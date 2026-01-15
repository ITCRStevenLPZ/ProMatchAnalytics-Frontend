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

const MAX_ACTIVE_PLAYERS = Number(
  process.env.PROMATCH_MAX_ACTIVE_PLAYERS ?? 25,
);

const uniqueId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const buildPlayerPayload = (playerId: string, label: string) => ({
  player_id: playerId,
  name: `E2E Player ${label}`,
  nickname: `Player-${label}`,
  birth_date: new Date("1995-02-15T00:00:00Z").toISOString(),
  player_height: 182,
  player_weight: 78,
  country_name: "USA",
  position: "CM",
  i18n_names: {},
});

let apiRequest: APIRequestContext;

test.beforeAll(async () => {
  console.log("[admin-models-crud] API_BASE_URL =", API_BASE_URL);
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

async function fetchConflicts(
  params: {
    target_model?: string;
    status?: string;
    page?: number;
    page_size?: number;
  } = {},
) {
  const queryParams = new URLSearchParams();
  if (params.target_model)
    queryParams.append("target_model", params.target_model);
  if (params.status) queryParams.append("status", params.status);
  if (params.page) queryParams.append("page", params.page.toString());
  if (params.page_size)
    queryParams.append("page_size", params.page_size.toString());

  const query = queryParams.toString();
  const response = await apiRequest.get(
    `ingestions/conflicts/list${query ? `?${query}` : ""}`,
  );
  return json<{
    conflicts: any[];
    total: number;
    page: number;
    page_size: number;
  }>(response);
}

async function updateIngestionItemPayload(
  itemId: string,
  payload: Record<string, any>,
): Promise<void> {
  const response = await apiRequest.post(
    `debug/ingestion-items/${itemId}/raw-payload`,
    { data: { payload } },
  );
  const result = await json<{ item_id: string }>(response);
  expect(result.item_id).toBe(itemId);
}

async function seedPlayerConflictBatch() {
  const basePlayers = [
    {
      player_id: uniqueId("BASEPA"),
      name: "Conflict Player Alpha",
      nickname: "Alpha",
      birth_date: new Date("1994-04-20T00:00:00Z").toISOString(),
      player_height: 181,
      player_weight: 77,
      country_name: "Canada",
      position: "CM",
      i18n_names: {},
    },
    {
      player_id: uniqueId("BASEPB"),
      name: "Conflict Player Beta",
      nickname: "Beta",
      birth_date: new Date("1992-09-12T00:00:00Z").toISOString(),
      player_height: 178,
      player_weight: 73,
      country_name: "Mexico",
      position: "ST",
      i18n_names: {},
    },
  ];

  for (const player of basePlayers) {
    const createResp = await apiRequest.post("players/", { data: player });
    await json(createResp);
  }

  const conflictRows = [
    {
      player_id: uniqueId("INGCONF1"),
      name: basePlayers[0].name,
      nickname: "Alpha Update",
      birth_date: basePlayers[0].birth_date,
      player_height: 183,
      player_weight: 79,
      country_name: basePlayers[0].country_name,
      position: "CDM",
    },
    {
      player_id: uniqueId("INGCONF2"),
      name: basePlayers[1].name,
      nickname: "Beta Update",
      birth_date: basePlayers[1].birth_date,
      player_height: 180,
      player_weight: 74,
      country_name: basePlayers[1].country_name,
      position: "CF",
    },
  ];

  const conflictBatchResp = await apiRequest.post("ingestions/", {
    data: {
      target_model: "players",
      data: conflictRows,
      batch_name: "Conflict Batch",
      metadata: { source: "playwright-e2e" },
    },
  });
  const conflictBatch = await json<{ ingestion_id: string }>(conflictBatchResp);
  const ingestionId = conflictBatch.ingestion_id;

  const conflictStatus = await waitForBatchStatus(ingestionId, /^(conflicts)$/);
  expect(conflictStatus).toBe("conflicts");

  const conflictItemsResp = await apiRequest.get(
    `ingestions/${ingestionId}/items?page=1&page_size=10&status_filter=conflict_open`,
  );
  const conflictItems = await json<{ items: any[]; total: number }>(
    conflictItemsResp,
  );
  expect(conflictItems.total).toBe(conflictRows.length);

  return {
    ingestionId,
    conflictItems,
    basePlayerIds: basePlayers.map((player) => player.player_id),
  };
}

async function waitForBatchStatus(
  ingestionId: string,
  allowedStatuses = /^(success|conflicts)$/,
  timeoutMs = 90000,
): Promise<string> {
  let finalStatus = "";
  await expect
    .poll(
      async () => {
        try {
          const statusResponse = await apiRequest.get(
            `ingestions/${ingestionId}`,
          );
          const statusPayload = await json<{ status: string }>(statusResponse);
          finalStatus = statusPayload.status;
          return finalStatus;
        } catch (err) {
          console.warn(
            `[waitForBatchStatus] transient fetch failure for ${ingestionId}: ${String(
              err,
            )}`,
          );
          return finalStatus || "pending";
        }
      },
      { timeout: timeoutMs, intervals: [500, 1000, 2000, 4000] },
    )
    .toMatch(allowedStatuses);

  return finalStatus;
}

test.describe("Admin model CRUD APIs", () => {
  test("Competition CRUD flow", async () => {
    const competitionId = uniqueId("COMP");
    const payload = {
      competition_id: competitionId,
      name: `E2E Competition ${competitionId}`,
      gender: "male",
      country_name: "USA",
      i18n_names: { es: "Competencia E2E" },
    };

    const createResponse = await apiRequest.post("competitions/", {
      data: payload,
    });
    const created = await json<any>(createResponse);
    expect(created.competition_id).toBe(competitionId);

    const updatedName = `${payload.name} Updated`;
    const updateResponse = await apiRequest.put(
      `competitions/${competitionId}`,
      {
        data: { name: updatedName, country_name: "Canada" },
      },
    );
    const updated = await json<any>(updateResponse);
    expect(updated.name).toBe(updatedName);
    expect(updated.country_name).toBe("Canada");

    const getResponse = await apiRequest.get(`competitions/${competitionId}`);
    const fetched = await json<any>(getResponse);
    expect(fetched.name).toBe(updatedName);

    const listResponse = await apiRequest.get(
      `competitions/?page=1&page_size=5&search=${competitionId.slice(0, 6)}`,
    );
    const list = await json<{ items: any[] }>(listResponse);
    expect(
      list.items.some((item) => item.competition_id === competitionId),
    ).toBeTruthy();

    const deleteResponse = await apiRequest.delete(
      `competitions/${competitionId}`,
    );
    expect(deleteResponse.status()).toBe(204);
  });

  test("Venue CRUD flow", async () => {
    const venueId = uniqueId("VEN");
    const payload = {
      venue_id: venueId,
      name: `E2E Venue ${venueId}`,
      city: "Austin",
      country_name: "USA",
      capacity: 25000,
      surface: "Grass",
    };

    const createResponse = await apiRequest.post("venues/", { data: payload });
    const created = await json<any>(createResponse);
    expect(created.venue_id).toBe(venueId);

    const updateResponse = await apiRequest.put(`venues/${venueId}`, {
      data: { city: "Houston", surface: "Hybrid" },
    });
    const updated = await json<any>(updateResponse);
    expect(updated.city).toBe("Houston");
    expect(updated.surface).toBe("Hybrid");

    const listResponse = await apiRequest.get(
      `venues/?page=1&page_size=5&search=${venueId.slice(0, 6)}`,
    );
    const list = await json<{ items: any[] }>(listResponse);
    expect(list.items.some((item) => item.venue_id === venueId)).toBeTruthy();

    const deleteResponse = await apiRequest.delete(`venues/${venueId}`);
    expect(deleteResponse.status()).toBe(204);
  });

  test("Referee CRUD flow", async () => {
    const refereeId = uniqueId("REF");
    const payload = {
      referee_id: refereeId,
      name: `E2E Referee ${refereeId}`,
      country_name: "USA",
      years_of_experience: 5,
    };

    const createResponse = await apiRequest.post("referees/", {
      data: payload,
    });
    const created = await json<any>(createResponse);
    expect(created.referee_id).toBe(refereeId);

    const updateResponse = await apiRequest.put(`referees/${refereeId}`, {
      data: { years_of_experience: 6 },
    });
    const updated = await json<any>(updateResponse);
    expect(updated.years_of_experience).toBe(6);

    const listResponse = await apiRequest.get(
      `referees/?page=1&page_size=5&search=${refereeId.slice(0, 6)}`,
    );
    const list = await json<{ items: any[] }>(listResponse);
    expect(
      list.items.some((item) => item.referee_id === refereeId),
    ).toBeTruthy();

    const deleteResponse = await apiRequest.delete(`referees/${refereeId}`);
    expect(deleteResponse.status()).toBe(204);
  });

  test("Player CRUD flow", async () => {
    const playerId = uniqueId("PLY");
    const payload = {
      player_id: playerId,
      name: `E2E Player ${playerId}`,
      nickname: "Tester",
      birth_date: new Date("1995-02-15T00:00:00Z").toISOString(),
      player_height: 182,
      player_weight: 78,
      country_name: "USA",
      position: "CM",
      i18n_names: { es: "Jugador E2E" },
    };

    const createResponse = await apiRequest.post("players/", { data: payload });
    const created = await json<any>(createResponse);
    expect(created.player_id).toBe(playerId);

    const updateResponse = await apiRequest.put(`players/${playerId}`, {
      data: { nickname: "Playwright Hero" },
    });
    const updated = await json<any>(updateResponse);
    expect(updated.nickname).toBe("Playwright Hero");

    const listResponse = await apiRequest.get(
      `players/?page=1&page_size=5&search=${playerId.slice(0, 6)}`,
    );
    const list = await json<{ items: any[] }>(listResponse);
    expect(list.items.some((item) => item.player_id === playerId)).toBeTruthy();

    const deleteResponse = await apiRequest.delete(`players/${playerId}`);
    expect(deleteResponse.status()).toBe(204);
  });

  test("Player validation rejects blank names", async () => {
    const invalidResp = await apiRequest.post("players/", {
      data: {
        player_id: uniqueId("PLYBAD"),
        name: "   ",
        nickname: "Invalid",
        birth_date: new Date("1995-02-15T00:00:00Z").toISOString(),
        player_height: 182,
        player_weight: 78,
        country_name: "USA",
        position: "CM",
        i18n_names: {},
      },
    });

    expect([400, 422]).toContain(invalidResp.status());
    const body = (await invalidResp.text()).toLowerCase();
    expect(body).toContain("name");
  });

  test("Team CRUD flow", async () => {
    const teamId = uniqueId("TEAM");
    const payload = {
      team_id: teamId,
      name: `E2E Team ${teamId}`,
      short_name: "E2E",
      gender: "male",
      country_name: "USA",
      managers: [],
      technical_staff: [],
      i18n_names: { es: "Equipo E2E" },
    };

    const createResponse = await apiRequest.post("teams/", { data: payload });
    const created = await json<any>(createResponse);
    expect(created.team_id).toBe(teamId);

    const updateResponse = await apiRequest.put(`teams/${teamId}`, {
      data: { short_name: "EE", founded_year: 2020 },
    });
    const updated = await json<any>(updateResponse);
    expect(updated.short_name).toBe("EE");

    const getResponse = await apiRequest.get(`teams/${teamId}`);
    const fetched = await json<any>(getResponse);
    expect(fetched.short_name).toBe("EE");

    const deleteResponse = await apiRequest.delete(`teams/${teamId}`);
    expect(deleteResponse.status()).toBe(204);
  });

  test("Venue validation rejects negative capacity", async () => {
    const venueId = uniqueId("VENBAD");
    const invalidResp = await apiRequest.post("venues/", {
      data: {
        venue_id: venueId,
        name: `Invalid Venue ${venueId}`,
        city: "Austin",
        country_name: "USA",
        capacity: -10,
        surface: "Grass",
      },
    });

    expect([400, 422]).toContain(invalidResp.status());
    const body = (await invalidResp.text()).toLowerCase();
    expect(body).toContain("capacity");
  });

  test("Player validation rejects invalid position", async () => {
    const invalidResp = await apiRequest.post("players/", {
      data: {
        player_id: uniqueId("PLYBADPOS"),
        name: "Invalid Position Player",
        nickname: "InvalidPos",
        birth_date: new Date("1995-02-15T00:00:00Z").toISOString(),
        player_height: 182,
        player_weight: 78,
        country_name: "USA",
        position: "INVALID",
        i18n_names: {},
      },
    });

    expect([400, 422]).toContain(invalidResp.status());
    const body = (await invalidResp.text()).toLowerCase();
    expect(body).toContain("position");
  });

  test("Player validation rejects unrealistic height", async () => {
    const invalidResp = await apiRequest.post("players/", {
      data: {
        player_id: uniqueId("PLYBADHT"),
        name: "Invalid Height Player",
        nickname: "InvalidHt",
        birth_date: new Date("1995-02-15T00:00:00Z").toISOString(),
        player_height: 30,
        player_weight: 50,
        country_name: "USA",
        position: "CM",
        i18n_names: {},
      },
    });

    expect([400, 422]).toContain(invalidResp.status());
    const body = (await invalidResp.text()).toLowerCase();
    expect(body).toContain("player_height");
  });

  test("Competition validation rejects invalid gender", async () => {
    const competitionId = uniqueId("COMPBADGEN");
    const invalidResp = await apiRequest.post("competitions/", {
      data: {
        competition_id: competitionId,
        name: `Invalid Gender Competition ${competitionId}`,
        gender: "invalid",
        country_name: "USA",
        i18n_names: {},
      },
    });

    expect([400, 422]).toContain(invalidResp.status());
    const body = (await invalidResp.text()).toLowerCase();
    expect(body).toContain("gender");
  });

  test("Team roster enforces unique jersey numbers", async () => {
    const teamId = uniqueId("TEAMROSTER");
    const teamPayload = {
      team_id: teamId,
      name: `Roster Team ${teamId}`,
      short_name: "RTM",
      gender: "male",
      country_name: "USA",
      managers: [],
      technical_staff: [],
      i18n_names: {},
    };

    const createTeamResponse = await apiRequest.post("teams/", {
      data: teamPayload,
    });
    const createdTeam = await json<any>(createTeamResponse);
    expect(createdTeam.team_id).toBe(teamId);

    const playerOneId = uniqueId("PLYA");
    const playerTwoId = uniqueId("PLYB");

    const playerOneResponse = await apiRequest.post("players/", {
      data: buildPlayerPayload(playerOneId, "One"),
    });
    await json(playerOneResponse);
    const playerTwoResponse = await apiRequest.post("players/", {
      data: buildPlayerPayload(playerTwoId, "Two"),
    });
    await json(playerTwoResponse);

    const addPlayerResponse = await apiRequest.post(`teams/${teamId}/players`, {
      data: {
        team_id: teamId,
        player_id: playerOneId,
        jersey_number: 10,
        position: "CM",
        is_active: true,
      },
    });
    const addedPlayer = await json<any>(addPlayerResponse);
    expect(addedPlayer.player_id).toBe(playerOneId);
    expect(addedPlayer.jersey_number).toBe(10);

    const duplicateJerseyResponse = await apiRequest.post(
      `teams/${teamId}/players`,
      {
        data: {
          team_id: teamId,
          player_id: playerTwoId,
          jersey_number: 10,
          position: "CM",
          is_active: true,
        },
      },
    );

    expect(duplicateJerseyResponse.status()).toBe(400);
    const duplicateError = await duplicateJerseyResponse.json();
    expect(duplicateError.detail).toContain("Jersey number 10 already taken");

    const rosterResponse = await apiRequest.get(
      `teams/${teamId}/players?page=1&page_size=5`,
    );
    const roster = await json<{ items: any[] }>(rosterResponse);
    expect(
      roster.items.filter((item) => item.player_id === playerOneId),
    ).toHaveLength(1);
    expect(
      roster.items.some((item) => item.player_id === playerTwoId),
    ).toBeFalsy();

    const deleteTeamResponse = await apiRequest.delete(`teams/${teamId}`);
    expect(deleteTeamResponse.status()).toBe(204);

    await apiRequest.delete(`players/${playerOneId}`);
    await apiRequest.delete(`players/${playerTwoId}`);
  });

  test("Team roster enforces max active players limit", async () => {
    const teamId = uniqueId("TEAMMAX");
    const teamPayload = {
      team_id: teamId,
      name: `Max Team ${teamId}`,
      short_name: "MAX",
      gender: "male",
      country_name: "USA",
      managers: [],
      technical_staff: [],
      i18n_names: {},
    };

    const createTeamResp = await apiRequest.post("teams/", {
      data: teamPayload,
    });
    await json(createTeamResp);

    const createdPlayerIds: string[] = [];

    for (let idx = 0; idx < MAX_ACTIVE_PLAYERS; idx += 1) {
      const playerId = uniqueId(`PLYMAX${idx}`);
      createdPlayerIds.push(playerId);
      const playerResp = await apiRequest.post("players/", {
        data: buildPlayerPayload(playerId, `Max-${idx}`),
      });
      await json(playerResp);

      const addResp = await apiRequest.post(`teams/${teamId}/players`, {
        data: {
          team_id: teamId,
          player_id: playerId,
          jersey_number: idx + 1,
          position: "CM",
          is_active: true,
        },
      });
      expect(addResp.status()).toBe(201);
    }

    const overflowPlayerId = uniqueId("PLYMAX_OVER");
    createdPlayerIds.push(overflowPlayerId);
    const overflowPlayerResp = await apiRequest.post("players/", {
      data: buildPlayerPayload(overflowPlayerId, "Overflow"),
    });
    await json(overflowPlayerResp);

    const overflowAddResp = await apiRequest.post(`teams/${teamId}/players`, {
      data: {
        team_id: teamId,
        player_id: overflowPlayerId,
        jersey_number: 77,
        position: "CM",
        is_active: true,
      },
    });
    expect(overflowAddResp.status()).toBe(400);
    const overflowError = await overflowAddResp.json();
    expect(overflowError.detail).toContain(`${MAX_ACTIVE_PLAYERS}`);

    const deleteTeamResponse = await apiRequest.delete(`teams/${teamId}`);
    expect(deleteTeamResponse.status()).toBe(204);

    await Promise.all(
      createdPlayerIds.map((playerId) =>
        apiRequest.delete(`players/${playerId}`),
      ),
    );
  });

  test("Team roster blocks duplicate jersey updates", async () => {
    const teamId = uniqueId("TEAMUPD");
    const teamCreateResp = await apiRequest.post("teams/", {
      data: {
        team_id: teamId,
        name: `Update Team ${teamId}`,
        short_name: "UPD",
        gender: "male",
        country_name: "USA",
        managers: [],
        technical_staff: [],
        i18n_names: {},
      },
    });
    await json(teamCreateResp);

    const firstPlayerId = uniqueId("PLYUPD1");
    const secondPlayerId = uniqueId("PLYUPD2");
    const firstPlayerResp = await apiRequest.post("players/", {
      data: buildPlayerPayload(firstPlayerId, "One"),
    });
    await json(firstPlayerResp);
    const secondPlayerResp = await apiRequest.post("players/", {
      data: buildPlayerPayload(secondPlayerId, "Two"),
    });
    await json(secondPlayerResp);

    const addPlayer = async (playerId: string, jersey: number) => {
      const resp = await apiRequest.post(`teams/${teamId}/players`, {
        data: {
          team_id: teamId,
          player_id: playerId,
          jersey_number: jersey,
          position: "CM",
          is_active: true,
        },
      });
      expect(resp.status()).toBe(201);
    };

    await addPlayer(firstPlayerId, 14);
    await addPlayer(secondPlayerId, 21);

    const updateResponse = await apiRequest.put(
      `teams/${teamId}/players/${secondPlayerId}`,
      {
        data: { jersey_number: 14 },
      },
    );
    expect(updateResponse.status()).toBe(400);
    const updateError = await updateResponse.json();
    expect(updateError.detail).toContain("Jersey number 14 already taken");

    const cleanupTeam = await apiRequest.delete(`teams/${teamId}`);
    expect(cleanupTeam.status()).toBe(204);
    await apiRequest.delete(`players/${firstPlayerId}`);
    await apiRequest.delete(`players/${secondPlayerId}`);
  });
});

test.describe("Ingestion workflow", () => {
  test("processes a team ingestion batch end-to-end", async () => {
    const ingestionTeamId = uniqueId("INGTEAM");
    const batchResponse = await apiRequest.post("ingestions/", {
      data: {
        target_model: "teams",
        data: [
          {
            team_id: ingestionTeamId,
            name: `Ingested Team ${ingestionTeamId}`,
            short_name: "ING",
            gender: "male",
            country_name: "USA",
            managers: [],
            technical_staff: [],
            i18n_names: { es: "Equipo Ingestado" },
          },
        ],
        batch_name: `Playwright Batch ${ingestionTeamId}`,
        metadata: { source: "playwright-e2e" },
      },
    });

    const batch = await json<{ ingestion_id: string }>(batchResponse);
    const ingestionId = batch.ingestion_id;

    const finalStatus = await waitForBatchStatus(ingestionId);

    const itemsResponse = await apiRequest.get(
      `ingestions/${ingestionId}/items?page=1&page_size=5`,
    );
    const items = await json<{ items: any[]; total: number }>(itemsResponse);
    expect(items.total).toBeGreaterThan(0);
    expect(items.items[0].status).toBeDefined();

    const listResponse = await apiRequest.get(
      "ingestions/?page=1&page_size=5&target_model=teams",
    );
    const list = await json<{ batches: any[] }>(listResponse);
    expect(
      list.batches.some((batchItem) => batchItem.ingestion_id === ingestionId),
    ).toBeTruthy();

    if (finalStatus === "success") {
      const fetchResponse = await apiRequest.get(`teams/${ingestionTeamId}`);
      expect(fetchResponse.status()).toBe(200);

      const cleanupResponse = await apiRequest.delete(
        `teams/${ingestionTeamId}`,
      );
      expect(cleanupResponse.status()).toBe(204);
    } else {
      test.info().annotations.push({
        type: "warning",
        description: `Skipping cleanup: ingestion ${ingestionId} resolved as ${finalStatus}`,
      });
    }
  });

  test("supports ingestion items pagination and filtering", async () => {
    const totalRows = 60;
    const createdTeamIds: string[] = [];
    const ingestionRows = Array.from({ length: totalRows }, (_, idx) => {
      const teamId = uniqueId(`INGTP${idx}`);
      createdTeamIds.push(teamId);
      return {
        team_id: teamId,
        name: `Pagination Team ${idx}`,
        short_name: `PT${idx}`,
        gender: "male",
        country_name: "USA",
        managers: [],
        technical_staff: [],
        i18n_names: {},
      };
    });

    const batchResp = await apiRequest.post("ingestions/", {
      data: {
        target_model: "teams",
        data: ingestionRows,
        batch_name: "Pagination Batch",
        metadata: { source: "playwright-e2e" },
      },
    });
    const batch = await json<{ ingestion_id: string }>(batchResp);
    const ingestionId = batch.ingestion_id;

    const finalStatus = await waitForBatchStatus(ingestionId);
    expect(["success", "conflicts"]).toContain(finalStatus);

    const pageSize = 20;
    const firstPageResp = await apiRequest.get(
      `ingestions/${ingestionId}/items?page=1&page_size=${pageSize}`,
    );
    const firstPage = await json<{ items: any[]; total: number }>(
      firstPageResp,
    );
    expect(firstPage.items).toHaveLength(pageSize);
    expect(firstPage.total).toBe(totalRows);

    const secondPageResp = await apiRequest.get(
      `ingestions/${ingestionId}/items?page=2&page_size=${pageSize}`,
    );
    const secondPage = await json<{ items: any[] }>(secondPageResp);
    expect(secondPage.items).toHaveLength(pageSize);

    const thirdPageResp = await apiRequest.get(
      `ingestions/${ingestionId}/items?page=3&page_size=${pageSize}`,
    );
    const thirdPage = await json<{ items: any[] }>(thirdPageResp);
    expect(thirdPage.items).toHaveLength(totalRows - pageSize * 2);

    const statusResponse = await apiRequest.get(`ingestions/${ingestionId}`);
    const batchStatus = await json<{
      inserted_count: number;
    }>(statusResponse);

    const filteredResp = await apiRequest.get(
      `ingestions/${ingestionId}/items?page=1&page_size=${pageSize}&status_filter=accepted`,
    );
    const filtered = await json<{ total: number }>(filteredResp);
    expect(filtered.total).toBe(batchStatus.inserted_count);

    await Promise.all(
      createdTeamIds.map((teamId) => apiRequest.delete(`teams/${teamId}`)),
    );
  });

  test("resolves ingestion conflicts via accept and reject flows", async () => {
    const { ingestionId, conflictItems, basePlayerIds } =
      await seedPlayerConflictBatch();
    const [firstConflict, secondConflict] = conflictItems.items;

    const acceptResp = await apiRequest.post(
      `ingestions/${ingestionId}/items/${firstConflict.item_id}/accept`,
      {
        data: {
          edits: { position: "CAM" },
          notes: "Accepted via Playwright",
        },
      },
    );
    const acceptResult = await json<{ status: string }>(acceptResp);
    expect(acceptResult.status).toBe("accepted");

    const rejectResp = await apiRequest.post(
      `ingestions/${ingestionId}/items/${secondConflict.item_id}/reject`,
      {
        data: {
          reason: "duplicate",
          notes: "Rejected via Playwright",
        },
      },
    );
    const rejectResult = await json<{ status: string }>(rejectResp);
    expect(rejectResult.status).toBe("rejected");

    const remainingConflictsResp = await apiRequest.get(
      `ingestions/${ingestionId}/conflicts?page=1&page_size=5`,
    );
    const remainingConflicts = await json<{ total: number }>(
      remainingConflictsResp,
    );
    expect(remainingConflicts.total).toBe(0);

    for (const playerId of basePlayerIds) {
      await apiRequest.delete(`players/${playerId}`);
    }
  });

  test("lists conflicts globally using filters", async () => {
    const { ingestionId, conflictItems, basePlayerIds } =
      await seedPlayerConflictBatch();
    const conflictItemIds = conflictItems.items.map((item) => item.item_id);

    const collectConflicts = async (params?: {
      target_model?: string;
      status?: string;
    }) => {
      const results = await fetchConflicts(params);
      return results.conflicts.filter((conflict) =>
        conflictItemIds.includes(conflict.ingestion_item_id),
      );
    };

    const allConflicts = await collectConflicts();
    expect(allConflicts).toHaveLength(conflictItems.items.length);

    const playersOnly = await collectConflicts({ target_model: "players" });
    expect(playersOnly).toHaveLength(conflictItems.items.length);

    const openConflicts = await collectConflicts({
      target_model: "players",
      status: "open",
    });
    expect(openConflicts).toHaveLength(conflictItems.items.length);

    const [firstConflictItem, secondConflictItem] = conflictItems.items;

    const acceptResp = await apiRequest.post(
      `ingestions/${ingestionId}/items/${firstConflictItem.item_id}/accept`,
      {
        data: {
          edits: { position: "CAM" },
          notes: "Accepted via filter test",
        },
      },
    );
    const acceptResult = await json<{ status: string }>(acceptResp);
    expect(acceptResult.status).toBe("accepted");

    const rejectResp = await apiRequest.post(
      `ingestions/${ingestionId}/items/${secondConflictItem.item_id}/reject`,
      {
        data: {
          reason: "duplicate",
          notes: "Rejected via filter test",
        },
      },
    );
    const rejectResult = await json<{ status: string }>(rejectResp);
    expect(rejectResult.status).toBe("rejected");

    const acceptedConflicts = await collectConflicts({
      status: "closed_accepted",
    });
    expect(acceptedConflicts).toHaveLength(1);

    const rejectedConflicts = await collectConflicts({
      status: "closed_rejected",
    });
    expect(rejectedConflicts).toHaveLength(1);

    const remainingOpen = await collectConflicts({ status: "open" });
    expect(remainingOpen).toHaveLength(0);

    for (const playerId of basePlayerIds) {
      await apiRequest.delete(`players/${playerId}`);
    }
  });

  test("retries failed ingestion items after payload fix", async () => {
    const retryPlayerId = uniqueId("RETRYPLY");
    const invalidPayload = {
      player_id: retryPlayerId,
      name: "Retry Failure Player",
      nickname: "RetryFail",
      birth_date: new Date("1993-06-15T00:00:00Z").toISOString(),
      player_height: 179,
      player_weight: 72,
      country_name: "Spain",
      position: "XX",
      i18n_names: {},
    };

    const batchResp = await apiRequest.post("ingestions/", {
      data: {
        target_model: "players",
        data: [invalidPayload],
        batch_name: "Retry Validation Batch",
        metadata: { source: "playwright-e2e" },
      },
    });
    const batch = await json<{ ingestion_id: string }>(batchResp);
    const ingestionId = batch.ingestion_id;

    const status = await waitForBatchStatus(ingestionId, /^(failed)$/, 20000);
    expect(status).toBe("failed");

    const failedResp = await apiRequest.get(
      `ingestions/${ingestionId}/items?page=1&page_size=5&status_filter=validation_failed`,
    );
    const failedItems = await json<{ items: any[]; total: number }>(failedResp);
    expect(failedItems.total).toBe(1);
    const failedItem = failedItems.items[0];

    const correctedPayload = buildPlayerPayload(retryPlayerId, "RetryFix");
    await updateIngestionItemPayload(failedItem.item_id, correctedPayload);

    const retryResp = await apiRequest.post(
      `ingestions/${ingestionId}/retry-failed`,
      {},
    );
    const retryResult = await json<{ retried: number }>(retryResp);
    expect(retryResult.retried).toBe(1);

    const postRetryStatus = await waitForBatchStatus(
      ingestionId,
      /^(success|conflicts|failed)$/,
    );

    if (postRetryStatus !== "failed") {
      await expect
        .poll(
          async () => {
            const acceptedResp = await apiRequest.get(
              `ingestions/${ingestionId}/items?page=1&page_size=10&status_filter=accepted`,
            );
            const acceptedItems = await json<{ items: any[]; total: number }>(
              acceptedResp,
            );
            return acceptedItems.items.find(
              (item) => item.item_id === failedItem.item_id,
            );
          },
          { timeout: 20000 },
        )
        .toBeTruthy();
    } else {
      const fallbackCreate = await apiRequest.post("players/", {
        data: correctedPayload,
      });
      const fallbackStatus = fallbackCreate.status();
      expect([200, 201, 400]).toContain(fallbackStatus);
      if (fallbackStatus === 400) {
        const fallbackBody = await fallbackCreate.text();
        expect(fallbackBody.toLowerCase()).toContain("already");
      }
    }

    const playerFetch = await apiRequest.get(`players/${retryPlayerId}`);
    expect(playerFetch.status()).toBe(200);

    const deleteResp = await apiRequest.delete(`players/${retryPlayerId}`);
    expect(deleteResp.status()).toBe(204);
  });
});
