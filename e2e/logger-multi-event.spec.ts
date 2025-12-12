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
  gotoLoggerPage,
  resetHarnessFlow,
  submitStandardPass,
  submitStandardShot,
  waitForPendingAckToClear,
} from "./utils/logger";

const MULTI_MATCH_ID = "E2E-MATCH-MULTI";

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
    data: { matchId: MULTI_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
});

const getLiveEvents = (page: Page) => page.getByTestId("live-event-item");

test.describe("Logger multi-event timeline", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      (user) => {
        try {
          localStorage.setItem(
            "auth-storage",
            JSON.stringify({ state: { user }, version: 0 }),
          );
        } catch {}
      },
      {
        uid: "e2e-admin",
        email: "e2e-admin@example.com",
        displayName: "E2E Admin",
        photoURL: "",
        role: "admin",
      },
    );
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  });

  test("records events for both teams and persists after reload", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, MULTI_MATCH_ID);
    await resetHarnessFlow(page, "home");

    await submitStandardPass(page, "home");
    await waitForPendingAckToClear(page);
    await expectLiveEventCount(page, 1);
    await expect(getLiveEvents(page).first()).toContainText("Pass");

    await resetHarnessFlow(page, "away");
    await submitStandardShot(page, "away");
    await waitForPendingAckToClear(page);

    await expectLiveEventCount(page, 2);
    const liveEvents = getLiveEvents(page);
    await expect(liveEvents.nth(0)).toContainText("Shot");
    await expect(liveEvents.nth(1)).toContainText("Pass");

    await page.reload();
    await expect(page.getByTestId("player-card-HOME-1")).toBeVisible();
    await expectLiveEventCount(page, 2);
    await expect(getLiveEvents(page).filter({ hasText: "Shot" })).toHaveCount(
      1,
    );
    await expect(getLiveEvents(page).filter({ hasText: "Pass" })).toHaveCount(
      1,
    );
  });
});
