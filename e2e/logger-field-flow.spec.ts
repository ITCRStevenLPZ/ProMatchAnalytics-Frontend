import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  resetHarnessFlow,
  ensureClockRunning,
  waitForPendingAckToClear,
} from "./utils/logger";

// ---------------------------------------------------------------------------
// The tactical field is now the default view in the logger cockpit.
// These tests verify: player rendering at positions, drag-to-reposition,
// substitution position inheritance, position bounds clamping, side-switching,
// and click-without-drag triggering the action flow.
// ---------------------------------------------------------------------------

const AUTH_USER = {
  uid: "e2e-admin",
  email: "e2e-admin@example.com",
  displayName: "E2E Admin",
  role: "admin",
};

// Avoid cross-spec collisions with shared match fixtures in parallel workers.
const FIELD_MATCH_ID = `E2E-FIELD-${Date.now()}-${Math.floor(
  Math.random() * 1e6,
)}`;

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
  await backendRequest.post("/e2e/reset", {
    data: { matchId: FIELD_MATCH_ID },
  });
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

/** Get the bounding box of a tactical player node by its testid. */
const getPlayerBox = async (page: Page, playerId: string) => {
  const el = page.getByTestId(`field-player-${playerId}`);
  await expect(el).toBeVisible({ timeout: 10000 });
  return el.boundingBox();
};

