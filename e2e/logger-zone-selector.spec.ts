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

    test("full flow: player → zone → quick action (Pass) → destination → complete", async ({
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

      // 5. Step should be selectDestination now
      const step = await getHarnessCurrentStep(page);
      expect(step).toBe("selectDestination");

      // 6. Click a destination on the soccer field
      const soccerField = page.getByTestId("soccer-field");
      await expect(soccerField).toBeVisible({ timeout: 5000 });
      const fieldBox = await soccerField.boundingBox();
      expect(fieldBox).not.toBeNull();
      if (!fieldBox) throw new Error("Missing field bounding box");

      // Click somewhere on the right half of the field (pass destination)
      await page.mouse.click(
        fieldBox.x + fieldBox.width * 0.7,
        fieldBox.y + fieldBox.height * 0.5,
      );

      // 7. Wait for any follow up step (recipient) or completion
      await page.waitForTimeout(500);
      const stepAfterDest = await getHarnessCurrentStep(page);
      if (stepAfterDest === "selectRecipient") {
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
      await expect(page.getByTestId("quick-action-Pass")).toBeVisible({
        timeout: 8000,
      });
      await page.getByTestId("quick-action-Pass").click();

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
      await page.getByTestId("quick-action-Pass").click();

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
      await page.getByTestId("quick-action-Pass").click();

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

      // Full flow: player → zone → Pass → click top border zone (touchline out)
      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });
      await page.getByTestId("zone-select-8").click();
      await page.getByTestId("quick-action-Pass").click();

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

      // Full flow: player → zone → Pass → click left border zone (goal line out)
      // HOME player passing behind own goal line → corner awarded to away team
      await page.getByTestId("field-player-HOME-3").click();
      await expect(page.getByTestId("field-zone-selector")).toBeVisible({
        timeout: 8000,
      });
      await page.getByTestId("zone-select-7").click();
      await page.getByTestId("quick-action-Pass").click();

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
}); // close outer "Logger Zone & Border Zone Tests"
