import { useEffect, useMemo, useRef, useState } from "react";
import type { Match } from "../types";
import { parseClockToSeconds, parseTimestampSafe } from "../lib/clockHelpers";

interface UseClockDriftParams {
  match: Match | null;
  globalClock: string;
  varPauseStartMs: number | null;
  varPausedSeconds: number;
  varTimeSeconds: number;
  fetchMatch: () => void | Promise<void>;
}

export interface UseClockDriftResult {
  computedDriftSeconds: number;
  forcedDriftSeconds: number | null;
  driftSeconds: number;
  showDriftNudge: boolean;
}

export const useClockDrift = ({
  match,
  globalClock,
  varPauseStartMs,
  varPausedSeconds,
  varTimeSeconds,
  fetchMatch,
}: UseClockDriftParams): UseClockDriftResult => {
  const lastDriftAutoSyncRef = useRef<number>(0);
  const driftExceededAtRef = useRef<number | null>(null);

  const serverSeconds = useMemo(() => {
    if (!match) return 0;
    const isStatusStopped =
      match.status === "Halftime" ||
      match.status === "Extra_Halftime" ||
      match.status === "Fulltime" ||
      match.status === "Completed" ||
      match.status === "Abandoned";
    const base =
      (match.match_time_seconds || 0) + (match.ineffective_time_seconds || 0);
    if (!match.current_period_start_timestamp || isStatusStopped) return base;
    const start = parseTimestampSafe(match.current_period_start_timestamp);
    const elapsed = Math.max(0, (Date.now() - start) / 1000);
    const pauseSeconds = varPauseStartMs
      ? Math.max(0, (Date.now() - varPauseStartMs) / 1000) + varPausedSeconds
      : varPausedSeconds;
    return base + Math.max(0, elapsed - pauseSeconds);
  }, [match, globalClock, varTimeSeconds, varPauseStartMs, varPausedSeconds]);

  const localSeconds = useMemo(
    () => parseClockToSeconds(globalClock),
    [globalClock],
  );

  const computedDriftSeconds = Math.abs(localSeconds - serverSeconds);
  const [forcedDriftSeconds, setForcedDriftSeconds] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateForcedDrift = () => {
      const raw = (window as any).__PROMATCH_FORCE_DRIFT_SECONDS__;
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        setForcedDriftSeconds(null);
        return;
      }
      setForcedDriftSeconds(Math.max(0, Math.abs(raw)));
    };
    updateForcedDrift();
    const interval = setInterval(updateForcedDrift, 250);
    return () => clearInterval(interval);
  }, []);

  const driftSeconds = forcedDriftSeconds ?? computedDriftSeconds;
  const showDriftNudge = driftSeconds > 2;

  useEffect(() => {
    const now = Date.now();
    if (driftSeconds > 2) {
      if (driftExceededAtRef.current === null) {
        driftExceededAtRef.current = now;
      }
      const lingered = now - (driftExceededAtRef.current || now);
      const sinceLastSync = now - (lastDriftAutoSyncRef.current || 0);
      if (lingered > 1000 && sinceLastSync > 15000) {
        lastDriftAutoSyncRef.current = now;
        console.info("[Logger] Auto-resync due to clock drift", {
          driftSeconds: driftSeconds.toFixed(3),
          localSeconds,
          serverSeconds,
          lingered,
          sinceLastSync,
        });
        fetchMatch();
      }
    } else {
      driftExceededAtRef.current = null;
    }
  }, [driftSeconds, fetchMatch, localSeconds, serverSeconds]);

  return {
    computedDriftSeconds,
    forcedDriftSeconds,
    driftSeconds,
    showDriftNudge,
  };
};
