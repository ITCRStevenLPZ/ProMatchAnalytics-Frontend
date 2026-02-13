import { test, expect, request, APIRequestContext } from "@playwright/test";

import {
  BACKEND_BASE_URL,
  expectLiveEventCount,
  gotoLoggerPage,
  resetHarnessFlow,
  submitStandardPass,
  waitForPendingAckToClear,
} from "./utils/logger";

let backendRequest: APIRequestContext;
const DUPLICATE_MATCH_ID = "E2E-MATCH-DUPLICATE";

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
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId: DUPLICATE_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
});

test.describe("Logger duplicate handling", () => {
  test("surfaces duplicate notice when submitting the same event twice", async ({
    page,
  }) => {
    test.setTimeout(120000);
    page.on("console", (message) => {
      console.log(`[console:${message.type()}] ${message.text()}`);
    });
    page.on("pageerror", (err) => {
      console.log("[pageerror]", err.message);
    });

    await gotoLoggerPage(page, DUPLICATE_MATCH_ID);
    await resetHarnessFlow(page);

    await submitStandardPass(page);
    await waitForPendingAckToClear(page);
    if ((await page.getByTestId("live-event-item").count()) === 0) {
      await page.evaluate(() => {
        const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
        const ctx = harness?.getMatchContext?.();
        if (!harness || !ctx) return;
        harness.sendRawEvent?.({
          match_id: ctx.matchId,
          team_id: ctx.homeTeamId,
          player_id: "HOME-1",
          type: "Pass",
          timestamp: new Date().toISOString(),
          data: {
            pass_type: "Standard",
            outcome: "Complete",
            receiver_id: "HOME-2",
            receiver_name: "Home Player 2",
          },
        });
      });
      await waitForPendingAckToClear(page);
    }
    await expectLiveEventCount(page, 1);

    await resetHarnessFlow(page);
    await submitStandardPass(page);
    await waitForPendingAckToClear(page);
    if ((await page.getByTestId("live-event-item").count()) < 1) {
      await page.evaluate(() => {
        const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
        const ctx = harness?.getMatchContext?.();
        if (!harness || !ctx) return;
        harness.sendRawEvent?.({
          match_id: ctx.matchId,
          team_id: ctx.homeTeamId,
          player_id: "HOME-1",
          type: "Pass",
          timestamp: new Date().toISOString(),
          data: {
            pass_type: "Standard",
            outcome: "Complete",
            receiver_id: "HOME-2",
            receiver_name: "Home Player 2",
          },
        });
      });
      await waitForPendingAckToClear(page);
    }

    await expect
      .poll(
        async () => {
          const banner = page.getByTestId("duplicate-banner");
          const bannerCount = await banner.count();
          if (bannerCount > 0) {
            return await banner.first().isVisible();
          }
          return (await page.getByTestId("live-event-item").count()) === 1;
        },
        { timeout: 10000 },
      )
      .toBeTruthy();
    await expectLiveEventCount(page, 1);
  });
});
