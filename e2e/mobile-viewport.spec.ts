import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  BACKEND_BASE_URL,
  getHarnessMatchContext,
  gotoLoggerPage,
  sendRawEventThroughHarness,
  waitForPendingAckToClear,
} from "./utils/logger";

const MOBILE_MATCH_ID = "E2E-MOBILE-VIEWPORT";

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
};

const sendEvent = async (
  page: Page,
  payload: {
    match_clock: string;
    period?: number;
    team_id: string;
    player_id: string;
    type: string;
    data: Record<string, any>;
  },
) => {
  await sendRawEventThroughHarness(page, {
    period: payload.period ?? 1,
    ...payload,
  });
  await waitForPendingAckToClear(page);
};

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
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId: MOBILE_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
});

test.describe("Mobile viewport rendering", () => {
  test("MOB-1: tactical field renders on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoLoggerPage(page, MOBILE_MATCH_ID);
    await setRole(page, "admin");

    const field = page.getByTestId("soccer-field");
    await expect(field).toBeVisible({ timeout: 15000 });

    // Players should still be visible
    await expect(page.getByTestId("field-player-HOME-1")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("field-player-AWAY-1")).toBeVisible({
      timeout: 10000,
    });
  });

  test("MOB-2: analytics panel is accessible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoLoggerPage(page, MOBILE_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:01.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    const toggleBtn = page.getByTestId("toggle-analytics");
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });
    await toggleBtn.click();

    const panel = page.getByTestId("analytics-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });

    // Banner should be visible on mobile
    const banner = page.getByTestId("live-match-context");
    await expect(banner).toBeVisible({ timeout: 10000 });
  });

  test("MOB-3: live event feed is scrollable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoLoggerPage(page, MOBILE_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    // Send several events to populate the feed
    for (let i = 1; i <= 5; i++) {
      await sendEvent(page, {
        match_clock: `00:0${i}.000`,
        team_id: context!.homeTeamId,
        player_id: `HOME-${i}`,
        type: "Pass",
        data: { outcome: "Complete" },
      });
    }

    // Feed should show events
    await expect
      .poll(() => page.getByTestId("live-event-item").count(), {
        timeout: 15000,
      })
      .toBeGreaterThanOrEqual(3);
  });

  test("MOB-4: connection status indicator visible on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoLoggerPage(page, MOBILE_MATCH_ID);

    await expect(page.getByTestId("connection-status")).toBeVisible({
      timeout: 10000,
    });
  });
});
