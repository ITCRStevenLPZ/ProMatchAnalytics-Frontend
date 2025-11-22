import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { BACKEND_BASE_URL } from './utils/logger';
import { uniqueId } from './utils/admin';

const normalizeBaseUrl = (base: string): string => base.replace(/\/+$/, '');
const API_BASE_URL = `${normalizeBaseUrl(BACKEND_BASE_URL)}/api/v1/`;

const AUTH_HEADERS = {
  Authorization: 'Bearer e2e-playwright',
  'Content-Type': 'application/json',
};

const buildPlayerPayload = (overrides: Partial<Record<string, any>> = {}) => ({
  player_id: overrides.player_id ?? uniqueId('PLY'),
  name: overrides.name ?? `E2E Player ${Math.random().toString(16).slice(2, 6)}`,
  nickname: overrides.nickname ?? 'FilterTest',
  birth_date: overrides.birth_date ?? new Date('1995-02-15T00:00:00Z').toISOString(),
  player_height: overrides.player_height ?? 182,
  player_weight: overrides.player_weight ?? 78,
  country_name: overrides.country_name ?? 'USA',
  position: overrides.position ?? 'CM',
  i18n_names: overrides.i18n_names ?? {},
});

let apiRequest: APIRequestContext;

test.beforeAll(async () => {
  console.log('[admin-directory-filters] API_BASE_URL =', API_BASE_URL);
  apiRequest = await request.newContext({
    baseURL: API_BASE_URL,
    extraHTTPHeaders: AUTH_HEADERS,
  });
});

test.afterAll(async () => {
  await apiRequest?.dispose();
});

async function json<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  if (response.ok()) {
    return response.json() as Promise<T>;
  }

  const body = await response.text();
  throw new Error(`Request failed: ${response.status()} ${response.url()}\n${body || '<empty body>'}`);
}

async function cleanupFilterTestPlayers(): Promise<void> {
  if (!apiRequest) {
    return;
  }

  const searchParams = new URLSearchParams({
    page: '1',
    page_size: '50',
    search: 'Filter Target',
  });

  try {
    const response = await apiRequest.get(`players/?${searchParams.toString()}`);
    if (!response.ok()) {
      console.warn('[admin-directory-filters] Failed to fetch stale players:', await response.text());
      return;
    }

    const data = await json<{ items: any[] }>(response);
    const targets = data.items.filter((item) => item.nickname === 'FilterTest');
    if (!targets.length) {
      return;
    }

    await Promise.all(
      targets.map(async (player) => {
        const deleteResp = await apiRequest.delete(`players/${player.player_id}`);
        if (!deleteResp.ok()) {
          console.warn(
            '[admin-directory-filters] Failed to delete stale player',
            player.player_id,
            await deleteResp.text(),
          );
        }
      }),
    );
  } catch (error) {
    console.warn('[admin-directory-filters] Cleanup exception', error);
  }
}

