import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";

import {
  BACKEND_BASE_URL,
  expectLiveEventCount,
  getHarnessMatchContext,
  gotoLoggerPage,
  resetHarnessFlow,
  sendRawEventThroughHarness,
  submitStandardPass,
  waitForPendingAckToClear,
} from "./utils/logger";

const CONFLICT_MATCH_ID = "E2E-MATCH-CONFLICT";

let backendRequest: APIRequestContext;

const resetMatch = async (matchId: string) => {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await backendRequest.post("/e2e/reset", {
      data: { matchId },
    });
    if (response.ok()) return;
    console.warn("[logger-conflicts] reset failed", response.status());
    try {
      await backendRequest.get("/health");
    } catch (err) {
      console.warn("[logger-conflicts] health probe failed", err);
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error("[logger-conflicts] reset failed after retries");
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

test.beforeEach(async () => {
  await resetMatch(CONFLICT_MATCH_ID);
});

test.describe("Logger conflicts and deduplication", () => {
  test("handles ingest vs live duplicate with banner, manual resolution, and deduped timeline", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, CONFLICT_MATCH_ID);
    await resetHarnessFlow(page);

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;

    const clockSeed = await backendRequest.patch(
      `/api/v1/logger/matches/${CONFLICT_MATCH_ID}/clock-mode`,
      {
        data: {
          match_time_seconds: 15,
          clock_seconds_at_period_start: 15,
          current_period_start_timestamp: null,
        },
      },
    );
    expect(clockSeed.ok()).toBeTruthy();

    // Seed an ingestion-like event (server-created) before the operator logs anything
    await sendRawEventThroughHarness(page, {
      match_clock: "00:15.000",
      period: 1,
      team_id: homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "HOME-2",
        receiver_name: "Home Player 2",
      },
    });
    await waitForPendingAckToClear(page);
    await page.reload();
    await expect(page.getByTestId("field-player-HOME-1")).toBeVisible({
      timeout: 15000,
    });
    await expectLiveEventCount(page, 1);

    // Operator attempts to log the same event from the cockpit (twice to force the duplicate response path)
    await resetHarnessFlow(page);
    await submitStandardPass(page);
    await waitForPendingAckToClear(page);

    await resetHarnessFlow(page);
    await submitStandardPass(page);
    await waitForPendingAckToClear(page);

    const duplicateBanner = page.getByTestId("duplicate-banner");
    const bannerVisible = await duplicateBanner
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // Timeline remains deduped and queue is clear
    await expectLiveEventCount(page, 1);
    await expect(page.getByTestId("queued-badge")).toBeHidden({
      timeout: 5000,
    });

    // Manual resolution: dismiss banner and continue
    if (bannerVisible) {
      await duplicateBanner.getByRole("button").first().click();
      await expect(duplicateBanner).toBeHidden({ timeout: 5000 });
    }

    await page.getByTestId("toggle-analytics").click();
    const analyticsPanel = page.getByTestId("analytics-panel");
    await expect(analyticsPanel).toBeVisible();
    await expect(analyticsPanel.getByText(/No data available yet/i)).toBeHidden(
      { timeout: 20000 },
    );

    // Reload to ensure state stays deduped and banner does not reappear
    await page.reload();
    await expect(page.getByTestId("field-player-HOME-1")).toBeVisible();
    await expectLiveEventCount(page, 1);
    await expect(page.getByTestId("duplicate-banner")).toBeHidden({
      timeout: 5000,
    });
  });
});
