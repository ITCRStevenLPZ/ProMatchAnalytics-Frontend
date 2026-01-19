import { Match, Player, Team } from "./types";

export const deriveShortName = (name?: string, fallback: string = "TEAM") =>
  name?.slice(0, 3).toUpperCase() ?? fallback;

const coercePlayers = (team: any, teamId: string): Player[] => {
  const source = Array.isArray(team?.players)
    ? team.players
    : Array.isArray(team?.lineup)
      ? team.lineup
      : [];

  const rosterSize = source.length;

  return source.map((player: any, index: number) => {
    const defaultStarter = rosterSize >= 11 ? index < 11 : true;
    const isStarter =
      player?.is_starter ??
      player?.isStarter ??
      player?.starter ??
      player?.is_on_field ??
      defaultStarter;

    return {
      id: player?.id ?? player?.player_id ?? `${teamId}-${index + 1}`,
      full_name:
        player?.full_name ?? player?.player_name ?? `Player ${index + 1}`,
      short_name: player?.short_name ?? player?.shortName,
      jersey_number: player?.jersey_number ?? index + 1,
      position: player?.position ?? "MF",
      is_starter: Boolean(isStarter),
    };
  });
};

export const normalizeTeamFromApi = (
  team: any,
  fallbackLabel: string,
): Team => {
  const teamId = team?.team_id ?? team?.id ?? fallbackLabel;
  const name = team?.name ?? fallbackLabel;
  const shortName = team?.short_name ?? deriveShortName(name, fallbackLabel);

  return {
    id: teamId,
    team_id: team?.team_id ?? teamId,
    name,
    short_name: shortName,
    players: coercePlayers(team, teamId),
  };
};

export const normalizeMatchPayload = (payload: any): Match => {
  if (!payload) {
    throw new Error("Missing match payload");
  }

  const id = payload.id ?? payload.match_id ?? payload._id;
  if (!id) {
    throw new Error("Match payload missing ID");
  }

  return {
    id,
    match_time_seconds: payload.match_time_seconds ?? 0,
    status: payload.status ?? "Live",
    current_period_start_timestamp: payload.current_period_start_timestamp,
    clock_seconds_at_period_start: payload.clock_seconds_at_period_start,
    period_timestamps: payload.period_timestamps ?? {},
    ineffective_time_seconds: payload.ineffective_time_seconds ?? 0,
    time_off_seconds: payload.time_off_seconds ?? 0,
    clock_mode: payload.clock_mode ?? "EFFECTIVE",
    last_mode_change_timestamp: payload.last_mode_change_timestamp,
    home_team: normalizeTeamFromApi(payload.home_team, "HOME"),
    away_team: normalizeTeamFromApi(payload.away_team, "AWAY"),
  };
};

export const formatMatchClock = (seconds?: number): string => {
  const safeSeconds = Math.max(0, seconds ?? 0);
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${secs}.000`;
};

export const normalizeMatchClock = (input: string): string | null => {
  if (!input) return null;
  // Already valid?
  if (/^\d{1,3}:\d{2}(\.\d{1,3})?$/.test(input)) return input;

  // Try to parse basic formats
  // MM:SS
  const parts = input.split(":");
  if (parts.length === 2) {
    const mm = parseInt(parts[0], 10);
    const ss = parseFloat(parts[1]);
    if (!isNaN(mm) && !isNaN(ss)) {
      return formatMatchClock(mm * 60 + ss);
    }
  }

  // Pure numbers: treat as minutes if <= 150, else maybe milliseconds or MMSS?
  // Let's keep it simple: if it looks invalid, return null to signal fallback.
  return null;
};
