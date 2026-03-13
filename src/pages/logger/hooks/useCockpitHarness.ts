import { useEffect } from "react";
import type { MatchEvent } from "../../../store/useMatchLogStore";
import { useMatchLogStore } from "../../../store/useMatchLogStore";
import type {
  ActionStep,
  GameStoppageSummary,
  LoggerHarness,
  Match,
  QueuedEventSummary,
} from "../types";

interface UseCockpitHarnessParams {
  enabled: boolean;
  match: Match | null;
  resetFlow: () => void;
  setSelectedTeam: (team: "home" | "away") => void;
  currentStepRef: React.MutableRefObject<ActionStep>;
  sendPassEvent: (options: {
    team: "home" | "away";
    passerId: string;
    recipientId: string;
  }) => void;
  sendRawEvent: (payload: Record<string, any>) => void;
  undoLastEvent: () => Promise<void> | void;
  computedDriftSeconds: number;
  forcedDriftSeconds: number | null;
  driftSeconds: number;
  showDriftNudge: boolean;
}

export const useCockpitHarness = ({
  enabled,
  match,
  resetFlow,
  setSelectedTeam,
  currentStepRef,
  sendPassEvent,
  sendRawEvent,
  undoLastEvent,
  computedDriftSeconds,
  forcedDriftSeconds,
  driftSeconds,
  showDriftNudge,
}: UseCockpitHarnessParams): void => {
  useEffect(() => {
    if (!enabled || !match) return;

    const harness: LoggerHarness = {
      resetFlow,
      setSelectedTeam,
      getCurrentStep: () => currentStepRef.current,
      sendPassEvent,
      sendRawEvent,
      getMatchContext: () => ({
        matchId: match.id,
        homeTeamId: match.home_team.id,
        awayTeamId: match.away_team.id,
      }),
      undoLastEvent: () => undoLastEvent(),
      getQueueSnapshot: () => {
        const summarize = (events: MatchEvent[]): QueuedEventSummary[] =>
          events.map((event) => ({
            match_id: event.match_id,
            timestamp: event.timestamp,
            client_id: event.client_id,
            type: event.type,
          }));
        const state = useMatchLogStore.getState();
        return {
          currentMatchId: state.currentMatchId,
          queuedEvents: summarize(state.queuedEvents),
          queuedEventsByMatch: Object.fromEntries(
            Object.entries(state.queuedEventsByMatch).map(
              ([matchKey, events]) => [matchKey, summarize(events)],
            ),
          ),
        };
      },
      getLiveEventSummary: () => {
        const state = useMatchLogStore.getState();
        return {
          liveCount: state.liveEvents.length,
          gameStoppageCount: state.liveEvents.filter(
            (event) => event.type === "GameStoppage",
          ).length,
        };
      },
      getRecentGameStoppages: () => {
        const summarize = (event: MatchEvent): GameStoppageSummary => ({
          team_id: event.team_id,
          match_clock: event.match_clock,
          notes: event.notes,
          stoppage_type: String(event.data?.stoppage_type || ""),
          reason:
            typeof event.data?.reason === "string" ? event.data.reason : null,
          trigger_action:
            typeof event.data?.trigger_action === "string"
              ? event.data.trigger_action
              : null,
          trigger_team_id:
            typeof event.data?.trigger_team_id === "string"
              ? event.data.trigger_team_id
              : null,
        });
        const state = useMatchLogStore.getState();
        return state.liveEvents
          .filter((event) => event.type === "GameStoppage")
          .slice(-6)
          .map(summarize);
      },
      clearQueue: () => {
        useMatchLogStore.getState().clearQueuedEvents();
      },
      getDriftSnapshot: () => ({
        computed: computedDriftSeconds,
        forced: forcedDriftSeconds,
        effective: driftSeconds,
        show: showDriftNudge,
      }),
    };

    window.__PROMATCH_LOGGER_HARNESS__ = harness;

    return () => {
      delete window.__PROMATCH_LOGGER_HARNESS__;
    };
  }, [
    enabled,
    match,
    resetFlow,
    setSelectedTeam,
    currentStepRef,
    sendPassEvent,
    sendRawEvent,
    undoLastEvent,
    computedDriftSeconds,
    forcedDriftSeconds,
    driftSeconds,
    showDriftNudge,
  ]);
};
