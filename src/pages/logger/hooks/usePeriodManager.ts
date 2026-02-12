import { useState, useEffect, useCallback, useRef } from "react";
import { Match } from "../types";
import { updateMatchStatus } from "../../../lib/loggerApi";

export const FIRST_HALF_MINUTES = 45;
export const SECOND_HALF_MINUTES = 90; // Total match time
export const EXTRA_HALF_MINUTES = 15;
export const REGULATION_FIRST_HALF_SECONDS = FIRST_HALF_MINUTES * 60;
export const REGULATION_SECOND_HALF_SECONDS = SECOND_HALF_MINUTES * 60;
export const EXTRA_FIRST_HALF_END_SECONDS =
  REGULATION_SECOND_HALF_SECONDS + EXTRA_HALF_MINUTES * 60; // 105:00
export const EXTRA_SECOND_HALF_END_SECONDS =
  EXTRA_FIRST_HALF_END_SECONDS + EXTRA_HALF_MINUTES * 60; // 120:00

export type PeriodPhase =
  | "NOT_STARTED"
  | "FIRST_HALF"
  | "FIRST_HALF_EXTRA_TIME"
  | "HALFTIME"
  | "EXTRA_HALFTIME"
  | "SECOND_HALF"
  | "SECOND_HALF_EXTRA_TIME"
  | "PENALTIES"
  | "FULLTIME"
  | "COMPLETED";

interface PeriodInfo {
  period: number;
  phase: PeriodPhase;
  isExtraTime: boolean;
  extraTimeSeconds: number;
  shouldShowExtraTimeWarning: boolean;
  canTransitionToHalftime: boolean;
  canTransitionToSecondHalf: boolean;
  canTransitionToFulltime: boolean;
  canTransitionToExtraTimeFirst: boolean;
  canTransitionToExtraHalftime: boolean;
  canTransitionToExtraTimeSecond: boolean;
  canTransitionToPenalties: boolean;
  canFinishMatch: boolean;
}

// Map match status to phase
const statusToPhase = (status: string | undefined): PeriodPhase | null => {
  switch (status) {
    case "Scheduled":
    case "Pending":
      return "NOT_STARTED";
    case "Live":
    case "Live_First_Half":
      return "FIRST_HALF";
    case "Halftime":
      return "HALFTIME";
    case "Live_Second_Half":
      return "SECOND_HALF";
    case "Live_Extra_First":
      return "FIRST_HALF_EXTRA_TIME";
    case "Extra_Halftime":
      return "EXTRA_HALFTIME";
    case "Live_Extra_Second":
      return "SECOND_HALF_EXTRA_TIME";
    case "Penalties":
      return "PENALTIES";
    case "Fulltime":
      return "FULLTIME";
    case "Completed":
      return "COMPLETED";
    default:
      return null;
  }
};

