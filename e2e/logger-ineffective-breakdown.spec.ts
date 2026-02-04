import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  resetHarnessFlow,
  getHarnessMatchContext,
  sendRawEventThroughHarness,
  waitForPendingAckToClear,
} from "./utils/logger";

const MATCH_ID = "E2E-INEFFECTIVE-BREAKDOWN";

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

test.describe("Logger ineffective time breakdown", () => {
  test.describe.configure({ mode: "serial" });

  test("aggregates ineffective time by team, action, and neutral", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);
    await setRole(page, "admin");

    await page.getByTestId("team-select-both").click();

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    await sendStoppage(page, {
      match_clock: "00:10.000",
      team_id: homeTeamId,
      data: {
        stoppage_type: "ClockStop",
        reason: "Other",
        trigger_action: "OutOfBounds",
        trigger_team_id: homeTeamId,
        trigger_player_id: "HOME-1",
        neutral: false,
      },
    });
    await page.waitForTimeout(1200);
    await sendStoppage(page, {
      match_clock: "00:11.000",
      team_id: homeTeamId,
      data: {
        stoppage_type: "ClockStart",
        reason: "Other",
        trigger_action: "OutOfBounds",
        trigger_team_id: homeTeamId,
        trigger_player_id: "HOME-1",
        neutral: false,
      },
    });

    await sendStoppage(page, {
      match_clock: "00:20.000",
      team_id: awayTeamId,
      data: {
        stoppage_type: "ClockStop",
        reason: "Other",
        trigger_action: "Goal",
        trigger_team_id: awayTeamId,
        trigger_player_id: "AWAY-1",
        neutral: false,
      },
    });
    await page.waitForTimeout(1200);
    await sendStoppage(page, {
      match_clock: "00:21.000",
      team_id: awayTeamId,
      data: {
        stoppage_type: "ClockStart",
        reason: "Other",
        trigger_action: "Goal",
        trigger_team_id: awayTeamId,
        trigger_player_id: "AWAY-1",
        neutral: false,
      },
    });

    await sendStoppage(page, {
      match_clock: "00:30.000",
      team_id: "NEUTRAL",
      data: {
        stoppage_type: "ClockStop",
        reason: "Other",
        trigger_action: "Injury",
        trigger_team_id: null,
        trigger_player_id: null,
        neutral: true,
      },
    });
    await page.waitForTimeout(1200);
    await sendStoppage(page, {
      match_clock: "00:31.000",
      team_id: "NEUTRAL",
      data: {
        stoppage_type: "ClockStart",
        reason: "Other",
        trigger_action: "Injury",
        trigger_team_id: null,
        trigger_player_id: null,
        neutral: true,
      },
    });

    await page.getByTestId("toggle-analytics").click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 15000,
    });

    const outRow = page.getByTestId("stat-ineffective-outofbounds");
    const goalRow = page.getByTestId("stat-ineffective-goal");
    const injuryRow = page.getByTestId("stat-ineffective-injury");

    await expect(outRow).toBeVisible();
    await expect(goalRow).toBeVisible();
    await expect(injuryRow).toBeVisible();

    await expect(outRow).toContainText(/00:0[1-9]/);
    await expect(goalRow).toContainText(/00:0[1-9]/);
    await expect(injuryRow).toContainText(/00:0[1-9]/);
  });

  test("persists aggregates by team, action, and period", async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    await sendStoppage(page, {
      match_clock: "00:40.000",
      team_id: homeTeamId,
      period: 1,
      data: {
        stoppage_type: "ClockStop",
        reason: "Other",
        trigger_action: "OutOfBounds",
        trigger_team_id: homeTeamId,
        trigger_player_id: "HOME-2",
        neutral: false,
      },
    });
    await page.waitForTimeout(1200);
    await sendStoppage(page, {
      match_clock: "00:41.000",
      team_id: homeTeamId,
      period: 1,
      data: {
        stoppage_type: "ClockStart",
        reason: "Other",
        trigger_action: "OutOfBounds",
        trigger_team_id: homeTeamId,
        trigger_player_id: "HOME-2",
        neutral: false,
      },
    });

    await sendStoppage(page, {
      match_clock: "45:10.000",
      team_id: awayTeamId,
      period: 2,
      data: {
        stoppage_type: "ClockStop",
        reason: "Other",
        trigger_action: "Foul",
        trigger_team_id: awayTeamId,
        trigger_player_id: "AWAY-4",
        neutral: false,
      },
    });
    await page.waitForTimeout(1200);
    await sendStoppage(page, {
      match_clock: "45:11.000",
      team_id: awayTeamId,
      period: 2,
      data: {
        stoppage_type: "ClockStart",
        reason: "Other",
        trigger_action: "Foul",
        trigger_team_id: awayTeamId,
        trigger_player_id: "AWAY-4",
        neutral: false,
      },
    });

    const matchResponse = await backendRequest.get(
      `/api/v1/logger/matches/${MATCH_ID}`,
    );
    expect(matchResponse.ok()).toBeTruthy();
    const matchPayload = await matchResponse.json();
    const aggregates = matchPayload.ineffective_aggregates;
    expect(aggregates).toBeTruthy();

    const periodOne = aggregates.by_period?.["1"];
    const periodTwo = aggregates.by_period?.["2"];
    expect(periodOne?.by_action?.OutOfBounds?.home || 0).toBeGreaterThan(0.5);
    expect(periodTwo?.by_action?.Foul?.away || 0).toBeGreaterThan(0.5);

    const sumActions = (teamKey: "home" | "away" | "neutral") =>
      Object.values(aggregates.by_action || {}).reduce(
        (total: number, entry: { [key: string]: number }) =>
          total + (entry[teamKey] || 0),
        0,
      );

    expect(aggregates.totals.home).toBeGreaterThan(0.5);
    expect(aggregates.totals.away).toBeGreaterThan(0.5);
    expect(sumActions("home")).toBeCloseTo(aggregates.totals.home, 1);
    expect(sumActions("away")).toBeCloseTo(aggregates.totals.away, 1);
  });

  test("logs ineffective stoppage for selected team", async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);
    await setRole(page, "admin");

    await page.getByTestId("team-select-away").click();

    await page.getByTestId("btn-start-clock").click({ timeout: 15000 });
    await expect(page.getByTestId("btn-stop-clock")).toBeEnabled({
      timeout: 15000,
    });
    const initialEffectiveClock = await page
      .getByTestId("effective-clock-value")
      .innerText();
    await page.waitForFunction(
      ({ testId, initial }) => {
        const el = document.querySelector(
          `[data-testid="${testId}"]`,
        ) as HTMLElement | null;
        if (!el) return false;
        return el.innerText.trim() !== initial.trim();
      },
      { testId: "effective-clock-value", initial: initialEffectiveClock },
      { timeout: 10000 },
    );

    await page.getByTestId("btn-ineffective-event").click({ timeout: 15000 });
    await expect(page.getByTestId("ineffective-note-modal")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("ineffective-note-input").fill("Team stop");
    await page.getByTestId("ineffective-note-save").click();
    await waitForPendingAckToClear(page);

    await page.waitForTimeout(1200);
    await page.getByTestId("btn-resume-effective").click({ timeout: 15000 });
    await waitForPendingAckToClear(page);

    await page.getByTestId("toggle-analytics").click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 15000,
    });

    const otherRow = page.getByTestId("stat-ineffective-other");
    await expect(otherRow).toBeVisible();

    const cells = otherRow.locator("div");
    await expect(cells.nth(2)).toHaveText(/00:00/);
    await expect(cells.nth(3)).not.toHaveText("00:00");
  });

  test("shows neutral ineffective timer and avoids stoppage spam", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);
    await setRole(page, "admin");

    await page.getByTestId("btn-start-clock").click({ timeout: 15000 });
    await expect(page.getByTestId("btn-stop-clock")).toBeEnabled({
      timeout: 15000,
    });

    await page.getByTestId("btn-ineffective-event").click({ timeout: 15000 });
    const modal = page.getByTestId("ineffective-note-modal");
    await expect(modal).toBeVisible({ timeout: 10000 });

    await page.getByTestId("ineffective-note-action").selectOption("Injury");
    await page.getByTestId("ineffective-note-input").fill("Injury stoppage");
    await page.getByTestId("ineffective-note-save").click();
    await expect(modal).toBeHidden({ timeout: 10000 });
    await waitForPendingAckToClear(page);

    await page.waitForTimeout(1200);

    const neutralCard = page.getByTestId("neutral-ineffective-card");
    await expect(neutralCard).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("neutral-ineffective-clock")).toBeVisible();

    const resumeBtn = page.getByTestId("btn-resume-effective");
    await expect(resumeBtn).toBeVisible({ timeout: 10000 });
    await resumeBtn.click();
    await waitForPendingAckToClear(page);

    const stoppages = page
      .getByTestId("live-event-item")
      .filter({ hasText: "GameStoppage" });
    await expect(stoppages).toHaveCount(2);
  });

  test("analytics splits ineffective time by team and action", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    await sendStoppage(page, {
      match_clock: "01:10.000",
      team_id: homeTeamId,
      data: {
        stoppage_type: "ClockStop",
        reason: "Other",
        trigger_action: "OutOfBounds",
        trigger_team_id: homeTeamId,
        trigger_player_id: "HOME-1",
        neutral: false,
      },
    });
    await page.waitForTimeout(1200);
    await sendStoppage(page, {
      match_clock: "01:11.000",
      team_id: homeTeamId,
      data: {
        stoppage_type: "ClockStart",
        reason: "Other",
        trigger_action: "OutOfBounds",
        trigger_team_id: homeTeamId,
        trigger_player_id: "HOME-1",
        neutral: false,
      },
    });

    await sendStoppage(page, {
      match_clock: "01:20.000",
      team_id: awayTeamId,
      data: {
        stoppage_type: "ClockStop",
        reason: "Other",
        trigger_action: "Goal",
        trigger_team_id: awayTeamId,
        trigger_player_id: "AWAY-1",
        neutral: false,
      },
    });
    await page.waitForTimeout(1200);
    await sendStoppage(page, {
      match_clock: "01:21.000",
      team_id: awayTeamId,
      data: {
        stoppage_type: "ClockStart",
        reason: "Other",
        trigger_action: "Goal",
        trigger_team_id: awayTeamId,
        trigger_player_id: "AWAY-1",
        neutral: false,
      },
    });

    await sendStoppage(page, {
      match_clock: "01:30.000",
      team_id: "NEUTRAL",
      data: {
        stoppage_type: "ClockStop",
        reason: "Other",
        trigger_action: "Injury",
        trigger_team_id: null,
        trigger_player_id: null,
        neutral: true,
      },
    });
    await page.waitForTimeout(1200);
    await sendStoppage(page, {
      match_clock: "01:31.000",
      team_id: "NEUTRAL",
      data: {
        stoppage_type: "ClockStart",
        reason: "Other",
        trigger_action: "Injury",
        trigger_team_id: null,
        trigger_player_id: null,
        neutral: true,
      },
    });

    await page.getByTestId("toggle-analytics").click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 15000,
    });

    const outRow = page.getByTestId("stat-ineffective-outofbounds");
    const goalRow = page.getByTestId("stat-ineffective-goal");
    const injuryRow = page.getByTestId("stat-ineffective-injury");

    const outCells = outRow.locator("div");
    const goalCells = goalRow.locator("div");
    const injuryCells = injuryRow.locator("div");

    // Home column should show time for OutOfBounds
    await expect(outCells.nth(1)).not.toHaveText("00:00");
    // Away column should show time for Goal
    await expect(goalCells.nth(3)).not.toHaveText("00:00");
    // Neutral column should show time for injury
    await expect(injuryCells.nth(2)).not.toHaveText("00:00");
  });

  test("reset restores period status and clocks", async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);
    await setRole(page, "admin");

    await page.getByTestId("btn-start-clock").click({ timeout: 15000 });
    await expect(page.getByTestId("btn-stop-clock")).toBeEnabled({
      timeout: 15000,
    });

    await page.getByTestId("btn-end-first-half").click({ timeout: 15000 });
    await expect(page.getByTestId("period-status-halftime")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("btn-reset-clock").click({ timeout: 15000 });
    await page.getByPlaceholder("RESET").fill("RESET");
    await page.getByTestId("reset-confirm-button").click();

    await expect(page.getByTestId("period-status-first-half")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("period-status-halftime")).toBeHidden({
      timeout: 15000,
    });

    await expect(page.getByTestId("operator-clock-input")).toHaveValue(
      "00:00.000",
    );
  });
});
