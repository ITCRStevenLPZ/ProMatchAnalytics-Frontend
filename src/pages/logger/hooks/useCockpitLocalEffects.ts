import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { Match } from "../types";

interface UseCockpitLocalEffectsParams {
  match: Match | null;
  matchId?: string;
  setManualFieldFlip: Dispatch<SetStateAction<boolean>>;
  setPriorityPlayerId: Dispatch<SetStateAction<string | null>>;
  isGlobalClockRunning: boolean;
  setIsBallInPlay: (value: boolean) => void;
}

export const useCockpitLocalEffects = ({
  match,
  matchId,
  setManualFieldFlip,
  setPriorityPlayerId,
  isGlobalClockRunning,
  setIsBallInPlay,
}: UseCockpitLocalEffectsParams): void => {
  useEffect(() => {
    if (!match) return;
    const isResetMatch =
      match.status === "Pending" &&
      (match.match_time_seconds || 0) === 0 &&
      (match.ineffective_time_seconds || 0) === 0 &&
      !match.current_period_start_timestamp &&
      (!match.period_timestamps ||
        Object.keys(match.period_timestamps).length === 0);

    if (
      isResetMatch ||
      match.status === "Fulltime" ||
      match.status === "Completed"
    ) {
      setManualFieldFlip(false);
    }
  }, [
    match,
    match?.status,
    match?.match_time_seconds,
    match?.ineffective_time_seconds,
    match?.current_period_start_timestamp,
    match?.period_timestamps,
    setManualFieldFlip,
  ]);

  useEffect(() => {
    setPriorityPlayerId(null);
  }, [matchId, setPriorityPlayerId]);

  useEffect(() => {
    setIsBallInPlay(isGlobalClockRunning);
  }, [isGlobalClockRunning, setIsBallInPlay]);
};
