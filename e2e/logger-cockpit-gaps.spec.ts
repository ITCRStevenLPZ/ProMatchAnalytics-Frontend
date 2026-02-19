import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  BACKEND_BASE_URL,
  ensureClockRunning,
  expectLiveEventCount,
  forceSocketDisconnect,
  getHarnessMatchContext,
  getQueuedBadge,
  gotoLoggerPage,
  resetHarnessFlow,
  sendRawEventThroughHarness,
  submitStandardPass,
  waitForPendingAckToClear,
} from "./utils/logger";

const GAP_MATCH_ID = "E2E-LOGGER-GAPS";

let backendRequest: APIRequestContext;

const setRole = async (page: Page, role: "viewer" | "analyst" | "admin") => {
  await page.waitForFunction(() => (globalThis as any).__PROMATCH_AUTH_STORE__);
  await page.evaluate((newRole) => {
    const store = (globalThis as any).__PROMATCH_AUTH_STORE__;
    const currentUser = store?.getState?.().user || {
      uid: "e2e-user",
      email: "e2e-user@example.com",
      displayName: "E2E User",
      photoURL: "",
    };
    store?.getState?.().setUser?.({ ...currentUser, role: newRole });
  }, role);
  await page.waitForFunction(
    (r) =>
      (globalThis as any).__PROMATCH_AUTH_STORE__?.getState().user?.role === r,
    role,
  );
};

