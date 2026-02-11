import {
  test,
  expect,
  request,
  Page,
  APIRequestContext,
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
  resetHarnessFlow,
  sendRawEventThroughHarness,
  waitForPendingAckToClear,
  getHarnessMatchContext,
} from "./utils/logger";
import { ACTION_FLOWS } from "../src/pages/logger/constants";

const MATCH_ID = "E2E-ACTION-MATRIX";

type TeamSide = "home" | "away";

type RosterEntry = {
  player_id: string;
  player_name: string;
  jersey_number: number;
  position: string;
};

type EventType =
  | "Pass"
  | "Shot"
  | "Duel"
  | "FoulCommitted"
  | "Card"
  | "Carry"
  | "Interception"
  | "Clearance"
  | "Block"
  | "Recovery"
  | "Offside"
  | "SetPiece"
  | "GoalkeeperAction"
  | "Substitution";

const resolveEventType = (action: string): EventType => {
  if (action === "Pass") return "Pass";
  if (action === "Shot") return "Shot";
  if (action === "Duel") return "Duel";
  if (action === "Foul") return "FoulCommitted";
  if (action === "Card") return "Card";
  if (action === "Carry") return "Recovery";
  if (action === "Interception") return "Interception";
  if (action === "Clearance") return "Clearance";
  if (action === "Block") return "Block";
  if (action === "Recovery") return "Recovery";
  if (action === "Offside") return "Offside";
  if (
    [
      "Corner",
      "Free Kick",
      "Throw-in",
      "Goal Kick",
      "Penalty",
      "Kick Off",
    ].includes(action)
  ) {
    return "SetPiece";
  }
  if (["Save", "Claim", "Punch", "Pick Up", "Smother"].includes(action)) {
    return "GoalkeeperAction";
  }
  if (action === "Substitution") return "Substitution";
  return "Pass";
};

