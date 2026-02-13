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
  triggerUndoThroughHarness,
} from "./utils/logger";

const ANALYTICS_MATCH_ID = "E2E-MATCH-ANALYTICS-INTEGRITY";

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
    data: { matchId: ANALYTICS_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
});

test.describe("Logger analytics integrity", () => {
  test.describe.configure({ mode: "serial" });

  test("keeps KPIs consistent after mixed events, undo, and reload", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await gotoLoggerPage(page, ANALYTICS_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    // Mixed event set to populate analytics
    await sendEvent(page, {
      match_clock: "00:05.000",
      team_id: homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "HOME-2",
        receiver_name: "Home Player 2",
      },
    });
    await sendEvent(page, {
      match_clock: "00:06.000",
      team_id: awayTeamId,
      player_id: "AWAY-1",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "AWAY-2",
        receiver_name: "Away Player 2",
      },
    });
    await sendEvent(page, {
      match_clock: "00:07.000",
      team_id: homeTeamId,
      player_id: "HOME-3",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "OnTarget" },
    });
    await sendEvent(page, {
      match_clock: "00:08.000",
      team_id: awayTeamId,
      player_id: "AWAY-3",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "Goal" },
    });
    await sendEvent(page, {
      match_clock: "00:09.000",
      team_id: homeTeamId,
      player_id: "HOME-4",
      type: "FoulCommitted",
      data: { foul_type: "Tackle", outcome: "Yellow" },
    });
    await sendEvent(page, {
      match_clock: "00:10.000",
      team_id: awayTeamId,
      player_id: "AWAY-4",
      type: "Interception",
      data: { interception_type: "Ground" },
    });

    // Toggle analytics and verify key summaries include expected totals
    await page.getByTestId("toggle-analytics").click();
    const analyticsPanel = page.getByTestId("analytics-panel");
    await expect(analyticsPanel).toBeVisible({ timeout: 15000 });

    const getTotalEvents = async () => {
      const raw = await page
        .getByTestId("analytics-total-events")
        .textContent();
      const parsed = Number(String(raw || "").replace(/[^0-9]/g, ""));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    await expect.poll(getTotalEvents, { timeout: 15000 }).toBeGreaterThan(0);
    const totalBefore = await getTotalEvents();
    await expect(analyticsPanel).toContainText(/Pass(es)?|Pases/i);
    await expect(analyticsPanel).toContainText(/Shot(s)?|Tiros?/i);
    await expect(analyticsPanel).toContainText(/Fouls?|Faltas?/i);
    await expect(analyticsPanel).toContainText(
      /Interceptions?|Intercepciones?/i,
    );

    // Undo the last event and ensure totals drop
    await triggerUndoThroughHarness(page);
    await waitForPendingAckToClear(page);
    await expect
      .poll(getTotalEvents, { timeout: 15000 })
      .toBeLessThan(totalBefore);
    const totalAfter = await getTotalEvents();

    // Reload and confirm analytics stay consistent
    await page.reload();
    await page.getByTestId("toggle-analytics").click();
    const analyticsPanelReloaded = page.getByTestId("analytics-panel");
    await expect(analyticsPanelReloaded).toBeVisible({ timeout: 15000 });
    await expect.poll(getTotalEvents, { timeout: 15000 }).toBe(totalAfter);
  });

  test("computes comparative stats and score accurately", async ({ page }) => {
    test.setTimeout(120000);

    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await gotoLoggerPage(page, ANALYTICS_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    await sendEvent(page, {
      match_clock: "00:11.000",
      team_id: homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "HOME-2",
        receiver_name: "Home Player 2",
      },
    });
    await sendEvent(page, {
      match_clock: "00:12.000",
      team_id: homeTeamId,
      player_id: "HOME-2",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "HOME-3",
        receiver_name: "Home Player 3",
      },
    });
    await sendEvent(page, {
      match_clock: "00:13.000",
      team_id: awayTeamId,
      player_id: "AWAY-1",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "AWAY-2",
        receiver_name: "Away Player 2",
      },
    });
    await sendEvent(page, {
      match_clock: "00:14.000",
      team_id: homeTeamId,
      player_id: "HOME-4",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "OnTarget" },
    });
    await sendEvent(page, {
      match_clock: "00:15.000",
      team_id: homeTeamId,
      player_id: "HOME-5",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "OffTarget" },
    });
    await sendEvent(page, {
      match_clock: "00:16.000",
      team_id: awayTeamId,
      player_id: "AWAY-4",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "Goal" },
    });
    await sendEvent(page, {
      match_clock: "00:17.000",
      team_id: awayTeamId,
      player_id: "AWAY-5",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "OffTarget" },
    });
    await sendEvent(page, {
      match_clock: "00:18.000",
      team_id: homeTeamId,
      player_id: "HOME-6",
      type: "FoulCommitted",
      data: { foul_type: "Tackle", outcome: "Standard" },
    });
    await sendEvent(page, {
      match_clock: "00:19.000",
      team_id: awayTeamId,
      player_id: "AWAY-6",
      type: "FoulCommitted",
      data: { foul_type: "Charge", outcome: "Standard" },
    });
    await sendEvent(page, {
      match_clock: "00:20.000",
      team_id: homeTeamId,
      player_id: "HOME-7",
      type: "Card",
      data: { card_type: "Yellow" },
    });
    await sendEvent(page, {
      match_clock: "00:21.000",
      team_id: awayTeamId,
      player_id: "AWAY-7",
      type: "Card",
      data: { card_type: "Red" },
    });
    await sendEvent(page, {
      match_clock: "00:22.000",
      team_id: homeTeamId,
      player_id: "HOME-8",
      type: "Offside",
      data: { offender_id: "HOME-8" },
    });
    await sendEvent(page, {
      match_clock: "00:23.000",
      team_id: awayTeamId,
      player_id: "AWAY-8",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Pass Offside",
        receiver_id: "AWAY-9",
        receiver_name: "Away Player 9",
      },
    });
    await sendEvent(page, {
      match_clock: "00:24.000",
      team_id: homeTeamId,
      player_id: "HOME-9",
      type: "SetPiece",
      data: { set_piece_type: "Corner" },
    });
    await sendEvent(page, {
      match_clock: "00:25.000",
      team_id: awayTeamId,
      player_id: "AWAY-9",
      type: "SetPiece",
      data: { set_piece_type: "Corner" },
    });

    await page.getByTestId("toggle-analytics").click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 15000,
    });

    const getRowValues = async (testId: string) => {
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
      };
    };

    const scoreRow = await getRowValues("stat-score");
    expect(scoreRow.home).toBe(0);
    expect(scoreRow.away).toBe(1);

    const passes = await getRowValues("stat-accurate-passes");
    expect(passes.home).toBe(2);
    expect(passes.away).toBe(2);

    const shots = await getRowValues("stat-shots");
    expect(shots.home).toBe(2);
    expect(shots.away).toBe(2);

    const shotsOnTarget = await getRowValues("stat-shots-on-target");
    expect(shotsOnTarget.home).toBe(1);
    expect(shotsOnTarget.away).toBe(1);

    const shotsOffTarget = await getRowValues("stat-shots-off-target");
    expect(shotsOffTarget.home).toBe(1);
    expect(shotsOffTarget.away).toBe(1);

    const corners = await getRowValues("stat-corners");
    expect(corners.home).toBe(1);
    expect(corners.away).toBe(1);

    const offsides = await getRowValues("stat-offsides");
    expect(offsides.home).toBe(1);
    expect(offsides.away).toBe(1);

    const fouls = await getRowValues("stat-fouls");
    expect(fouls.home).toBe(1);
    expect(fouls.away).toBe(1);

    const yellows = await getRowValues("stat-yellow");
    expect(yellows.home).toBe(1);
    expect(yellows.away).toBe(0);

    const reds = await getRowValues("stat-red");
    expect(reds.home).toBe(0);
    expect(reds.away).toBe(1);

    const totalEventsText =
      (await page.getByTestId("analytics-total-events").textContent()) || "0";
    const totalEvents = Number(totalEventsText.replace(/[^0-9]/g, ""));
    expect(totalEvents).toBeGreaterThanOrEqual(14);
  });

  test("handles double yellows, penalties, and VAR + offsides", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await gotoLoggerPage(page, ANALYTICS_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    await sendEvent(page, {
      match_clock: "00:30.000",
      team_id: homeTeamId,
      player_id: "HOME-10",
      type: "Card",
      data: { card_type: "Yellow" },
    });
    await sendEvent(page, {
      match_clock: "00:31.000",
      team_id: homeTeamId,
      player_id: "HOME-10",
      type: "Card",
      data: { card_type: "Yellow (Second)" },
    });
    await sendEvent(page, {
      match_clock: "00:32.000",
      team_id: awayTeamId,
      player_id: "AWAY-10",
      type: "Card",
      data: { card_type: "Yellow" },
    });

    await sendEvent(page, {
      match_clock: "00:33.000",
      team_id: homeTeamId,
      player_id: "HOME-11",
      type: "Shot",
      data: { shot_type: "Penalty", outcome: "Goal" },
    });

    await sendEvent(page, {
      match_clock: "00:34.000",
      team_id: homeTeamId,
      player_id: "HOME-12",
      type: "Offside",
      data: { offender_id: "HOME-12" },
    });
    await sendEvent(page, {
      match_clock: "00:35.000",
      team_id: awayTeamId,
      player_id: "AWAY-12",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Pass Offside",
        receiver_id: "AWAY-13",
        receiver_name: "Away Player 13",
      },
    });

    await sendStoppage(page, {
      match_clock: "00:36.000",
      team_id: "NEUTRAL",
      data: {
        stoppage_type: "VARStart",
        reason: "VAR",
        trigger_action: "VAR",
        trigger_team_id: null,
        trigger_player_id: null,
      },
    });
    await page.waitForTimeout(2000);
    await sendStoppage(page, {
      match_clock: "00:37.000",
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

    const getRowValues = async (testId: string) => {
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
      };
    };

    const yellows = await getRowValues("stat-yellow");
    expect(yellows.home).toBe(2);
    expect(yellows.away).toBe(1);

    const reds = await getRowValues("stat-red");
    expect(reds.home).toBe(1);
    expect(reds.away).toBe(0);

    const score = await getRowValues("stat-score");
    expect(score.home).toBe(1);
    expect(score.away).toBe(0);

    const shotsOnTarget = await getRowValues("stat-shots-on-target");
    expect(shotsOnTarget.home).toBeGreaterThanOrEqual(1);

    const offsides = await getRowValues("stat-offsides");
    expect(offsides.home).toBe(1);
    expect(offsides.away).toBe(1);

    const varText =
      (await page.getByTestId("analytics-var-time").textContent()) || "00:00";
    const [mm, ss] = varText.trim().split(":");
    const varSeconds = Number(mm) * 60 + Number(ss || 0);
    expect(varSeconds).toBeGreaterThanOrEqual(1);
  });
});
