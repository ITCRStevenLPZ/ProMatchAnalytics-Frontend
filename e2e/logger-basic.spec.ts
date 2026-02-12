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
  waitForPendingAckToClear,
} from "./utils/logger";

let backendRequest: APIRequestContext;
const BASIC_MATCH_ID = "E2E-MATCH-BASIC";

const ensureAdminRole = async (page: Page) => {
  await page.waitForFunction(
    () => {
      const store = (window as any).__PROMATCH_AUTH_STORE__;
      const currentUser = store?.getState?.().user;
      if (!currentUser) return false;
      if (currentUser.role !== "admin") {
        store?.getState?.().setUser?.({ ...currentUser, role: "admin" });
      }
      return store?.getState?.().user?.role === "admin";
    },
    { timeout: 15000 },
  );
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
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId: BASIC_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
});

test.describe("Logger core flows", () => {
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

  test("records a pass event and clears pending acknowledgments", async ({
    page,
  }) => {
    await gotoLoggerPage(page, BASIC_MATCH_ID);
    await ensureAdminRole(page);
    await resetHarnessFlow(page);

    const playerRow = page.getByTestId("field-player-HOME-1");
    await expect(playerRow).toBeVisible({ timeout: 10000 });
    const title = await playerRow.getAttribute("title");
    const positionMatch = title?.match(/\(([^)]+)\)$/);
    const positionText = positionMatch?.[1] ?? null;
    expect(positionText).not.toBeNull();
    if (positionText) {
      await expect(playerRow).toContainText(positionText);
    }
    const positionGroup = await playerRow.getAttribute("data-position-group");
    expect(positionGroup).not.toBeNull();

    await submitStandardPass(page);

    const pendingBadge = page.getByTestId("pending-ack-badge");

    await waitForPendingAckToClear(page);
    await expect(pendingBadge).toBeHidden({ timeout: 10000 });

    await expectLiveEventCount(page, 1);
    await expect(page.getByTestId("live-event-item").first()).toContainText(
      "Pass",
    );
  });

  test("rehydrates persisted events after a reload", async ({ page }) => {
    await gotoLoggerPage(page, BASIC_MATCH_ID);
    await ensureAdminRole(page);
    await resetHarnessFlow(page);

    await submitStandardPass(page);
    await waitForPendingAckToClear(page);
    await expectLiveEventCount(page, 1);

    await page.reload();
    await gotoLoggerPage(page, BASIC_MATCH_ID);
    await ensureAdminRole(page);
    await expectLiveEventCount(page, 1);
    await expect(page.getByTestId("live-event-item").first()).toContainText(
      "Pass",
    );
  });
});
