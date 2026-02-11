import {
  test,
  expect,
  request,
  APIRequestContext,
  Page,
} from "@playwright/test";

import {
  createAdminApiContext,
  seedCompetition,
  seedVenue,
  seedReferee,
  seedTeam,
  seedPlayer,
  addPlayerToTeam,
  rosterToMatchLineup,
  seedLoggerMatch,
} from "./utils/admin";
import {
  waitForPendingAckToClear,
  sendRawEventThroughHarness,
  resetHarnessFlow,
  getHarnessMatchContext,
} from "./utils/logger";

const MEGA_MATCH_ID = "E2E-MATCH-MEGA-SIM";

type TeamSide = "home" | "away";

interface EventPayload {
  type: string;
  team: TeamSide;
  player: string;
  clockSeconds: number;
  data: Record<string, any>;
  period?: number;
}

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

const ensureAdminRole = async (page: Page) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await setRole(page, "admin");
    const role = await page.evaluate(
      () => (globalThis as any).__PROMATCH_AUTH_STORE__?.getState().user?.role,
    );
    if (role === "admin") return;
    await page.waitForTimeout(500);
  }
  throw new Error("Failed to assert admin role in auth store");
};

const toClock = (seconds: number) => {
  const mm = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}.000`;
};

test.describe("Logger mega simulation", () => {
  let backendRequest: APIRequestContext;
  let matchId: string = MEGA_MATCH_ID;
  let homeTeamId: string;
  let awayTeamId: string;
  let homeRoster: Array<{
    player_id: string;
    player_name: string;
    jersey_number: number;
    position: string;
  }> = [];
  let awayRoster: Array<{
    player_id: string;
    player_name: string;
    jersey_number: number;
    position: string;
  }> = [];

  test.beforeAll(async () => {
    // Seed match and teams via admin APIs so UI has a real fixture.
    const api = await createAdminApiContext();
    backendRequest = await request.newContext({
      baseURL: process.env.PROMATCH_E2E_BACKEND_URL ?? "http://127.0.0.1:8000",
      extraHTTPHeaders: { Authorization: "Bearer e2e-playwright" },
    });

    const competition = await seedCompetition(api);
    const venue = await seedVenue(api);
    const referee = await seedReferee(api);

    const homeTeam = await seedTeam(api, { name: "MegaSim Home" });
    const awayTeam = await seedTeam(api, { name: "MegaSim Away" });

    const addBench = async (
      teamId: string,
      roster: Array<{
        player_id: string;
        player_name: string;
        jersey_number: number;
        position: string;
      }>,
    ) => {
      const benchTemplates = [
        { position: "CM" },
        { position: "ST" },
        { position: "LB" },
      ];
      for (let idx = 0; idx < benchTemplates.length; idx += 1) {
        const benchPlayer = await seedPlayer(api, {
          position: benchTemplates[idx].position,
          name: `Bench ${benchTemplates[idx].position} ${idx + 12}`,
        });
        const jersey_number = roster.length + 1;
        await addPlayerToTeam(api, teamId, {
          player_id: benchPlayer.player_id,
          jersey_number,
          position: benchTemplates[idx].position,
          is_active: true,
        });
        roster.push({
          player_id: benchPlayer.player_id,
          player_name: benchPlayer.name,
          jersey_number,
          position: benchTemplates[idx].position,
        });
      }
    };

    homeTeamId = homeTeam.team_id;
    awayTeamId = awayTeam.team_id;
    homeRoster = homeTeam.roster.map((p) => ({
      player_id: p.player_id,
      player_name: p.player_name,
      jersey_number: p.jersey_number,
      position: p.position,
    }));
    awayRoster = awayTeam.roster.map((p) => ({
      player_id: p.player_id,
      player_name: p.player_name,
      jersey_number: p.jersey_number,
      position: p.position,
    }));

    await addBench(homeTeamId, homeRoster);
    await addBench(awayTeamId, awayRoster);

    await seedLoggerMatch(api, {
      match_id: MEGA_MATCH_ID,
      competition_id: competition.competition_id,
      venue_id: venue.venue_id,
      referee_id: referee.referee_id,
      home_team: {
        team_id: homeTeam.team_id,
        name: "MegaSim Home",
        lineup: [
          ...rosterToMatchLineup(homeRoster, 11),
          ...homeRoster.slice(11).map((p) => ({
            player_id: p.player_id,
            player_name: p.player_name,
            jersey_number: p.jersey_number,
            position: p.position,
            is_starter: false,
          })),
        ],
      },
      away_team: {
        team_id: awayTeam.team_id,
        name: "MegaSim Away",
        lineup: [
          ...rosterToMatchLineup(awayRoster, 11),
          ...awayRoster.slice(11).map((p) => ({
            player_id: p.player_id,
            player_name: p.player_name,
            jersey_number: p.jersey_number,
            position: p.position,
            is_starter: false,
          })),
        ],
      },
    });
  });

  test.afterAll(async () => {
    await backendRequest?.dispose();
  });

  test("simulates ~1000 events and validates KPIs", async ({ page }) => {
    test.setTimeout(480000);

    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    // Reset match state if supported.
    const resetResp = await backendRequest.post("/e2e/reset", {
      data: { matchId },
    });
    expect(resetResp.ok()).toBeTruthy();

    await page.goto(`/matches/${matchId}/logger`);
    await ensureAdminRole(page);
    await resetHarnessFlow(page);

    // Unlock logging: start clock and ensure field is interactive.
    await page.getByTestId("btn-start-clock").click({ timeout: 15000 });
    await expect(page.getByTestId("btn-stop-clock")).toBeEnabled({
      timeout: 15000,
    });

    const selectTeamSide = async (side: "home" | "away" | "both") => {
      await resetHarnessFlow(page, side);
    };

    await selectTeamSide("both");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();

    const firstHome = homeRoster[0]?.player_id;
    const firstAway = awayRoster[0]?.player_id;
    expect(firstHome && firstAway).toBeTruthy();

    const clickFieldPlayer = async (playerId: string) => {
      const marker = page.getByTestId(`field-player-${playerId}`);
      await expect(marker).toBeVisible({ timeout: 20000 });
      await marker.click({ timeout: 20000, force: true });
      await expect(page.getByTestId("quick-action-menu")).toBeVisible({
        timeout: 10000,
      });
    };

    const openMoreActions = async () => {
      await page.getByTestId("quick-action-more").click({ timeout: 8000 });
      await expect(page.getByTestId("action-selection")).toBeVisible({
        timeout: 10000,
      });
    };

    await expect(page.getByTestId(`field-player-${firstHome}`)).toBeVisible({
      timeout: 20000,
    });

    // UI coverage for critical flows (pass, shot, corner, foul/card, substitution).
    const logUiPass = async (playerId: string) => {
      await selectTeamSide("home");
      await clickFieldPlayer(playerId);
      await openMoreActions();
      await page.getByTestId("action-btn-Pass").click();
      const outcome = page.getByTestId("outcome-btn-Complete");
      await expect(outcome).toBeVisible({ timeout: 5000 });
      await outcome.click();
      await waitForPendingAckToClear(page);
    };

    const logUiShotGoal = async (playerId: string) => {
      await selectTeamSide("away");
      await clickFieldPlayer(playerId);
      await openMoreActions();
      await page.getByTestId("action-btn-Shot").click();
      await page.getByTestId("outcome-btn-Goal").click();
      await waitForPendingAckToClear(page);
    };

    const logUiCorner = async (playerId: string) => {
      await selectTeamSide("home");
      await page.getByPlaceholder("00:00.000").fill("00:10.000");
      await clickFieldPlayer(playerId);
      await openMoreActions();
      await page.getByTestId("action-btn-Corner").click({ force: true });
      await page.getByTestId("outcome-btn-Complete").click({ force: true });
      await waitForPendingAckToClear(page);
    };

    const logUiFoulYellow = async (playerId: string) => {
      await selectTeamSide("away");
      await clickFieldPlayer(playerId);
      await openMoreActions();
      await page.getByTestId("action-btn-Foul").click({ force: true });
      await page.getByTestId("outcome-btn-Standard").click({ force: true });
      await waitForPendingAckToClear(page);
      await sendRawEventThroughHarness(page, {
        match_clock: "00:12.000",
        period: 1,
        team_id: homeTeamId,
        player_id: playerId,
        type: "Card",
        data: { card_type: "Yellow", reason: "Foul" },
      });
      await waitForPendingAckToClear(page);
    };

    // Substitution via UI modal (single coverage).
    const logUiSubstitution = async () => {
      await selectTeamSide("home");
      await clickFieldPlayer(firstHome);
      await openMoreActions();
      await page.getByTestId("action-btn-Substitution").click();
      const subModal = page.getByTestId("substitution-modal");
      await expect(subModal).toBeVisible({ timeout: 15000 });
      const offList = subModal.locator('[data-testid^="sub-off-"]');
      await offList.first().click();
      const onList = subModal.locator('[data-testid^="sub-on-"]');
      await onList.first().click();
      await expect(subModal.getByTestId("confirm-substitution")).toBeEnabled({
        timeout: 10000,
      });
      await subModal.getByTestId("confirm-substitution").click();
      await waitForPendingAckToClear(page);
    };

    await logUiPass(firstHome);
    await logUiShotGoal(firstAway);
    await logUiCorner(firstHome);
    await logUiFoulYellow(firstAway);
    await logUiSubstitution();

    // Harness-driven high-volume script built from taxonomy samples.
    const baseEvents: EventPayload[] = [
      {
        type: "Pass",
        team: "home",
        player: homeRoster[1]?.player_id,
        clockSeconds: 15,
        data: {
          pass_type: "Standard",
          outcome: "Complete",
          receiver_id: homeRoster[2]?.player_id,
          receiver_name: homeRoster[2]?.player_name,
        },
      },
      {
        type: "Pass",
        team: "away",
        player: awayRoster[1]?.player_id,
        clockSeconds: 16,
        data: {
          pass_type: "Standard",
          outcome: "Incomplete",
          receiver_id: awayRoster[2]?.player_id,
          receiver_name: awayRoster[2]?.player_name,
        },
      },
      {
        type: "Shot",
        team: "home",
        player: homeRoster[3]?.player_id,
        clockSeconds: 17,
        data: { shot_type: "Standard", outcome: "OnTarget" },
      },
      {
        type: "Shot",
        team: "away",
        player: awayRoster[3]?.player_id,
        clockSeconds: 18,
        data: { shot_type: "Standard", outcome: "Goal" },
      },
      {
        type: "FoulCommitted",
        team: "home",
        player: homeRoster[4]?.player_id,
        clockSeconds: 19,
        data: { foul_type: "Tackle", outcome: "FreeKick" },
      },
      {
        type: "Card",
        team: "home",
        player: homeRoster[4]?.player_id,
        clockSeconds: 19,
        data: { card_type: "Yellow", reason: "Foul" },
      },
      {
        type: "Offside",
        team: "away",
        player: awayRoster[4]?.player_id,
        clockSeconds: 20,
        data: { pass_player_id: awayRoster[1]?.player_id, outcome: "Standard" },
      },
      {
        type: "SetPiece",
        team: "home",
        player: homeRoster[5]?.player_id,
        clockSeconds: 21,
        data: { set_piece_type: "Corner", outcome: "Cross" },
      },
      {
        type: "SetPiece",
        team: "away",
        player: awayRoster[5]?.player_id,
        clockSeconds: 22,
        data: { set_piece_type: "Free Kick", outcome: "Shot" },
      },
      {
        type: "SetPiece",
        team: "home",
        player: homeRoster[6]?.player_id,
        clockSeconds: 23,
        data: { set_piece_type: "Goal Kick", outcome: "Standard" },
      },
      {
        type: "SetPiece",
        team: "away",
        player: awayRoster[6]?.player_id,
        clockSeconds: 24,
        data: { set_piece_type: "Throw In", outcome: "Standard" },
      },
      {
        type: "SetPiece",
        team: "home",
        player: homeRoster[7]?.player_id,
        clockSeconds: 25,
        data: { set_piece_type: "Penalty", outcome: "Goal" },
      },
      {
        type: "VARDecision",
        team: "home",
        player: homeRoster[1]?.player_id,
        clockSeconds: 26,
        data: { decision: "Penalty Retake" },
      },
      {
        type: "Interception",
        team: "away",
        player: awayRoster[7]?.player_id,
        clockSeconds: 27,
        data: { interception_type: "Ground" },
      },
      {
        type: "Clearance",
        team: "home",
        player: homeRoster[8]?.player_id,
        clockSeconds: 28,
        data: { clearance_type: "Foot" },
      },
      {
        type: "Shot",
        team: "away",
        player: awayRoster[8]?.player_id,
        clockSeconds: 29,
        data: { shot_type: "OwnGoal", outcome: "Goal" },
      },
      {
        type: "Shot",
        team: "home",
        player: homeRoster[9]?.player_id,
        clockSeconds: 30,
        data: { shot_type: "Standard", outcome: "OffTarget" },
      },
    ];

    // Repeat base events via backend API to reach ~1000 total injected events quickly.
    const repeats = Math.ceil(1000 / baseEvents.length);
    let injected = 0;

    const sendChunk = async (chunk: EventPayload[], offset: number) => {
      for (let idx = 0; idx < chunk.length; idx += 1) {
        const evt = chunk[idx];
        const teamId = evt.team === "home" ? homeTeamId : awayTeamId;
        const playerId =
          evt.player ?? (evt.team === "home" ? firstHome : firstAway);
        const match_clock = toClock(evt.clockSeconds + offset + idx);
        await sendRawEventThroughHarness(page, {
          match_id: matchId,
          period: evt.period ?? (match_clock.startsWith("45") ? 2 : 1),
          match_clock,
          team_id: teamId,
          player_id: playerId,
          type: evt.type,
          data: evt.data,
        });
        if ((idx + 1) % 50 === 0) {
          await waitForPendingAckToClear(page);
        }
      }
      await waitForPendingAckToClear(page);
    };

    for (let i = 0; i < repeats && injected < 1000; i += 1) {
      const remaining = 1000 - injected;
      const chunk = baseEvents.slice(
        0,
        remaining >= baseEvents.length ? baseEvents.length : remaining,
      );
      await sendChunk(chunk, i * 30);
      injected += chunk.length;
    }

    // Validate totals via backend API.
    const fetchEvents = async (): Promise<any[]> => {
      const collected: any[] = [];
      let pageNum = 1;
      while (true) {
        const resp = await backendRequest.get(
          `/api/v1/logger/matches/${matchId}/events?page=${pageNum}&page_size=500`,
        );
        expect(resp.ok()).toBeTruthy();
        const body = await resp.json();
        const items = Array.isArray(body) ? body : body.items;
        collected.push(...items);
        const hasNext = Array.isArray(body)
          ? false
          : body.has_next ?? items.length === 500;
        if (!hasNext || items.length === 0) break;
        pageNum += 1;
      }
      return collected;
    };

    const events = await fetchEvents();
    expect(events.length).toBeGreaterThanOrEqual(1000);

    const typeCounts = events.reduce<Record<string, number>>((acc, evt) => {
      acc[evt.type] = (acc[evt.type] ?? 0) + 1;
      return acc;
    }, {});

    // Spot-check key KPIs match our scripted volumes.
    expect(typeCounts.Pass ?? 0).toBeGreaterThanOrEqual(100);
    expect(typeCounts.Shot ?? 0).toBeGreaterThanOrEqual(100);
    expect(typeCounts.SetPiece ?? 0).toBeGreaterThanOrEqual(100);
    expect(typeCounts.FoulCommitted ?? 0).toBeGreaterThanOrEqual(50);
    expect(typeCounts.Card ?? 0).toBeGreaterThanOrEqual(50);
    expect(typeCounts.VARDecision ?? 0).toBeGreaterThan(0);

    // Validate analytics panel renders with the aggregated data.
    await page.getByTestId("toggle-analytics").click();
    const analyticsPanel = page.getByTestId("analytics-panel");
    await expect(analyticsPanel).toBeVisible({ timeout: 20000 });
    await expect(analyticsPanel.getByTestId("analytics-title")).toBeVisible();
    await expect(analyticsPanel).toContainText(/Events|Eventos/i);

    // Basic front-end chart sanity: ensure scores and totals surfaced.
    await expect(analyticsPanel).toContainText(/Pass|Pases/i);
    await expect(analyticsPanel).toContainText(/Shot|Tiro/i);
    await expect(analyticsPanel).toContainText(/Foul|Falta/i);
  });
});
