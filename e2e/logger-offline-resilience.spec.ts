import {
  test,
  expect,
  request,
  APIRequestContext,
  Page,
} from "@playwright/test";

import {
  BACKEND_BASE_URL,
  expectLiveEventCount,
  forceSocketDisconnect,
  forceSocketReconnect,
  getQueuedBadge,
  gotoLoggerPage,
  resetHarnessFlow,
  submitStandardPass,
  waitForPendingAckToClear,
} from "./utils/logger";

const OFFLINE_MATCH_ID = "E2E-MATCH-OFFLINE";

let backendRequest: APIRequestContext;

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

const queuedBadge = (page: Page) => getQueuedBadge(page);

test.beforeEach(async () => {
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId: OFFLINE_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
});

test.describe("Logger offline resilience", () => {
  test("queues events while offline and flushes after reconnect", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, OFFLINE_MATCH_ID);
    await resetHarnessFlow(page);

    await submitStandardPass(page);

    await waitForPendingAckToClear(page);

    await expectLiveEventCount(page, 1);

    await forceSocketDisconnect(page);

    await resetHarnessFlow(page, "away");

    await submitStandardPass(page, "away");

    await expect(queuedBadge(page)).toBeVisible({ timeout: 10000 });
    await expect(queuedBadge(page)).toHaveText(/^1\D*/i);

    await forceSocketReconnect(page);

    await waitForPendingAckToClear(page);
    await expect(queuedBadge(page)).toBeHidden();
    await expectLiveEventCount(page, 2);

    await page.reload();
    await expect(page.getByTestId("field-player-HOME-1")).toBeVisible();
    await expectLiveEventCount(page, 2);
  });
});
