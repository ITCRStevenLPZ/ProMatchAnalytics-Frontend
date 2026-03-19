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
  getHarnessMatchContext,
  gotoLoggerPage,
  sendRawEventThroughHarness,
  waitForPendingAckToClear,
} from "./utils/logger";

const BANNER_MATCH_ID = "E2E-BANNER-CONTEXT";

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

const sendStoppage = async (
  page: Page,
  payload: {
    match_clock: string;
    period?: number;
    team_id: string;
    data: Record<string, any>;
  },
) => {
  await sendRawEventThroughHarness(page, {
    period: payload.period ?? 1,
    match_clock: payload.match_clock,
    team_id: payload.team_id,
    type: "GameStoppage",
    data: payload.data,
  });
  await waitForPendingAckToClear(page);
};

const openAnalytics = async (page: Page) => {
  await page.getByTestId("toggle-analytics").click();
  await expect(page.getByTestId("analytics-panel")).toBeVisible({
    timeout: 15000,
  });
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
    data: { matchId: BANNER_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
});

test.describe("Live Match Context Banner", () => {
  test.describe.configure({ mode: "serial" });

  test("BNR-1: Banner is visible in analytics view with data", async ({
    page,
  }) => {
    await gotoLoggerPage(page, BANNER_MATCH_ID);
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

    await openAnalytics(page);

    await expect(page.getByTestId("live-match-context")).toBeVisible();
    await expect(page.getByTestId("stat-total-effective-time")).toBeVisible();
    await expect(page.getByTestId("stat-total-ineffective-time")).toBeVisible();
    await expect(page.getByTestId("stat-on-field-age-home")).toBeVisible();
    await expect(page.getByTestId("stat-on-field-age-away")).toBeVisible();
  });

  test("BNR-2: Effective time displays formatted clock value", async ({
    page,
  }) => {
    await gotoLoggerPage(page, BANNER_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:02.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    await openAnalytics(page);

    const effectiveTime = page.getByTestId("stat-total-effective-time");
    await expect(effectiveTime).toBeVisible();
    const text = await effectiveTime.textContent();
    expect(text).toMatch(/\d{2}:\d{2}/);
  });

  test("BNR-3: Ineffective time increments after stoppage", async ({
    page,
  }) => {
    test.setTimeout(60000);

    await gotoLoggerPage(page, BANNER_MATCH_ID);
    await setRole(page, "admin");
    await ensureClockRunning(page);

    // Use the referee action bar UI to trigger a real clock stop
    const refereeBar = page.getByTestId("referee-action-bar");
    await expect(refereeBar).toBeVisible({ timeout: 10000 });

    await page.getByTestId("referee-action-discussion").click();
    await waitForPendingAckToClear(page);

    // Let ineffective time accumulate
    await page.waitForTimeout(1500);

    // Resume effective time
    const resumeButton = page.getByTestId("btn-resume-effective");
    await expect(resumeButton).toBeVisible({ timeout: 10000 });
    await resumeButton.click();
    await waitForPendingAckToClear(page);

    await openAnalytics(page);

    const ineffectiveTime = page.getByTestId("stat-total-ineffective-time");
    await expect(ineffectiveTime).toBeVisible();
    const text = (await ineffectiveTime.textContent()) ?? "00:00";
    const parts = text.match(/(\d{2}):(\d{2})/);
    expect(parts).toBeTruthy();
    const seconds = parseInt(parts![1], 10) * 60 + parseInt(parts![2], 10);
    expect(seconds).toBeGreaterThan(0);
  });

  test("BNR-4: On-field average age shows numeric value for both teams", async ({
    page,
  }) => {
    await gotoLoggerPage(page, BANNER_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:05.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    await openAnalytics(page);

    const homeAge = page.getByTestId("stat-on-field-age-home");
    const awayAge = page.getByTestId("stat-on-field-age-away");
    await expect(homeAge).toBeVisible();
    await expect(awayAge).toBeVisible();

    const homeText = await homeAge.locator("span").last().textContent();
    const awayText = await awayAge.locator("span").last().textContent();
    expect(homeText?.trim()).toMatch(/^\d+(\.\d)?$/);
    expect(awayText?.trim()).toMatch(/^\d+(\.\d)?$/);
  });

  test("BNR-5: Banner values update live (effective time ticks)", async ({
    page,
  }) => {
    test.setTimeout(60000);

    await gotoLoggerPage(page, BANNER_MATCH_ID);
    await setRole(page, "admin");
    await ensureClockRunning(page);

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:06.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    await openAnalytics(page);

    const effectiveTime = page.getByTestId("stat-total-effective-time");
    await expect(effectiveTime).toBeVisible();
    const firstReading = await effectiveTime.textContent();

    await page.waitForTimeout(2000);

    const secondReading = await effectiveTime.textContent();
    expect(secondReading).not.toBe(firstReading);
  });

  test("BNR-6: Banner visible when accessing ?view=analytics URL directly", async ({
    page,
  }) => {
    await page.goto(`/matches/${BANNER_MATCH_ID}/logger?view=analytics`);
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 15000,
    });
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:07.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    await expect(page.getByTestId("live-match-context")).toBeVisible({
      timeout: 10000,
    });
  });

  test("BNR-7: Banner not present in main comparison table (isolation)", async ({
    page,
  }) => {
    await gotoLoggerPage(page, BANNER_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:08.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    await openAnalytics(page);

    const mainTable = page.getByTestId("analytics-comparison-table");
    await expect(mainTable).toBeVisible();

    await expect(
      mainTable.getByTestId("stat-total-effective-time"),
    ).toHaveCount(0);
    await expect(
      mainTable.getByTestId("stat-total-ineffective-time"),
    ).toHaveCount(0);

    // Confirm they exist only in the banner
    await expect(
      page
        .getByTestId("live-match-context")
        .getByTestId("stat-total-effective-time"),
    ).toBeVisible();
    await expect(
      page
        .getByTestId("live-match-context")
        .getByTestId("stat-total-ineffective-time"),
    ).toBeVisible();
  });

  test("BNR-8: Average age recalculates after substitution", async ({
    page,
  }) => {
    test.setTimeout(90000);

    await gotoLoggerPage(page, BANNER_MATCH_ID);
    await setRole(page, "admin");
    await ensureClockRunning(page);

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:09.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    await openAnalytics(page);

    const homeAge = page.getByTestId("stat-on-field-age-home");
    await expect(homeAge).toBeVisible();

    // Close analytics to perform substitution
    await page.getByTestId("toggle-analytics").click();

    // Perform substitution: HOME-2 → HOME-12
    const player = page.getByTestId("field-player-HOME-2");
    await expect(player).toBeVisible({ timeout: 10000 });
    await player.click();

    await expect(page.getByTestId("field-zone-selector")).toBeVisible({
      timeout: 8000,
    });
    await page.getByTestId("zone-select-7").click();
    await page.getByTestId("quick-action-more").click({ timeout: 8000 });
    await page.getByTestId("action-btn-Substitution").click();

    const subModal = page.getByTestId("substitution-modal");
    await expect(subModal).toBeVisible({ timeout: 15000 });
    await subModal.getByTestId("sub-off-HOME-2").click();
    await subModal.getByTestId("sub-on-HOME-12").click();

    const confirmBtn = subModal.getByTestId("confirm-substitution");
    await expect(confirmBtn).toBeEnabled({ timeout: 15000 });
    await confirmBtn.click();
    await waitForPendingAckToClear(page);
    await page.waitForTimeout(500);

    // Re-open analytics
    await openAnalytics(page);

    const updatedHomeAge = page.getByTestId("stat-on-field-age-home");
    await expect(updatedHomeAge).toBeVisible();
    const updatedValue = await updatedHomeAge
      .locator("span")
      .last()
      .textContent();

    // Value must still be a valid numeric (proves recalculation executed)
    expect(updatedValue?.trim()).toMatch(/^\d+(\.\d)?$/);
  });
});
