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
  resetHarnessFlow,
  submitStandardPass,
  waitForPendingAckToClear,
  ensureClockRunning,
} from "./utils/logger";

// ---------------------------------------------------------------------------
// Formation rotation + Review view E2E tests
//
// Covers:
//   1. Formation pickers swap sides when field is flipped
//   2. Flip & Undo buttons are centered between formation pickers
//   3. Review view is accessible via ?view=review URL param
//   4. Review view shows events and supports inline editing
//   5. Multi-tab: Tab A logs events, Tab B in review mode sees them
// ---------------------------------------------------------------------------

const AUTH_USER = {
  uid: "e2e-admin",
  email: "e2e-admin@example.com",
  displayName: "E2E Admin",
  role: "admin",
};

let backendRequest: APIRequestContext;

async function resetMatch(matchId: string) {
  const r = await backendRequest.post("/e2e/reset", { data: { matchId } });
  expect(r.ok()).toBeTruthy();
}

test.beforeAll(async () => {
  backendRequest = await request.newContext({
    baseURL: BACKEND_BASE_URL,
    extraHTTPHeaders: { Authorization: "Bearer e2e-playwright" },
  });
});

test.afterAll(async () => {
  await backendRequest?.dispose();
});

const ensureAdminRole = async (page: Page) => {
  await page.evaluate((user) => {
    const store = (window as any).__PROMATCH_AUTH_STORE__;
    if (store?.getState) {
      store.getState().setUser(user);
    }
  }, AUTH_USER);
};

// ---------------------------------------------------------------------------
// Formation Rotation Tests
// ---------------------------------------------------------------------------

test.describe("Formation Rotation", () => {
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

  test("formation pickers swap sides when field is flipped", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    // Verify initial state: left slot has home formation, right has away
    const leftSlot = page.getByTestId("formation-slot-left");
    const rightSlot = page.getByTestId("formation-slot-right");
    await expect(leftSlot).toBeVisible({ timeout: 15000 });
    await expect(rightSlot).toBeVisible({ timeout: 15000 });

    // Before flip: left should have home picker, right should have away picker
    await expect(
      leftSlot.locator('[data-testid="formation-picker-home"]'),
    ).toBeVisible();
    await expect(
      rightSlot.locator('[data-testid="formation-picker-away"]'),
    ).toBeVisible();

    // Flip the field
    await page.getByTestId("toggle-field-flip").click();
    await page.waitForTimeout(300);

    // After flip: left should have away picker, right should have home picker
    await expect(
      leftSlot.locator('[data-testid="formation-picker-away"]'),
    ).toBeVisible();
    await expect(
      rightSlot.locator('[data-testid="formation-picker-home"]'),
    ).toBeVisible();

    // Flip back
    await page.getByTestId("toggle-field-flip").click();
    await page.waitForTimeout(300);

    // Should be back to original
    await expect(
      leftSlot.locator('[data-testid="formation-picker-home"]'),
    ).toBeVisible();
    await expect(
      rightSlot.locator('[data-testid="formation-picker-away"]'),
    ).toBeVisible();
  });

  test("flip + undo buttons are centered between formation pickers", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    const leftSlot = page.getByTestId("formation-slot-left");
    const rightSlot = page.getByTestId("formation-slot-right");
    const flipBtn = page.getByTestId("toggle-field-flip");
    const undoBtn = page.getByTestId("undo-button");

    await expect(leftSlot).toBeVisible({ timeout: 15000 });
    await expect(flipBtn).toBeVisible();
    await expect(undoBtn).toBeVisible();
    await expect(rightSlot).toBeVisible();

    // Verify left-to-right ordering: leftSlot < flipBtn < undoBtn < rightSlot
    const leftBox = await leftSlot.boundingBox();
    const flipBox = await flipBtn.boundingBox();
    const undoBox = await undoBtn.boundingBox();
    const rightBox = await rightSlot.boundingBox();

    expect(leftBox).toBeTruthy();
    expect(flipBox).toBeTruthy();
    expect(undoBox).toBeTruthy();
    expect(rightBox).toBeTruthy();

    // Left slot should be to the left of flip button
    expect(leftBox!.x + leftBox!.width).toBeLessThanOrEqual(flipBox!.x + 10);
    // Flip button should be to the left of undo button
    expect(flipBox!.x).toBeLessThan(undoBox!.x + undoBox!.width);
    // Right slot should be to the right of undo button
    expect(undoBox!.x + undoBox!.width).toBeLessThanOrEqual(rightBox!.x + 10);
  });

  test("formation selection persists after flip and unflip", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    await expect(page.getByTestId("formation-slot-left")).toBeVisible({
      timeout: 15000,
    });

    // Apply 4-4-2 to home
    await page.getByTestId("formation-picker-home").click();
    await page.getByTestId("formation-preset-home-4-4-2").click();
    await page.waitForTimeout(300);

    // Verify home shows 4-4-2
    await expect(page.getByTestId("formation-picker-home")).toContainText(
      "4-4-2",
    );

    // Flip field
    await page.getByTestId("toggle-field-flip").click();
    await page.waitForTimeout(300);

    // After flip, home picker should still show 4-4-2 (just on the right side now)
    await expect(page.getByTestId("formation-picker-home")).toContainText(
      "4-4-2",
    );

    // Unflip
    await page.getByTestId("toggle-field-flip").click();
    await page.waitForTimeout(300);

    // Still shows 4-4-2 on home
    await expect(page.getByTestId("formation-picker-home")).toContainText(
      "4-4-2",
    );
  });
});