export const usePeriodManager = (
  match: Match | null,
  effectiveTime: number,
  globalTimeSeconds: number,
  clockMode: "EFFECTIVE" | "INEFFECTIVE",
  isClockRunning: boolean,
  handleModeSwitch: (mode: "EFFECTIVE" | "INEFFECTIVE") => void,
  fetchMatch: () => void,
  onTransitionError?: (info: {
    target: Match["status"];
    error: unknown;
  }) => void,
) => {
  const [currentPhase, setCurrentPhase] = useState<PeriodPhase>("NOT_STARTED");
  const [operatorPeriod, setOperatorPeriod] = useState(1);
  const [showExtraTimeAlert, setShowExtraTimeAlert] = useState(false);
  const lastMatchIdRef = useRef<string | null>(null);

  const phaseRank: Record<PeriodPhase, number> = {
    NOT_STARTED: 0,
    FIRST_HALF: 1,
    HALFTIME: 2,
    SECOND_HALF: 3,
    FULLTIME: 4, // End of Regulation
    FIRST_HALF_EXTRA_TIME: 5,
    EXTRA_HALFTIME: 6,
    SECOND_HALF_EXTRA_TIME: 7,
    PENALTIES: 8,
    COMPLETED: 9,
  };

  // Initialize phase from match status (monotonic: never regress the phase)
  useEffect(() => {
    if (!match?.status) return;

    const isResetMatch =
      match.status === "Pending" &&
      (match.match_time_seconds || 0) === 0 &&
      (match.ineffective_time_seconds || 0) === 0 &&
      !match.current_period_start_timestamp &&
      (!match.period_timestamps ||
        Object.keys(match.period_timestamps).length === 0);

    if (isResetMatch) {
      setCurrentPhase("NOT_STARTED");
      setOperatorPeriod(1);
      return;
    }

    const phaseFromStatus = statusToPhase(match.status);
    if (!phaseFromStatus) return;

    setCurrentPhase((prev) => {
      // If we are already in a later phase locally, don't regress unless explicit reset.
      if (phaseRank[phaseFromStatus] < phaseRank[prev]) return prev;
      return phaseFromStatus;
    });
  }, [
    match?.status,
    match?.match_time_seconds,
    match?.ineffective_time_seconds,
    match?.current_period_start_timestamp,
    match?.period_timestamps,
  ]);

  useEffect(() => {
    if (!match?.id) return;
    if (lastMatchIdRef.current && lastMatchIdRef.current !== match.id) {
      const nextPhase = statusToPhase(match.status) ?? "NOT_STARTED";
      setCurrentPhase(nextPhase);
      setShowExtraTimeAlert(false);
      if (nextPhase === "SECOND_HALF") setOperatorPeriod(2);
      else if (nextPhase === "FIRST_HALF_EXTRA_TIME") setOperatorPeriod(3);
      else if (nextPhase === "SECOND_HALF_EXTRA_TIME") setOperatorPeriod(4);
      else if (nextPhase === "PENALTIES") setOperatorPeriod(5);
      else setOperatorPeriod(1);
    }
    lastMatchIdRef.current = match.id;
  }, [match?.id, match?.status]);

  // Update operator period based on phase
  useEffect(() => {
    if (currentPhase === "SECOND_HALF") setOperatorPeriod(2);
    else if (currentPhase === "FIRST_HALF_EXTRA_TIME") setOperatorPeriod(3);
    else if (currentPhase === "SECOND_HALF_EXTRA_TIME") setOperatorPeriod(4);
    else if (currentPhase === "PENALTIES") setOperatorPeriod(5);
    else if (currentPhase === "FIRST_HALF") setOperatorPeriod(1);
    // Halftimes keep previous period usually, or next?
    // Standard: Halftime is technically end of P1, Extra Halftime end of P3.
    // Let's stick to simple mapping:
  }, [currentPhase]);

  // Calculate current period info based on effective time and current phase
  const getPeriodInfo = useCallback((): PeriodInfo => {
    let phase: PeriodPhase = currentPhase;
    let period = operatorPeriod;
    let isExtraTime =
      currentPhase === "FIRST_HALF_EXTRA_TIME" ||
      currentPhase === "EXTRA_HALFTIME" ||
      currentPhase === "SECOND_HALF_EXTRA_TIME";
    let extraTimeSeconds = 0;
    let shouldShowExtraTimeWarning = false;
    const periodKey =
      currentPhase === "FIRST_HALF"
        ? "1"
        : currentPhase === "SECOND_HALF"
          ? "2"
          : currentPhase === "FIRST_HALF_EXTRA_TIME"
            ? "3"
            : currentPhase === "SECOND_HALF_EXTRA_TIME"
              ? "4"
              : null;
    const rawStartSeconds = periodKey
      ? match?.period_timestamps?.[periodKey]?.global_start_seconds
      : null;
    const fallbackStartSeconds =
      currentPhase === "FIRST_HALF"
        ? 0
        : currentPhase === "SECOND_HALF"
          ? REGULATION_FIRST_HALF_SECONDS
          : currentPhase === "FIRST_HALF_EXTRA_TIME"
            ? REGULATION_SECOND_HALF_SECONDS
            : currentPhase === "SECOND_HALF_EXTRA_TIME"
              ? EXTRA_FIRST_HALF_END_SECONDS
              : globalTimeSeconds;
    const startSeconds =
      typeof rawStartSeconds === "number"
        ? rawStartSeconds
        : fallbackStartSeconds;
    const elapsedSinceStart = Math.max(0, globalTimeSeconds - startSeconds);

    const canTransitionToHalftime = currentPhase === "FIRST_HALF";
    const canTransitionToSecondHalf = currentPhase === "HALFTIME";
    const canTransitionToFulltime = currentPhase === "SECOND_HALF"; // End of Regulation
    const canTransitionToExtraTimeFirst = currentPhase === "FULLTIME"; // From End of Regulation
    const canTransitionToExtraHalftime =
      currentPhase === "FIRST_HALF_EXTRA_TIME";
    const canTransitionToExtraTimeSecond = currentPhase === "EXTRA_HALFTIME";
    const canTransitionToPenalties = currentPhase === "SECOND_HALF_EXTRA_TIME";
    const canFinishMatch =
      currentPhase === "SECOND_HALF_EXTRA_TIME" || currentPhase === "PENALTIES";

    // Calculate extra time based on current phase and standard durations
    // P1: 45m, P2: 90m, P3: 105m, P4: 120m
    if (currentPhase === "FIRST_HALF") {
      period = 1;
      if (elapsedSinceStart >= REGULATION_FIRST_HALF_SECONDS) {
        extraTimeSeconds = elapsedSinceStart - REGULATION_FIRST_HALF_SECONDS;
        shouldShowExtraTimeWarning = true;
      }
    } else if (currentPhase === "SECOND_HALF") {
      period = 2;
      if (elapsedSinceStart >= REGULATION_FIRST_HALF_SECONDS) {
        extraTimeSeconds = elapsedSinceStart - REGULATION_FIRST_HALF_SECONDS;
        shouldShowExtraTimeWarning = true;
      }
    } else if (currentPhase === "FIRST_HALF_EXTRA_TIME") {
      period = 3;
      if (elapsedSinceStart >= EXTRA_HALF_MINUTES * 60) {
        extraTimeSeconds = elapsedSinceStart - EXTRA_HALF_MINUTES * 60;
        shouldShowExtraTimeWarning = true;
      }
    } else if (currentPhase === "SECOND_HALF_EXTRA_TIME") {
      period = 4;
      if (elapsedSinceStart >= EXTRA_HALF_MINUTES * 60) {
        extraTimeSeconds = elapsedSinceStart - EXTRA_HALF_MINUTES * 60;
        shouldShowExtraTimeWarning = true;
      }
    }

    return {
      period,
      phase,
      isExtraTime,
      extraTimeSeconds,
      shouldShowExtraTimeWarning,
      canTransitionToHalftime,
      canTransitionToSecondHalf,
      canTransitionToFulltime,
      canTransitionToExtraTimeFirst,
      canTransitionToExtraHalftime,
      canTransitionToExtraTimeSecond,
      canTransitionToPenalties,
      canFinishMatch,
    };
  }, [effectiveTime, currentPhase, operatorPeriod, globalTimeSeconds, match]);

  const periodInfo = getPeriodInfo();

  // Show extra time alert
  useEffect(() => {
    if (
      periodInfo.shouldShowExtraTimeWarning &&
      isClockRunning &&
      clockMode === "EFFECTIVE"
    ) {
      setShowExtraTimeAlert(true);
    }
  }, [periodInfo.shouldShowExtraTimeWarning, isClockRunning, clockMode]);

  // Transition Helpers
  const performTransition = async (
    targetPhase: PeriodPhase,
    targetStatus: Match["status"],
    targetMode: "EFFECTIVE" | "INEFFECTIVE" | null,
  ) => {
    if (!match) return false;
    console.log(`🔄 Transitioning to ${targetPhase}...`);

    setCurrentPhase(targetPhase);
    setShowExtraTimeAlert(false);

    if (targetMode) {
      await handleModeSwitch(targetMode);
    }

    try {
      await updateMatchStatus(match.id, targetStatus);
      console.log(`✅ Match status updated to ${targetStatus}`);
      fetchMatch();
      return true;
    } catch (error) {
      console.error(`Failed to transition to ${targetStatus}:`, error);
      onTransitionError?.({ target: targetStatus as Match["status"], error });
      return false;
    }
  };

  const transitionToHalftime = () =>
    performTransition("HALFTIME", "Halftime", null);
  const transitionToSecondHalf = () =>
    performTransition("SECOND_HALF", "Live_Second_Half", "EFFECTIVE");
  const transitionToFulltime = () =>
    performTransition("FULLTIME", "Fulltime", null);

  const transitionToExtraFirst = () =>
    performTransition("FIRST_HALF_EXTRA_TIME", "Live_Extra_First", "EFFECTIVE");
  const transitionToExtraHalftime = () =>
    performTransition("EXTRA_HALFTIME", "Extra_Halftime", null);
  const transitionToExtraSecond = () =>
    performTransition(
      "SECOND_HALF_EXTRA_TIME",
      "Live_Extra_Second",
      "EFFECTIVE",
    );
  const transitionToPenalties = () =>
    performTransition("PENALTIES", "Penalties", null);
  // Treat "match finished" as the standard Fulltime state to align with backend enums.
  const finishMatch = () => performTransition("COMPLETED", "Completed", null);

  const dismissExtraTimeAlert = useCallback(() => {
    setShowExtraTimeAlert(false);
  }, []);

  return {
    operatorPeriod,
    currentPhase,
    periodInfo,
    showExtraTimeAlert,
    transitionToHalftime,
    transitionToSecondHalf,
    transitionToFulltime,
    transitionToExtraFirst,
    transitionToExtraHalftime,
    transitionToExtraSecond,
    transitionToPenalties,
    finishMatch,
    dismissExtraTimeAlert,
  };
};
