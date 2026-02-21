import { useCallback, useMemo, useState } from "react";
import type { Match } from "../types";
import { IS_E2E_TEST_MODE } from "../../../lib/loggerApi";
import {
  EXTRA_FIRST_HALF_END_SECONDS,
  EXTRA_HALF_MINUTES,
  REGULATION_FIRST_HALF_SECONDS,
  REGULATION_SECOND_HALF_SECONDS,
  type PeriodPhase,
} from "./usePeriodManager";
import { formatSecondsAsClock } from "../lib/clockHelpers";

interface UseTransitionGuardsParams {
  statusOverride?: Match["status"];
  currentPhase: PeriodPhase;
  globalTimeSeconds: number;
  match: Match | null;
  t: (...args: any[]) => any;
}

export interface UseTransitionGuardsResult {
  currentStatusNormalized: Match["status"];
  canHalftime: boolean;
  canSecondHalf: boolean;
  canFulltime: boolean;
  transitionGuardMessage: string;
  transitionError: string | null;
  hasFirstHalfMinimum: boolean;
  hasSecondHalfMinimum: boolean;
  hasExtraFirstHalfMinimum: boolean;
  hasExtraSecondHalfMinimum: boolean;
  minimumFirstHalfReason: string;
  minimumSecondHalfReason: string;
  minimumExtraFirstHalfReason: string;
  minimumExtraSecondHalfReason: string;
  guardTransition: (target: Match["status"], fn?: () => void) => void;
  isTransitionAllowed: (
    target: Match["status"],
    currentOverride?: Match["status"],
  ) => boolean;
}

