import { useMemo } from "react";
import type { MatchEvent } from "../../../store/useMatchLogStore";
import type { Match } from "../types";
import {
  buildIneffectiveBreakdownFromAggregates,
  computeIneffectiveBreakdown,
  type IneffectiveBreakdown,
} from "../utils";

interface UseCockpitIneffectiveBreakdownParams {
  match: Match | null;
  liveEvents: MatchEvent[];
  queuedEvents: MatchEvent[];
  ineffectiveTick: number;
}

export const useCockpitIneffectiveBreakdown = ({
  match,
  liveEvents,
  queuedEvents,
  ineffectiveTick,
}: UseCockpitIneffectiveBreakdownParams): IneffectiveBreakdown | null => {
  return useMemo(() => {
    if (!match) return null;
    const homeTeamIds = [match.home_team.id, match.home_team.team_id].filter(
      Boolean,
    ) as string[];
    const awayTeamIds = [match.away_team.id, match.away_team.team_id].filter(
      Boolean,
    ) as string[];

    const combinedEvents = [...liveEvents, ...queuedEvents];

    // Always use local event computation when events are loaded.
    // This ensures optimistic events (e.g., team switches) are reflected
    // immediately rather than waiting for stale server aggregates to refresh.
    if (combinedEvents.length > 0) {
      return computeIneffectiveBreakdown(
        combinedEvents,
        homeTeamIds,
        awayTeamIds,
        Date.now(),
      );
    }

    // Fallback to server aggregates only when no local events are loaded yet
    if (match.ineffective_aggregates) {
      return buildIneffectiveBreakdownFromAggregates(
        match.ineffective_aggregates,
        Date.now(),
      );
    }

    return computeIneffectiveBreakdown(
      combinedEvents,
      homeTeamIds,
      awayTeamIds,
      Date.now(),
    );
  }, [match, liveEvents, queuedEvents, ineffectiveTick]);
};