const resetMatch = async (
  matchId: string,
  options?: {
    status?: string;
    matchTimeSeconds?: number;
    ineffectiveTimeSeconds?: number;
    periodTimestamps?: Record<string, unknown>;
  },
) => {
  const response = await backendRequest.post("/e2e/reset", {
    data: {
      matchId,
      status: options?.status,
      matchTimeSeconds: options?.matchTimeSeconds,
      ineffectiveTimeSeconds: options?.ineffectiveTimeSeconds,
      periodTimestamps: options?.periodTimestamps,
    },
  });
  expect(response.ok()).toBeTruthy();
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

test.beforeEach(async ({ page }) => {
  await resetMatch(GAP_MATCH_ID);
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
});

test.describe("Logger cockpit critical gap closures", () => {
  test.describe.configure({ mode: "serial" });

  test("G-01: cancels ineffective note modal without logging stoppage", async ({
    page,
  }) => {
    await gotoLoggerPage(page, GAP_MATCH_ID);
    await setRole(page, "admin");
    await resetHarnessFlow(page);
    await ensureClockRunning(page);

    const baselineCount = await page.getByTestId("live-event-item").count();

    await page.getByTestId("btn-ineffective-event").click();
    await expect(page.getByTestId("ineffective-note-modal")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("ineffective-note-cancel").click();

    await expect(page.getByTestId("ineffective-note-modal")).toBeHidden({
      timeout: 10000,
    });
    await expect(page.getByTestId("btn-resume-effective")).toHaveCount(0);
    await expect(page.getByTestId("live-event-item")).toHaveCount(
      baselineCount,
    );
  });

  test("G-02: updates event notes from live feed", async ({ page }) => {
    await gotoLoggerPage(page, GAP_MATCH_ID);
    await setRole(page, "admin");
    await resetHarnessFlow(page);

    await submitStandardPass(page);
    await waitForPendingAckToClear(page);
    await expectLiveEventCount(page, 1);

    await page.getByTestId("event-note-edit").first().click();
    await page.getByTestId("event-note-textarea").fill("E2E updated note");
    await page.getByTestId("event-note-save").click();

    await expect(page.getByText("E2E updated note").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("G-03: treats zeroed fulltime fixture as pending/first-half operator state", async ({
    page,
  }) => {
    const zeroedMatchId = `${GAP_MATCH_ID}-ZEROED`;
    await resetMatch(zeroedMatchId, {
      status: "Fulltime",
      matchTimeSeconds: 0,
      ineffectiveTimeSeconds: 0,
      periodTimestamps: {},
    });

    await gotoLoggerPage(page, zeroedMatchId);
    await setRole(page, "admin");

    await expect(page.getByTestId("period-status-first-half")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("clock-locked-banner")).toHaveCount(0);
    await expect(page.getByTestId("btn-end-first-half")).toBeVisible({
      timeout: 10000,
    });
  });

  test("G-04/G-08: shows drift nudge and resync action", async ({ page }) => {
    let matchFetchCount = 0;
    await page.route(
      `**/api/v1/logger/matches/${GAP_MATCH_ID}`,
      async (route) => {
        matchFetchCount += 1;
        await route.continue();
      },
    );

    await gotoLoggerPage(page, GAP_MATCH_ID);
    await setRole(page, "admin");
    await resetHarnessFlow(page);
    await ensureClockRunning(page);

    await page.evaluate(() => {
      (window as any).__PROMATCH_FORCE_DRIFT_SECONDS__ = 3.5;
    });
    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
            return harness?.getDriftSnapshot?.()?.show ?? false;
          }),
        { timeout: 15000 },
      )
      .toBe(true);

    await expect
      .poll(() => matchFetchCount, { timeout: 15000 })
      .toBeGreaterThan(1);

    const resyncButton = page.getByTestId("clock-drift-resync");
    await expect(resyncButton).toBeVisible({ timeout: 10000 });

    await resyncButton.click();
    await page.evaluate(() => {
      (window as any).__PROMATCH_FORCE_DRIFT_SECONDS__ = 0;
    });
    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
            return harness?.getDriftSnapshot?.()?.show ?? false;
          }),
        { timeout: 15000 },
      )
      .toBe(false);
    await expect(page.getByTestId("clock-drift-banner")).toBeHidden({
      timeout: 10000,
    });
  });

  test("G-05: deletes pending (unacked) event from feed", async ({ page }) => {
    await gotoLoggerPage(page, GAP_MATCH_ID);
    await setRole(page, "admin");
    await resetHarnessFlow(page);

    await forceSocketDisconnect(page);
    await submitStandardPass(page);

    await expect(getQueuedBadge(page)).toBeVisible({ timeout: 10000 });
    const deletePendingButton = page
      .getByTitle(/Delete pending event|Eliminar evento pendiente/i)
      .first();
    await expect(deletePendingButton).toBeVisible({ timeout: 10000 });

    await deletePendingButton.click();

    await expect(page.getByTestId("live-event-item")).toHaveCount(0, {
      timeout: 10000,
    });
    await expect(getQueuedBadge(page)).toBeHidden({ timeout: 10000 });
  });

  test("G-06: goal event auto-starts ineffective mode", async ({ page }) => {
    await gotoLoggerPage(page, GAP_MATCH_ID);
    await setRole(page, "admin");
    await resetHarnessFlow(page);

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendRawEventThroughHarness(page, {
      match_clock: "05:10.000",
      period: 1,
      team_id: context?.homeTeamId,
      player_id: "HOME-1",
      type: "Shot",
      data: {
        shot_type: "Standard",
        outcome: "Goal",
      },
    });
    await waitForPendingAckToClear(page);

    await expect(page.getByTestId("btn-resume-effective").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("G-07: reset modal shows blocked warning while unsent events exist", async ({
    page,
  }) => {
    await gotoLoggerPage(page, GAP_MATCH_ID);
    await setRole(page, "admin");
    await resetHarnessFlow(page);

    await forceSocketDisconnect(page);
    await submitStandardPass(page);
    await expect(getQueuedBadge(page)).toBeVisible({ timeout: 10000 });

    await page.getByTestId("btn-reset-clock").click();
    await page.getByPlaceholder("RESET").fill("RESET");
    await page.getByTestId("reset-confirm-button").click();

    await expect(page.getByTestId("live-event-item")).toHaveCount(1, {
      timeout: 5000,
    });
    await expect(getQueuedBadge(page)).toBeVisible({ timeout: 5000 });
  });

  test("G-09: shows toast with retry action and supports dismiss", async ({
    page,
  }) => {
    const toastMatchId = `${GAP_MATCH_ID}-TOAST`;
    await resetMatch(toastMatchId, {
      status: "Live_First_Half",
      matchTimeSeconds: 46 * 60,
    });

    let statusPatchCount = 0;
    await page.route("**/api/v1/logger/matches/**/status", async (route) => {
      statusPatchCount += 1;
      if (statusPatchCount === 1) {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await gotoLoggerPage(page, toastMatchId);
    await setRole(page, "admin");

    await page.getByTestId("btn-end-first-half").click();
    const toast = page.getByTestId("logger-toast");
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText(/Failed to update status to Halftime/i);
    await expect(toast.getByRole("button", { name: "Retry" })).toBeVisible();

    await toast.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByTestId("period-status-halftime")).toBeVisible({
      timeout: 15000,
    });

    await toast.getByLabel(/Dismiss toast/i).click();
    await expect(toast).toBeHidden({ timeout: 10000 });
  });
});
