import { useCallback, useEffect, useState } from "react";
import type { Match } from "../types";

interface UseVarTimerParams {
  match: Match | null;
}

export interface UseVarTimerResult {
  isVarActiveLocal: boolean;
  varStartMs: number | null;
  varStartGlobalSeconds: number | null;
  varStartTotalSeconds: number;
  varPauseStartMs: number | null;
  varPausedSeconds: number;
  varTick: number;
  syncVarPauseWithClockMode: () => void;
  syncVarWithGlobalClockRunning: (isGlobalClockRunning: boolean) => void;
  handleVarToggle: (params: {
    currentGlobalSeconds: number;
    currentVarSeconds: number;
    isGlobalClockRunning: boolean;
  }) => void;
  handleGlobalClockStartVarSync: () => void;
  handleGlobalClockStopVarSync: () => void;
  resetVarState: () => void;
}

export const useVarTimer = ({
  match,
}: UseVarTimerParams): UseVarTimerResult => {
  const [isVarActiveLocal, setIsVarActiveLocal] = useState(false);
  const [varStartMs, setVarStartMs] = useState<number | null>(null);
  const [varStartGlobalSeconds, setVarStartGlobalSeconds] = useState<
    number | null
  >(null);
  const [varStartTotalSeconds, setVarStartTotalSeconds] = useState(0);
  const [varPauseStartMs, setVarPauseStartMs] = useState<number | null>(null);
  const [varPausedSeconds, setVarPausedSeconds] = useState(0);
  const [varTick, setVarTick] = useState(0);

  useEffect(() => {
    if (!match) return;
    const hasVarActive = Boolean(
      (match as any).ineffective_aggregates?.var_active?.start_timestamp,
    );
    if (!hasVarActive && !isVarActiveLocal) return;
    const interval = setInterval(() => {
      setVarTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [match, isVarActiveLocal]);

  const syncVarPauseWithClockMode = useCallback(() => {
    setVarPausedSeconds(0);
    setVarPauseStartMs(isVarActiveLocal ? Date.now() : null);
  }, [isVarActiveLocal]);

  const syncVarWithGlobalClockRunning = useCallback(
    (isGlobalClockRunning: boolean) => {
      if (!isVarActiveLocal) return;
      if (isGlobalClockRunning) {
        if (varPauseStartMs) {
          const paused = Math.max(0, (Date.now() - varPauseStartMs) / 1000);
          setVarPausedSeconds((prev) => prev + paused);
          setVarPauseStartMs(null);
        }
        return;
      }
      if (!varPauseStartMs) {
        setVarPauseStartMs(Date.now());
      }
    },
    [isVarActiveLocal, varPauseStartMs],
  );

  const handleVarToggleWithState = useCallback(
    ({
      currentGlobalSeconds,
      currentVarSeconds,
      isGlobalClockRunning: isClockRunningNow,
    }: {
      currentGlobalSeconds: number;
      currentVarSeconds: number;
      isGlobalClockRunning: boolean;
    }) => {
      const nextActive = !isVarActiveLocal;
      setIsVarActiveLocal(nextActive);
      setVarStartMs(nextActive ? Date.now() : null);
      setVarStartGlobalSeconds(nextActive ? currentGlobalSeconds : null);
      setVarStartTotalSeconds(nextActive ? currentVarSeconds : 0);
      setVarPausedSeconds(0);
      if (nextActive) {
        setVarPauseStartMs(isClockRunningNow ? null : Date.now());
      } else if (varPauseStartMs) {
        const deltaSeconds = Math.max(0, (Date.now() - varPauseStartMs) / 1000);
        setVarPausedSeconds((prev) => prev + deltaSeconds);
        setVarPauseStartMs(null);
      }
    },
    [isVarActiveLocal, varPauseStartMs],
  );

  const handleGlobalClockStartVarSync = useCallback(() => {
    if (isVarActiveLocal && varPauseStartMs) {
      const paused = Math.max(0, (Date.now() - varPauseStartMs) / 1000);
      setVarPausedSeconds((prev) => prev + paused);
      setVarPauseStartMs(null);
    }
  }, [isVarActiveLocal, varPauseStartMs]);

  const handleGlobalClockStopVarSync = useCallback(() => {
    if (isVarActiveLocal && !varPauseStartMs) {
      setVarPauseStartMs(Date.now());
    }
  }, [isVarActiveLocal, varPauseStartMs]);

  const resetVarState = useCallback(() => {
    setIsVarActiveLocal(false);
    setVarStartMs(null);
    setVarStartGlobalSeconds(null);
    setVarStartTotalSeconds(0);
    setVarPauseStartMs(null);
    setVarPausedSeconds(0);
    setVarTick(0);
  }, []);

  return {
    isVarActiveLocal,
    varStartMs,
    varStartGlobalSeconds,
    varStartTotalSeconds,
    varPauseStartMs,
    varPausedSeconds,
    varTick,
    syncVarPauseWithClockMode,
    syncVarWithGlobalClockRunning,
    handleVarToggle: handleVarToggleWithState,
    handleGlobalClockStartVarSync,
    handleGlobalClockStopVarSync,
    resetVarState,
  };
};
