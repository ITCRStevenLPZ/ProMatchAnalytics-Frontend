import { useEffect, useMemo } from "react";
import { formatSecondsAsClock, parseClockToSeconds } from "../lib/clockHelpers";

interface UseCockpitVarDerivedStateParams {
  ineffectiveBreakdown: any;
  isVarActiveLocal: boolean;
  varStartGlobalSeconds: number | null;
  varStartTotalSeconds: number;
  varStartMs: number | null;
  varPauseStartMs: number | null;
  varPausedSeconds: number;
  varTick: number;
  isGlobalClockRunning: boolean;
  clockMode: "EFFECTIVE" | "INEFFECTIVE";
  syncVarWithGlobalClockRunning: (running: boolean) => void;
  syncVarPauseWithClockMode: () => void;
  globalClock: string;
}

interface CockpitVarDerivedState {
  varTimeSeconds: number;
  varTimeClock: string;
}

export const useCockpitVarDerivedState = ({
  ineffectiveBreakdown,
  isVarActiveLocal,
  varStartGlobalSeconds,
  varStartTotalSeconds,
  varStartMs,
  varPauseStartMs,
  varPausedSeconds,
  varTick,
  isGlobalClockRunning,
  clockMode,
  syncVarWithGlobalClockRunning,
  syncVarPauseWithClockMode,
  globalClock,
}: UseCockpitVarDerivedStateParams): CockpitVarDerivedState => {
  const globalClockSeconds = useMemo(
    () => parseClockToSeconds(globalClock),
    [globalClock],
  );

  const breakdownVarActive = Boolean(ineffectiveBreakdown?.varActive);

  const varTimeSeconds = useMemo(() => {
    const baseVar =
      ineffectiveBreakdown?.totals?.byAction?.VAR?.neutral ??
      ineffectiveBreakdown?.totals.neutral ??
      0;
    if (isVarActiveLocal && varStartGlobalSeconds !== null) {
      const syncedDeltaSeconds = Math.max(
        0,
        globalClockSeconds - varStartGlobalSeconds,
      );
      return Math.max(0, varStartTotalSeconds + syncedDeltaSeconds);
    }
    if (isVarActiveLocal && varStartMs) {
      const pausedWhileActive =
        varPausedSeconds +
        (varPauseStartMs
          ? Math.max(0, (Date.now() - varPauseStartMs) / 1000)
          : 0);
      if (breakdownVarActive) {
        return Math.max(0, baseVar - pausedWhileActive);
      }
      const deltaSeconds = Math.max(
        0,
        (Date.now() - varStartMs) / 1000 - pausedWhileActive,
      );
      return baseVar + deltaSeconds;
    }
    if (breakdownVarActive) return baseVar;
    return baseVar;
  }, [
    ineffectiveBreakdown,
    breakdownVarActive,
    isVarActiveLocal,
    globalClockSeconds,
    varStartGlobalSeconds,
    varStartTotalSeconds,
    varStartMs,
    varPauseStartMs,
    varPausedSeconds,
    varTick,
  ]);

  const varTimeClock = useMemo(
    () => formatSecondsAsClock(varTimeSeconds),
    [varTimeSeconds, varTick],
  );

  useEffect(() => {
    syncVarWithGlobalClockRunning(isGlobalClockRunning);
  }, [isGlobalClockRunning, syncVarWithGlobalClockRunning]);

  useEffect(() => {
    syncVarPauseWithClockMode();
  }, [clockMode, syncVarPauseWithClockMode]);

  return {
    varTimeSeconds,
    varTimeClock,
  };
};
