import type { Team, ManagerInfo, TechnicalStaffMember } from '../types';

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
  gender: 'male' | 'female';
  country_name: string;
  logo_url?: string | null;
  founded_year?: number | null;
  i18n_names?: Record<string, string> | null;
  managers?: TeamManagerApi[] | null;
  technical_staff?: TeamStaffApi[] | null;
}

const mapManager = (manager: TeamManagerApi): ManagerInfo => ({
  name: manager.name,
  nationality: manager.country_name ?? undefined,
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
  const technicalStaff = (team.technical_staff ?? []).filter(Boolean).map(mapStaffMember);
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

export const normalizeTeams = (teams: TeamApiResponse[]): Team[] => teams.map(normalizeTeam);