test.describe('Admin directory filters & suggestions', () => {
  test.describe.configure({ mode: 'serial' });
  test('filters players by position, country, and age; returns search suggestions', async () => {
    await cleanupFilterTestPlayers();
    const cleanupIds: string[] = [];

    const playerPayloads = [
      buildPlayerPayload({
        player_id: uniqueId('PLYUSA'),
        name: 'Filter Target USA CM',
        country_name: 'USA',
        position: 'CM',
        birth_date: new Date('1994-01-15T00:00:00Z').toISOString(),
      }),
      buildPlayerPayload({
        player_id: uniqueId('PLYESP'),
        name: 'Filter Target Spain ST',
        country_name: 'Spain',
        position: 'ST',
        birth_date: new Date('1988-07-22T00:00:00Z').toISOString(),
      }),
      buildPlayerPayload({
        player_id: uniqueId('PLYCAN'),
        name: 'Filter Target Canada CM',
        country_name: 'Canada',
        position: 'CM',
        birth_date: new Date('2003-11-05T00:00:00Z').toISOString(),
      }),
    ];

    for (const player of playerPayloads) {
      const response = await apiRequest.post('players/', { data: player });
      if (response.status() !== 201) {
        const body = await response.text();
        throw new Error(`Failed to create player ${player.player_id}: ${response.status()} ${body}`);
      }
      cleanupIds.push(player.player_id);
    }

    const cmResponse = await apiRequest.get('players/?page=1&page_size=10&position=CM');
    const cmList = await json<{ items: any[]; total: number }>(cmResponse);
    const cmIds = cmList.items.map((item) => item.player_id);
    expect(cmIds).toEqual(expect.arrayContaining([playerPayloads[0].player_id, playerPayloads[2].player_id]));

    const usaCmQuery = new URLSearchParams({
      page: '1',
      page_size: '10',
      position: 'CM',
      country: 'USA',
      search: 'Filter Target',
    });
    const usaCmResponse = await apiRequest.get(`players/?${usaCmQuery.toString()}`);
    const usaCmList = await json<{ items: any[]; total: number }>(usaCmResponse);
    expect(usaCmList.items).toHaveLength(1);
    expect(usaCmList.items[0].player_id).toBe(playerPayloads[0].player_id);

    const ageFilteredQuery = new URLSearchParams({
      page: '1',
      page_size: '10',
      min_age: '30',
      max_age: '40',
      search: 'Filter Target',
    });
    const ageFilteredResponse = await apiRequest.get(`players/?${ageFilteredQuery.toString()}`);
    const ageFiltered = await json<{ items: any[] }>(ageFilteredResponse);
    const ageFilteredIds = ageFiltered.items.map((item) => item.player_id);
    expect(ageFilteredIds).toEqual(expect.arrayContaining([playerPayloads[0].player_id]));
    expect(ageFilteredIds).not.toContain(playerPayloads[2].player_id);

    const suggestionResponse = await apiRequest.get('players/search/suggestions?q=Filter Target USA');
    const suggestions = await json<any[]>(suggestionResponse);
    expect(suggestions.some((player) => player.player_id === playerPayloads[0].player_id)).toBeTruthy();

    await Promise.all(cleanupIds.map((playerId) => apiRequest.delete(`players/${playerId}`)));
  });

  test('team search suggestions and roster filters honor is_active/position flags', async () => {
    const teamId = uniqueId('TEAMDIR');
    const teamCreate = await apiRequest.post('teams/', {
      data: {
        team_id: teamId,
        name: `Directory Team ${teamId}`,
        short_name: 'DIR',
        gender: 'male',
        country_name: 'USA',
        managers: [],
        technical_staff: [],
        i18n_names: {},
      },
    });
    expect(teamCreate.status()).toBe(201);

    const keeper = buildPlayerPayload({ player_id: uniqueId('GK'), position: 'GK', name: 'Directory Keeper' });
    const defender = buildPlayerPayload({ player_id: uniqueId('CB'), position: 'CB', name: 'Directory Defender' });

    for (const player of [keeper, defender]) {
      const response = await apiRequest.post('players/', { data: player });
      if (response.status() !== 201) {
        const body = await response.text();
        throw new Error(`Failed to create roster player ${player.player_id}: ${response.status()} ${body}`);
      }
    }

    const addKeeper = await apiRequest.post(`teams/${teamId}/players`, {
      data: {
        team_id: teamId,
        player_id: keeper.player_id,
        jersey_number: 1,
        position: 'GK',
        is_active: true,
      },
    });
    if (addKeeper.status() !== 201) {
      const body = await addKeeper.text();
      throw new Error(`Failed to add keeper to roster: ${addKeeper.status()} ${body}`);
    }

    const addDefender = await apiRequest.post(`teams/${teamId}/players`, {
      data: {
        team_id: teamId,
        player_id: defender.player_id,
        jersey_number: 5,
        position: 'CB',
        is_active: true,
      },
    });
    if (addDefender.status() !== 201) {
      const body = await addDefender.text();
      throw new Error(`Failed to add defender to roster: ${addDefender.status()} ${body}`);
    }

    const deactivateDefender = await apiRequest.put(`teams/${teamId}/players/${defender.player_id}`, {
      data: { is_active: false },
    });
    expect(deactivateDefender.status()).toBe(200);

    const activeRosterResponse = await apiRequest.get(`teams/${teamId}/players?page=1&page_size=10&is_active=true`);
    const activeRoster = await json<{ items: any[] }>(activeRosterResponse);
    expect(activeRoster.items.some((item) => item.player_id === keeper.player_id)).toBeTruthy();
    expect(activeRoster.items.some((item) => item.player_id === defender.player_id)).toBeFalsy();

    const goalieRosterResponse = await apiRequest.get(`teams/${teamId}/players?page=1&page_size=10&position=GK`);
    const goalieRoster = await json<{ items: any[] }>(goalieRosterResponse);
    expect(goalieRoster.items).toHaveLength(1);
    expect(goalieRoster.items[0].player_id).toBe(keeper.player_id);

    const suggestionQuery = encodeURIComponent(`Directory Team ${teamId}`);
    const suggestionResponse = await apiRequest.get(`teams/search/suggestions?q=${suggestionQuery}`);
    const teamSuggestions = await json<any[]>(suggestionResponse);
    expect(teamSuggestions.some((team) => team.team_id === teamId)).toBeTruthy();

    await apiRequest.delete(`teams/${teamId}`);
    await Promise.all([
      apiRequest.delete(`players/${keeper.player_id}`),
      apiRequest.delete(`players/${defender.player_id}`),
    ]);
  });
});
