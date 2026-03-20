import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  ensureClockRunning,
  resetHarnessFlow,
  selectZoneIfVisible,
  waitForPendingAckToClear,
} from "./utils/logger";

const TOUCH_MATCH_ID = "E2E-MATCH-TOUCH";

const AUTH_USER = {
  uid: "e2e-admin",
  email: "e2e-admin@example.com",
  displayName: "E2E Admin",
  role: "admin",
};

let backendRequest: APIRequestContext;

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 1024, height: 1366 },
});

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
    data: { matchId: TOUCH_MATCH_ID },
  });
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  await page.addInitScript((user) => {
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({ state: { user }, version: 0 }),
    );
  }, AUTH_USER);
});

const ensureAdminRole = async (page: Page) => {
  await page.evaluate((user) => {
    const store = (window as any).__PROMATCH_AUTH_STORE__;
    if (store?.getState) {
      store.getState().setUser(user);
    }
  }, AUTH_USER);
};

const tapLocator = async (page: Page, locator: Locator) => {
  await expect(locator).toBeVisible({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  await locator.tap();
};

test("touch taps support destination selection and undo", async ({ page }) => {
  test.setTimeout(60000);
  await gotoLoggerPage(page, TOUCH_MATCH_ID);
  await ensureAdminRole(page);
  await ensureClockRunning(page);

  const initialCount = await page.getByTestId("live-event-item").count();

  await tapLocator(page, page.getByTestId("field-player-HOME-3"));
  await selectZoneIfVisible(page, 7);
  await tapLocator(page, page.getByTestId("quick-action-Pass"));

  await expect(page.getByTestId("field-cancel-btn")).toBeVisible({
    timeout: 10000,
  });

  // Pass must target a player or out-of-bounds. Use teammate touch target.
  await tapLocator(page, page.getByTestId("field-player-HOME-4"));

  await waitForPendingAckToClear(page);
  await expect
    .poll(async () => page.getByTestId("live-event-item").count(), {
      timeout: 10000,
    })
    .toBeGreaterThan(initialCount);

  await tapLocator(page, page.getByTestId("undo-button"));
  await waitForPendingAckToClear(page);
  await expect
    .poll(async () => page.getByTestId("live-event-item").count(), {
      timeout: 10000,
    })
    .toBe(initialCount);
});

test("touch zone selection requires two taps — first highlights, second confirms", async ({
  page,
}) => {
  test.setTimeout(60000);
  await gotoLoggerPage(page, TOUCH_MATCH_ID);
  await ensureAdminRole(page);
  await ensureClockRunning(page);
  await resetHarnessFlow(page, "home");

  // Click a player to enter zone selection step (mouse click — we test
  // touch specifically on the zone buttons, not on the player node)
  await page.getByTestId("field-player-HOME-3").click();
  await expect(page.getByTestId("field-zone-selector")).toBeVisible({
    timeout: 8000,
  });

  const zone7 = page.getByTestId("zone-select-7");

  // First tap on zone 7 — should highlight (preview) but NOT confirm
  await zone7.tap();

  // Zone should be touch-highlighted
  await expect(zone7).toHaveAttribute("data-zone-touched", "true", {
    timeout: 3000,
  });

  // Zone selector must still be on screen (zone was NOT selected yet)
  await expect(page.getByTestId("field-zone-selector")).toBeVisible();

  // Quick action menu must NOT be visible — zone not confirmed
  const quickPass = page.getByTestId("quick-action-Pass");
  await expect(quickPass).toBeHidden({ timeout: 2000 });

  // Second tap on the SAME zone — should confirm the selection
  await zone7.tap();

  // Quick action menu should now appear
  await expect(quickPass).toBeVisible({ timeout: 8000 });
});

test("touch tap on a different zone switches the highlight", async ({
  page,
}) => {
  test.setTimeout(60000);
  await gotoLoggerPage(page, TOUCH_MATCH_ID);
  await ensureAdminRole(page);
  await ensureClockRunning(page);
  await resetHarnessFlow(page, "home");

  await page.getByTestId("field-player-HOME-3").click();
  await expect(page.getByTestId("field-zone-selector")).toBeVisible({
    timeout: 8000,
  });

  const zone7 = page.getByTestId("zone-select-7");
  const zone13 = page.getByTestId("zone-select-13");

  // First tap on zone 7
  await zone7.tap();
  await expect(zone7).toHaveAttribute("data-zone-touched", "true", {
    timeout: 3000,
  });

  // Tap a different zone (13) — highlight should move
  await zone13.tap();
  await expect(zone13).toHaveAttribute("data-zone-touched", "true", {
    timeout: 3000,
  });
  // Zone 7 should no longer be highlighted
  await expect(zone7).not.toHaveAttribute("data-zone-touched", "true", {
    timeout: 3000,
  });

  // Zone selector still visible — no zone confirmed yet
  await expect(page.getByTestId("field-zone-selector")).toBeVisible();

  // Second tap on zone 13 confirms
  await zone13.tap();
  await expect(page.getByTestId("quick-action-Pass")).toBeVisible({
    timeout: 8000,
  });
});

test("touch tap on player opens zone selector or quick actions without getting stuck", async ({
  page,
}) => {
  test.setTimeout(60000);
  await gotoLoggerPage(page, TOUCH_MATCH_ID);
  await ensureAdminRole(page);
  await ensureClockRunning(page);
  await resetHarnessFlow(page, "home");

  // Touch-tap a player node — must advance past selectPlayer (not get stuck)
  await tapLocator(page, page.getByTestId("field-player-HOME-3"));

  // Depending on position mode (Manual → zone selector, Auto → quick actions)
  const zoneSelector = page.getByTestId("field-zone-selector");
  const quickMenu = page.getByTestId("quick-action-menu");

  const zoneVisible = await zoneSelector
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  if (zoneVisible) {
    // Manual mode: confirm zone with two taps (touch two-tap flow)
    const zone7 = page.getByTestId("zone-select-7");
    await zone7.tap();
    await zone7.tap();
    await expect(quickMenu).toBeVisible({ timeout: 8000 });
  } else {
    // Auto mode: quick action menu should already be visible
    await expect(quickMenu).toBeVisible({ timeout: 8000 });
  }

  // Quick action buttons must be interactive
  await expect(page.getByTestId("quick-action-Pass")).toBeVisible({
    timeout: 3000,
  });
});
