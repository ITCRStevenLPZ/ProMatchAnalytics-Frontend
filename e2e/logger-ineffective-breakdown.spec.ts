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

  test("aggregates ineffective time by team and VAR time", async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);
    await setRole(page, "admin");

    await resetHarnessFlow(page, "both");

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
        stoppage_type: "VARStart",
        reason: "VAR",
        trigger_action: "VAR",
        trigger_team_id: null,
        trigger_player_id: null,
      },
    });
    await page.waitForTimeout(3200);
    await sendStoppage(page, {
      match_clock: "00:31.000",
      team_id: "NEUTRAL",
      data: {
        stoppage_type: "VARStop",
        reason: "VAR",
        trigger_action: "VAR",
        trigger_team_id: null,
        trigger_player_id: null,
      },
    });

    await page.getByTestId("toggle-analytics").click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 15000,
    });

    const outRow = page.getByTestId("stat-ineffective-outofbounds");
    const goalRow = page.getByTestId("stat-ineffective-goal");
    const teamTotalsRow = page.getByTestId("stat-ineffective-time");
    const varStat = page.getByTestId("analytics-var-time");

    await expect(outRow).toBeVisible();
    await expect(goalRow).toBeVisible();
    await expect(teamTotalsRow).toBeVisible();
    await expect(varStat).toBeVisible();

    await expect(outRow).toContainText(/00:0[1-9]/);
    await expect(goalRow).toContainText(/00:0[1-9]/);
    await expect(varStat).toContainText(/00:0[1-9]/);

    const parseClock = (value: string) => {
      const [mm, ss] = value.trim().split(":");
      return Number(mm) * 60 + Number(ss || 0);
    };

    const totalText = (await teamTotalsRow.textContent()) || "";
    const totals = totalText.match(/\d{2}:\d{2}/g) || [];
    expect(totals.length).toBeGreaterThanOrEqual(2);
    const homeTotal = parseClock(totals[0]);
    const awayTotal = parseClock(totals[1]);
    const varSeconds = parseClock((await varStat.textContent()) || "00:00");

    expect(varSeconds).toBeGreaterThanOrEqual(2);
    expect(homeTotal).toBeGreaterThanOrEqual(1);
    expect(awayTotal).toBeGreaterThanOrEqual(1);
  });

  test("pauses effective/ineffective clocks during VAR and resumes after", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);
    await setRole(page, "admin");

    await ensureClockRunning(page);

    const parseClock = (value: string) => {
      const [mm, ss] = value.trim().split(":");
      return Number(mm) * 60 + Number(ss || 0);
    };

    const readEffective = async () => {
      const text =
        (await page.getByTestId("effective-clock-value").textContent()) ||
        "00:00";
      return parseClock(text);
    };

    const readVar = async () => {
      const text =
        (await page
          .getByTestId("var-time-card")
          .locator(".font-mono")
          .textContent()) || "00:00";
      return parseClock(text);
    };

    await page.waitForTimeout(1200);
    const effectiveBefore = await readEffective();

    await page.getByTestId("btn-var-toggle").click();
    await page.waitForTimeout(1500);

    const effectiveDuring = await readEffective();
    const varDuring = await readVar();
    expect(effectiveDuring).toBeLessThanOrEqual(effectiveBefore + 2);
    expect(varDuring).toBeGreaterThanOrEqual(1);

    await page.getByTestId("btn-var-toggle").click();
    await page.waitForTimeout(1200);

    const effectiveAfter = await readEffective();
    expect(effectiveAfter).toBeGreaterThan(effectiveBefore);
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

  test("tracks VAR time from the timer toggle", async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);
    await setRole(page, "admin");

    await ensureClockRunning(page);

    const varToggle = page.getByTestId("btn-var-toggle");
    await expect(varToggle).toBeVisible();

    await varToggle.click();
    await page.waitForTimeout(1200);
    await varToggle.click();

    await page.getByTestId("toggle-analytics").click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByTestId("analytics-var-time")).toContainText(
      /00:0[1-9]/,
    );
  });

  test("logs ineffective stoppage for selected team", async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);
    await setRole(page, "admin");

    await resetHarnessFlow(page, "away");

    await ensureClockRunning(page);
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
    await expect(cells.nth(1)).toHaveText(/00:00/);
    await expect(cells.nth(2)).not.toHaveText("00:00");
  });

  test("shows offside offender on stoppage feed", async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;

    await sendStoppage(page, {
      match_clock: "02:10.000",
      team_id: homeTeamId,
      data: {
        stoppage_type: "ClockStop",
        reason: "Other",
        trigger_action: "Offside",
        trigger_team_id: homeTeamId,
        trigger_player_id: "HOME-1",
        neutral: false,
      },
    });

    const stoppageEvent = page
      .getByTestId("live-event-item")
      .filter({ hasText: "GameStoppage" })
      .first();
    await expect(stoppageEvent).toContainText("#1");
  });

  test("shows VAR timer and avoids stoppage spam", async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);
    await setRole(page, "admin");

    await ensureClockRunning(page);

    const varToggle = page.getByTestId("btn-var-toggle");
    await expect(varToggle).toBeVisible({ timeout: 10000 });

    await varToggle.click();
    await waitForPendingAckToClear(page);
    await page.waitForTimeout(1200);
    await varToggle.click();
    await waitForPendingAckToClear(page);

    const stoppages = page
      .getByTestId("live-event-item")
      .filter({ hasText: "GameStoppage" });
    await expect(stoppages).toHaveCount(2);
  });

  test("does not add VAR overlap to team ineffective totals", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);
    await setRole(page, "admin");

    await ensureClockRunning(page);

    const parseClock = (value: string) => {
      const [mm, ss] = value.trim().split(":");
      return Number(mm) * 60 + Number(ss || 0);
    };

    const readIneffective = async () => {
      const text =
        (await page.getByTestId("ineffective-clock-value").textContent()) ||
        "00:00";
      return parseClock(text);
    };

    const readVar = async () => {
      const text =
        (await page
          .getByTestId("var-time-card")
          .locator(".font-mono")
          .textContent()) || "00:00";
      return parseClock(text);
    };

    await page.getByTestId("btn-ineffective-event").click({ timeout: 15000 });
    await expect(page.getByTestId("ineffective-note-modal")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("ineffective-note-input").fill("Overlap check");
    await page.getByTestId("ineffective-note-save").click();
    await waitForPendingAckToClear(page);

    await page.waitForTimeout(1200);
    const ineffectiveBefore = await readIneffective();

    await page.getByTestId("btn-var-toggle").click();
    await waitForPendingAckToClear(page);
    await page.waitForTimeout(1500);

    const ineffectiveDuring = await readIneffective();
    const varDuring = await readVar();

    expect(ineffectiveDuring).toBeLessThanOrEqual(ineffectiveBefore + 2);
    expect(varDuring).toBeGreaterThanOrEqual(1);

    await page.getByTestId("btn-var-toggle").click();
    await waitForPendingAckToClear(page);
    await page.waitForTimeout(1200);

    const ineffectiveAfter = await readIneffective();
    expect(ineffectiveAfter).toBeGreaterThan(ineffectiveBefore);
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
        stoppage_type: "VARStart",
        reason: "VAR",
        trigger_action: "VAR",
        trigger_team_id: null,
        trigger_player_id: null,
      },
    });
    await page.waitForTimeout(1200);
    await sendStoppage(page, {
      match_clock: "01:31.000",
      team_id: "NEUTRAL",
      data: {
        stoppage_type: "VARStop",
        reason: "VAR",
        trigger_action: "VAR",
        trigger_team_id: null,
        trigger_player_id: null,
      },
    });

    await page.getByTestId("toggle-analytics").click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 15000,
    });

    const outRow = page.getByTestId("stat-ineffective-outofbounds");
    const goalRow = page.getByTestId("stat-ineffective-goal");
    const varStat = page.getByTestId("analytics-var-time");

    const outCells = outRow.locator("div");
    const goalCells = goalRow.locator("div");
    await expect(varStat).toBeVisible();

    // Home column should show time for OutOfBounds
    await expect(outCells.nth(1)).not.toHaveText("00:00");
    // Away column should show time for Goal
    await expect(goalCells.nth(2)).not.toHaveText("00:00");
    await expect(varStat).toContainText(/00:0[1-9]/);
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
  });
});
