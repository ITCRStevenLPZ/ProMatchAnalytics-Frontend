import { IneffectiveAggregates, Match, Player, Team } from "./types";
import { MatchEvent } from "../../store/useMatchLogStore";
import { formatPlayerName } from "../../lib/nameFormat";

export type IneffectiveAction =
  | "Goal"
  | "OutOfBounds"
  | "Card"
  | "Foul"
  | "Offside"
  | "Substitution"
  | "Injury"
  | "VAR"
  | "Referee"
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
  timeout: {
    totalSeconds: number;
    active: { startMs: number } | null;
  };
  active?: {
    teamKey: IneffectiveTeamKey;
    action: IneffectiveAction;
    startMs: number;
  } | null;
  varActive?: {
    startMs: number;
  } | null;
}

const INEFFECTIVE_ACTIONS: IneffectiveAction[] = [
  "Goal",
  "OutOfBounds",
  "Card",
  "Foul",
  "Offside",
  "Substitution",
  "Injury",
  "VAR",
  "Referee",
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
  if (normalized.includes("offside")) return "Offside";
  if (normalized.includes("sub")) return "Substitution";
  if (normalized.includes("injury")) return "Injury";
  if (normalized.includes("var")) return "VAR";
  if (normalized.includes("referee") || normalized.includes("ref"))
    return "Other";
  return "Other";
};

/**
 * Parse an ISO timestamp as UTC even if the string lacks a timezone suffix.
 * Servers may return timezone-naive ISO strings (e.g. "2026-03-13T16:34:02.772000")
 * which browsers parse as local time; appending "Z" forces UTC interpretation.
 */
const parseTimestampAsUtcMs = (ts?: string | null): number => {
  if (!ts) return NaN;
  const s = String(ts).trim();
  // Already has timezone info ("Z" or "+HH:MM" / "-HH:MM")
  if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    return new Date(s).getTime();
  }
  // Looks like an ISO timestamp without timezone → treat as UTC
  if (s.includes("T")) {
    return new Date(s + "Z").getTime();
  }
  return new Date(s).getTime();
};

