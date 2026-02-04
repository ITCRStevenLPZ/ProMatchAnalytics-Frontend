import { IneffectiveAggregates, Match, Player, Team } from "./types";
import { MatchEvent } from "../../store/useMatchLogStore";

export type IneffectiveAction =
  | "Goal"
  | "OutOfBounds"
  | "Card"
  | "Foul"
  | "Substitution"
  | "Injury"
  | "VAR"
  | "Other";

export type IneffectiveTeamKey = "home" | "away" | "neutral";

export interface IneffectiveTotals {
  home: number;
  away: number;
  neutral: number;
  byAction: Record<IneffectiveAction, Record<IneffectiveTeamKey, number>>;
}

export interface IneffectiveBreakdown {
  totals: IneffectiveTotals;
  active?: {
    teamKey: IneffectiveTeamKey;
    action: IneffectiveAction;
    startMs: number;
  } | null;
}

const INEFFECTIVE_ACTIONS: IneffectiveAction[] = [
  "Goal",
  "OutOfBounds",
  "Card",
  "Foul",
  "Substitution",
  "Injury",
  "VAR",
  "Other",
];

const normalizeIneffectiveAction = (raw?: string | null): IneffectiveAction => {
  const normalized = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "");
  if (!normalized) return "Other";
  if (normalized.includes("goal")) return "Goal";
  if (normalized.includes("outofbounds") || normalized.includes("out"))
    return "OutOfBounds";
  if (normalized.includes("card")) return "Card";
  if (normalized.includes("foul")) return "Foul";
  if (normalized.includes("sub")) return "Substitution";
  if (normalized.includes("injury")) return "Injury";
  if (normalized.includes("var")) return "VAR";
  return "Other";
};

const buildEmptyTotals = (): IneffectiveTotals => {
  const byAction = INEFFECTIVE_ACTIONS.reduce(
    (acc, action) => {
      acc[action] = { home: 0, away: 0, neutral: 0 };
      return acc;
    },
    {} as Record<IneffectiveAction, Record<IneffectiveTeamKey, number>>,
  );
  return { home: 0, away: 0, neutral: 0, byAction };
};

const resolveTeamKey = (
  event: MatchEvent,
  homeTeamId: string,
  awayTeamId: string,
): IneffectiveTeamKey => {
  const isNeutral = Boolean(event.data?.neutral);
  if (isNeutral) return "neutral";
  const triggerTeam = event.data?.trigger_team_id || event.team_id || "NEUTRAL";
  if (triggerTeam === "NEUTRAL") return "neutral";
  if (triggerTeam === homeTeamId) return "home";
  if (triggerTeam === awayTeamId) return "away";
  return "neutral";
};

export const computeIneffectiveBreakdown = (
  events: MatchEvent[],
  homeTeamId: string,
  awayTeamId: string,
  nowMs: number = Date.now(),
): IneffectiveBreakdown => {
  const totals = buildEmptyTotals();
  const stoppages = events
    .filter(
      (event) =>
        event.type === "GameStoppage" &&
        typeof event.data?.stoppage_type === "string",
    )
    .slice()
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

  let activeTeamKey: IneffectiveTeamKey | null = null;
  let activeAction: IneffectiveAction | null = null;
  let activeStartMs: number | null = null;

  const addDuration = (
    teamKey: IneffectiveTeamKey,
    action: IneffectiveAction,
    durationSeconds: number,
  ) => {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
    totals[teamKey] += durationSeconds;
    totals.byAction[action][teamKey] += durationSeconds;
  };

  stoppages.forEach((event) => {
    const stoppageType = String(event.data?.stoppage_type || "");
    const action = normalizeIneffectiveAction(
      event.data?.trigger_action || event.data?.reason,
    );
    const teamKey = resolveTeamKey(event, homeTeamId, awayTeamId);
    const timestampMs = new Date(event.timestamp).getTime();
    if (!Number.isFinite(timestampMs)) return;

    if (stoppageType === "ClockStop") {
      activeTeamKey = teamKey;
      activeAction = action;
      activeStartMs = timestampMs;
      return;
    }
    if (stoppageType === "ClockStart") {
      if (activeTeamKey && activeAction && activeStartMs !== null) {
        addDuration(
          activeTeamKey,
          activeAction,
          (timestampMs - activeStartMs) / 1000,
        );
      }
      activeTeamKey = null;
      activeAction = null;
      activeStartMs = null;
    }
  });

  if (activeTeamKey && activeAction && activeStartMs !== null) {
    addDuration(activeTeamKey, activeAction, (nowMs - activeStartMs) / 1000);
  }

  const active =
    activeTeamKey && activeAction && activeStartMs !== null
      ? {
          teamKey: activeTeamKey,
          action: activeAction,
          startMs: activeStartMs,
        }
      : null;

  return { totals, active };
};

export const buildIneffectiveBreakdownFromAggregates = (
  aggregates: IneffectiveAggregates,
  nowMs: number = Date.now(),
): IneffectiveBreakdown => {
  const totals = buildEmptyTotals();

  INEFFECTIVE_ACTIONS.forEach((action) => {
    const actionTotals = aggregates.by_action?.[action];
    if (!actionTotals) return;
    totals.byAction[action].home = actionTotals.home || 0;
    totals.byAction[action].away = actionTotals.away || 0;
    totals.byAction[action].neutral = actionTotals.neutral || 0;
  });

  totals.home = aggregates.totals?.home || 0;
  totals.away = aggregates.totals?.away || 0;
  totals.neutral = aggregates.totals?.neutral || 0;

  let active: {
    teamKey: IneffectiveTeamKey;
    action: IneffectiveAction;
    startMs: number;
  } | null = null;
  if (aggregates.active?.start_timestamp) {
    const startMs = new Date(aggregates.active.start_timestamp).getTime();
    if (Number.isFinite(startMs)) {
      active = {
        teamKey: aggregates.active.team_key,
        action: aggregates.active.action,
        startMs,
      };
      const deltaSeconds = Math.max(0, (nowMs - startMs) / 1000);
      totals[active.teamKey] += deltaSeconds;
      totals.byAction[active.action][active.teamKey] += deltaSeconds;
    }
  }

  return { totals, active };
};

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
    ineffective_aggregates: payload.ineffective_aggregates ?? null,
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
