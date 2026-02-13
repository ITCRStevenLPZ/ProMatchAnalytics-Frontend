import type { Team, ManagerInfo, TechnicalStaffMember } from "../types";

export interface TeamManagerApi {
  name: string;
  country_name?: string | null;
  start_date?: string | null;
}

export interface TeamStaffApi {
  name: string;
  role?: string | null;
  country_name?: string | null;
  start_date?: string | null;
}

export interface TeamApiResponse {
  _id?: string;
  team_id: string;
  name: string;
  short_name?: string | null;
  gender: "male" | "female";
  country_name: string;
  logo_url?: string | null;
  founded_year?: number | null;
  i18n_names?: Record<string, string> | null;
  managers?: TeamManagerApi[] | null;
  technical_staff?: TeamStaffApi[] | null;
}

const mapManager = (manager: TeamManagerApi): ManagerInfo => ({
  name: manager.name,
  country_name: manager.country_name ?? undefined,
  start_date: manager.start_date ?? null,
});

const mapStaffMember = (staff: TeamStaffApi): TechnicalStaffMember => ({
  name: staff.name,
  role: staff.role ?? undefined,
  country_name: staff.country_name ?? undefined,
  start_date: staff.start_date ?? null,
});

export const normalizeTeam = (team: TeamApiResponse): Team => {
  const managers = (team.managers ?? []).filter(Boolean).map(mapManager);
  const technicalStaff = (team.technical_staff ?? [])
    .filter(Boolean)
    .map(mapStaffMember);
  const primaryManager = managers[0];

  return {
    _id: team._id,
    team_id: team.team_id,
    name: team.name,
    short_name: team.short_name ?? undefined,
    gender: team.gender,
    country_name: team.country_name,
    manager: primaryManager,
    managers,
    technical_staff: technicalStaff,
    logo_url: team.logo_url ?? undefined,
    founded_year: team.founded_year ?? undefined,
    players: [],
    i18n_names: team.i18n_names ?? undefined,
  };
};

export const normalizeTeams = (teams: TeamApiResponse[]): Team[] =>
  teams.map(normalizeTeam);

const trimOrUndefined = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const toNumberOrUndefined = (value?: number | null) => {
  if (value === null || value === undefined) return undefined;
  return Number.isFinite(value) ? value : undefined;
};

const sanitizeDate = (value?: string | null) => {
  if (!value) return undefined;
  return value;
};

const sanitizeManagerInput = (manager?: ManagerInfo | null) => {
  if (!manager) return undefined;
  const name = trimOrUndefined(manager.name);
  if (!name) return undefined;
  return {
    name,
    country_name: trimOrUndefined(manager.country_name),
    start_date: sanitizeDate(manager.start_date) ?? undefined,
  };
};

const sanitizeManagers = (
  primaryManager?: ManagerInfo | null,
  extraManagers?: ManagerInfo[] | null,
) => {
  const sanitized: Array<
    { name: string; country_name?: string; start_date?: string } | undefined
  > = [];
  const primary = sanitizeManagerInput(primaryManager ?? null);
  if (primary) {
    sanitized.push(primary);
  }
  (extraManagers ?? []).forEach((manager) => {
    const cleaned = sanitizeManagerInput(manager);
    if (!cleaned) return;
    if (primary && cleaned.name === primary.name) return;
    sanitized.push(cleaned);
  });
  return sanitized.length > 0 ? sanitized : undefined;
};

const sanitizeStaffMemberInput = (staff?: TechnicalStaffMember | null) => {
  if (!staff) return undefined;
  const name = trimOrUndefined(staff.name);
  if (!name) return undefined;
  return {
    name,
    role: trimOrUndefined(staff.role) ?? "Other",
    country_name: trimOrUndefined(staff.country_name),
    start_date: sanitizeDate(staff.start_date) ?? undefined,
  };
};

const sanitizeTechnicalStaff = (staff?: TechnicalStaffMember[] | null) => {
  const sanitized = (staff ?? [])
    .map(sanitizeStaffMemberInput)
    .filter(Boolean) as Array<{
    name: string;
    role: string;
    country_name?: string;
    start_date?: string;
  }>;
  return sanitized.length > 0 ? sanitized : undefined;
};

export const buildTeamPayload = (data: Partial<Team>) => {
  const payload = {
    team_id: trimOrUndefined(data.team_id),
    name: trimOrUndefined(data.name),
    short_name: trimOrUndefined(data.short_name),
    gender: data.gender,
    country_name: trimOrUndefined(data.country_name),
    logo_url: trimOrUndefined(data.logo_url),
    founded_year: toNumberOrUndefined(data.founded_year ?? null),
    managers: sanitizeManagers(data.manager ?? null, data.managers ?? []),
    technical_staff: sanitizeTechnicalStaff(data.technical_staff ?? []),
    i18n_names:
      data.i18n_names && Object.keys(data.i18n_names).length > 0
        ? data.i18n_names
        : undefined,
  } as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
};
