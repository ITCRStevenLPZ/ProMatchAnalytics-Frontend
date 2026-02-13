import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { BACKEND_BASE_URL } from "./utils/logger";

const normalizeBaseUrl = (base: string): string => base.replace(/\/+$/, "");
const API_BASE_URL = `${normalizeBaseUrl(BACKEND_BASE_URL)}/api/v1/`;

const AUTH_HEADERS = {
  Authorization: "Bearer e2e-playwright",
  "Content-Type": "application/json",
};

const uniqueId = (prefix: string) => {
  const randomToken = Math.random()
    .toString(36)
    .replace(/[^a-z0-9]/gi, "")
    .slice(2, 8)
    .toUpperCase();
  return `${prefix}-${Date.now()}-${randomToken}`;
};

let apiRequest: APIRequestContext;

test.beforeAll(async () => {
  console.log("[admin-matches-crud] API_BASE_URL =", API_BASE_URL);
  apiRequest = await request.newContext({
    baseURL: API_BASE_URL,
    extraHTTPHeaders: AUTH_HEADERS,
  });
});

test.afterAll(async () => {
  await apiRequest?.dispose();
});

async function json<T>(
  response: Awaited<ReturnType<APIRequestContext["get"]>>,
): Promise<T> {
  if (response.ok()) {
    return response.json() as Promise<T>;
  }

  const body = await response.text();
  throw new Error(
    `Request failed: ${response.status()} ${response.url()}\n${
      body || "<empty body>"
    }`,
  );
}

async function createCompetition(competitionId: string, name: string) {
  const response = await apiRequest.post("competitions/", {
    data: {
      competition_id: competitionId,
      name,
      gender: "male",
      country_name: "USA",
      i18n_names: {},
    },
  });
  expect(response.status()).toBe(201);
}

async function createVenue(venueId: string, name: string) {
  const response = await apiRequest.post("venues/", {
    data: {
      venue_id: venueId,
      name,
      city: "Austin",
      country_name: "USA",
      capacity: 25000,
      surface: "Grass",
    },
  });
  expect(response.status()).toBe(201);
}

async function createReferee(refereeId: string, name: string) {
  const response = await apiRequest.post("referees/", {
    data: {
      referee_id: refereeId,
      name,
      country_name: "USA",
      years_of_experience: 8,
    },
  });
  expect(response.status()).toBe(201);
}

function buildPlayerPayload(playerId: string, name: string, position: string) {
  return {
    player_id: playerId,
    name,
    nickname: `${name.split(" ")[0]} Nick`,
    birth_date: new Date("1994-04-15T00:00:00Z").toISOString(),
    player_height: 182,
    player_weight: 77,
    country_name: "USA",
    position,
    i18n_names: {},
  };
}

function rosterAssignmentPosition(index: number): string {
  if (index === 0) return "GK";
  if (index < 5) return "CB";
  return "ST";
}

function lineupPosition(index: number): "GK" | "DF" | "FW" {
  if (index === 0) return "GK";
  if (index < 5) return "DF";
  return "FW";
}

type SeededTeam = {
  teamId: string;
  name: string;
  manager: string;
  lineup: Array<{
    player_id: string;
    player_name: string;
    jersey_number: number;
    position: string;
    is_starter: boolean;
    is_captain: boolean;
  }>;
};

