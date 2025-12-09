import { expect, request, type APIRequestContext, type APIResponse } from '@playwright/test';

const normalizeBaseUrl = (base: string): string => base.replace(/\/+$/, '');

export const BACKEND_BASE_URL =
  process.env.PROMATCH_E2E_BACKEND_URL ?? 'http://127.0.0.1:8000';

const API_BASE_URL = `${normalizeBaseUrl(BACKEND_BASE_URL)}/api/v1/`;

export const ADMIN_AUTH_HEADERS = {
  Authorization: 'Bearer e2e-playwright',
  'Content-Type': 'application/json',
};

export const createAdminApiContext = async (): Promise<APIRequestContext> => {
  return request.newContext({
    baseURL: API_BASE_URL,
    extraHTTPHeaders: ADMIN_AUTH_HEADERS,
  });
};

export const uniqueId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`.toUpperCase();

export async function apiJson<T>(response: APIResponse): Promise<T> {
  if (response.ok()) {
    return (await response.json()) as T;
  }
  const body = await response.text();
  throw new Error(
    `Request failed: ${response.status()} ${response.url()}\n${body || '<empty body>'}`,
  );
}

export async function waitForIngestionStatus(
  api: APIRequestContext,
  ingestionId: string,
  allowedStatuses: RegExp = /^(success|conflicts)$/,
  timeoutMs = 90000,
): Promise<string> {
  let finalStatus = '';
  await expect
    .poll(async () => {
      const statusResponse = await api.get(`ingestions/${ingestionId}`);
      const payload = await apiJson<{ status: string }>(statusResponse);
      finalStatus = payload.status;
      return finalStatus;
    }, { timeout: timeoutMs, intervals: [500, 1000, 2000] })
    .toMatch(allowedStatuses);

  return finalStatus;
}

export async function cleanupResource(
  api: APIRequestContext,
  path: string,
): Promise<void> {
  const response = await api.delete(path);
  if ([200, 204, 404].includes(response.status())) {
    return;
  }
  const body = await response.text();
  throw new Error(`Cleanup failed for ${path}: ${response.status()} ${body}`);
}

const DEFAULT_POSITIONS: Array<{ position: string }> = [
  { position: 'GK' },
  { position: 'CB' },
  { position: 'CB' },
  { position: 'RB' },
  { position: 'LB' },
  { position: 'CDM' },
  { position: 'CM' },
  { position: 'CAM' },
  { position: 'LW' },
  { position: 'RW' },
  { position: 'ST' },
];

export interface CompetitionSeedResult {
  competition_id: string;
}

export interface VenueSeedResult {
  venue_id: string;
}

export interface RefereeSeedResult {
  referee_id: string;
}

export interface PlayerSeedResult {
  player_id: string;
  name: string;
}

export interface TeamRosterEntry {
  player_id: string;
  player_name: string;
  jersey_number: number;
  position: string;
}

export interface TeamSeedResult {
  team_id: string;
  name: string;
  roster: TeamRosterEntry[];
}

export const rosterToMatchLineup = (
  roster: TeamRosterEntry[],
  starters = 11,
) =>
  roster.slice(0, starters).map((entry, index) => ({
    player_id: entry.player_id,
    player_name: entry.player_name,
    jersey_number: entry.jersey_number,
    position: entry.position,
    is_starter: index < starters,
  }));

export interface MatchSeedResult {
  match_id: string;
  document_id: string;
}

export async function seedCompetition(
  api: APIRequestContext,
  overrides: Partial<{ competition_id: string; name: string; gender: string; country_name: string }> = {},
): Promise<CompetitionSeedResult> {
  const competition_id = overrides.competition_id ?? uniqueId('COMP');
  const payload = {
    competition_id,
    name: overrides.name ?? `Competition ${competition_id}`,
    gender: overrides.gender ?? 'male',
    country_name: overrides.country_name ?? 'USA',
    i18n_names: {},
  };
  const response = await api.post('competitions/', { data: payload });
  await apiJson(response);
  return { competition_id };
}

export async function seedVenue(
  api: APIRequestContext,
  overrides: Partial<{ venue_id: string; name: string; city: string; country_name: string; capacity: number; surface: string }> = {},
): Promise<VenueSeedResult> {
  const venue_id = overrides.venue_id ?? uniqueId('VEN');
  const payload = {
    venue_id,
    name: overrides.name ?? `Venue ${venue_id}`,
    city: overrides.city ?? 'Austin',
    country_name: overrides.country_name ?? 'USA',
    capacity: overrides.capacity ?? 25000,
    surface: overrides.surface ?? 'Grass',
  };
  const response = await api.post('venues/', { data: payload });
  await apiJson(response);
  return { venue_id };
}

export async function seedReferee(
  api: APIRequestContext,
  overrides: Partial<{ referee_id: string; name: string; country_name: string; years_of_experience: number }> = {},
): Promise<RefereeSeedResult> {
  const referee_id = overrides.referee_id ?? uniqueId('REF');
  const payload = {
    referee_id,
    name: overrides.name ?? `Referee ${referee_id}`,
    country_name: overrides.country_name ?? 'USA',
    years_of_experience: overrides.years_of_experience ?? 5,
  };
  const response = await api.post('referees/', { data: payload });
  await apiJson(response);
  return { referee_id };
}

export async function seedPlayer(
  api: APIRequestContext,
  overrides: Partial<{
    player_id: string;
    name: string;
    nickname: string;
    position: string;
    country_name: string;
  }> = {},
): Promise<PlayerSeedResult> {
  const player_id = overrides.player_id ?? uniqueId('PLY');
  const payload = {
    player_id,
    name: overrides.name ?? `Player ${player_id}`,
    nickname: overrides.nickname ?? player_id.slice(0, 8),
    birth_date: new Date('1995-01-01T00:00:00Z').toISOString(),
    player_height: 182,
    player_weight: 78,
    country_name: overrides.country_name ?? 'USA',
    position: overrides.position ?? 'CM',
    i18n_names: {},
  };
  const response = await api.post('players/', { data: payload });
  await apiJson(response);
  return { player_id, name: payload.name };
}

export async function addPlayerToTeam(
  api: APIRequestContext,
  team_id: string,
  entry: { player_id: string; jersey_number: number; position: string; is_active?: boolean },
): Promise<void> {
  const response = await api.post(`teams/${team_id}/players`, {
    data: {
      team_id,
      player_id: entry.player_id,
      jersey_number: entry.jersey_number,
      position: entry.position,
      is_active: entry.is_active ?? true,
    },
  });
  await apiJson(response);
}

export interface SeedTeamOptions {
  team_id?: string;
  name?: string;
  short_name?: string;
  gender?: string;
  country_name?: string;
  rosterTemplate?: Array<{ position: string }>;
}

export async function seedTeam(
  api: APIRequestContext,
  overrides: SeedTeamOptions = {},
): Promise<TeamSeedResult> {
  const team_id = overrides.team_id ?? uniqueId('TEAM');
  const payload = {
    team_id,
    name: overrides.name ?? `Team ${team_id}`,
    short_name: overrides.short_name ?? team_id.slice(0, 3).toUpperCase(),
    gender: overrides.gender ?? 'male',
    country_name: overrides.country_name ?? 'USA',
    managers: [],
    technical_staff: [],
    i18n_names: {},
  };
  const response = await api.post('teams/', { data: payload });
  await apiJson(response);

  const rosterTemplate = overrides.rosterTemplate ?? DEFAULT_POSITIONS;
  const roster: TeamRosterEntry[] = [];

  for (let idx = 0; idx < rosterTemplate.length; idx += 1) {
    const jersey_number = idx + 1;
    const position = rosterTemplate[idx].position;
    const player = await seedPlayer(api, { position });
    await addPlayerToTeam(api, team_id, {
      player_id: player.player_id,
      jersey_number,
      position,
      is_active: true,
    });
    roster.push({
      player_id: player.player_id,
      player_name: player.name,
      jersey_number,
      position,
    });
  }

  return { team_id, name: payload.name, roster };
}

export interface MatchLineupSeed {
  player_id: string;
  player_name: string;
  jersey_number: number;
  position: string;
  is_starter?: boolean;
  is_captain?: boolean;
}

export interface SeedMatchOptions {
  match_id?: string;
  competition_id: string;
  season_name?: string;
  competition_stage?: string;
  match_date?: string;
  kick_off?: string;
  venue_id: string;
  referee_id: string;
  home_team: {
    team_id: string;
    name?: string;
    manager?: string;
    lineup: MatchLineupSeed[];
  };
  away_team: {
    team_id: string;
    name?: string;
    manager?: string;
    lineup: MatchLineupSeed[];
  };
}

export async function seedMatch(
  api: APIRequestContext,
  options: SeedMatchOptions,
): Promise<MatchSeedResult> {
  const match_id = options.match_id ?? uniqueId('MATCH');
  const now = new Date();
  const payload = {
    match_id,
    competition_id: options.competition_id,
    season_name: options.season_name ?? `${now.getUTCFullYear()}/${now.getUTCFullYear() + 1}`,
    competition_stage: options.competition_stage ?? 'Friendly',
    match_date: options.match_date ?? now.toISOString(),
    kick_off: options.kick_off ?? new Date(now.getTime() + 5 * 60_000).toISOString(),
    venue: {
      venue_id: options.venue_id,
      name: 'Playwright Arena',
    },
    referee: {
      referee_id: options.referee_id,
      name: 'E2E Referee',
    },
    home_team: {
      team_id: options.home_team.team_id,
      name: options.home_team.name ?? options.home_team.team_id,
      manager: options.home_team.manager ?? 'Home Manager',
      lineup: options.home_team.lineup.map((entry, index) => ({
        ...entry,
        is_starter: entry.is_starter ?? true,
        is_captain: entry.is_captain ?? index === 0,
      })),
    },
    away_team: {
      team_id: options.away_team.team_id,
      name: options.away_team.name ?? options.away_team.team_id,
      manager: options.away_team.manager ?? 'Away Manager',
      lineup: options.away_team.lineup.map((entry, index) => ({
        ...entry,
        is_starter: entry.is_starter ?? true,
        is_captain: entry.is_captain ?? index === 0,
      })),
    },
  };

  const response = await api.post('matches/', { data: payload });
  const created = await apiJson<{ _id: string } & typeof payload>(response);
  return { match_id, document_id: created._id };
}

export async function seedLoggerMatch(
  api: APIRequestContext,
  options: SeedMatchOptions,
): Promise<MatchSeedResult> {
  const match_id = options.match_id ?? uniqueId('MATCH');
  const now = new Date();
  const payload = {
    match_id,
    competition_id: options.competition_id,
    season_name: options.season_name ?? `${now.getUTCFullYear()}/${now.getUTCFullYear() + 1}`,
    competition_stage: options.competition_stage ?? 'Friendly',
    match_date: options.match_date ?? now.toISOString(),
    kick_off: options.kick_off ?? new Date(now.getTime() + 5 * 60_000).toISOString(),
    venue: {
      venue_id: options.venue_id,
      name: 'Playwright Arena',
    },
    referee: {
      referee_id: options.referee_id,
      name: 'E2E Referee',
    },
    home_team: {
      team_id: options.home_team.team_id,
      name: options.home_team.name ?? options.home_team.team_id,
      manager: options.home_team.manager ?? 'Home Manager',
      lineup: options.home_team.lineup.map((entry, index) => ({
        ...entry,
        is_starter: entry.is_starter ?? true,
        is_captain: entry.is_captain ?? index === 0,
      })),
    },
    away_team: {
      team_id: options.away_team.team_id,
      name: options.away_team.name ?? options.away_team.team_id,
      manager: options.away_team.manager ?? 'Away Manager',
      lineup: options.away_team.lineup.map((entry, index) => ({
        ...entry,
        is_starter: entry.is_starter ?? true,
        is_captain: entry.is_captain ?? index === 0,
      })),
    },
  };

  const response = await api.post('logger/matches', { data: payload });
  const created = await apiJson<{ _id: string } & typeof payload>(response);
  return { match_id, document_id: created._id };
}
