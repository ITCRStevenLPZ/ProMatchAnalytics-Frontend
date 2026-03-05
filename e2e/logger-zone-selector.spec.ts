import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  BACKEND_BASE_URL,
  MATCH_ID,
  gotoLoggerPage,
  ensureClockRunning,
  resetHarnessFlow,
  waitForPendingAckToClear,
} from "./utils/logger";

// ---------------------------------------------------------------------------
// Zone Selector E2E — validates the full zone-selection flow:
//   Click player → other nodes hide → zone grid appears on field
//   → tap zone → quick actions appear → complete action
// ---------------------------------------------------------------------------

const AUTH_USER = {
  uid: "e2e-admin",
  email: "e2e-admin@example.com",
  displayName: "E2E Admin",
  role: "admin",
};

let backendRequest: APIRequestContext;

test.beforeAll(async () => {
  backendRequest = await request.newContext({
    baseURL: BACKEND_BASE_URL,
    extraHTTPHeaders: { Authorization: "Bearer e2e-playwright" },
  });
});

test.afterAll(async () => {
  await backendRequest?.dispose();
});

test.beforeEach(async ({ page }) => {
  await backendRequest.post("/e2e/reset", { data: { matchId: MATCH_ID } });
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  await page.addInitScript((user) => {
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({ state: { user }, version: 0 }),
    );
  }, AUTH_USER);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ensureAdminRole = async (page: Page) => {
  await page.evaluate((user) => {
    const store = (window as any).__PROMATCH_AUTH_STORE__;
    if (store?.getState) {
      store.getState().setUser(user);
    }
  }, AUTH_USER);
};

/** Read the harness currentStep via the exposed window hook */
const getHarnessCurrentStep = async (page: Page): Promise<string | null> => {
  return page.evaluate(() => {
    const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
    return harness?.getCurrentStep ? harness.getCurrentStep() : null;
  });
};

// ---------------------------------------------------------------------------
// Tests — single serial block so both suites share one worker and never race
// ---------------------------------------------------------------------------

test.describe("Logger Zone & Border Zone Tests", () => {
  test.describe.configure({ mode: "serial" });

  test.describe("Zone Selector Flow", () => {
    test("clicking a player transitions to selectZone step", async ({
      page,
    }) => {
      test.setTimeout(60000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Verify we start at selectPlayer
      const stepBefore = await getHarnessCurrentStep(page);
      expect(stepBefore).toBe("selectPlayer");

      // Click a player
      const player = page.getByTestId("field-player-HOME-3");
      await expect(player).toBeVisible({ timeout: 15000 });
      await player.click();

      // Step should now be selectZone
      const stepAfter = await getHarnessCurrentStep(page);
      expect(stepAfter).toBe("selectZone");
    });

    test("zone selector overlay appears on the actual field after player click", async ({
      page,
    }) => {
      test.setTimeout(60000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Click a player
      await page.getByTestId("field-player-HOME-3").click();

      // The zone selector should appear
      const zoneSelector = page.getByTestId("field-zone-selector");
      await expect(zoneSelector).toBeVisible({ timeout: 8000 });

      // The zone selector should be inside the soccer field (not a full-screen modal)
      const soccerField = page.getByTestId("soccer-field");
      await expect(soccerField).toBeVisible();

      // Verify zone selector is a descendant of the soccer field
      const zoneSelectorInsideField = soccerField.locator(
        '[data-testid="field-zone-selector"]',
      );
      await expect(zoneSelectorInsideField).toBeVisible({ timeout: 5000 });

      // It should NOT be a fixed/modal element covering the whole screen
      const isFixed = await zoneSelector.evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return cs.position === "fixed";
      });
      expect(isFixed).toBe(false);
    });

    test("other player nodes hide during zone selection (only selected player visible)", async ({
      page,
    }) => {
      test.setTimeout(60000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Before clicking — HOME-1, HOME-2, HOME-3 should all be visible
      await expect(page.getByTestId("field-player-HOME-1")).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByTestId("field-player-HOME-2")).toBeVisible();
      await expect(page.getByTestId("field-player-HOME-3")).toBeVisible();

      // Click HOME-3
      await page.getByTestId("field-player-HOME-3").click();

      // Wait for zone selector to appear
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });

      // HOME-3 (selected) should still be visible
      await expect(page.getByTestId("field-player-HOME-3")).toBeVisible();

      // Other players should be hidden
      await expect(page.getByTestId("field-player-HOME-1")).toBeHidden({
        timeout: 5000,
      });
      await expect(page.getByTestId("field-player-HOME-2")).toBeHidden({
        timeout: 5000,
      });
      await expect(page.getByTestId("field-player-AWAY-1")).toBeHidden({
        timeout: 5000,
      });
    });

    test("zone buttons are clickable and have correct testids", async ({
      page,
    }) => {
      test.setTimeout(60000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });

      // Verify several zone buttons exist
      for (const zoneId of [0, 7, 14, 23]) {
        await expect(page.getByTestId(`zone-select-${zoneId}`)).toBeVisible();
      }

      // Zone buttons should total 24
      const zoneButtons = page.locator('[data-testid^="zone-select-"]');
      await expect(zoneButtons).toHaveCount(24);
    });

    test("selecting a zone advances to quick action menu", async ({ page }) => {
      test.setTimeout(60000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Click player → zone selector appears
      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });

      // Select zone 7 (center of field)
      await page.getByTestId("zone-select-7").click();

      // Step should advance past selectZone
      const step = await getHarnessCurrentStep(page);
      expect(step).toBe("selectQuickAction");

      // Quick action menu should now be visible
      await expect(page.getByTestId("quick-action-Pass")).toBeVisible({
        timeout: 8000,
      });
    });

    test("full flow: player → zone → quick action (Pass) → outcome → complete", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // 1. Click player
      await page.getByTestId("field-player-HOME-3").click();

      // 2. Zone selector visible
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });

      // 3. Select zone 7
      await page.getByTestId("zone-select-7").click();

      // 4. Quick action menu visible — click Pass
      await expect(page.getByTestId("quick-action-Pass")).toBeVisible({
        timeout: 8000,
      });
      await page.getByTestId("quick-action-Pass").click();

      // 5. Step should be selectOutcome now (Pass uses two-step outcome flow)
      const step = await getHarnessCurrentStep(page);
      expect(step).toBe("selectOutcome");

      // 6. Select Complete outcome → goes to selectRecipient
      await page.getByTestId("outcome-btn-Complete").click({ timeout: 5000 });

      // 7. Wait for recipient step and select a teammate
      await page.waitForTimeout(500);
      const stepAfterOutcome = await getHarnessCurrentStep(page);
      if (stepAfterOutcome === "selectRecipient") {
        const recipient = page
          .locator('[data-testid^="recipient-card-HOME-"]')
          .first();
        await expect(recipient).toBeVisible({ timeout: 5000 });
        await recipient.click();
      }

      // Event should be submitted — wait for ack
      await waitForPendingAckToClear(page);

      // Verify at least one event was logged
      await expect(page.getByTestId("live-event-item").first()).toBeVisible({
        timeout: 10000,
      });
    });

    test("cancel zone selector returns to selectPlayer step", async ({
      page,
    }) => {
      test.setTimeout(60000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Click player → zone selector
      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });

      // Click cancel
      await page.getByTestId("zone-selector-cancel").click();

      // Should go back to selectPlayer
      const step = await getHarnessCurrentStep(page);
      expect(step).toBe("selectPlayer");

      // Zone selector should be gone
      await expect(page.getByTestId("field-zone-selector")).toBeHidden({
        timeout: 5000,
      });

      // All players should be visible again
      await expect(page.getByTestId("field-player-HOME-1")).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByTestId("field-player-HOME-2")).toBeVisible();
      await expect(page.getByTestId("field-player-HOME-3")).toBeVisible();
    });

    test("zone selector is NOT a full-screen modal (renders within field bounds)", async ({
      page,
    }) => {
      test.setTimeout(60000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });

      // Get bounding boxes
      const fieldBox = await page.getByTestId("soccer-field").boundingBox();
      const zoneSelectorBox = await page
        .getByTestId("field-zone-selector")
        .boundingBox();

      expect(fieldBox).not.toBeNull();
      expect(zoneSelectorBox).not.toBeNull();
      if (!fieldBox || !zoneSelectorBox)
        throw new Error("Missing bounding boxes");

      // Zone selector should be contained within the soccer field
      expect(zoneSelectorBox.x).toBeGreaterThanOrEqual(fieldBox.x - 2);
      expect(zoneSelectorBox.y).toBeGreaterThanOrEqual(fieldBox.y - 2);
      expect(zoneSelectorBox.x + zoneSelectorBox.width).toBeLessThanOrEqual(
        fieldBox.x + fieldBox.width + 2,
      );
      expect(zoneSelectorBox.y + zoneSelectorBox.height).toBeLessThanOrEqual(
        fieldBox.y + fieldBox.height + 2,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Border Zone (Out-of-Bounds) Tests
  // ---------------------------------------------------------------------------

  test.describe("Border Zone Destination Flow", () => {
    test.beforeEach(async ({ page }) => {
      await backendRequest.post("/e2e/reset", { data: { matchId: MATCH_ID } });
      await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    });

    test("border zones appear during selectDestination step", async ({
      page,
    }) => {
      test.setTimeout(60000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Complete the zone-selection → quick-action flow to reach selectDestination
      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });
      await page.getByTestId("zone-select-7").click();
      await expect(page.getByTestId("quick-action-Header")).toBeVisible({
        timeout: 8000,
      });
      await page.getByTestId("quick-action-Header").click();

      const step = await getHarnessCurrentStep(page);
      expect(step).toBe("selectDestination");

      // Border zones should now be visible
      await expect(page.getByTestId("border-zone-top-0")).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByTestId("border-zone-bottom-5")).toBeVisible();
      await expect(page.getByTestId("border-zone-left-0")).toBeVisible();
      await expect(page.getByTestId("border-zone-right-3")).toBeVisible();
    });

    test("all 20 border zones are rendered (6 top + 6 bottom + 4 left + 4 right)", async ({
      page,
    }) => {
      test.setTimeout(60000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });
      await page.getByTestId("zone-select-7").click();
      await page.getByTestId("quick-action-Header").click();

      // Count all border zone buttons
      const borderZones = page.locator('[data-testid^="border-zone-"]');
      await expect(borderZones.first()).toBeVisible({ timeout: 5000 });
      const count = await borderZones.count();
      expect(count).toBe(20);
    });

    test("corner areas have exactly 2 border zone buttons each", async ({
      page,
    }) => {
      test.setTimeout(60000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });
      await page.getByTestId("zone-select-7").click();
      await page.getByTestId("quick-action-Header").click();

      // Top-left corner: top-0 (touchline) + left-0 (goal line) = 2 buttons
      await expect(page.getByTestId("border-zone-top-0")).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByTestId("border-zone-left-0")).toBeVisible();

      // Top-right corner: top-5 + right-0
      await expect(page.getByTestId("border-zone-top-5")).toBeVisible();
      await expect(page.getByTestId("border-zone-right-0")).toBeVisible();

      // Bottom-left corner: bottom-0 + left-3
      await expect(page.getByTestId("border-zone-bottom-0")).toBeVisible();
      await expect(page.getByTestId("border-zone-left-3")).toBeVisible();

      // Bottom-right corner: bottom-5 + right-3
      await expect(page.getByTestId("border-zone-bottom-5")).toBeVisible();
      await expect(page.getByTestId("border-zone-right-3")).toBeVisible();
    });

    test("clicking a touchline border zone (top) logs out-of-bounds event", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Full flow: player → zone → Header → click top border zone (touchline out)
      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });
      await page.getByTestId("zone-select-8").click();
      await page.getByTestId("quick-action-Header").click();

      const step = await getHarnessCurrentStep(page);
      expect(step).toBe("selectDestination");

      // Click a top (touchline) border zone — ball went out over the sideline
      await page.getByTestId("border-zone-top-3").click();

      // Should have submitted the event
      await waitForPendingAckToClear(page);
      await expect(page.getByTestId("live-event-item").first()).toBeVisible({
        timeout: 10000,
      });
    });

    test("clicking a goal-line border zone (left) logs out-of-bounds event with corner logic preserved", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Full flow: player → zone → Header → click left border zone (goal line out)
      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });
      await page.getByTestId("zone-select-7").click();
      await page.getByTestId("quick-action-Header").click();

      const step = await getHarnessCurrentStep(page);
      expect(step).toBe("selectDestination");

      // Click a left (goal line) border zone
      await page.getByTestId("border-zone-left-1").click();

      // Should have submitted the event (pass out + potential corner set piece)
      await waitForPendingAckToClear(page);
      await expect(page.getByTestId("live-event-item").first()).toBeVisible({
        timeout: 10000,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Zone-Biased Position Enhancement Tests
  // ---------------------------------------------------------------------------

  test.describe("Zone-Biased Position Enhancement", () => {
    test.beforeEach(async ({ page }) => {
      await backendRequest.post("/e2e/reset", { data: { matchId: MATCH_ID } });
      await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    });

    /**
     * Helper: fetch the latest events from the backend and return them as JSON.
     * Uses page_size=200 to ensure we capture all events in the E2E match.
     */
    const fetchBackendEvents = async (): Promise<any[]> => {
      const res = await backendRequest.get(
        `/api/v1/logger/matches/${MATCH_ID}/events?page_size=200`,
      );
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      return body.items ?? body;
    };

    test("completed Pass event contains zone_id in data payload", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Flow: player → zone 8 → Pass → outcome (Complete) → recipient
      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });
      await page.getByTestId("zone-select-8").click();
      await page.getByTestId("quick-action-Pass").click();

      // Select Complete outcome
      await page.getByTestId("outcome-btn-Complete").click({ timeout: 5000 });

      // Handle recipient step
      await page.waitForTimeout(500);
      const stepAfter = await getHarnessCurrentStep(page);
      if (stepAfter === "selectRecipient") {
        const recipient = page
          .locator('[data-testid^="recipient-card-HOME-"]')
          .first();
        await expect(recipient).toBeVisible({ timeout: 5000 });
        await recipient.click();
      }

      await waitForPendingAckToClear(page);
      await expect(page.getByTestId("live-event-item").first()).toBeVisible({
        timeout: 10000,
      });

      // Verify backend event has zone_id
      const events = await fetchBackendEvents();
      const passEvents = events.filter((e: any) => e.type === "Pass");
      expect(passEvents.length).toBeGreaterThanOrEqual(1);
      const latestPass = passEvents[passEvents.length - 1];
      expect(latestPass.data.zone_id).toBe(8);
    });

    test("completed DirectShot event contains zone_id in data payload", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Flow: player → zone 16 → DirectShot (auto-completes)
      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });
      await page.getByTestId("zone-select-16").click();
      await page.getByTestId("quick-action-DirectShot").click();

      await waitForPendingAckToClear(page);
      await expect(page.getByTestId("live-event-item").first()).toBeVisible({
        timeout: 10000,
      });

      // Verify backend event has zone_id
      const events = await fetchBackendEvents();
      const shotEvents = events.filter((e: any) => e.type === "Shot");
      expect(shotEvents.length).toBeGreaterThanOrEqual(1);
      const latestShot = shotEvents[shotEvents.length - 1];
      expect(latestShot.data.zone_id).toBe(16);
    });

    test("event location is the zone centre when player position is outside selected zone", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Click player (its position is somewhere on the left half of the field)
      // then deliberately select a zone on the FAR RIGHT (zone 5 = top-right corner)
      // which is unlikely to contain the player's position → zone centre should be used
      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });

      // Zone 5: col=5, row=0 → x0=100, x1=120, y0=0, y1=20 → centre = [110, 10]
      await page.getByTestId("zone-select-5").click();
      await page.getByTestId("quick-action-Goal").click();

      await waitForPendingAckToClear(page);
      await expect(page.getByTestId("live-event-item").first()).toBeVisible({
        timeout: 10000,
      });

      // Fetch the event and verify location is the zone centre [110, 10]
      const events = await fetchBackendEvents();
      const shotEvents = events.filter((e: any) => e.type === "Shot");
      expect(shotEvents.length).toBeGreaterThanOrEqual(1);
      const latestShot = shotEvents[shotEvents.length - 1];
      expect(latestShot.location).toBeDefined();
      expect(latestShot.location[0]).toBe(110);
      expect(latestShot.location[1]).toBe(10);
      expect(latestShot.data.zone_id).toBe(5);
    });

    test("event location uses exact player position when it falls inside the selected zone", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Read the player's actual position on the field before clicking
      const playerNode = page.getByTestId("field-player-HOME-3");
      await expect(playerNode).toBeVisible({ timeout: 10000 });

      // Get the soccer field bounding box for coordinate calculations
      const fieldEl = page.getByTestId("soccer-field");
      const fieldBox = await fieldEl.boundingBox();
      expect(fieldBox).not.toBeNull();
      if (!fieldBox) throw new Error("Missing field bounding box");

      const playerBox = await playerNode.boundingBox();
      expect(playerBox).not.toBeNull();
      if (!playerBox) throw new Error("Missing player bounding box");

      // Calculate the player's % position on the field
      const playerCenterX = playerBox.x + playerBox.width / 2;
      const playerCenterY = playerBox.y + playerBox.height / 2;
      const xPct = ((playerCenterX - fieldBox.x) / fieldBox.width) * 100;
      const yPct = ((playerCenterY - fieldBox.y) / fieldBox.height) * 100;

      // Convert to StatsBomb coordinates
      const sbX = (xPct / 100) * 120;
      const sbY = (yPct / 100) * 80;

      // Determine which zone this falls into
      const col = Math.min(5, Math.max(0, Math.floor(sbX / 20)));
      const row = Math.min(3, Math.max(0, Math.floor(sbY / 20)));
      const expectedZoneId = row * 6 + col;

      // Click the player → select the MATCHING zone (the one the player is in)
      await playerNode.click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });
      await page.getByTestId(`zone-select-${expectedZoneId}`).click();

      // Use Goal quick action (auto-completes, no destination needed)
      await page.getByTestId("quick-action-Goal").click();

      await waitForPendingAckToClear(page);
      await expect(page.getByTestId("live-event-item").first()).toBeVisible({
        timeout: 10000,
      });

      // Fetch the event from the backend
      const events = await fetchBackendEvents();
      const shotEvents = events.filter((e: any) => e.type === "Shot");
      expect(shotEvents.length).toBeGreaterThanOrEqual(1);
      const latestShot = shotEvents[shotEvents.length - 1];
      expect(latestShot.location).toBeDefined();
      expect(latestShot.data.zone_id).toBe(expectedZoneId);

      // The location should NOT be the zone centre — it should be the
      // player's exact position (with some tolerance for rounding)
      const zoneCentreX = col * 20 + 10;
      const zoneCentreY = row * 20 + 10;

      // If the player position differs from zone centre by > 0.5 in either
      // axis, the exact position should have been used (not quantised)
      if (
        Math.abs(sbX - zoneCentreX) > 0.5 ||
        Math.abs(sbY - zoneCentreY) > 0.5
      ) {
        // Location should be close to the player's actual position, not zone centre
        expect(latestShot.location[0]).not.toBe(zoneCentreX);
        expect(latestShot.location[1]).not.toBe(zoneCentreY);
      }

      // In all cases, the location should be within the zone bounds
      expect(latestShot.location[0]).toBeGreaterThanOrEqual(col * 20);
      expect(latestShot.location[0]).toBeLessThanOrEqual((col + 1) * 20);
      expect(latestShot.location[1]).toBeGreaterThanOrEqual(row * 20);
      expect(latestShot.location[1]).toBeLessThanOrEqual((row + 1) * 20);
    });
  });

  // -------------------------------------------------------------------------
  // Auto Position Mode — skip zone selector, use player node coords
  // -------------------------------------------------------------------------
  test.describe("Auto Position Mode", () => {
    test.beforeEach(async ({ page }) => {
      await backendRequest.post("/e2e/reset", { data: { matchId: MATCH_ID } });
      await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    });

    /** Read the latest events from the backend. */
    const fetchBackendEvents = async (): Promise<any[]> => {
      const res = await backendRequest.get(
        `/api/v1/logger/matches/${MATCH_ID}/events?page_size=200`,
      );
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      return body.items ?? body;
    };

    test("position mode toggle is visible and defaults to Manual", async ({
      page,
    }) => {
      test.setTimeout(60000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);

      const toggle = page.getByTestId("position-mode-toggle");
      await expect(toggle).toBeVisible({ timeout: 10000 });

      // Manual button should be active (blue bg class)
      const manualBtn = page.getByTestId("position-mode-manual");
      await expect(manualBtn).toBeVisible();
      await expect(manualBtn).toHaveClass(/bg-blue-600/);

      // Auto button should be inactive
      const autoBtn = page.getByTestId("position-mode-auto");
      await expect(autoBtn).toBeVisible();
      await expect(autoBtn).not.toHaveClass(/bg-amber-600/);
    });

    test("switching to Auto skips zone selector after player click", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Switch to Auto mode
      await page.getByTestId("position-mode-auto").click();
      await expect(page.getByTestId("position-mode-auto")).toHaveClass(
        /bg-amber-600/,
      );

      // Click a player — zone selector should NOT appear
      await page.getByTestId("field-player-HOME-3").click();

      // Wait a short moment to ensure the zone selector did NOT appear
      await page.waitForTimeout(500);
      await expect(page.getByTestId("field-zone-selector")).not.toBeVisible();

      // Should jump directly to quick actions or action selection
      const step = await getHarnessCurrentStep(page);
      expect(
        step === "selectQuickAction" || step === "selectAction",
      ).toBeTruthy();
    });

    test("Auto mode event has zone_id derived from player node position", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Get the player node's actual position for expectation
      const playerNode = page.getByTestId("field-player-HOME-3");
      await expect(playerNode).toBeVisible({ timeout: 10000 });
      const fieldEl = page.getByTestId("soccer-field");
      const fieldBox = await fieldEl.boundingBox();
      const playerBox = await playerNode.boundingBox();
      expect(fieldBox).not.toBeNull();
      expect(playerBox).not.toBeNull();
      if (!fieldBox || !playerBox) throw new Error("Missing bounding box");

      const xPct =
        ((playerBox.x + playerBox.width / 2 - fieldBox.x) / fieldBox.width) *
        100;
      const yPct =
        ((playerBox.y + playerBox.height / 2 - fieldBox.y) / fieldBox.height) *
        100;
      const sbX = (xPct / 100) * 120;
      const sbY = (yPct / 100) * 80;
      const col = Math.min(5, Math.max(0, Math.floor(sbX / 20)));
      const row = Math.min(3, Math.max(0, Math.floor(sbY / 20)));
      const expectedZoneId = row * 6 + col;

      // Switch to Auto mode
      await page.getByTestId("position-mode-auto").click();

      // Click player → Goal (auto-completes)
      await playerNode.click();
      await page.getByTestId("quick-action-Goal").click();

      await waitForPendingAckToClear(page);
      await expect(page.getByTestId("live-event-item").first()).toBeVisible({
        timeout: 10000,
      });

      // Verify the backend event
      const events = await fetchBackendEvents();
      const shotEvents = events.filter((e: any) => e.type === "Shot");
      expect(shotEvents.length).toBeGreaterThanOrEqual(1);
      const latestShot = shotEvents[shotEvents.length - 1];
      expect(latestShot.data.zone_id).toBe(expectedZoneId);
      expect(latestShot.location).toBeDefined();

      // Location should be the player's node coords (within zone bounds)
      expect(latestShot.location[0]).toBeGreaterThanOrEqual(col * 20);
      expect(latestShot.location[0]).toBeLessThanOrEqual((col + 1) * 20);
      expect(latestShot.location[1]).toBeGreaterThanOrEqual(row * 20);
      expect(latestShot.location[1]).toBeLessThanOrEqual((row + 1) * 20);
    });

    test("switching back to Manual restores zone selector flow", async ({
      page,
    }) => {
      test.setTimeout(90000);
      await gotoLoggerPage(page, MATCH_ID);
      await ensureAdminRole(page);
      await ensureClockRunning(page);
      await resetHarnessFlow(page, "home");

      // Switch to Auto, then back to Manual
      await page.getByTestId("position-mode-auto").click();
      await expect(page.getByTestId("position-mode-auto")).toHaveClass(
        /bg-amber-600/,
      );
      await page.getByTestId("position-mode-manual").click();
      await expect(page.getByTestId("position-mode-manual")).toHaveClass(
        /bg-blue-600/,
      );

      // Click a player — zone selector SHOULD appear (back to manual)
      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });
    });
  });
}); // close outer "Logger Zone & Border Zone Tests"