async function seedTeamWithRoster(label: string): Promise<SeededTeam> {
  const teamId = uniqueId(`TEAM${label}`);
  const teamName = `${label} FC ${teamId.slice(-4)}`;
  const manager = `${label} Manager`;

  const teamResponse = await apiRequest.post("teams/", {
    data: {
      team_id: teamId,
      name: teamName,
      short_name: label.slice(0, 3).toUpperCase(),
      gender: "male",
      country_name: "USA",
      managers: [],
      technical_staff: [],
      i18n_names: {},
    },
  });
  expect(teamResponse.status()).toBe(201);

  const lineup: SeededTeam["lineup"] = [];
  for (let idx = 0; idx < 11; idx += 1) {
    const playerId = uniqueId(`${label}PLY${idx}`);
    const playerName = `${label} Player ${idx + 1}`;
    const corePosition = idx === 0 ? "GK" : idx < 5 ? "CB" : "ST";
    const playerResp = await apiRequest.post("players/", {
      data: buildPlayerPayload(playerId, playerName, corePosition),
    });
    if (playerResp.status() !== 201) {
      const body = await playerResp.text();
      throw new Error(
        `Failed to create match player ${playerId}: ${playerResp.status()} ${body}`,
      );
    }

    const rosterResp = await apiRequest.post(`teams/${teamId}/players`, {
      data: {
        team_id: teamId,
        player_id: playerId,
        jersey_number: idx + 1,
        position: rosterAssignmentPosition(idx),
        is_active: true,
      },
    });
    if (rosterResp.status() !== 201) {
      const body = await rosterResp.text();
      throw new Error(
        `Failed to attach player ${playerId} to roster: ${rosterResp.status()} ${body}`,
      );
    }

    lineup.push({
      player_id: playerId,
      player_name: playerName,
      jersey_number: idx + 1,
      position: lineupPosition(idx),
      is_starter: true,
      is_captain: idx === 0,
    });
  }

  return { teamId, name: teamName, manager, lineup };
}

function buildMatchPayload(params: {
  matchId: string;
  competitionId: string;
  venueId: string;
  venueName: string;
  refereeId: string;
  refereeName: string;
  home: SeededTeam;
  away: SeededTeam;
}): Record<string, any> {
  const kickoff = new Date();
  const matchDate = new Date(kickoff.getTime() + 5 * 60 * 1000);
  return {
    match_id: params.matchId,
    competition_id: params.competitionId,
    season_name: "2025/2026",
    competition_stage: "Regular Season",
    match_date: matchDate.toISOString(),
    kick_off: new Date(matchDate.getTime() + 15 * 60 * 1000).toISOString(),
    home_team: {
      team_id: params.home.teamId,
      name: params.home.name,
      manager: params.home.manager,
      lineup: params.home.lineup,
    },
    away_team: {
      team_id: params.away.teamId,
      name: params.away.name,
      manager: params.away.manager,
      lineup: params.away.lineup,
    },
    venue: { venue_id: params.venueId, name: params.venueName },
    referee: { referee_id: params.refereeId, name: params.refereeName },
  };
}

async function expectStatusTransition(matchDocId: string, status: string) {
  const response = await apiRequest.patch(`matches/${matchDocId}/status`, {
    data: { status },
  });
  expect(response.status()).toBe(200);
  const payload = await json<any>(response);
  expect(payload.status).toBe(status);
}

