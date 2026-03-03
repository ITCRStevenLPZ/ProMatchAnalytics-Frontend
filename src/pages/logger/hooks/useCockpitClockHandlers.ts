import { useCallback } from "react";
import { parseClockToSeconds } from "../lib/clockHelpers";

interface UseCockpitClockHandlersParams {
  cockpitLocked: boolean;
  clockMode: "EFFECTIVE" | "INEFFECTIVE";
  currentPhase?: string;
  isVarActiveLocal: boolean;
  isTimeoutActive: boolean;
  varTimeSeconds: number;
  globalClock: string;
  isGlobalClockRunning: boolean;
  beginIneffective: () => void;
  endIneffectiveIfNeeded: (mode: "EFFECTIVE") => void;
  setIsBallInPlay: (value: boolean) => void;
  handleGlobalClockStart: () => void;
  handleGlobalClockStop: () => void;
  handleGlobalClockStartVarSync: () => void;
  handleGlobalClockStopVarSync: () => void;
  handleVarToggleBase: (options: {
    currentGlobalSeconds: number;
    currentVarSeconds: number;
    isGlobalClockRunning: boolean;
  }) => void;
  logNeutralTimerEvent: (
    type: "VARStart" | "VARStop" | "TimeoutStart" | "TimeoutStop",
  ) => void;
}

interface UseCockpitClockHandlersResult {
  handleGlobalClockStartGuarded: () => void;
  handleGlobalClockStopGuarded: () => void;
  handleModeSwitchGuarded: (mode: "EFFECTIVE" | "INEFFECTIVE") => void;
  handleVarToggle: () => void;
  handleTimeoutToggle: () => void;
  showFieldResume: boolean;
}

export const useCockpitClockHandlers = ({
  cockpitLocked,
  clockMode,
  currentPhase,
  isVarActiveLocal,
  isTimeoutActive,
  varTimeSeconds,
  globalClock,
  isGlobalClockRunning,
  beginIneffective,
  endIneffectiveIfNeeded,
  setIsBallInPlay,
  handleGlobalClockStart,
  handleGlobalClockStop,
  handleGlobalClockStartVarSync,
  handleGlobalClockStopVarSync,
  handleVarToggleBase,
  logNeutralTimerEvent,
}: UseCockpitClockHandlersParams): UseCockpitClockHandlersResult => {
  const handleGlobalClockStartGuarded = useCallback(() => {
    if (cockpitLocked) return;
    handleGlobalClockStartVarSync();
    setIsBallInPlay(true);
    handleGlobalClockStart();
  }, [
    cockpitLocked,
    handleGlobalClockStartVarSync,
    handleGlobalClockStart,
    setIsBallInPlay,
  ]);

  const handleGlobalClockStopGuarded = useCallback(() => {
    if (cockpitLocked) return;
    handleGlobalClockStopVarSync();
    setIsBallInPlay(false);
    handleGlobalClockStop();
  }, [
    cockpitLocked,
    handleGlobalClockStopVarSync,
    handleGlobalClockStop,
    setIsBallInPlay,
  ]);

  const handleModeSwitchGuarded = useCallback(
    (mode: "EFFECTIVE" | "INEFFECTIVE") => {
      if (cockpitLocked) return;
      if (mode === "INEFFECTIVE") {
        beginIneffective();
        return;
      }
      endIneffectiveIfNeeded(mode);
    },
    [beginIneffective, cockpitLocked, endIneffectiveIfNeeded],
  );

  const handleVarToggle = useCallback(() => {
    if (cockpitLocked) return;
    const nextActive = !isVarActiveLocal;
    const currentVarSeconds = varTimeSeconds;
    const currentGlobalSeconds = parseClockToSeconds(globalClock);
    logNeutralTimerEvent(nextActive ? "VARStart" : "VARStop");
    handleVarToggleBase({
      currentGlobalSeconds,
      currentVarSeconds,
      isGlobalClockRunning,
    });
  }, [
    cockpitLocked,
    globalClock,
    handleVarToggleBase,
    isGlobalClockRunning,
    isVarActiveLocal,
    logNeutralTimerEvent,
    varTimeSeconds,
  ]);

  const handleTimeoutToggle = useCallback(() => {
    if (cockpitLocked) return;
    logNeutralTimerEvent(isTimeoutActive ? "TimeoutStop" : "TimeoutStart");
  }, [cockpitLocked, isTimeoutActive, logNeutralTimerEvent]);

  return {
    handleGlobalClockStartGuarded,
    handleGlobalClockStopGuarded,
    handleModeSwitchGuarded,
    handleVarToggle,
    handleTimeoutToggle,
    showFieldResume:
      clockMode !== "EFFECTIVE" &&
      !cockpitLocked &&
      currentPhase !== "HALFTIME" &&
      currentPhase !== "EXTRA_HALFTIME",
  };
};
