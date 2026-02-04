import { useEffect, useRef } from "react";
import { ClockMode, Match } from "../types";
import { formatMatchClock } from "../utils";

interface UnifiedClockOptions {
  match: Match | null;
  clockMode: ClockMode;
  accumulatedIneffectiveTime: number;
  accumulatedTimeOff: number;
  operatorPeriod: number;
  setClockRunning: (value: boolean) => void;
  setGlobalClock: (value: string) => void;
  setOperatorClock: (value: string) => void;
  setEffectiveTime: (value: number) => void;
  setIneffectiveClock: (value: string) => void;
  setTimeOffClock: (value: string) => void;
}

export const useUnifiedClockDisplay = ({
  match,
  clockMode,
  accumulatedIneffectiveTime,
  accumulatedTimeOff,
  operatorPeriod,
  setClockRunning,
  setGlobalClock,
  setOperatorClock,
  setEffectiveTime,
  setIneffectiveClock,
  setTimeOffClock,
}: UnifiedClockOptions) => {
  const localModeChangeRef = useRef<number | null>(null);

  useEffect(() => {
    localModeChangeRef.current = Date.now();
  }, [clockMode]);

  useEffect(() => {
    if (!match) return;

    const updateTimers = () => {
      const now = new Date().getTime();

      let effectiveSeconds = match.match_time_seconds || 0;
      if (!match.current_period_start_timestamp) {
        effectiveSeconds =
          match.clock_seconds_at_period_start || match.match_time_seconds || 0;
      }

      let ineffectiveSeconds = accumulatedIneffectiveTime;
      let timeOffSeconds = accumulatedTimeOff;

      if (match.current_period_start_timestamp) {
        const startTimestamp = match.current_period_start_timestamp.endsWith(
          "Z",
        )
          ? match.current_period_start_timestamp
          : `${match.current_period_start_timestamp}Z`;
        const start = new Date(startTimestamp).getTime();
        const elapsed = (now - start) / 1000;

        if (clockMode === "EFFECTIVE") {
          effectiveSeconds =
            (match.clock_seconds_at_period_start || 0) + elapsed;
        } else if (clockMode === "INEFFECTIVE" || clockMode === "TIMEOFF") {
          const modeTimestamp = match.last_mode_change_timestamp
            ? match.last_mode_change_timestamp.endsWith("Z")
              ? match.last_mode_change_timestamp
              : `${match.last_mode_change_timestamp}Z`
            : null;
          const lastChange = modeTimestamp
            ? new Date(modeTimestamp).getTime()
            : localModeChangeRef.current;
          if (lastChange) {
            const elapsedSinceChange = Math.max(0, (now - lastChange) / 1000);
            if (clockMode === "INEFFECTIVE") {
              ineffectiveSeconds += elapsedSinceChange;
            } else {
              timeOffSeconds += elapsedSinceChange;
            }
          }
        }

        setClockRunning(true);
      } else {
        setClockRunning(false);
      }

      const globalSeconds =
        effectiveSeconds + ineffectiveSeconds + timeOffSeconds;

      if (Math.random() < 0.1) {
        console.log("[TimerDebug]", {
          clockMode,
          operatorPeriod,
          globalSeconds,
          effectiveSeconds,
          ineffectiveSeconds,
          timeOffSeconds,
        });
      }

      setGlobalClock(formatMatchClock(globalSeconds));
      setOperatorClock(formatMatchClock(effectiveSeconds));
      setEffectiveTime(effectiveSeconds);
      setIneffectiveClock(formatMatchClock(ineffectiveSeconds));
      setTimeOffClock(formatMatchClock(timeOffSeconds));
    };

    updateTimers();
    const interval = setInterval(updateTimers, 100);
    return () => clearInterval(interval);
  }, [
    match,
    clockMode,
    accumulatedIneffectiveTime,
    accumulatedTimeOff,
    operatorPeriod,
    setClockRunning,
    setGlobalClock,
    setOperatorClock,
    setEffectiveTime,
    setIneffectiveClock,
    setTimeOffClock,
  ]);
};