/** Read the data-tactical-x/y attributes from the player wrapper. */
const getTacticalCoords = async (page: Page, playerId: string) => {
  const el = page.getByTestId(`field-player-${playerId}`);
  const x = await el.getAttribute("data-tactical-x");
  const y = await el.getAttribute("data-tactical-y");
  return { x: parseFloat(x ?? "0"), y: parseFloat(y ?? "0") };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Tactical Field", () => {
  test.describe.configure({ mode: "serial" });

  test("renders all on-field players at positioned coordinates", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);

    // The field wrapper should be visible
    const field = page.getByTestId("soccer-field");
    await expect(field).toBeVisible({ timeout: 15000 });

    // HOME-1 is a GK — should be positioned near the left (x ≈ 5)
    const gkCoords = await getTacticalCoords(page, "HOME-1");
    expect(gkCoords.x).toBeLessThan(20);
    expect(gkCoords.y).toBeGreaterThan(30);
    expect(gkCoords.y).toBeLessThan(70); // near centre vertically

    // HOME-2 is MF — should be near the centre-left (x ≈ 45)
    const mfCoords = await getTacticalCoords(page, "HOME-2");
    expect(mfCoords.x).toBeGreaterThan(25);
    expect(mfCoords.x).toBeLessThan(65);

    // AWAY-1 is GK — should be mirrored to the right (x ≈ 95)
    const awayGkCoords = await getTacticalCoords(page, "AWAY-1");
    expect(awayGkCoords.x).toBeGreaterThan(80);

    // All 11 starters per team should be visible
    for (let i = 1; i <= 11; i++) {
      await expect(page.getByTestId(`field-player-HOME-${i}`)).toBeVisible();
      await expect(page.getByTestId(`field-player-AWAY-${i}`)).toBeVisible();
    }
  });

  test("pre-match default keeps teams on separate halves", async ({ page }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);

    for (let i = 1; i <= 11; i++) {
      const home = await getTacticalCoords(page, `HOME-${i}`);
      const away = await getTacticalCoords(page, `AWAY-${i}`);
      expect(home.x).toBeLessThanOrEqual(49.5);
      expect(away.x).toBeGreaterThanOrEqual(50.5);
    }
  });

  test("drag a player to reposition — coordinates update", async ({ page }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);
    await ensureClockRunning(page);

    // Unlock drag — drag is locked by default
    const dragLockBtn = page.getByTestId("toggle-drag-lock");
    await expect(dragLockBtn).toBeVisible({ timeout: 10000 });
    await dragLockBtn.click();
    await page.waitForTimeout(300);

    // Use HOME-1 (GK) — guaranteed at x≈5, no overlap with AWAY-1 at x≈95
    const player = page.getByTestId("field-player-HOME-1");
    await expect(player).toBeVisible({ timeout: 15000 });

    const beforeCoords = await getTacticalCoords(page, "HOME-1");

    // Must scroll into view — page.mouse doesn't auto-scroll like click()
    await player.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const box = await player.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error("Player bounding box unavailable");

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Move gradually — each step fires a pointermove event
    await page.mouse.move(startX + 60, startY + 30, { steps: 10 });
    await page.mouse.up();

    // Wait for React state to settle
    await page.waitForTimeout(500);

    const afterCoords = await getTacticalCoords(page, "HOME-1");

    // The GK position should have changed (we dragged right & down)
    expect(afterCoords.x).toBeGreaterThan(beforeCoords.x);
  });

  test("click without drag triggers action flow (player selection)", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);
    await ensureClockRunning(page);

    // Click player without dragging — should trigger soccer action flow
    const player = page.getByTestId("field-player-HOME-3");
    await expect(player).toBeVisible({ timeout: 15000 });
    await player.click();

    // After clicking a player, the zone selector should appear first
    const zoneSelector = page.getByTestId("field-zone-selector");
    await expect(zoneSelector).toBeVisible({ timeout: 8000 });

    // Select a zone to proceed to quick action menu
    await page.getByTestId("zone-select-7").click();

    // Now the quick-action menu should appear
    const quickAction = page.getByTestId("quick-action-Pass");
    await expect(quickAction).toBeVisible({ timeout: 8000 });
  });

  test("substitution — incoming player inherits outgoing position", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);
    await ensureClockRunning(page);

    // Record the position of the player who will be substituted off (HOME-2)
    const beforeCoords = await getTacticalCoords(page, "HOME-2");

    // Use the same substitution flow as proven working tests:
    // 1) Click a player → 2) Select zone → 3) More actions → 4) Substitution
    const player = page.getByTestId("field-player-HOME-2");
    await expect(player).toBeVisible({ timeout: 10000 });
    await player.click();

    // Select zone to advance past zone selection step
    await expect(page.getByTestId("field-zone-selector")).toBeVisible({
      timeout: 8000,
    });
    await page.getByTestId("zone-select-7").click();

    await page.getByTestId("quick-action-more").click({ timeout: 8000 });
    await page.getByTestId("action-btn-Substitution").click();

    const subModal = page.getByTestId("substitution-modal");
    await expect(subModal).toBeVisible({ timeout: 15000 });

    // Select player going off (first available in the off-list)
    const offList = subModal.locator('[data-testid^="sub-off-"]');
    await expect(offList.first()).toBeVisible({ timeout: 10000 });
    // Click HOME-2 specifically from the off list
    const subOff = subModal.getByTestId("sub-off-HOME-2");
    await subOff.click();

    // Select player coming on — first bench player (HOME-12)
    const onList = subModal.locator('[data-testid^="sub-on-"]');
    await expect(onList.first()).toBeVisible({ timeout: 10000 });
    const subOn = subModal.getByTestId("sub-on-HOME-12");
    await subOn.click();

    // Wait for validation, then confirm
    const confirmBtn = subModal.getByTestId("confirm-substitution");
    await expect(confirmBtn).toBeEnabled({ timeout: 15000 });
    await confirmBtn.click();
    await waitForPendingAckToClear(page);

    // Wait for UI to settle
    await page.waitForTimeout(500);

    // HOME-2 should no longer be on the field
    await expect(page.getByTestId("field-player-HOME-2")).toBeHidden({
      timeout: 10000,
    });

    // HOME-12 should now be visible and at the same position as HOME-2 was
    const newPlayerCoords = await getTacticalCoords(page, "HOME-12");
    expect(newPlayerCoords.x).toBeCloseTo(beforeCoords.x, 0);
    expect(newPlayerCoords.y).toBeCloseTo(beforeCoords.y, 0);
  });

  test("side-switching flips player positions", async ({ page }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);

    // Record the GK position before flip
    const beforeCoords = await getTacticalCoords(page, "HOME-1");
    const beforeAwayCoords = await getTacticalCoords(page, "AWAY-1");

    // Click the field flip toggle
    const flipButton = page.getByTestId("toggle-field-flip");
    await expect(flipButton).toBeVisible({ timeout: 10000 });
    await flipButton.click();

    // Wait until positions settle after store/state propagation.
    await expect
      .poll(
        async () => {
          const afterHome = await getTacticalCoords(page, "HOME-1");
          const afterAway = await getTacticalCoords(page, "AWAY-1");
          const homeDelta = Math.abs(afterHome.x - (100 - beforeCoords.x));
          const awayDelta = Math.abs(afterAway.x - (100 - beforeAwayCoords.x));
          return homeDelta <= 1 && awayDelta <= 1;
        },
        { timeout: 5000, interval: 200 },
      )
      .toBeTruthy();

    const afterCoords = await getTacticalCoords(page, "HOME-1");
    const afterAwayCoords = await getTacticalCoords(page, "AWAY-1");

    // Mirror invariant for side switch (x' ~= 100 - x, y unchanged elsewhere).
    expect(afterCoords.x).toBeCloseTo(100 - beforeCoords.x, 0);
    expect(afterAwayCoords.x).toBeCloseTo(100 - beforeAwayCoords.x, 0);
  });

  test("pre-match: GK bounds — cannot be dragged past 20% x", async ({
    page,
  }) => {
    test.setTimeout(60000);
    // Re-seed with Pending so isMatchLive=false and pre-match bounds apply.
    await backendRequest.post("/e2e/reset", {
      data: { matchId: FIELD_MATCH_ID, status: "Pending" },
    });
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);

    const gkPlayer = page.getByTestId("field-player-HOME-1");
    await expect(gkPlayer).toBeVisible({ timeout: 15000 });

    const field = page.getByTestId("soccer-field");

    // Scroll GK into view — page.mouse doesn't auto-scroll
    await gkPlayer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const fieldBox = await field.boundingBox();
    expect(fieldBox).not.toBeNull();
    if (!fieldBox) throw new Error("Field bounding box unavailable");

    const box = await gkPlayer.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error("GK bounding box unavailable");

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    // Drag the GK far to the right — way past 20% of the field
    const dragRight = fieldBox.width * 0.6; // ~60% of field width

    // Unlock drag
    const dragLockBtn = page.getByTestId("toggle-drag-lock");
    await expect(dragLockBtn).toBeVisible({ timeout: 10000 });
    await dragLockBtn.click();
    await page.waitForTimeout(300);

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dragRight, startY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // The GK should be clamped to the goalkeeper bounds (x ≤ 20)
    const afterCoords = await getTacticalCoords(page, "HOME-1");
    expect(afterCoords.x).toBeLessThanOrEqual(21); // Allow small rounding
  });

  test("pre-match: players cannot cross into the opposite half", async ({
    page,
  }) => {
    test.setTimeout(60000);
    // Re-seed with Pending so isMatchLive=false and pre-match bounds apply.
    await backendRequest.post("/e2e/reset", {
      data: { matchId: FIELD_MATCH_ID, status: "Pending" },
    });
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);

    const dragLockBtn = page.getByTestId("toggle-drag-lock");
    await expect(dragLockBtn).toBeVisible({ timeout: 10000 });
    await dragLockBtn.click();
    await page.waitForTimeout(300);

    const field = page.getByTestId("soccer-field");
    const fieldBox = await field.boundingBox();
    expect(fieldBox).not.toBeNull();
    if (!fieldBox) throw new Error("Field bounding box unavailable");

    // Use HOME-4 / AWAY-4 — positioned at y≈50 (center) so pointer
    // interactions are reliable (HOME-11 at y≈86 can be clipped).
    const homePlayer = page.getByTestId("field-player-HOME-4");
    await expect(homePlayer).toBeVisible({ timeout: 10000 });
    await homePlayer.scrollIntoViewIfNeeded();
    const homeBox = await homePlayer.boundingBox();
    expect(homeBox).not.toBeNull();
    if (!homeBox) throw new Error("HOME-4 bounding box unavailable");

    await page.mouse.move(
      homeBox.x + homeBox.width / 2,
      homeBox.y + homeBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      fieldBox.x + fieldBox.width * 0.92,
      homeBox.y + homeBox.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();
    await page.waitForTimeout(250);

    const homeAfter = await getTacticalCoords(page, "HOME-4");
    expect(homeAfter.x).toBeLessThanOrEqual(49.5);

    // Try to drag an away player deep into the home half.
    const awayPlayer = page.getByTestId("field-player-AWAY-4");
    await expect(awayPlayer).toBeVisible({ timeout: 10000 });
    await awayPlayer.scrollIntoViewIfNeeded();
    const awayBox = await awayPlayer.boundingBox();
    expect(awayBox).not.toBeNull();
    if (!awayBox) throw new Error("AWAY-4 bounding box unavailable");

    await page.mouse.move(
      awayBox.x + awayBox.width / 2,
      awayBox.y + awayBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      fieldBox.x + fieldBox.width * 0.08,
      awayBox.y + awayBox.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();
    await page.waitForTimeout(250);

    const awayAfter = await getTacticalCoords(page, "AWAY-4");
    expect(awayAfter.x).toBeGreaterThanOrEqual(50.5);
  });

  test("live match: players CAN cross midfield when clock is running", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);
    await ensureClockRunning(page); // → First_Half (live bounds = full field)

    const dragLockBtn = page.getByTestId("toggle-drag-lock");
    await expect(dragLockBtn).toBeVisible({ timeout: 10000 });
    await dragLockBtn.click();
    await page.waitForTimeout(300);

    const field = page.getByTestId("soccer-field");
    const fieldBox = await field.boundingBox();
    expect(fieldBox).not.toBeNull();
    if (!fieldBox) throw new Error("Field bounding box unavailable");

    // Use HOME-4 / AWAY-4 — at y≈50 (center), reliable for pointer events.
    const homePlayer = page.getByTestId("field-player-HOME-4");
    await expect(homePlayer).toBeVisible({ timeout: 10000 });
    await homePlayer.scrollIntoViewIfNeeded();
    const homeBox = await homePlayer.boundingBox();
    expect(homeBox).not.toBeNull();
    if (!homeBox) throw new Error("HOME-4 bounding box unavailable");

    await page.mouse.move(
      homeBox.x + homeBox.width / 2,
      homeBox.y + homeBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      fieldBox.x + fieldBox.width * 0.85,
      homeBox.y + homeBox.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();
    await page.waitForTimeout(250);

    const homeAfter = await getTacticalCoords(page, "HOME-4");
    // During live play the player should have moved past midfield.
    expect(homeAfter.x).toBeGreaterThan(50);

    // Drag an away player deep into the home half — should succeed.
    const awayPlayer = page.getByTestId("field-player-AWAY-4");
    await expect(awayPlayer).toBeVisible({ timeout: 10000 });
    await awayPlayer.scrollIntoViewIfNeeded();
    const awayBox = await awayPlayer.boundingBox();
    expect(awayBox).not.toBeNull();
    if (!awayBox) throw new Error("AWAY-4 bounding box unavailable");

    await page.mouse.move(
      awayBox.x + awayBox.width / 2,
      awayBox.y + awayBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      fieldBox.x + fieldBox.width * 0.15,
      awayBox.y + awayBox.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();
    await page.waitForTimeout(250);

    const awayAfter = await getTacticalCoords(page, "AWAY-4");
    // During live play the away player should have crossed into the home half.
    expect(awayAfter.x).toBeLessThan(50);
  });

  test("field flip preserves player role lane and restores after unflip", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);

    const before = await getTacticalCoords(page, "AWAY-11");
    const flipButton = page.getByTestId("toggle-field-flip");
    await expect(flipButton).toBeVisible({ timeout: 10000 });

    await flipButton.click();
    await page.waitForTimeout(250);
    const flipped = await getTacticalCoords(page, "AWAY-11");

    // Flipping mirrors x but keeps vertical lane (right/left wing lane) stable.
    expect(flipped.x).toBeCloseTo(100 - before.x, 0);
    expect(flipped.y).toBeCloseTo(before.y, 0);

    await flipButton.click();
    await page.waitForTimeout(250);
    const restored = await getTacticalCoords(page, "AWAY-11");
    expect(restored.x).toBeCloseTo(before.x, 0);
    expect(restored.y).toBeCloseTo(before.y, 0);
  });

  test("backward compat — existing field-player testids are clickable", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);
    await ensureClockRunning(page);

    // Verify the standard field-player-* testids from SoccerField are present
    // on TacticalPlayerNode for backward compatibility
    const player = page.getByTestId("field-player-HOME-1");
    await expect(player).toBeVisible({ timeout: 15000 });

    // Verify clicking works and triggers the action flow
    await player.click();

    // Zone selector should appear first
    const zoneSelector = page.getByTestId("field-zone-selector");
    await expect(zoneSelector).toBeVisible({ timeout: 8000 });

    // Select a zone to proceed
    await page.getByTestId("zone-select-7").click();

    const quickAction = page.getByTestId("quick-action-Pass");
    await expect(quickAction).toBeVisible({ timeout: 8000 });

    // Reset for clean state
    await resetHarnessFlow(page);
  });

  test("dragged position persists across page navigation", async ({ page }) => {
    test.setTimeout(90000);
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);
    await ensureClockRunning(page);

    // Unlock drag — drag is locked by default
    const dragLockBtn = page.getByTestId("toggle-drag-lock");
    await expect(dragLockBtn).toBeVisible({ timeout: 10000 });
    await dragLockBtn.click();
    await page.waitForTimeout(300);

    const gkPlayer = page.getByTestId("field-player-HOME-1");
    await expect(gkPlayer).toBeVisible({ timeout: 15000 });

    // Get initial position
    const beforeCoords = await getTacticalCoords(page, "HOME-1");

    // Drag the GK slightly (stay within bounds: xMax=20)
    await gkPlayer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await gkPlayer.boundingBox();
    if (!box) throw new Error("GK bounding box unavailable");

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 40, startY + 25, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(800); // Wait for debounced IDB write (500ms)

    const afterCoords = await getTacticalCoords(page, "HOME-1");
    expect(afterCoords.x).not.toBeCloseTo(beforeCoords.x, 0);

    // Navigate away, then come back (preserves same browser context + IDB)
    await page.goto("/dashboard");
    await page.waitForTimeout(500);

    // Navigate back to the logger
    await page.goto(`/matches/${FIELD_MATCH_ID}/logger`);
    await expect(page.getByTestId("soccer-field")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("field-player-HOME-1")).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(500);

    // Position should be restored from IndexedDB
    const restoredCoords = await getTacticalCoords(page, "HOME-1");
    expect(restoredCoords.x).toBeCloseTo(afterCoords.x, 0);
    expect(restoredCoords.y).toBeCloseTo(afterCoords.y, 0);
  });

  test("drag bounds overlay appears during pre-match drag", async ({
    page,
  }) => {
    test.setTimeout(60000);
    // Re-seed with Pending so isMatchLive=false and bounds overlay is rendered.
    await backendRequest.post("/e2e/reset", {
      data: { matchId: FIELD_MATCH_ID, status: "Pending" },
    });
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);

    // Unlock drag — drag is locked by default
    const dragLockBtn = page.getByTestId("toggle-drag-lock");
    await expect(dragLockBtn).toBeVisible({ timeout: 10000 });
    await dragLockBtn.click();
    await page.waitForTimeout(300);

    const gkPlayer = page.getByTestId("field-player-HOME-1");
    await expect(gkPlayer).toBeVisible({ timeout: 15000 });

    // Before dragging — no bounds overlay should exist
    await expect(page.getByTestId("drag-bounds-overlay")).toBeHidden();

    // Start dragging the GK
    await gkPlayer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await gkPlayer.boundingBox();
    if (!box) throw new Error("GK bounding box unavailable");

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Move enough to trigger drag threshold
    await page.mouse.move(startX + 20, startY, { steps: 5 });
    await page.waitForTimeout(200);

    // Bounds overlay should now be visible
    const overlay = page.getByTestId("drag-bounds-overlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Release
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Overlay should disappear after drag ends
    await expect(overlay).toBeHidden({ timeout: 5000 });
  });

  test("live match: no bounds overlay during drag (unrestricted)", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);
    await ensureClockRunning(page);

    // Unlock drag
    const dragLockBtn = page.getByTestId("toggle-drag-lock");
    await expect(dragLockBtn).toBeVisible({ timeout: 10000 });
    await dragLockBtn.click();
    await page.waitForTimeout(300);

    const gkPlayer = page.getByTestId("field-player-HOME-1");
    await expect(gkPlayer).toBeVisible({ timeout: 15000 });

    await gkPlayer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await gkPlayer.boundingBox();
    if (!box) throw new Error("GK bounding box unavailable");

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 20, startY, { steps: 5 });
    await page.waitForTimeout(200);

    // During live match, bounds overlay should NOT appear
    await expect(page.getByTestId("drag-bounds-overlay")).toBeHidden();

    await page.mouse.up();
    await page.waitForTimeout(300);
  });

  test("collision detection — players repel on overlap", async ({ page }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FIELD_MATCH_ID);
    await ensureAdminRole(page);
    await ensureClockRunning(page);

    // Unlock drag — drag is locked by default
    const dragLockBtn = page.getByTestId("toggle-drag-lock");
    await expect(dragLockBtn).toBeVisible({ timeout: 10000 });
    await dragLockBtn.click();
    await page.waitForTimeout(300);

    // HOME-2 (MF) and HOME-3 (MF) should both be visible
    const p2 = page.getByTestId("field-player-HOME-2");
    const p3 = page.getByTestId("field-player-HOME-3");
    await expect(p2).toBeVisible({ timeout: 15000 });
    await expect(p3).toBeVisible({ timeout: 15000 });

    // Record HOME-3's position
    const p3Before = await getTacticalCoords(page, "HOME-3");

    // Drag HOME-2 exactly onto HOME-3's position
    await p2.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box2 = await p2.boundingBox();
    const box3 = await p3.boundingBox();
    if (!box2 || !box3) throw new Error("Player bounding boxes unavailable");

    const start2X = box2.x + box2.width / 2;
    const start2Y = box2.y + box2.height / 2;
    const target3X = box3.x + box3.width / 2;
    const target3Y = box3.y + box3.height / 2;

    await page.mouse.move(start2X, start2Y);
    await page.mouse.down();
    await page.mouse.move(target3X, target3Y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // After collision resolution, HOME-2 should NOT be at the exact same
    // coordinates as HOME-3 — there should be at least MIN_PLAYER_SEPARATION
    const p2After = await getTacticalCoords(page, "HOME-2");
    const p3After = await getTacticalCoords(page, "HOME-3");
    const distance = Math.hypot(p2After.x - p3After.x, p2After.y - p3After.y);

    // MIN_PLAYER_SEPARATION = 6, allow a small tolerance
    expect(distance).toBeGreaterThanOrEqual(4);
  });
});
