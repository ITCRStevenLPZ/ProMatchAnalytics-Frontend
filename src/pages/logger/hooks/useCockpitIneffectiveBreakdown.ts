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
  const hasVarStoppage = useMemo(() => {
    const combinedEvents = [...liveEvents, ...queuedEvents];
    return combinedEvents.some(
      (event) =>
        event.type === "GameStoppage" &&
        (event.data?.stoppage_type === "VARStart" ||
          event.data?.stoppage_type === "VARStop"),
    );
  }, [liveEvents, queuedEvents]);

  const hasTimeoutStoppage = useMemo(() => {
    const combinedEvents = [...liveEvents, ...queuedEvents];
    return combinedEvents.some(
      (event) =>
        event.type === "GameStoppage" &&
        (event.data?.stoppage_type === "TimeoutStart" ||
          event.data?.stoppage_type === "TimeoutStop"),
    );
  }, [liveEvents, queuedEvents]);

  return useMemo(() => {
    if (!match) return null;
    const homeTeamIds = [match.home_team.id, match.home_team.team_id].filter(
      Boolean,
    ) as string[];
    const awayTeamIds = [match.away_team.id, match.away_team.team_id].filter(
      Boolean,
    ) as string[];

    if (hasVarStoppage || hasTimeoutStoppage) {
      return computeIneffectiveBreakdown(
        [...liveEvents, ...queuedEvents],
        homeTeamIds,
        awayTeamIds,
        Date.now(),
      );
    }

    if (match.ineffective_aggregates) {
      return buildIneffectiveBreakdownFromAggregates(
        match.ineffective_aggregates,
        Date.now(),
      );
    }

    return computeIneffectiveBreakdown(
      [...liveEvents, ...queuedEvents],
      homeTeamIds,
      awayTeamIds,
      Date.now(),
    );
  }, [
    match,
    liveEvents,
    queuedEvents,
    ineffectiveTick,
    hasVarStoppage,
    hasTimeoutStoppage,
  ]);
};
