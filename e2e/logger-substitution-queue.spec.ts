/**
 * E2E: Home & away substitutions must succeed without getting stuck in queue.
 *
 * Covers the bug where `record_substitution_in_match` could throw (e.g.
 * case-insensitive team_id mismatch), sending an "error" ack that stranded
 * events in the queue permanently while the WebSocket was connected.
 */
import {
  test,
  expect,
  request,
  APIRequestContext,
  Page,
} from "@playwright/test";
import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  resetHarnessFlow,
  selectZoneIfVisible,
  waitForPendingAckToClear,
  getQueuedBadge,
  getQueueSnapshot,
  getHarnessMatchContext,
} from "./utils/logger";
import { uniqueId } from "./utils/admin";

const makeMatchId = () => uniqueId("E2E-SUB-QUEUE");
let backendRequest: APIRequestContext;
let matchId: string;

const promoteToAdmin = async (page: Page) => {
  await page.evaluate(() => {
    const store = (window as any).__PROMATCH_AUTH_STORE__;
    const currentUser = store?.getState?.().user || {
      uid: "e2e-admin",
      email: "e2e-admin@example.com",
      displayName: "E2E Admin",
      photoURL: "",
    };
    store?.getState?.().setUser?.({
      ...currentUser,
      role: "admin",
      displayName: currentUser.displayName || "E2E Admin",
    });
  });
};

const resetMatch = async (id: string) => {
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId: id },
  });
  expect(response.ok()).toBeTruthy();
};

/**
 * Perform a substitution for the given team via the quick-sub button.
 */
const performSubstitution = async (
  page: Page,
  team: "home" | "away",
  offIndex: number,
  onIndex: number,
) => {
  const teamTag = team.toUpperCase();
  // Click a field player to give context, then open quick-sub
  await page.getByTestId(`field-player-${teamTag}-${offIndex}`).click();
  await selectZoneIfVisible(page);
  await page.getByTestId("quick-action-more").click({ timeout: 8000 });
  await page.getByTestId("action-btn-Substitution").click();

  const subModal = page.getByTestId("substitution-modal");
  await expect(subModal).toBeVisible({ timeout: 10000 });

  // Select player off — first item in list (may differ from offIndex)
  const offOption = subModal.locator('[data-testid^="sub-off-"]').first();
  await expect(offOption).toBeVisible();
  await offOption.click();

  // Select player on — first bench player shown
  const onOption = subModal.locator('[data-testid^="sub-on-"]').first();
  await expect(onOption).toBeVisible();
  await onOption.click();

  // Confirm
  const confirmBtn = subModal.getByTestId("confirm-substitution");
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click();
  } else {
    // May land on step-confirm first
    await subModal
      .getByTestId("substitution-step-confirm")
      .waitFor({ timeout: 5000 });
    await confirmBtn.click();
  }

  await expect(subModal).toBeHidden({ timeout: 10000 });
};

test.beforeAll(async () => {
  backendRequest = await request.newContext({
    baseURL: BACKEND_BASE_URL,
    extraHTTPHeaders: {
      Authorization: "Bearer e2e-playwright",
    },
  });
});

test.afterAll(async () => {
  await backendRequest?.dispose();
});

