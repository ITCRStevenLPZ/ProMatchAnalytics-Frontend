import { useEffect, type Dispatch, type SetStateAction } from "react";
import { formatMatchClock } from "../utils";
import { DEFAULT_PERIOD_MAP } from "../constants";
import type { Match } from "../types";

interface UseCockpitLifecycleEffectsParams {
  matchId?: string;
  lastTimelineRefreshRequest?: string | number | null;
  setCurrentMatch: (matchId: string) => void;
  hydrateEvents: () => Promise<void>;
  resetDuplicateStats: () => void;
  setManualFieldFlip: Dispatch<SetStateAction<boolean>>;
  match: Match | null;
  statusOverride?: Match["status"];
  resetOperatorControls: (payload: { clock: string; period: number }) => void;
  cockpitLocked: boolean;
  resetFlow: () => void;
}

export const useCockpitLifecycleEffects = ({
  matchId,
  lastTimelineRefreshRequest,
  setCurrentMatch,
  hydrateEvents,
  resetDuplicateStats,
  setManualFieldFlip,
  match,
  statusOverride,
  resetOperatorControls,
  cockpitLocked,
  resetFlow,
}: UseCockpitLifecycleEffectsParams): void => {
  useEffect(() => {
    if (!matchId) return;
    setCurrentMatch(matchId);
    hydrateEvents();
  }, [matchId, setCurrentMatch, hydrateEvents]);

  useEffect(() => {
    if (!matchId || !lastTimelineRefreshRequest) return;
    hydrateEvents();
  }, [matchId, lastTimelineRefreshRequest, hydrateEvents]);

  useEffect(() => {
    if (!matchId) return;
    resetDuplicateStats();
  }, [matchId, resetDuplicateStats]);

  useEffect(() => {
    setManualFieldFlip(false);
  }, [matchId, setManualFieldFlip]);

  useEffect(() => {
    if (!match) return;
    const defaultClock = formatMatchClock(match.match_time_seconds);
    const defaultPeriod =
      DEFAULT_PERIOD_MAP[statusOverride || match.status] ?? 1;
    resetOperatorControls({ clock: defaultClock, period: defaultPeriod });
  }, [match, resetOperatorControls, statusOverride]);

  useEffect(() => {
    if (cockpitLocked) {
      resetFlow();
    }
  }, [cockpitLocked, resetFlow]);
};