// ---------------------------------------------------------------------------
// Review View Tests
// ---------------------------------------------------------------------------

test.describe("Review View", () => {
  test("?view=review URL param opens review view directly", async ({
    page,
  }) => {
    const MID = "E2E-REVIEW-URL";
    await resetMatch(MID);

    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await page.addInitScript((user) => {
      localStorage.setItem(
        "auth-storage",
        JSON.stringify({ state: { user }, version: 0 }),
      );
    }, AUTH_USER);

    await page.goto(`/matches/${MID}/logger?view=review`);

    // The review panel should be visible
    await expect(page.getByTestId("review-panel")).toBeVisible({
      timeout: 15_000,
    });

    // The review toggle should be active (teal)
    const reviewBtn = page.getByTestId("toggle-review");
    await expect(reviewBtn).toBeVisible();
  });

  test("review view shows logged events and supports editing", async ({
    page,
  }) => {
    const MID = "E2E-REVIEW-EDIT";
    await resetMatch(MID);

    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await page.addInitScript((user) => {
      localStorage.setItem(
        "auth-storage",
        JSON.stringify({ state: { user }, version: 0 }),
      );
    }, AUTH_USER);

    // Start on logger view to log an event
    await gotoLoggerPage(page, MID);
    await ensureAdminRole(page);
    await resetHarnessFlow(page);
    await submitStandardPass(page);
    await waitForPendingAckToClear(page);

    // Confirm event in logger feed
    await expect(page.getByTestId("live-event-item")).toHaveCount(1, {
      timeout: 10_000,
    });

    // Switch to review view
    await page.getByTestId("toggle-review").click();
    await expect(page.getByTestId("review-panel")).toBeVisible({
      timeout: 10_000,
    });

    // The event should be visible in the review panel
    await expect(page.getByTestId("review-event-item")).toHaveCount(1, {
      timeout: 10_000,
    });

    // Click edit on the event
    await page.getByTestId("review-event-edit").click();

    // The edit form should appear
    await expect(page.getByTestId("review-edit-form")).toBeVisible({
      timeout: 5_000,
    });

    // Change outcome to Incomplete
    const outcomeSelect = page.getByTestId("review-edit-outcome");
    await expect(outcomeSelect).toBeVisible();
    await outcomeSelect.selectOption("Incomplete");

    // Save changes
    await page.getByTestId("review-edit-save").click();

    // Wait for save to complete (edit form should close)
    await expect(page.getByTestId("review-edit-form")).not.toBeVisible({
      timeout: 10_000,
    });

    // The event item should now show "Incomplete"
    const eventItem = page.getByTestId("review-event-item").first();
    await expect(eventItem).toContainText("Incomplete", { timeout: 5_000 });
  });

  test("review view edit can be cancelled", async ({ page }) => {
    const MID = "E2E-REVIEW-CANCEL";
    await resetMatch(MID);

    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await page.addInitScript((user) => {
      localStorage.setItem(
        "auth-storage",
        JSON.stringify({ state: { user }, version: 0 }),
      );
    }, AUTH_USER);

    // Log an event
    await gotoLoggerPage(page, MID);
    await ensureAdminRole(page);
    await resetHarnessFlow(page);
    await submitStandardPass(page);
    await waitForPendingAckToClear(page);

    // Switch to review view
    await page.getByTestId("toggle-review").click();
    await expect(page.getByTestId("review-panel")).toBeVisible({
      timeout: 10_000,
    });

    // Click edit
    await page.getByTestId("review-event-edit").click();
    await expect(page.getByTestId("review-edit-form")).toBeVisible();

    // Cancel
    await page.getByTestId("review-edit-cancel").click();
    await expect(page.getByTestId("review-edit-form")).not.toBeVisible();
  });

  test("review view filters events by type", async ({ page }) => {
    const MID = "E2E-REVIEW-FILTER";
    await resetMatch(MID);

    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await page.addInitScript((user) => {
      localStorage.setItem(
        "auth-storage",
        JSON.stringify({ state: { user }, version: 0 }),
      );
    }, AUTH_USER);

    // Log a pass event
    await gotoLoggerPage(page, MID);
    await ensureAdminRole(page);
    await resetHarnessFlow(page);
    await submitStandardPass(page);
    await waitForPendingAckToClear(page);

    // Switch to review view
    await page.getByTestId("toggle-review").click();
    await expect(page.getByTestId("review-panel")).toBeVisible({
      timeout: 10_000,
    });

    // Event should be visible initially
    await expect(page.getByTestId("review-event-item")).toHaveCount(1, {
      timeout: 10_000,
    });

    // Filter by "Shot" type — should show no events (we logged a Pass)
    const typeFilter = page.getByTestId("review-filter-type");
    await typeFilter.selectOption("Shot");
    await page.waitForTimeout(300);
    await expect(page.getByTestId("review-event-item")).toHaveCount(0);

    // Filter by "Pass" type — should show the event again
    await typeFilter.selectOption("Pass");
    await page.waitForTimeout(300);
    await expect(page.getByTestId("review-event-item")).toHaveCount(1);

    // Reset filter to "All"
    await typeFilter.selectOption("");
    await page.waitForTimeout(300);
    await expect(page.getByTestId("review-event-item")).toHaveCount(1);
  });

  test("three-way view toggle: Logger → Review → Analytics → Logger", async ({
    page,
  }) => {
    const MID = "E2E-VIEW-TOGGLE";
    await resetMatch(MID);

    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await page.addInitScript((user) => {
      localStorage.setItem(
        "auth-storage",
        JSON.stringify({ state: { user }, version: 0 }),
      );
    }, AUTH_USER);

    await gotoLoggerPage(page, MID);
    await ensureAdminRole(page);

    // Initially in logger view — field should be visible
    await expect(page.getByTestId("toggle-field-flip")).toBeVisible({
      timeout: 15_000,
    });

    // Switch to Review
    await page.getByTestId("toggle-review").click();
    await expect(page.getByTestId("review-panel")).toBeVisible({
      timeout: 10_000,
    });

    // Switch to Analytics
    const analyticsFromReview = page.getByTestId(
      "toggle-analytics-from-review",
    );
    await expect(analyticsFromReview).toBeVisible({ timeout: 5_000 });
    await analyticsFromReview.click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 10_000,
    });

    // Switch back to Logger
    await page.getByTestId("toggle-logger").click();
    await expect(page.getByTestId("toggle-field-flip")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Tab A logs events, Tab B in review mode sees them", async ({
    page,
    context,
  }) => {
    const MID = "E2E-REVIEW-MULTI-TAB";
    await resetMatch(MID);

    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await page.addInitScript((user) => {
      localStorage.setItem(
        "auth-storage",
        JSON.stringify({ state: { user }, version: 0 }),
      );
    }, AUTH_USER);

    // Tab A — logger mode
    await gotoLoggerPage(page, MID);
    await resetHarnessFlow(page);
    await ensureAdminRole(page);

    // Tab B — review mode via URL param
    const tabB = await context.newPage();
    await tabB.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await tabB.addInitScript((user) => {
      localStorage.setItem(
        "auth-storage",
        JSON.stringify({ state: { user }, version: 0 }),
      );
    }, AUTH_USER);
    await tabB.goto(`/matches/${MID}/logger?view=review`);
    await expect(tabB.getByTestId("review-panel")).toBeVisible({
      timeout: 15_000,
    });

    // Wait for Tab B's WS to connect
    await tabB.waitForTimeout(2000);

    // Log a pass on Tab A
    await submitStandardPass(page);
    await waitForPendingAckToClear(page);

    // Tab A should show the event in logger feed
    await expect(page.getByTestId("live-event-item")).toHaveCount(1, {
      timeout: 10_000,
    });

    // Tab B (review) should receive the broadcast and show the event
    await expect(tabB.getByTestId("review-event-item")).toHaveCount(1, {
      timeout: 15_000,
    });
  });
});