test.describe("Substitution queue resilience (home + away)", () => {
  test.beforeEach(async ({ page }) => {
    matchId = makeMatchId();
    await resetMatch(matchId);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  });

  test("home team substitution succeeds and is not queued", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await page.route(
      "**/api/v1/logger/matches/**/validate-substitution",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            is_valid: true,
            error_message: null,
            opens_new_window: true,
            team_status: {
              total_substitutions: 1,
              max_substitutions: 5,
              remaining_substitutions: 4,
              windows_used: 1,
              max_windows: 3,
              remaining_windows: 2,
              is_extra_time: false,
              concussion_subs_used: 0,
            },
          }),
        }),
    );

    await gotoLoggerPage(page, matchId);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    await performSubstitution(page, "home", 1, 12);
    await waitForPendingAckToClear(page);

    // Queue badge should NOT be visible — event was ack'd successfully
    await expect(getQueuedBadge(page)).toHaveCount(0, { timeout: 5000 });

    // Verify via harness that queue is empty
    const snap = await getQueueSnapshot(page);
    expect(snap?.queuedEvents?.length ?? 0).toBe(0);
  });

  test("away team substitution succeeds and is not queued", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await page.route(
      "**/api/v1/logger/matches/**/validate-substitution",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            is_valid: true,
            error_message: null,
            opens_new_window: true,
            team_status: {
              total_substitutions: 1,
              max_substitutions: 5,
              remaining_substitutions: 4,
              windows_used: 1,
              max_windows: 3,
              remaining_windows: 2,
              is_extra_time: false,
              concussion_subs_used: 0,
            },
          }),
        }),
    );

    await gotoLoggerPage(page, matchId);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    await performSubstitution(page, "away", 1, 12);
    await waitForPendingAckToClear(page);

    await expect(getQueuedBadge(page)).toHaveCount(0, { timeout: 5000 });

    const snap = await getQueueSnapshot(page);
    expect(snap?.queuedEvents?.length ?? 0).toBe(0);
  });

  test("three consecutive home subs are not stuck in queue", async ({
    page,
  }) => {
    test.setTimeout(180000);

    await page.route(
      "**/api/v1/logger/matches/**/validate-substitution",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            is_valid: true,
            error_message: null,
            opens_new_window: false,
            team_status: {
              total_substitutions: 3,
              max_substitutions: 5,
              remaining_substitutions: 2,
              windows_used: 1,
              max_windows: 3,
              remaining_windows: 2,
              is_extra_time: false,
              concussion_subs_used: 0,
            },
          }),
        }),
    );

    await gotoLoggerPage(page, matchId);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    // Perform 3 consecutive home subs
    for (let i = 1; i <= 3; i++) {
      await resetHarnessFlow(page);
      await performSubstitution(page, "home", i, 11 + i);
      // Brief pause to let WS ack arrive
      await page.waitForTimeout(1500);
    }

    await waitForPendingAckToClear(page);

    // No events should be stuck in queue
    await expect(getQueuedBadge(page)).toHaveCount(0, { timeout: 10000 });

    const snap = await getQueueSnapshot(page);
    expect(snap?.queuedEvents?.length ?? 0).toBe(0);
  });

  test("queued events are retried automatically while connected", async ({
    page,
  }) => {
    test.setTimeout(120000);

    let callCount = 0;

    await page.route(
      "**/api/v1/logger/matches/**/validate-substitution",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            is_valid: true,
            error_message: null,
            opens_new_window: true,
            team_status: {
              total_substitutions: 1,
              max_substitutions: 5,
              remaining_substitutions: 4,
              windows_used: 1,
              max_windows: 3,
              remaining_windows: 2,
              is_extra_time: false,
              concussion_subs_used: 0,
            },
          }),
        }),
    );

    await gotoLoggerPage(page, matchId);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    // Insert a synthetic queued event via the harness
    const ctx = await getHarnessMatchContext(page);
    await page.evaluate(
      ({ matchId, homeTeamId }) => {
        const store = (window as any).__useMatchLogStore;
        if (store?.getState) {
          store.getState().addQueuedEvent({
            match_id: matchId,
            match_clock: "20:00.000",
            period: 1,
            team_id: homeTeamId,
            type: "Substitution",
            timestamp: new Date().toISOString(),
            client_id: `e2e-retry-${Date.now()}`,
            data: {
              player_off_id: "HOME-5",
              player_on_id: "HOME-15",
              is_concussion: false,
            },
          });
        }
      },
      { matchId: ctx!.matchId, homeTeamId: ctx!.homeTeamId },
    );

    // The periodic retry (10s interval) should pick it up.
    // Wait up to 20s for the queue to drain.
    await expect
      .poll(
        async () => {
          const snap = await getQueueSnapshot(page);
          return snap?.queuedEvents?.length ?? 0;
        },
        { timeout: 20000, intervals: [2000] },
      )
      .toBe(0);
  });
});
