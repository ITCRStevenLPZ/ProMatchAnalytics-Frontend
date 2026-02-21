import { useMemo } from "react";
import { formatSecondsAsClock } from "../lib/clockHelpers";

interface UseTimeoutTimerParams {
  ineffectiveBreakdown: any;
}

export interface UseTimeoutTimerResult {
  isTimeoutActive: boolean;
  timeoutTimeSeconds: number;
  timeoutTimeClock: string;
}

export const useTimeoutTimer = ({
  ineffectiveBreakdown,
}: UseTimeoutTimerParams): UseTimeoutTimerResult => {
  const isTimeoutActive = Boolean(ineffectiveBreakdown?.timeout?.active);
  const timeoutTimeSeconds = ineffectiveBreakdown?.timeout?.totalSeconds ?? 0;

  const timeoutTimeClock = useMemo(
    () => formatSecondsAsClock(timeoutTimeSeconds),
    [timeoutTimeSeconds],
  );

  return {
    isTimeoutActive,
    timeoutTimeSeconds,
    timeoutTimeClock,
  };
};