test.describe("Admin matches CRUD & status transitions", () => {
  test.describe.configure({ mode: "serial" });

  test("auto-suffixes duplicate match_id instead of blocking creation", async () => {
    const competitionId = uniqueId("COMP");
    const venueId = uniqueId("VEN");
    const refereeId = uniqueId("REF");

    await createCompetition(
      competitionId,
      `E2E Competition ${competitionId.slice(-4)}`,
    );
    await createVenue(venueId, `Venue ${venueId.slice(-4)}`);
    await createReferee(refereeId, `Ref ${refereeId.slice(-4)}`);

    const homeTeam = await seedTeamWithRoster("HOME-DUP");
    const awayTeam = await seedTeamWithRoster("AWAY-DUP");
    const duplicateMatchId = uniqueId("MATCHDUPID");

    const firstPayload = buildMatchPayload({
      matchId: duplicateMatchId,
      competitionId,
      venueId,
      venueName: `Venue ${venueId.slice(-4)}`,
      refereeId,
      refereeName: `Ref ${refereeId.slice(-4)}`,
      home: homeTeam,
      away: awayTeam,
    });

    const firstCreate = await apiRequest.post("matches/", {
      data: firstPayload,
    });
    if (![200, 201].includes(firstCreate.status())) {
      const body = await firstCreate.text();
      throw new Error(
        `Failed to create first duplicate-id match: ${firstCreate.status()} ${body}`,
      );
    }
    const firstCreated = await json<any>(firstCreate);
    expect(firstCreated.match_id).toBe(duplicateMatchId);

    const secondPayload = buildMatchPayload({
      matchId: duplicateMatchId,
      competitionId,
      venueId,
      venueName: `Venue ${venueId.slice(-4)}`,
      refereeId,
      refereeName: `Ref ${refereeId.slice(-4)}`,
      home: homeTeam,
      away: awayTeam,
    });

    const secondCreate = await apiRequest.post("matches/", {
      data: secondPayload,
    });
    if (![200, 201].includes(secondCreate.status())) {
      const body = await secondCreate.text();
      throw new Error(
        `Failed to create second duplicate-id match: ${secondCreate.status()} ${body}`,
      );
    }
    const secondCreated = await json<any>(secondCreate);
    expect(secondCreated.match_id).not.toBe(duplicateMatchId);
    expect(String(secondCreated.match_id)).toMatch(
      new RegExp(`^${duplicateMatchId}_[0-9]+$`),
    );
  });

  test("creates matches, walks status transitions, and exposes stats", async () => {
    const competitionId = uniqueId("COMP");
    const venueId = uniqueId("VEN");
    const refereeId = uniqueId("REF");

    await createCompetition(
      competitionId,
      `E2E Competition ${competitionId.slice(-4)}`,
    );
    await createVenue(venueId, `Venue ${venueId.slice(-4)}`);
    await createReferee(refereeId, `Ref ${refereeId.slice(-4)}`);

    const homeTeam = await seedTeamWithRoster("HOME");
    const awayTeam = await seedTeamWithRoster("AWAY");

    const matchPayload = buildMatchPayload({
      matchId: uniqueId("MATCH"),
      competitionId,
      venueId,
      venueName: `Venue ${venueId.slice(-4)}`,
      refereeId,
      refereeName: `Ref ${refereeId.slice(-4)}`,
      home: homeTeam,
      away: awayTeam,
    });

    const createResponse = await apiRequest.post("matches/", {
      data: matchPayload,
    });
    if (![200, 201].includes(createResponse.status())) {
      const body = await createResponse.text();
      throw new Error(
        `Failed to create match ${
          matchPayload.match_id
        }: ${createResponse.status()} ${body}`,
      );
    }
    const createdMatch = await json<any>(createResponse);
    expect(createdMatch.match_id).toBe(matchPayload.match_id);
    const matchDocId = createdMatch._id;

    const fetchResponse = await apiRequest.get(`matches/${matchDocId}`);
    const fetchedMatch = await json<any>(fetchResponse);
    expect(fetchedMatch.status).toBe("Pending");

    const pendingListResponse = await apiRequest.get(
      "matches/?status=Pending&limit=10",
    );
    const pendingMatches = await json<any[]>(pendingListResponse);
    expect(
      pendingMatches.some((match) => match.match_id === matchPayload.match_id),
    ).toBeTruthy();

    const invalidTransition = await apiRequest.patch(
      `matches/${matchDocId}/status`,
      {
        data: { status: "Halftime" },
      },
    );
    expect(invalidTransition.status()).toBe(400);

    await expectStatusTransition(matchDocId, "Live_First_Half");
    const liveFeedResponse = await apiRequest.get("matches/live");
    const liveMatches = await json<any[]>(liveFeedResponse);
    expect(liveMatches.some((match) => match._id === matchDocId)).toBeTruthy();

    await expectStatusTransition(matchDocId, "Halftime");
    await expectStatusTransition(matchDocId, "Live_Second_Half");
    await expectStatusTransition(matchDocId, "Fulltime");

    const statsResponse = await apiRequest.get(`matches/${matchDocId}/stats`);
    const stats = await json<any>(statsResponse);
    expect(stats.status).toBe("Fulltime");
    expect(stats.home_team.lineup_size).toBe(homeTeam.lineup.length);
    expect(stats.away_team.lineup_size).toBe(awayTeam.lineup.length);

    const deletablePayload = buildMatchPayload({
      matchId: uniqueId("MATCHDEL"),
      competitionId,
      venueId,
      venueName: `Venue ${venueId.slice(-4)}`,
      refereeId,
      refereeName: `Ref ${refereeId.slice(-4)}`,
      home: homeTeam,
      away: awayTeam,
    });
    const deletableResp = await apiRequest.post("matches/", {
      data: deletablePayload,
    });
    expect([200, 201]).toContain(deletableResp.status());
    const deletableMatch = await json<any>(deletableResp);

    const deleteResponse = await apiRequest.delete(
      `matches/${deletableMatch._id}`,
    );
    expect(deleteResponse.status()).toBe(204);
  });
});
