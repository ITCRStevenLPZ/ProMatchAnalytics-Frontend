import { useState, useEffect, useRef } from "react";
import { Match } from "../types";
import { formatMatchClock } from "../utils";
import { updateMatchStatus, updateMatch } from "../../../lib/loggerApi";

/**
 * Safely parse a timestamp string to milliseconds.
 * Handles both ISO timestamps with 'Z' suffix and naive timestamps (treated as UTC).
 */
const parseTimestamp = (timestamp: string | undefined | null): number => {
  if (!timestamp) return 0;
  // If timestamp doesn't end with Z and doesn't have timezone info, treat as UTC
  const normalized =
    timestamp.endsWith("Z") ||
    timestamp.includes("+") ||
    timestamp.includes("-", 10)
      ? timestamp
      : `${timestamp}Z`;
  return new Date(normalized).getTime();
};

export const useMatchTimer = (
  match: Match | null,
  fetchMatch: () => void,
  options?: {
    varTimeSeconds?: number;
    isVarActive?: boolean;
    varPauseStartMs?: number | null;
    varPausedSeconds?: number;
  },
) => {
  const [globalClock, setGlobalClock] = useState("00:00");
  const [effectiveTime, setEffectiveTime] = useState(0);
  const [effectiveClock, setEffectiveClock] = useState("00:00");
  const [ineffectiveClock, setIneffectiveClock] = useState("00:00");

  const [clockMode, setClockMode] = useState<"EFFECTIVE" | "INEFFECTIVE">(
    "EFFECTIVE",
  );
  const [accumulatedIneffectiveTime, setAccumulatedIneffectiveTime] =
    useState(0);
  const [isClockRunning, setClockRunning] = useState(false);

  // Track current calculated values for mode switch calculations
  const currentEffectiveRef = useRef(0);
  const currentIneffectiveRef = useRef(0);
  const varTimeSeconds = options?.varTimeSeconds ?? 0;
  const isVarActive = options?.isVarActive ?? false;
  const varPauseStartMs = options?.varPauseStartMs ?? null;
  const varPausedSeconds = options?.varPausedSeconds ?? 0;

  // Sync state with match data
  useEffect(() => {
    if (match) {
      setAccumulatedIneffectiveTime(match.ineffective_time_seconds || 0);
      const nextMode =
        match.clock_mode === "INEFFECTIVE" ? "INEFFECTIVE" : "EFFECTIVE";
      setClockMode(nextMode);
    }
  }, [match]);

  // Timer Loop
  useEffect(() => {
    if (!match) return;

    const updateTimers = () => {
      const now = Date.now();
      const isStatusStopped =
        match.status === "Halftime" ||
        match.status === "Extra_Halftime" ||
        match.status === "Fulltime" ||
        match.status === "Completed" ||
        match.status === "Abandoned";

      // 1. Calculate Sub-Clocks based on Mode
      let currentEffectiveSeconds = match.match_time_seconds || 0;
      // If clock is stopped (no current_period_start), use the stored time
      if (!match.current_period_start_timestamp) {
        currentEffectiveSeconds =
          match.clock_seconds_at_period_start || match.match_time_seconds || 0;
      }

      let currentIneffectiveSeconds = accumulatedIneffectiveTime;

      // If global clock is running (according to backend)
      if (match.current_period_start_timestamp && !isStatusStopped) {
        const start = parseTimestamp(match.current_period_start_timestamp);
        const elapsed = Math.max(0, (now - start) / 1000);
        const varPauseDelta =
          varPauseStartMs && isVarActive
            ? Math.max(0, (now - varPauseStartMs) / 1000)
            : 0;
        const varPauseTotal = Math.max(0, varPausedSeconds + varPauseDelta);

        // Add elapsed to the active mode accumulator
        // IMPORTANT: Only accumulate if the backend match state matches our local optimistic clockMode.
        // Otherwise, we might calculate elapsed time using a timestamp from the WRONG mode (e.g. previous mode start),
        // leading to massive time jumps (phantom accumulation) which can be permanently saved if a save triggers during the glitch.
        if (clockMode === "EFFECTIVE") {
          if (match.clock_mode === "EFFECTIVE") {
            currentEffectiveSeconds =
              (match.clock_seconds_at_period_start || 0) +
              Math.max(0, elapsed - varPauseTotal);
          } else {
            // Waiting for sync: use the stored value
            currentEffectiveSeconds =
              match.clock_seconds_at_period_start ||
              match.match_time_seconds ||
              0;
          }
        } else if (clockMode === "INEFFECTIVE") {
          if (
            match.clock_mode === "INEFFECTIVE" &&
            match.last_mode_change_timestamp
          ) {
            const lastChange = parseTimestamp(match.last_mode_change_timestamp);
            const elapsedSinceChange = Math.max(0, (now - lastChange) / 1000);
            currentIneffectiveSeconds += Math.max(
              0,
              elapsedSinceChange - varPauseTotal,
            );
          }
        }

        setClockRunning(true);
      } else {
        setClockRunning(false);
      }

      // 2. Calculate Global Time (Sum of all)
      const globalSeconds =
        currentEffectiveSeconds + currentIneffectiveSeconds + varTimeSeconds;

      // Update refs for mode switch calculations
      currentEffectiveRef.current = currentEffectiveSeconds;
      currentIneffectiveRef.current = currentIneffectiveSeconds;

      // Update Displays
      setGlobalClock(formatMatchClock(globalSeconds));
      setEffectiveTime(currentEffectiveSeconds);
      setEffectiveClock(formatMatchClock(currentEffectiveSeconds));
      setIneffectiveClock(formatMatchClock(currentIneffectiveSeconds));
    };

    const interval = setInterval(updateTimers, 100);
    updateTimers(); // Initial call

    return () => clearInterval(interval);
  }, [
    match,
    clockMode,
    accumulatedIneffectiveTime,
    varTimeSeconds,
    isVarActive,
    varPauseStartMs,
    varPausedSeconds,
  ]);

  // Handlers
  const handleGlobalClockStart = async () => {
    if (!match) return;
    try {
      const startStatus =
        match.status === "Pending" || match.status === "Scheduled"
          ? "Live_First_Half"
          : undefined;
      await updateMatchStatus(match.id, startStatus, "start");
      fetchMatch();
    } catch (error) {
      console.error("Failed to start global clock:", error);
    }
  };

  const handleGlobalClockStop = async () => {
    if (!match) return;
    try {
      // Capture current time before network call to avoid delay
      const currentTime = Math.round(currentEffectiveRef.current);
      await updateMatchStatus(match.id, undefined, "stop", currentTime);
      fetchMatch();
    } catch (error) {
      console.error("Failed to stop global clock:", error);
    }
  };

  const handleGlobalClockReset = async () => {
    if (!match) return;
    try {
      // Attempt to reset status/clocks via status endpoint; backend may reject Fulltime→Pending
      try {
        if (match.status === "Completed" || match.status === "Fulltime") {
          await updateMatchStatus(match.id, undefined, "reset", 0);
        } else {
          await updateMatchStatus(match.id, "Pending", "reset", 0);
        }
      } catch (statusError) {
        console.warn(
          "[Reset] Status reset rejected, continuing with clock reset",
          statusError,
        );
      }

      await updateMatch(match.id, {
        match_time_seconds: 0,
        clock_seconds_at_period_start: 0,
        ineffective_time_seconds: 0,
        current_period_start_timestamp: null,
        last_mode_change_timestamp: null,
        period_timestamps: {},
        clock_mode: "EFFECTIVE",
      });
      fetchMatch();
    } catch (error) {
      console.error("Failed to reset global clock:", error);
    }
  };

  const handleModeSwitch = async (newMode: "EFFECTIVE" | "INEFFECTIVE") => {
    if (!match) return;

    const previousMode = clockMode;

    // Optimistic update
    setClockMode(newMode);

    try {
      const updates: Record<string, any> = {
        clock_mode: newMode,
        last_mode_change_timestamp: new Date().toISOString(),
        current_period_start_timestamp: new Date().toISOString(),
      };

      // Persist accumulated times based on the mode we're leaving
      if (previousMode === "EFFECTIVE") {
        // Save the current effective time when leaving EFFECTIVE mode
        updates.match_time_seconds = Math.round(currentEffectiveRef.current);
        updates.clock_seconds_at_period_start = Math.round(
          currentEffectiveRef.current,
        );
      } else if (previousMode === "INEFFECTIVE") {
        // Save the current ineffective time when leaving INEFFECTIVE mode
        updates.ineffective_time_seconds = Math.round(
          currentIneffectiveRef.current,
        );
      }
      await updateMatch(match.id, updates);
      fetchMatch();
    } catch (error) {
      console.error("Failed to switch clock mode:", error);
      // Keep local mode to allow timers to continue while offline.
    }
  };

  return {
    globalClock,
    effectiveClock,
    effectiveTime,
    ineffectiveClock,
    clockMode,
    isClockRunning,
    handleGlobalClockStart,
    handleGlobalClockStop,
    handleGlobalClockReset,
    handleModeSwitch,
  };
};
