import { useCallback, useMemo } from "react";
import type { MatchEvent } from "../../../store/useMatchLogStore";
import type { Match } from "../types";

interface GoalEventsBySide {
  home: MatchEvent[];
  away: MatchEvent[];
}

interface LiveScore {
  home: number;
  away: number;
}

export interface UseLiveScoreResult {
  goalEvents: GoalEventsBySide;
  liveScore: LiveScore;
  formatGoalLabel: (event: MatchEvent) => string;
}

export const useLiveScore = (
  match: Match | null,
  liveEvents: MatchEvent[],
): UseLiveScoreResult => {
  const goalEvents = useMemo(() => {
    if (!match) return { home: [] as MatchEvent[], away: [] as MatchEvent[] };
    const homeIds = new Set(match.home_team.players.map((player) => player.id));
    const awayIds = new Set(match.away_team.players.map((player) => player.id));
    const goals = liveEvents.filter(
      (event) => event.type === "Shot" && event.data?.outcome === "Goal",
    );
    return {
      home: goals.filter((event) => homeIds.has(event.player_id ?? "")),
      away: goals.filter((event) => awayIds.has(event.player_id ?? "")),
    };
  }, [liveEvents, match]);

  const liveScore = useMemo(() => {
    if (!match) return { home: 0, away: 0 };
    return {
      home: goalEvents.home.length,
      away: goalEvents.away.length,
    };
  }, [goalEvents, match]);

  const formatGoalLabel = useCallback(
    (event: MatchEvent) => {
      if (!match) return `${event.match_clock}`;
      const player =
        match.home_team.players.find((p) => p.id === event.player_id) ||
        match.away_team.players.find((p) => p.id === event.player_id);
      const playerLabel = player
        ? `#${player.jersey_number} ${player.full_name}`
        : event.player_id ?? "";
      return `${event.match_clock} · ${playerLabel}`;
    },
    [match],
  );

  return {
    goalEvents,
    liveScore,
    formatGoalLabel,
  };
};