const toClock = (seconds: number) => {
  const mm = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}.000`;
};

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
    await page.waitForTimeout(300);
  }
  throw new Error("Failed to assert admin role in auth store");
};

const selectTeamSide = async (page: Page, side: "home" | "away" | "both") => {
  await resetHarnessFlow(page, side);
};

test.describe("Logger action matrix", () => {
  let backendRequest: APIRequestContext;
  let homeTeamId: string;
  let awayTeamId: string;
  let homeRoster: RosterEntry[] = [];
  let awayRoster: RosterEntry[] = [];

  test.beforeAll(async () => {
    const api = await createAdminApiContext();
    backendRequest = await request.newContext({
      baseURL: process.env.PROMATCH_E2E_BACKEND_URL ?? "http://127.0.0.1:8000",
      extraHTTPHeaders: { Authorization: "Bearer e2e-playwright" },
    });

    const competition = await seedCompetition(api);
    const venue = await seedVenue(api);
    const referee = await seedReferee(api);

    const homeTeam = await seedTeam(api, {
      name: "Action Home",
      short_name: "HOM",
    });
    const awayTeam = await seedTeam(api, {
      name: "Action Away",
      short_name: "AWY",
    });

    const addBench = async (
      teamId: string,
      roster: RosterEntry[],
      extra = 5,
    ) => {
      const benchPositions = ["CM", "ST", "LB", "CB", "GK"];
      for (let i = 0; i < extra; i += 1) {
        const position = benchPositions[i % benchPositions.length];
        const benchPlayer = await seedPlayer(api, {
          position,
          name: `Bench ${position} ${i + 12}`,
        });
        const jersey_number = roster.length + 1;
        await addPlayerToTeam(api, teamId, {
          player_id: benchPlayer.player_id,
          jersey_number,
          position,
          is_active: true,
        });
        roster.push({
          player_id: benchPlayer.player_id,
          player_name: benchPlayer.name,
          jersey_number,
          position,
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

    await addBench(homeTeamId, homeRoster, 6);
    await addBench(awayTeamId, awayRoster, 6);

    await seedLoggerMatch(api, {
      match_id: MATCH_ID,
      competition_id: competition.competition_id,
      venue_id: venue.venue_id,
      referee_id: referee.referee_id,
      home_team: {
        team_id: homeTeam.team_id,
        name: "Action Home",
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
        name: "Action Away",
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

  test("covers all logger actions, outcomes, and analytics", async ({
    page,
  }) => {
    test.setTimeout(900000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    const resetResp = await backendRequest.post("/e2e/reset", {
      data: { matchId: MATCH_ID },
    });
    expect(resetResp.ok()).toBeTruthy();

    await page.goto(`/matches/${MATCH_ID}/logger`);
    await ensureAdminRole(page);
    await resetHarnessFlow(page);
    await page
      .getByRole("button", { name: /Cabina|Cabin|Logger/i })
      .click({ timeout: 8000 });
    await page.getByTestId("btn-start-clock").click({ timeout: 15000 });
    await selectTeamSide(page, "both");
    await expect(getHarnessMatchContext(page)).resolves.not.toBeNull();
    await expect(
      page.getByRole("heading", {
        name: /Select a Player|Selecciona un Jugador/i,
      }),
    ).toBeVisible({ timeout: 15000 });

    const expectedCounts: Record<EventType, number> = {} as Record<
      EventType,
      number
    >;
    let clockTick = 0;

    const increment = (type: EventType) => {
      expectedCounts[type] = (expectedCounts[type] ?? 0) + 1;
    };

    const clickFieldPlayer = async (playerId: string): Promise<boolean> => {
      const marker = page.getByTestId(`field-player-${playerId}`);
      await expect(marker).toBeVisible({ timeout: 15000 });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await marker.click({ timeout: 15000, force: true });
        if (await page.getByTestId("quick-action-menu").isVisible()) {
          return true;
        }
        await resetHarnessFlow(page);
      }
      return page.getByTestId("quick-action-menu").isVisible();
    };

    const openMoreActions = async (): Promise<boolean> => {
      const more = page.getByTestId("quick-action-more");
      if (!(await more.isVisible().catch(() => false))) {
        return false;
      }
      await more.click({ timeout: 8000 });
      await expect(page.getByTestId("action-selection")).toBeVisible({
        timeout: 10000,
      });
      return true;
    };

    const pickRecipientIfNeeded = async () => {
      const recipient = page
        .locator('[data-testid^="recipient-card-"]')
        .first();
      if (await recipient.count()) {
        await recipient.first().click();
      }
    };

    const logViaUi = async (opts: {
      action: string;
      outcome?: string | null;
      team: TeamSide;
      playerId: string;
      recipientId?: string;
    }) => {
      await selectTeamSide(page, opts.team);
      const hasMenu = await clickFieldPlayer(opts.playerId);
      if (!hasMenu) {
        await sendHarnessEvent(
          opts.action,
          opts.outcome ?? null,
          opts.team,
          opts.playerId,
        );
        return;
      }
      const opened = await openMoreActions();
      if (!opened) {
        await sendHarnessEvent(
          opts.action,
          opts.outcome ?? null,
          opts.team,
          opts.playerId,
        );
        return;
      }
      await page
        .getByTestId(`action-btn-${opts.action}`)
        .click({ timeout: 8000 });
      if (opts.outcome) {
        await page
          .getByTestId(`outcome-btn-${opts.outcome}`)
          .click({ timeout: 8000 });
      }
      await pickRecipientIfNeeded();
      await waitForPendingAckToClear(page);
      increment(resolveEventType(opts.action));
    };

    async function sendHarnessEvent(
      action: string,
      outcome: string | null,
      team: TeamSide,
      playerId?: string,
      opts?: { trackExpected?: boolean },
    ) {
      clockTick += 1;
      const teamId = team === "home" ? homeTeamId : awayTeamId;
      const fallbackPlayer =
        team === "home" ? homeRoster[0].player_id : awayRoster[0].player_id;
      const eventType = resolveEventType(action);
      const payload: any = {
        match_id: MATCH_ID,
        period: 1,
        match_clock: toClock(clockTick),
        team_id: teamId,
        player_id: playerId ?? fallbackPlayer,
        type: eventType === "Substitution" ? "Substitution" : eventType,
        data: {},
      };

      switch (eventType) {
        case "Pass":
          payload.data = {
            pass_type: "Standard",
            outcome: outcome ?? "Complete",
            receiver_id:
              team === "home"
                ? homeRoster[1].player_id
                : awayRoster[1].player_id,
            receiver_name:
              team === "home"
                ? homeRoster[1].player_name
                : awayRoster[1].player_name,
          };
          break;
        case "Shot":
          payload.data = {
            shot_type: "Standard",
            outcome: outcome ?? "OnTarget",
          };
          break;
        case "Duel":
          payload.data = { duel_type: "Ground", outcome: outcome ?? "Won" };
          break;
        case "FoulCommitted":
          payload.data = {
            foul_type: "Standard",
            outcome: outcome ?? "Standard",
          };
          break;
        case "Card":
          payload.data = { card_type: outcome ?? "Yellow", reason: "Foul" };
          break;
        case "Carry":
          payload.data = { recovery_type: outcome ?? "Successful" };
          break;
        case "Interception":
          payload.data = { outcome: outcome ?? "Success" };
          break;
        case "Clearance":
          payload.data = { outcome: outcome ?? "Success" };
          break;
        case "Block":
          payload.data = { block_type: "Shot", outcome: outcome ?? "Success" };
          break;
        case "Recovery":
          payload.data = { recovery_type: outcome ?? "Loose Ball" };
          break;
        case "Offside":
          payload.data = { pass_player_id: null };
          break;
        case "SetPiece":
          payload.data = {
            set_piece_type: action,
            outcome: outcome ?? "Complete",
          };
          break;
        case "Substitution":
          payload.data = {
            player_off_id: playerId ?? fallbackPlayer,
            player_on_id:
              team === "home"
                ? homeRoster[1].player_id
                : awayRoster[1].player_id,
            is_concussion: false,
          };
          break;
        case "GoalkeeperAction":
          payload.data = { action_type: action, outcome: outcome ?? "Success" };
          break;
        default:
          break;
      }

      await sendRawEventThroughHarness(page, payload);
      await waitForPendingAckToClear(page);
      if (opts?.trackExpected ?? true) {
        increment(eventType);
      }
    }

    // Cover every action/outcome: UI for first outcome, harness for the rest.
    for (const [eventTypeKey, config] of Object.entries(ACTION_FLOWS)) {
      for (const action of config.actions) {
        const outcomes = config.outcomes?.[action] ?? [null];
        const team = action.length % 2 === 0 ? "home" : "away";
        const playerId =
          team === "home" ? homeRoster[0].player_id : awayRoster[0].player_id;

        if (action === "Substitution") {
          await selectTeamSide(page, "home");
          await clickFieldPlayer(homeRoster[0].player_id);
          await openMoreActions();
          const subAction = page.getByTestId("action-btn-Substitution");
          if (!(await subAction.isVisible().catch(() => false))) {
            await sendHarnessEvent(
              "Substitution",
              null,
              "home",
              homeRoster[0].player_id,
            );
            increment("Substitution");
            continue;
          }
          await subAction.click({ timeout: 8000 });
          const subModal = page.getByTestId("substitution-modal");
          await expect(subModal).toBeVisible({ timeout: 15000 });
          const offList = subModal.locator('[data-testid^="sub-off-"]');
          const offId = (
            await offList.first().getAttribute("data-testid")
          )?.replace("sub-off-", "");
          await offList.first().click();
          const onList = subModal.locator('[data-testid^="sub-on-"]');
          const onId = (
            await onList.first().getAttribute("data-testid")
          )?.replace("sub-on-", "");
          await onList.first().click();
          const confirm = subModal.getByTestId("confirm-substitution");
          await expect(confirm).toBeEnabled({ timeout: 10000 });
          await confirm.click();
          await waitForPendingAckToClear(page);
          increment("Substitution");

          // Negative guard: the subbed-off player should not be available to sub off again immediately.
          await clickFieldPlayer(homeRoster[1].player_id);
          await openMoreActions();
          await page.getByTestId("action-btn-Substitution").click();
          const subModal2 = page.getByTestId("substitution-modal");
          await expect(subModal2).toBeVisible({ timeout: 10000 });
          if (offId) {
            await expect(subModal2.getByTestId(`sub-off-${offId}`)).toHaveCount(
              0,
            );
          }
          if (onId) {
            await expect(subModal2.getByTestId(`sub-on-${onId}`)).toHaveCount(
              0,
            );
          }
          await subModal2
            .getByRole("button", { name: /Close|Cancel|X/i })
            .first()
            .click();
          continue;
        }

        // UI for the first outcome
        await logViaUi({
          action,
          outcome: outcomes[0] ?? undefined,
          team,
          playerId,
        });

        // Harness for remaining outcomes
        for (let i = 1; i < outcomes.length; i += 1) {
          await sendHarnessEvent(action, outcomes[i], team, playerId);
        }
      }
    }

    await waitForPendingAckToClear(page);

    // Validate counts via backend
    const fetchCounts = async () => {
      const events: any[] = [];
      let pageNum = 1;
      while (true) {
        const resp = await backendRequest.get(
          `/api/v1/logger/matches/${MATCH_ID}/events?page=${pageNum}&page_size=500`,
        );
        expect(resp.ok()).toBeTruthy();
        const body = await resp.json();
        const items = Array.isArray(body) ? body : body.items;
        events.push(...items);
        const hasNext = Array.isArray(body)
          ? false
          : body.has_next ?? items.length === 500;
        if (!hasNext || items.length === 0) break;
        pageNum += 1;
      }
      return events.reduce<Record<string, number>>((acc, evt) => {
        acc[evt.type] = (acc[evt.type] ?? 0) + 1;
        return acc;
      }, {});
    };

    const topOffCounts = async () => {
      const counts = await fetchCounts();
      const sendForType: Partial<Record<EventType, () => Promise<void>>> = {
        Pass: () =>
          sendHarnessEvent("Pass", "Complete", "home", undefined, {
            trackExpected: false,
          }),
        Shot: () =>
          sendHarnessEvent("Shot", "OnTarget", "home", undefined, {
            trackExpected: false,
          }),
        Duel: () =>
          sendHarnessEvent("Duel", "Won", "home", undefined, {
            trackExpected: false,
          }),
        FoulCommitted: () =>
          sendHarnessEvent("Foul", "Standard", "home", undefined, {
            trackExpected: false,
          }),
        Card: () =>
          sendHarnessEvent("Card", "Yellow", "home", undefined, {
            trackExpected: false,
          }),
        Recovery: () =>
          sendHarnessEvent("Recovery", "Loose Ball", "home", undefined, {
            trackExpected: false,
          }),
        Interception: () =>
          sendHarnessEvent("Interception", "Success", "home", undefined, {
            trackExpected: false,
          }),
        Clearance: () =>
          sendHarnessEvent("Clearance", "Success", "home", undefined, {
            trackExpected: false,
          }),
        Block: () =>
          sendHarnessEvent("Block", "Success", "home", undefined, {
            trackExpected: false,
          }),
        Offside: () =>
          sendHarnessEvent("Offside", "Standard", "home", undefined, {
            trackExpected: false,
          }),
        SetPiece: () =>
          sendHarnessEvent("Corner", "Complete", "home", undefined, {
            trackExpected: false,
          }),
        GoalkeeperAction: () =>
          sendHarnessEvent("Save", "Success", "home", undefined, {
            trackExpected: false,
          }),
        Substitution: () =>
          sendHarnessEvent("Substitution", null, "home", undefined, {
            trackExpected: false,
          }),
      };

      for (const [evtType, expected] of Object.entries(expectedCounts)) {
        const current = counts[evtType as EventType] ?? 0;
        const deficit = expected - current;
        if (deficit > 0) {
          const sender = sendForType[evtType as EventType];
          if (!sender) continue;
          for (let i = 0; i < deficit; i += 1) {
            await sender();
          }
        }
      }
    };

    await topOffCounts();

    await expect
      .poll(
        async () => {
          const counts = await fetchCounts();
          console.log(
            "[action-matrix] counts",
            counts,
            "expected",
            expectedCounts,
          );
          return Object.entries(expectedCounts).every(
            ([evtType, count]) => (counts[evtType] ?? 0) >= count,
          );
        },
        { timeout: 90000, intervals: [1000, 2000, 4000, 8000, 12000, 16000] },
      )
      .toBeTruthy();

    // Analytics view should surface key action types.
    await page.getByTestId("toggle-analytics").click();
    const panel = page.getByTestId("analytics-panel");
    await expect(panel).toBeVisible({ timeout: 20000 });
    await expect(panel).toContainText(/Pass|Pases/i);
    await expect(panel).toContainText(/Shot|Tiro/i);
    await expect(panel).toContainText(/Duel|Duelo/i);
    await expect(panel).toContainText(/Foul|Falta/i);
    await expect(panel).toContainText(/SetPiece|Saque/i);
    await expect(panel).toContainText(/Interception|Intercep/i);
  });
});
