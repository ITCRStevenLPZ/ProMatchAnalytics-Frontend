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
  triggerUndoThroughHarness,
  waitForPendingAckToClear,
} from "./utils/logger";

const MATRIX_MATCH_ID = "E2E-ANALYTICS-MATRIX";

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

const getRowValues = async (page: Page, testId: string) => {
  const row = page.getByTestId(testId);
  await expect(row).toBeVisible({ timeout: 15000 });
  const homeText = (await row.locator("div").nth(0).textContent()) || "";
  const awayText = (await row.locator("div").nth(2).textContent()) || "";
  const parseNumber = (value: string) => {
    const match = String(value).match(/\d+/);
    return match ? Number(match[0]) : 0;
  };
  return {
    home: parseNumber(homeText),
    away: parseNumber(awayText),
    homeText,
    awayText,
  };
};

const getTotalEvents = async (page: Page) => {
  const raw = await page.getByTestId("analytics-total-events").textContent();
  const parsed = Number(String(raw || "").replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseClockToSeconds = (value: string) => {
  const [mm, ss] = String(value).trim().split(":");
  return Number(mm || 0) * 60 + Number(ss || 0);
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

test.beforeEach(async ({ page }) => {
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId: MATRIX_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
});

test.describe("Logger analytics matrix", () => {
  test.describe.configure({ mode: "serial" });

  test("ANL-01: yellow card increments yellows", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:05.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Card",
      data: { card_type: "Yellow" },
    });

    await openAnalytics(page);
    const yellows = await getRowValues(page, "stat-yellow");
    expect(yellows.home).toBe(1);
    expect(yellows.away).toBe(0);
  });

  test("ANL-02: second yellow adds yellow + red", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:06.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-2",
      type: "Card",
      data: { card_type: "Yellow" },
    });
    await sendEvent(page, {
      match_clock: "00:07.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-2",
      type: "Card",
      data: { card_type: "Yellow (Second)" },
    });

    await openAnalytics(page);
    const yellows = await getRowValues(page, "stat-yellow");
    const reds = await getRowValues(page, "stat-red");
    expect(yellows.home).toBe(2);
    expect(reds.home).toBe(1);
  });

  test("ANL-03: direct red increments reds", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:08.000",
      team_id: context!.awayTeamId,
      player_id: "AWAY-1",
      type: "Card",
      data: { card_type: "Red" },
    });

    await openAnalytics(page);
    const reds = await getRowValues(page, "stat-red");
    expect(reds.away).toBe(1);
  });

  test("ANL-03b: cancelled card updates net yellow/red stats", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:08.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Card",
      data: { card_type: "Yellow" },
    });
    await sendEvent(page, {
      match_clock: "00:08.001",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Card",
      data: { card_type: "Yellow (Second)" },
    });
    await sendEvent(page, {
      match_clock: "00:08.002",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Card",
      data: { card_type: "Red" },
    });

    await openAnalytics(page);
    let yellows = await getRowValues(page, "stat-yellow");
    let reds = await getRowValues(page, "stat-red");
    expect(yellows.home).toBe(2);
    expect(reds.home).toBe(1);

    await page.getByTestId("toggle-analytics").click();
    await sendEvent(page, {
      match_clock: "00:08.003",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Card",
      data: { card_type: "Cancelled" },
    });

    await openAnalytics(page);
    yellows = await getRowValues(page, "stat-yellow");
    reds = await getRowValues(page, "stat-red");
    expect(yellows.home).toBe(1);
    expect(reds.home).toBe(0);
  });

  test("ANL-04: saved shots count as on target", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:09.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-3",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "Saved" },
    });

    await openAnalytics(page);
    const shots = await getRowValues(page, "stat-shots");
    const onTarget = await getRowValues(page, "stat-shots-on-target");
    const score = await getRowValues(page, "stat-score");
    expect(shots.home).toBe(1);
    expect(onTarget.home).toBe(1);
    expect(score.home).toBe(0);
  });

  test("ANL-05: off target shots count separately", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:10.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-4",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "OffTarget" },
    });

    await openAnalytics(page);
    const shots = await getRowValues(page, "stat-shots");
    const offTarget = await getRowValues(page, "stat-shots-off-target");
    expect(shots.home).toBe(1);
    expect(offTarget.home).toBe(1);
  });

  test("ANL-06: goal updates score and shots", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:11.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-5",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "Goal" },
    });

    await openAnalytics(page);
    const shots = await getRowValues(page, "stat-shots");
    const onTarget = await getRowValues(page, "stat-shots-on-target");
    const score = await getRowValues(page, "stat-score");
    expect(shots.home).toBe(1);
    expect(onTarget.home).toBe(1);
    expect(score.home).toBe(1);
  });

  test("ANL-07: own goal increments credited team score", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:12.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-6",
      type: "Shot",
      data: { shot_type: "OwnGoal", outcome: "Goal" },
    });

    await openAnalytics(page);
    const score = await getRowValues(page, "stat-score");
    expect(score.home).toBe(1);
  });

  test("ANL-08: penalty goal counts as shot and score", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:13.000",
      team_id: context!.awayTeamId,
      player_id: "AWAY-2",
      type: "Shot",
      data: { shot_type: "Penalty", outcome: "Goal" },
    });

    await openAnalytics(page);
    const shots = await getRowValues(page, "stat-shots");
    const onTarget = await getRowValues(page, "stat-shots-on-target");
    const score = await getRowValues(page, "stat-score");
    expect(shots.away).toBe(1);
    expect(onTarget.away).toBe(1);
    expect(score.away).toBe(1);
  });

  test("ANL-09: complete pass increments accurate passes", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:14.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-7",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "HOME-8",
        receiver_name: "Home Player 8",
      },
    });

    await openAnalytics(page);
    const row = await getRowValues(page, "stat-accurate-passes");
    expect(row.home).toBe(1);
    await expect(page.getByTestId("stat-accurate-passes")).toContainText(
      /1\s*\(1\)/,
    );
  });

  test("ANL-10: incomplete pass increments total only", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:15.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-9",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Incomplete",
        receiver_id: "HOME-10",
        receiver_name: "Home Player 10",
      },
    });

    await openAnalytics(page);
    const row = await getRowValues(page, "stat-accurate-passes");
    expect(row.home).toBe(1);
    await expect(page.getByTestId("stat-accurate-passes")).toContainText(
      /1\s*\(0\)/,
    );
  });

  test("ANL-11: pass offside increments offsides", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:16.000",
      team_id: context!.awayTeamId,
      player_id: "AWAY-3",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Pass Offside",
        receiver_id: "AWAY-4",
        receiver_name: "Away Player 4",
      },
    });

    await openAnalytics(page);
    const offsides = await getRowValues(page, "stat-offsides");
    expect(offsides.away).toBe(1);
  });

  test("ANL-12: corner increments corners", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:17.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-11",
      type: "SetPiece",
      data: { set_piece_type: "Corner" },
    });

    await openAnalytics(page);
    const corners = await getRowValues(page, "stat-corners");
    expect(corners.home).toBe(1);
  });

  test("ANL-13: fouls increment fouls", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:18.000",
      team_id: context!.awayTeamId,
      player_id: "AWAY-5",
      type: "FoulCommitted",
      data: { foul_type: "Tackle", outcome: "Standard" },
    });

    await openAnalytics(page);
    const fouls = await getRowValues(page, "stat-fouls");
    expect(fouls.away).toBe(1);
  });

  test("ANL-14: analytics table does not render duels row", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:19.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-12",
      type: "Duel",
      data: { duel_type: "Ground", outcome: "Won" },
    });

    await openAnalytics(page);
    await expect(page.getByTestId("stat-duels")).toHaveCount(0);
  });

  test("ANL-15: VAR time stays neutral", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    await sendStoppage(page, {
      match_clock: "00:20.000",
      team_id: "NEUTRAL",
      data: {
        stoppage_type: "VARStart",
        reason: "VAR",
        trigger_action: "VAR",
        trigger_team_id: null,
        trigger_player_id: null,
      },
    });
    await page.waitForTimeout(1500);
    await sendStoppage(page, {
      match_clock: "00:21.000",
      team_id: "NEUTRAL",
      data: {
        stoppage_type: "VARStop",
        reason: "VAR",
        trigger_action: "VAR",
        trigger_team_id: null,
        trigger_player_id: null,
      },
    });

    await openAnalytics(page);
    const varText =
      (await page.getByTestId("analytics-var-time").textContent()) || "00:00";
    const [mm, ss] = varText.trim().split(":");
    const varSeconds = Number(mm) * 60 + Number(ss || 0);
    expect(varSeconds).toBeGreaterThanOrEqual(1);

    const totals = await getRowValues(page, "stat-ineffective-time");
    expect(totals.home).toBe(0);
    expect(totals.away).toBe(0);
  });

  test("ANL-16: ineffective time attributes to team", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendStoppage(page, {
      match_clock: "00:22.000",
      team_id: context!.homeTeamId,
      data: {
        stoppage_type: "ClockStop",
        reason: "Other",
        trigger_action: "OutOfBounds",
        trigger_team_id: context!.homeTeamId,
        trigger_player_id: "HOME-1",
      },
    });
    await page.waitForTimeout(1200);
    await sendStoppage(page, {
      match_clock: "00:23.000",
      team_id: context!.homeTeamId,
      data: {
        stoppage_type: "ClockStart",
        reason: "Other",
        trigger_action: "OutOfBounds",
        trigger_team_id: context!.homeTeamId,
        trigger_player_id: "HOME-1",
      },
    });

    await openAnalytics(page);
    const totalsRow = page.getByTestId("stat-ineffective-time");
    const totalsHomeText =
      (await totalsRow.locator("div").nth(0).textContent()) || "00:00";
    const totalsAwayText =
      (await totalsRow.locator("div").nth(2).textContent()) || "00:00";
    expect(parseClockToSeconds(totalsHomeText)).toBeGreaterThan(0);
    expect(parseClockToSeconds(totalsAwayText)).toBe(0);

    const outRow = page.getByTestId("stat-ineffective-outofbounds");
    const outHomeText =
      (await outRow.locator("div").nth(1).textContent()) || "00:00";
    expect(parseClockToSeconds(outHomeText)).toBeGreaterThan(0);
  });

  test("ANL-17: undo reduces totals", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:24.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-13",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "HOME-14",
        receiver_name: "Home Player 14",
      },
    });

    let feedCount = await page.getByTestId("live-event-item").count();
    if (feedCount === 0) {
      await page.evaluate(() => {
        const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
        const ctx = harness?.getMatchContext?.();
        if (!harness || !ctx) return;
        harness.sendRawEvent?.({
          match_clock: "00:24.100",
          period: 1,
          team_id: ctx.homeTeamId,
          player_id: "HOME-13",
          type: "Pass",
          data: {
            pass_type: "Standard",
            outcome: "Complete",
            receiver_id: "HOME-14",
            receiver_name: "Home Player 14",
          },
        });
      });
      await waitForPendingAckToClear(page);
    }

    await expect
      .poll(() => page.getByTestId("live-event-item").count(), {
        timeout: 15000,
      })
      .toBeGreaterThan(0);

    await triggerUndoThroughHarness(page);
    await waitForPendingAckToClear(page);

    await page.evaluate(() => {
      const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
      const snapshot = harness?.getQueueSnapshot?.();
      if ((snapshot?.queuedEvents?.length ?? 0) > 0) {
        harness?.clearQueue?.();
      }
    });

    await expect
      .poll(() => page.getByTestId("live-event-item").count(), {
        timeout: 15000,
      })
      .toBe(0);

    await page.getByTestId("toggle-analytics").click();
    await expect(
      page.getByText(/No data available yet|Aún no hay datos/i),
    ).toBeVisible({
      timeout: 15000,
    });
  });

  test("ANL-18: reload preserves totals", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:25.000",
      team_id: context!.awayTeamId,
      player_id: "AWAY-6",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "OnTarget" },
    });

    await openAnalytics(page);
    const before = await getTotalEvents(page);

    await page.reload();
    await setRole(page, "admin");
    await openAnalytics(page);
    await expect
      .poll(async () => await getTotalEvents(page), { timeout: 15000 })
      .toBe(before);
  });

  test("ANL-19: comparative stats use larger typography", async ({ page }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendEvent(page, {
      match_clock: "00:26.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-15",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "OnTarget" },
    });

    await openAnalytics(page);

    const typography = await page.getByTestId("stat-shots").evaluate((row) => {
      const cells = row.querySelectorAll("div");
      const homeSize = Number.parseFloat(getComputedStyle(cells[0]).fontSize);
      const metricSize = Number.parseFloat(getComputedStyle(cells[1]).fontSize);
      const awaySize = Number.parseFloat(getComputedStyle(cells[2]).fontSize);
      return { homeSize, metricSize, awaySize };
    });

    expect(typography.homeSize).toBeGreaterThanOrEqual(18);
    expect(typography.metricSize).toBeGreaterThanOrEqual(16);
    expect(typography.awaySize).toBeGreaterThanOrEqual(18);
  });

  test("ANL-20: logger uses 3-column shell on large screens", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const layout = await page
      .getByTestId("logger-page-shell")
      .evaluate((node) => {
        const shell = node as HTMLElement;
        const shellRect = shell.getBoundingClientRect();
        const left = shell.querySelector(
          '[data-testid="logger-shell-left"]',
        ) as HTMLElement | null;
        const center = shell.querySelector(
          '[data-testid="logger-shell-center"]',
        ) as HTMLElement | null;
        const right = shell.querySelector(
          '[data-testid="logger-shell-right"]',
        ) as HTMLElement | null;
        const cockpit = shell.querySelector(
          '[data-testid="cockpit-main"]',
        ) as HTMLElement | null;
        const leftRect = left?.getBoundingClientRect();
        const centerRect = center?.getBoundingClientRect();
        const rightRect = right?.getBoundingClientRect();
        const cockpitRect = cockpit?.getBoundingClientRect();
        return {
          shellWidth: shellRect.width,
          viewport: window.innerWidth,
          leftWidth: leftRect?.width ?? 0,
          centerWidth: centerRect?.width ?? 0,
          rightWidth: rightRect?.width ?? 0,
          cockpitWidth: cockpitRect?.width ?? 0,
        };
      });

    expect(layout.viewport).toBeGreaterThanOrEqual(1900);
    expect(layout.shellWidth).toBeGreaterThanOrEqual(1800);
    expect(layout.leftWidth).toBeGreaterThanOrEqual(120);
    expect(layout.rightWidth).toBeGreaterThanOrEqual(120);
    expect(layout.centerWidth).toBeGreaterThan(layout.leftWidth * 4);
    expect(layout.centerWidth).toBeGreaterThan(layout.rightWidth * 4);
    expect(layout.cockpitWidth).toBeGreaterThanOrEqual(layout.centerWidth - 20);
  });

  test("ANL-21: comparative table shows effective time percentage", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendStoppage(page, {
      match_clock: "00:30.000",
      team_id: context!.homeTeamId,
      data: {
        stoppage_type: "ClockStop",
        reason: "Other",
        trigger_action: "OutOfBounds",
        trigger_team_id: context!.homeTeamId,
        trigger_player_id: "HOME-1",
      },
    });
    await page.waitForTimeout(1100);
    await sendStoppage(page, {
      match_clock: "00:31.000",
      team_id: context!.homeTeamId,
      data: {
        stoppage_type: "ClockStart",
        reason: "Other",
        trigger_action: "OutOfBounds",
        trigger_team_id: context!.homeTeamId,
        trigger_player_id: "HOME-1",
      },
    });

    await openAnalytics(page);

    const percentRow = page.getByTestId("stat-effective-time-percent");
    await expect(percentRow).toBeVisible({ timeout: 15000 });

    const homePercentText =
      (await percentRow.locator("div").nth(0).textContent()) || "0%";
    const awayPercentText =
      (await percentRow.locator("div").nth(2).textContent()) || "0%";

    const homePercent = Number(homePercentText.replace(/[^0-9.]/g, ""));
    const awayPercent = Number(awayPercentText.replace(/[^0-9.]/g, ""));

    expect(homePercent).toBeGreaterThan(0);
    expect(homePercent).toBeLessThanOrEqual(100);
    expect(awayPercent).toBe(homePercent);
  });

  test("ANL-22: injury is hidden and excluded from ineffective totals", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATRIX_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    await sendStoppage(page, {
      match_clock: "00:32.000",
      team_id: context!.homeTeamId,
      data: {
        stoppage_type: "ClockStop",
        reason: "Injury",
        trigger_action: "Injury",
        trigger_team_id: context!.homeTeamId,
        trigger_player_id: "HOME-1",
      },
    });
    await page.waitForTimeout(1100);
    await sendStoppage(page, {
      match_clock: "00:33.000",
      team_id: context!.homeTeamId,
      data: {
        stoppage_type: "ClockStart",
        reason: "Injury",
        trigger_action: "Injury",
        trigger_team_id: context!.homeTeamId,
        trigger_player_id: "HOME-1",
      },
    });

    await sendStoppage(page, {
      match_clock: "00:34.000",
      team_id: context!.homeTeamId,
      data: {
        stoppage_type: "ClockStop",
        reason: "Other",
        trigger_action: "OutOfBounds",
        trigger_team_id: context!.homeTeamId,
        trigger_player_id: "HOME-1",
      },
    });
    await page.waitForTimeout(1100);
    await sendStoppage(page, {
      match_clock: "00:35.000",
      team_id: context!.homeTeamId,
      data: {
        stoppage_type: "ClockStart",
        reason: "Other",
        trigger_action: "OutOfBounds",
        trigger_team_id: context!.homeTeamId,
        trigger_player_id: "HOME-1",
      },
    });

    await openAnalytics(page);

    await expect(page.getByTestId("stat-ineffective-injury")).toHaveCount(0);

    const out = await getRowValues(page, "stat-ineffective-outofbounds");
    const totals = await getRowValues(page, "stat-ineffective-time");
    expect(totals.home).toBe(out.home);
    expect(totals.away).toBe(out.away);
  });
});