const parseClockToMs = (clock?: string | null): number | null => {
  if (!clock) return null;
  const match = String(clock)
    .trim()
    .match(/^(\d+):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const millis = Number((match[3] || "0").padEnd(3, "0"));
  if (
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(millis)
  ) {
    return null;
  }
  return (minutes * 60 + seconds) * 1000 + millis;
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
  homeTeamIds: string | string[],
  awayTeamIds: string | string[],
  action: IneffectiveAction,
): IneffectiveTeamKey => {
  if (action === "VAR") return "neutral";
  const triggerTeamRaw =
    event.data?.trigger_team_id || event.team_id || "NEUTRAL";
  const triggerTeam = String(triggerTeamRaw || "").toLowerCase();
  if (triggerTeam === "neutral") return "neutral";
  if (triggerTeam === "home") return "home";
  if (triggerTeam === "away") return "away";
  const homeSet = new Set(
    (Array.isArray(homeTeamIds) ? homeTeamIds : [homeTeamIds])
      .map((value) => String(value || "").toLowerCase())
      .filter(Boolean),
  );
  const awaySet = new Set(
    (Array.isArray(awayTeamIds) ? awayTeamIds : [awayTeamIds])
      .map((value) => String(value || "").toLowerCase())
      .filter(Boolean),
  );
  if (homeSet.has(triggerTeam)) return "home";
  if (awaySet.has(triggerTeam)) return "away";
  return "home";
};

export const computeIneffectiveBreakdown = (
  events: MatchEvent[],
  homeTeamIds: string | string[],
  awayTeamIds: string | string[],
  nowMs: number = Date.now(),
): IneffectiveBreakdown => {
  const totals = buildEmptyTotals();
  const stoppages = events
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        event.type === "GameStoppage" &&
        typeof event.data?.stoppage_type === "string",
    )
    .slice()
    .sort((left, right) => {
      const leftTs = new Date(left.event.timestamp).getTime();
      const rightTs = new Date(right.event.timestamp).getTime();
      const leftValid = Number.isFinite(leftTs);
      const rightValid = Number.isFinite(rightTs);
      if (leftValid && rightValid && leftTs !== rightTs) {
        return leftTs - rightTs;
      }
      return left.index - right.index;
    })
    .map(({ event }) => event);

  let activeTeamKey: IneffectiveTeamKey | null = null;
  let activeAction: IneffectiveAction | null = null;
  let activeStartMs: number | null = null;
  let pausedByVarTeamKey: IneffectiveTeamKey | null = null;
  let pausedByVarAction: IneffectiveAction | null = null;
  let pausedByTimeoutTeamKey: IneffectiveTeamKey | null = null;
  let pausedByTimeoutAction: IneffectiveAction | null = null;
  let varStartMs: number | null = null;
  let timeoutStartMs: number | null = null;
  let timeoutTotalSeconds = 0;

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
    const timestampMs = (() => {
      const parsedTimestamp = parseTimestampAsUtcMs(event.timestamp);
      if (Number.isFinite(parsedTimestamp)) return parsedTimestamp;
      const fromClock = parseClockToMs(event.match_clock);
      if (fromClock !== null) return fromClock;
      return NaN;
    })();
    if (!Number.isFinite(timestampMs)) return;

    if (stoppageType === "VARStart") {
      if (activeTeamKey && activeAction && activeStartMs !== null) {
        addDuration(
          activeTeamKey,
          activeAction,
          (timestampMs - activeStartMs) / 1000,
        );
        pausedByVarTeamKey = activeTeamKey;
        pausedByVarAction = activeAction;
        activeTeamKey = null;
        activeAction = null;
        activeStartMs = null;
      }
      varStartMs = timestampMs;
      return;
    }
    if (stoppageType === "VARStop") {
      if (varStartMs !== null) {
        addDuration("neutral", "VAR", (timestampMs - varStartMs) / 1000);
      }
      varStartMs = null;
      if (!activeTeamKey && pausedByVarTeamKey && pausedByVarAction) {
        activeTeamKey = pausedByVarTeamKey;
        activeAction = pausedByVarAction;
        activeStartMs = timestampMs;
      }
      pausedByVarTeamKey = null;
      pausedByVarAction = null;
      return;
    }

    if (stoppageType === "TimeoutStart") {
      if (activeTeamKey && activeAction && activeStartMs !== null) {
        addDuration(
          activeTeamKey,
          activeAction,
          (timestampMs - activeStartMs) / 1000,
        );
        pausedByTimeoutTeamKey = activeTeamKey;
        pausedByTimeoutAction = activeAction;
        activeTeamKey = null;
        activeAction = null;
        activeStartMs = null;
      }
      timeoutStartMs = timestampMs;
      return;
    }

    if (stoppageType === "TimeoutStop") {
      if (timeoutStartMs !== null) {
        const timeoutDeltaSeconds = Math.max(
          0,
          (timestampMs - timeoutStartMs) / 1000,
        );
        timeoutTotalSeconds += timeoutDeltaSeconds;
        addDuration("neutral", "Other", timeoutDeltaSeconds);
      }
      timeoutStartMs = null;
      if (!activeTeamKey && pausedByTimeoutTeamKey && pausedByTimeoutAction) {
        activeTeamKey = pausedByTimeoutTeamKey;
        activeAction = pausedByTimeoutAction;
        activeStartMs = timestampMs;
      }
      pausedByTimeoutTeamKey = null;
      pausedByTimeoutAction = null;
      return;
    }

    const action = normalizeIneffectiveAction(
      event.data?.trigger_action || event.data?.reason,
    );
    const teamKey = resolveTeamKey(event, homeTeamIds, awayTeamIds, action);

    if (stoppageType === "ClockStop") {
      activeTeamKey = teamKey;
      activeAction = action;
      activeStartMs = timestampMs;
      pausedByVarTeamKey = null;
      pausedByVarAction = null;
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
      pausedByVarTeamKey = null;
      pausedByVarAction = null;
    }
  });

  if (activeTeamKey && activeAction && activeStartMs !== null) {
    const activeDelta = (nowMs - activeStartMs) / 1000;
    addDuration(activeTeamKey, activeAction, activeDelta);
  }

  if (varStartMs !== null) {
    addDuration("neutral", "VAR", (nowMs - varStartMs) / 1000);
  }

  if (timeoutStartMs !== null) {
    const timeoutDeltaSeconds = Math.max(0, (nowMs - timeoutStartMs) / 1000);
    timeoutTotalSeconds += timeoutDeltaSeconds;
    addDuration("neutral", "Other", timeoutDeltaSeconds);
  }

  const active =
    activeTeamKey && activeAction && activeStartMs !== null
      ? {
          teamKey: activeTeamKey,
          action: activeAction,
          startMs: activeStartMs,
        }
      : null;

  const varActive =
    varStartMs !== null
      ? {
          startMs: varStartMs,
        }
      : null;

  const timeoutActive =
    timeoutStartMs !== null
      ? {
          startMs: timeoutStartMs,
        }
      : null;

  return {
    totals,
    timeout: {
      totalSeconds: timeoutTotalSeconds,
      active: timeoutActive,
    },
    active,
    varActive,
  };
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
  let varActive: { startMs: number } | null = null;
  if (aggregates.active?.start_timestamp) {
    const startMs = new Date(aggregates.active.start_timestamp).getTime();
    if (Number.isFinite(startMs)) {
      active = {
        teamKey: aggregates.active.team_key,
        action: aggregates.active.action,
        startMs,
      };
      let deltaSeconds = Math.max(0, (nowMs - startMs) / 1000);
      if (aggregates.var_active?.start_timestamp) {
        const varStartMs = new Date(
          aggregates.var_active.start_timestamp,
        ).getTime();
        if (Number.isFinite(varStartMs)) {
          const overlapSeconds = Math.max(
            0,
            (nowMs - Math.max(startMs, varStartMs)) / 1000,
          );
          deltaSeconds = Math.max(0, deltaSeconds - overlapSeconds);
        }
      }
      totals[active.teamKey] += deltaSeconds;
      if (totals.byAction[active.action]) {
        totals.byAction[active.action][active.teamKey] += deltaSeconds;
      }
    }
  }

  if (aggregates.var_active?.start_timestamp) {
    const startMs = new Date(aggregates.var_active.start_timestamp).getTime();
    if (Number.isFinite(startMs)) {
      varActive = { startMs };
      const deltaSeconds = Math.max(0, (nowMs - startMs) / 1000);
      totals.neutral += deltaSeconds;
      totals.byAction.VAR.neutral += deltaSeconds;
    }
  }

  return {
    totals,
    timeout: {
      totalSeconds: 0,
      active: null,
    },
    active,
    varActive,
  };
};

