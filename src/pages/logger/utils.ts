import { Match, Player, Team } from './types';

export const deriveShortName = (name?: string, fallback: string = 'TEAM') =>
  (name?.slice(0, 3).toUpperCase() ?? fallback);

const coercePlayers = (team: any, teamId: string): Player[] => {
  const source = Array.isArray(team?.players)
    ? team.players
    : Array.isArray(team?.lineup)
      ? team.lineup
      : [];

  return source.map((player: any, index: number) => ({
    id: player?.id ?? player?.player_id ?? `${teamId}-${index + 1}`,
    full_name: player?.full_name ?? player?.player_name ?? `Player ${index + 1}`,
    jersey_number: player?.jersey_number ?? index + 1,
    position: player?.position ?? 'MF',
  }));
};

export const normalizeTeamFromApi = (team: any, fallbackLabel: string): Team => {
  const teamId = team?.id ?? team?.team_id ?? fallbackLabel;
  const name = team?.name ?? fallbackLabel;
  const shortName = team?.short_name ?? deriveShortName(name, fallbackLabel);

  return {
    id: teamId,
    name,
    short_name: shortName,
    players: coercePlayers(team, teamId),
  };
};

export const normalizeMatchPayload = (payload: any): Match => {
  if (!payload) {
    throw new Error('Missing match payload');
  }

  const id = payload.id ?? payload.match_id ?? payload._id;
  if (!id) {
    throw new Error('Match payload missing ID');
  }

  return {
    id,
    match_time_seconds: payload.match_time_seconds ?? 0,
    status: payload.status ?? 'Live',
    current_period_start_timestamp: payload.current_period_start_timestamp,
    clock_seconds_at_period_start: payload.clock_seconds_at_period_start,
    period_timestamps: payload.period_timestamps ?? {},
    ineffective_time_seconds: payload.ineffective_time_seconds ?? 0,
    time_off_seconds: payload.time_off_seconds ?? 0,
    clock_mode: payload.clock_mode ?? 'EFFECTIVE',
    last_mode_change_timestamp: payload.last_mode_change_timestamp,
    home_team: normalizeTeamFromApi(payload.home_team, 'HOME'),
    away_team: normalizeTeamFromApi(payload.away_team, 'AWAY'),
  };
};

export const formatMatchClock = (seconds?: number): string => {
  const safeSeconds = Math.max(0, seconds ?? 0);
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${secs}.000`;
};