export const useTransitionGuards = ({
  statusOverride,
  currentPhase,
  globalTimeSeconds,
  match,
  t,
}: UseTransitionGuardsParams): UseTransitionGuardsResult => {
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const normalizeStatus = useCallback(
    (status?: Match["status"]): Match["status"] => {
      if (status === "Live") return "Live_First_Half";
      return status || "Pending";
    },
    [],
  );

  const isTransitionAllowed = useCallback(
    (target: Match["status"], currentOverride?: Match["status"]): boolean => {
      const current = normalizeStatus(currentOverride ?? statusOverride);
      const allowed: Record<Match["status"], Match["status"][]> = {
        Pending: ["Live_First_Half"],
        Live_First_Half: ["Halftime"],
        Halftime: ["Live_Second_Half"],
        Live_Second_Half: ["Fulltime"],
        Live: ["Halftime"],
        Fulltime: ["Live_Extra_First", "Penalties", "Completed"],
        Abandoned: [],
        Live_Extra_First: ["Extra_Halftime"],
        Extra_Halftime: ["Live_Extra_Second"],
        Live_Extra_Second: ["Penalties", "Completed"],
        Penalties: ["Completed"],
        Completed: [],
        Scheduled: ["Live_First_Half"],
      };
      const allowedTargets = allowed[current] || [];
      return allowedTargets.includes(target);
    },
    [normalizeStatus, statusOverride],
  );

  const bypassMinimums =
    IS_E2E_TEST_MODE &&
    !(
      typeof window !== "undefined" &&
      (window as any).__PROMATCH_E2E_ENFORCE_MINIMUMS__
    );

  const getPeriodStartSeconds = useCallback(
    (period: number) => {
      if (period === 1) return 0;

      const canonicalStart =
        period === 2
          ? REGULATION_FIRST_HALF_SECONDS
          : period === 3
            ? REGULATION_SECOND_HALF_SECONDS
            : period === 4
              ? EXTRA_FIRST_HALF_END_SECONDS
              : globalTimeSeconds;

      const raw =
        match?.period_timestamps?.[String(period)]?.global_start_seconds;
      if (
        typeof raw === "number" &&
        Number.isFinite(raw) &&
        raw >= 0 &&
        raw <= globalTimeSeconds
      ) {
        return raw;
      }

      return canonicalStart;
    },
    [globalTimeSeconds, match],
  );

  const firstHalfElapsed = Math.max(
    0,
    globalTimeSeconds - getPeriodStartSeconds(1),
  );
  const secondHalfElapsed = Math.max(
    0,
    globalTimeSeconds - getPeriodStartSeconds(2),
  );
  const extraFirstElapsed = Math.max(
    0,
    globalTimeSeconds - getPeriodStartSeconds(3),
  );
  const extraSecondElapsed = Math.max(
    0,
    globalTimeSeconds - getPeriodStartSeconds(4),
  );

  const hasFirstHalfMinimum =
    bypassMinimums || firstHalfElapsed >= REGULATION_FIRST_HALF_SECONDS;
  const hasSecondHalfMinimum =
    bypassMinimums || secondHalfElapsed >= REGULATION_FIRST_HALF_SECONDS;
  const hasExtraFirstHalfMinimum =
    bypassMinimums || extraFirstElapsed >= EXTRA_HALF_MINUTES * 60;
  const hasExtraSecondHalfMinimum =
    bypassMinimums || extraSecondElapsed >= EXTRA_HALF_MINUTES * 60;

  const minimumFirstHalfReason = t(
    "transitionMinimumFirstHalf",
    "Need at least 45:00 of global time from 1st half start (current {{clock}}).",
    { clock: formatSecondsAsClock(firstHalfElapsed) },
  );
  const minimumSecondHalfReason = t(
    "transitionMinimumSecondHalf",
    "Need at least 45:00 from 2nd half start (current {{clock}}).",
    { clock: formatSecondsAsClock(secondHalfElapsed) },
  );
  const minimumExtraFirstHalfReason = t(
    "transitionMinimumExtraFirstHalf",
    "Need at least 15:00 from ET 1st half start (current {{clock}}).",
    { clock: formatSecondsAsClock(extraFirstElapsed) },
  );
  const minimumExtraSecondHalfReason = t(
    "transitionMinimumExtraSecondHalf",
    "Need at least 15:00 from ET 2nd half start (current {{clock}}).",
    { clock: formatSecondsAsClock(extraSecondElapsed) },
  );

  const guardTransition = useCallback(
    (target: Match["status"], fn?: () => void) => {
      if (!fn) return;
      const current = normalizeStatus(statusOverride);
      const phaseDerivedStatus =
        currentPhase === "NOT_STARTED"
          ? "Pending"
          : currentPhase === "FIRST_HALF"
            ? "Live_First_Half"
            : currentPhase === "HALFTIME"
              ? "Halftime"
              : currentPhase === "SECOND_HALF"
                ? "Live_Second_Half"
                : currentPhase === "FULLTIME"
                  ? "Fulltime"
                  : currentPhase === "FIRST_HALF_EXTRA_TIME"
                    ? "Live_Extra_First"
                    : currentPhase === "EXTRA_HALFTIME"
                      ? "Extra_Halftime"
                      : currentPhase === "SECOND_HALF_EXTRA_TIME"
                        ? "Live_Extra_Second"
                        : currentPhase === "PENALTIES"
                          ? "Penalties"
                          : currentPhase === "COMPLETED"
                            ? "Completed"
                            : undefined;
      const allowedStatus = phaseDerivedStatus ?? current;
      if (
        target === "Halftime" &&
        currentPhase === "FIRST_HALF" &&
        !hasFirstHalfMinimum
      ) {
        setTransitionError(minimumFirstHalfReason);
        return;
      }

      if (
        target === "Fulltime" &&
        currentPhase === "SECOND_HALF" &&
        !hasSecondHalfMinimum
      ) {
        setTransitionError(minimumSecondHalfReason);
        return;
      }

      if (
        target === "Extra_Halftime" &&
        currentPhase === "FIRST_HALF_EXTRA_TIME" &&
        !hasExtraFirstHalfMinimum
      ) {
        setTransitionError(minimumExtraFirstHalfReason);
        return;
      }

      if (
        (target === "Penalties" ||
          target === "Fulltime" ||
          target === "Completed") &&
        currentPhase === "SECOND_HALF_EXTRA_TIME" &&
        !hasExtraSecondHalfMinimum
      ) {
        setTransitionError(minimumExtraSecondHalfReason);
        return;
      }

      if (!isTransitionAllowed(target, allowedStatus)) {
        const canAutoAdvance =
          target === "Fulltime" &&
          ["Pending", "Live", "Live_First_Half", "Halftime"].includes(
            current as Match["status"],
          );

        if (!canAutoAdvance) {
          setTransitionError(
            `Transition not allowed: ${current} → ${target}. Follow Pending → Live_First_Half → Halftime → Live_Second_Half → Fulltime.`,
          );
          return;
        }
      }

      setTransitionError(null);
      fn();
    },
    [
      currentPhase,
      hasFirstHalfMinimum,
      hasSecondHalfMinimum,
      hasExtraFirstHalfMinimum,
      hasExtraSecondHalfMinimum,
      isTransitionAllowed,
      minimumFirstHalfReason,
      minimumSecondHalfReason,
      minimumExtraFirstHalfReason,
      minimumExtraSecondHalfReason,
      normalizeStatus,
      statusOverride,
    ],
  );

  const currentStatusNormalized = normalizeStatus(statusOverride);
  const canHalftime = isTransitionAllowed("Halftime");
  const canSecondHalf = isTransitionAllowed("Live_Second_Half");
  const canFulltime = isTransitionAllowed("Fulltime");

  const transitionGuardMessage = useMemo(
    () =>
      t(
        "transitionGuardMessage",
        "Follow order: Pending → Live_First_Half → Halftime → Live_Second_Half → Fulltime (current: {{status}}).",
        { status: currentStatusNormalized },
      ),
    [currentStatusNormalized, t],
  );

  return {
    currentStatusNormalized,
    canHalftime,
    canSecondHalf,
    canFulltime,
    transitionGuardMessage,
    transitionError,
    hasFirstHalfMinimum,
    hasSecondHalfMinimum,
    hasExtraFirstHalfMinimum,
    hasExtraSecondHalfMinimum,
    minimumFirstHalfReason,
    minimumSecondHalfReason,
    minimumExtraFirstHalfReason,
    minimumExtraSecondHalfReason,
    guardTransition,
    isTransitionAllowed,
  };
};