export const deriveShortName = (name?: string, fallback: string = "TEAM") =>
  name?.slice(0, 3).toUpperCase() ?? fallback;

const normalizeBirthDateValue = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "object" && "$date" in (value as Record<string, any>)) {
    const iso = (value as Record<string, any>).$date;
    return typeof iso === "string" ? iso : null;
  }
  return null;
};

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
      full_name: formatPlayerName(
        player?.full_name ?? player?.player_name ?? `Player ${index + 1}`,
      ),
      short_name: player?.short_name ?? player?.shortName,
      jersey_number: player?.jersey_number ?? index + 1,
      position: player?.position ?? "MF",
      birth_date: normalizeBirthDateValue(
        player?.birth_date ??
          player?.birthDate ??
          player?.date_of_birth ??
          player?.dateOfBirth ??
          null,
      ),
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
    ineffective_aggregates: payload.ineffective_aggregates ?? null,
    clock_mode:
      payload.clock_mode === "INEFFECTIVE" ? "INEFFECTIVE" : "EFFECTIVE",
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

/* ── Timer-formula helpers (pure, testable) ──────────────────── */

export interface TimerFormulaInput {
  /** Pure ball-in-play seconds from useMatchTimer (frozen during INEFFECTIVE mode). */
  effectiveTime: number;
  /** Global accumulated ineffective seconds. */
  ineffectiveSeconds: number;
  /** Timeout seconds. */
  timeoutSeconds: number;
  /** VAR seconds (displayed separately, excluded from global clock). */
  varTimeSeconds: number;
  /** Team-attributed ineffective totals (excluding VAR & Injury). */
  teamIneffective: { home: number; away: number };
}

export interface TimerFormulaResult {
  globalSeconds: number;
  totalEffectiveTime: number;
  totalIneffectiveSeconds: number;
  homeEffectiveSeconds: number;
  awayEffectiveSeconds: number;
  homeEffectivePercent: string;
  awayEffectivePercent: string;
  homeIneffectivePercent: string;
  awayIneffectivePercent: string;
}

/**
 * Compute per-team effective/ineffective display values.
 *
 * Rules:
 * - effectiveTime is already pure ball-in-play; it must NOT be reduced by
 *   team-attributed stoppages (those seconds were never included in it).
 * - globalSeconds = effective + ineffective + timeout (VAR excluded, shown separately).
 * - Per-team denominators = effective + that team's attributed ineffective.
 * - Effective % = effective / denom.
 * - Ineffective % = team's ineffective / denom.
 */
export const computeTimerFormulas = (
  input: TimerFormulaInput,
): TimerFormulaResult => {
  const { effectiveTime, ineffectiveSeconds, timeoutSeconds, teamIneffective } =
    input;

  const globalSeconds = effectiveTime + ineffectiveSeconds + timeoutSeconds;

  const homeEffectiveSeconds = effectiveTime;
  const awayEffectiveSeconds = effectiveTime;

  const homeDenom = effectiveTime + teamIneffective.home;
  const awayDenom = effectiveTime + teamIneffective.away;

  const homeEffectivePercent =
    homeDenom > 0
      ? `${((effectiveTime / homeDenom) * 100).toFixed(1)}%`
      : "0.0%";
  const awayEffectivePercent =
    awayDenom > 0
      ? `${((effectiveTime / awayDenom) * 100).toFixed(1)}%`
      : "0.0%";

  const homeIneffectivePercent =
    homeDenom > 0
      ? `${((teamIneffective.home / homeDenom) * 100).toFixed(1)}%`
      : "0.0%";
  const awayIneffectivePercent =
    awayDenom > 0
      ? `${((teamIneffective.away / awayDenom) * 100).toFixed(1)}%`
      : "0.0%";

  return {
    globalSeconds,
    totalEffectiveTime: effectiveTime,
    totalIneffectiveSeconds: ineffectiveSeconds,
    homeEffectiveSeconds,
    awayEffectiveSeconds,
    homeEffectivePercent,
    awayEffectivePercent,
    homeIneffectivePercent,
    awayIneffectivePercent,
  };
};
