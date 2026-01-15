import { useState, useEffect, useCallback } from "react";
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
  | "SECOND_HALF"
  | "SECOND_HALF_EXTRA_TIME"
  | "FULLTIME";

interface PeriodInfo {
  period: number;
  phase: PeriodPhase;
  isExtraTime: boolean;
  extraTimeSeconds: number;
  shouldShowExtraTimeWarning: boolean;
  canTransitionToHalftime: boolean;
  canTransitionToSecondHalf: boolean;
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
    case "Completed":
      return "FULLTIME";
    default:
      return null;
  }
};

export const usePeriodManager = (
  match: Match | null,
  effectiveTime: number,
  clockMode: "EFFECTIVE" | "INEFFECTIVE" | "TIMEOFF",
  isClockRunning: boolean,
  handleModeSwitch: (mode: "EFFECTIVE" | "INEFFECTIVE" | "TIMEOFF") => void,
  fetchMatch: () => void,
  onTransitionError?: (info: {
    target: Match["status"];
    error: unknown;
  }) => void,
) => {
  const [currentPhase, setCurrentPhase] = useState<PeriodPhase>("NOT_STARTED");
  const [operatorPeriod, setOperatorPeriod] = useState(1);
  const [showExtraTimeAlert, setShowExtraTimeAlert] = useState(false);

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

    const phaseFromStatus = statusToPhase(match.status);
    if (!phaseFromStatus) return;

    setCurrentPhase((prev) => {
      // If we are already in a "later" phase locally, don't regress unless explicit reset
      // (Simplified: just trust backend for now, but handle periods carefully)
      return phaseFromStatus;
    });
  }, [match?.status]);

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
    let isExtraTime = false;
    let extraTimeSeconds = 0;
    let shouldShowExtraTimeWarning = false;

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
      if (effectiveTime >= REGULATION_FIRST_HALF_SECONDS) {
        extraTimeSeconds = effectiveTime - REGULATION_FIRST_HALF_SECONDS;
        shouldShowExtraTimeWarning = true;
      }
    } else if (currentPhase === "SECOND_HALF") {
      period = 2;
      if (effectiveTime >= REGULATION_SECOND_HALF_SECONDS) {
        extraTimeSeconds = effectiveTime - REGULATION_SECOND_HALF_SECONDS;
        shouldShowExtraTimeWarning = true;
      }
    } else if (currentPhase === "FIRST_HALF_EXTRA_TIME") {
      period = 3;
      if (effectiveTime >= EXTRA_FIRST_HALF_END_SECONDS) {
        extraTimeSeconds = effectiveTime - EXTRA_FIRST_HALF_END_SECONDS;
        shouldShowExtraTimeWarning = true;
      }
    } else if (currentPhase === "SECOND_HALF_EXTRA_TIME") {
      period = 4;
      if (effectiveTime >= EXTRA_SECOND_HALF_END_SECONDS) {
        extraTimeSeconds = effectiveTime - EXTRA_SECOND_HALF_END_SECONDS;
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
  }, [effectiveTime, currentPhase, operatorPeriod]);

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
    targetMode: "EFFECTIVE" | "TIMEOFF",
  ) => {
    if (!match) return false;
    console.log(`🔄 Transitioning to ${targetPhase}...`);

    setCurrentPhase(targetPhase);
    setShowExtraTimeAlert(false);

    if (targetMode === "TIMEOFF") {
      await handleModeSwitch("TIMEOFF");
    } else {
      await handleModeSwitch("EFFECTIVE");
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
    performTransition("HALFTIME", "Halftime", "TIMEOFF");
  const transitionToSecondHalf = () =>
    performTransition("SECOND_HALF", "Live_Second_Half", "EFFECTIVE");
  const transitionToFulltime = () =>
    performTransition("FULLTIME", "Fulltime", "TIMEOFF");

  const transitionToExtraFirst = () =>
    performTransition("FIRST_HALF_EXTRA_TIME", "Live_Extra_First", "EFFECTIVE");
  const transitionToExtraHalftime = () =>
    performTransition("EXTRA_HALFTIME", "Extra_Halftime", "TIMEOFF");
  const transitionToExtraSecond = () =>
    performTransition(
      "SECOND_HALF_EXTRA_TIME",
      "Live_Extra_Second",
      "EFFECTIVE",
    );
  const transitionToPenalties = () =>
    performTransition("PENALTIES", "Penalties", "TIMEOFF");
  // Treat "match finished" as the standard Fulltime state to align with backend enums.
  const finishMatch = () =>
    performTransition("FULLTIME", "Fulltime", "TIMEOFF");

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
