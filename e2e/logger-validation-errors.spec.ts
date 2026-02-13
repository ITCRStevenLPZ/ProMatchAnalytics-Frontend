import {
  test,
  expect,
  request,
  APIRequestContext,
  Page,
} from "@playwright/test";

import {
  BACKEND_BASE_URL,
  MATCH_ID,
  gotoLoggerPage,
  resetHarnessFlow,
  triggerInvalidPassEvent,
  waitForPendingAckToClear,
} from "./utils/logger";

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

test.beforeEach(async () => {
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId: MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
});

const queuedBadge = (page: Page) => page.getByTestId("queued-badge");

test.describe("Logger validation handling", () => {
  test("keeps invalid events queued and surfaces the queued badge", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page);
    await resetHarnessFlow(page);

    await triggerInvalidPassEvent(page);
    await waitForPendingAckToClear(page);

    await expect(queuedBadge(page)).toBeVisible();
    await expect(queuedBadge(page)).toHaveText(/^1\D*/i);
  });
});
