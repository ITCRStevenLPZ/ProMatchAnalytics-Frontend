import { useTransitionGuards } from "./useTransitionGuards";
import type { Match } from "../types";
import type { PeriodPhase } from "./usePeriodManager";

interface UseCockpitTransitionStateParams {
  statusOverride?: Match["status"];
  currentPhase: PeriodPhase;
  globalTimeSeconds: number;
  match: Match | null;
  isAdmin: boolean;
  t: (key: string, fallback: string) => string;
}

export const useCockpitTransitionState = ({
  statusOverride,
  currentPhase,
  globalTimeSeconds,
  match,
  isAdmin,
  t,
}: UseCockpitTransitionStateParams) => {
  const transitionGuards = useTransitionGuards({
    statusOverride,
    currentPhase,
    globalTimeSeconds,
    match,
    t,
  });

  const cockpitLocked = currentPhase === "COMPLETED";
  const lockReason = cockpitLocked
    ? t("lockReasonFulltime", "Match is Fulltime. Cockpit is read-only.")
    : undefined;

  const transitionDisabled =
    cockpitLocked ||
    !isAdmin ||
    (currentPhase === "FIRST_HALF"
      ? !transitionGuards.canHalftime || !transitionGuards.hasFirstHalfMinimum
      : currentPhase === "HALFTIME"
        ? !transitionGuards.canSecondHalf
        : currentPhase === "FIRST_HALF_EXTRA_TIME"
          ? !transitionGuards.hasExtraFirstHalfMinimum
          : currentPhase === "SECOND_HALF"
            ? !transitionGuards.canFulltime ||
              !transitionGuards.hasSecondHalfMinimum
            : currentPhase === "SECOND_HALF_EXTRA_TIME"
              ? !transitionGuards.hasExtraSecondHalfMinimum
              : false);

  const transitionReason = cockpitLocked
    ? lockReason
    : !isAdmin
      ? t(
          "adminOnlyTransitions",
          "Admin only: match status changes are locked.",
        )
      : currentPhase === "FIRST_HALF" &&
          (!transitionGuards.canHalftime ||
            !transitionGuards.hasFirstHalfMinimum)
        ? !transitionGuards.hasFirstHalfMinimum
          ? transitionGuards.minimumFirstHalfReason
          : transitionGuards.transitionGuardMessage
        : currentPhase === "HALFTIME" && !transitionGuards.canSecondHalf
          ? transitionGuards.transitionGuardMessage
          : currentPhase === "FIRST_HALF_EXTRA_TIME" &&
              !transitionGuards.hasExtraFirstHalfMinimum
            ? transitionGuards.minimumExtraFirstHalfReason
            : currentPhase === "SECOND_HALF" &&
                (!transitionGuards.canFulltime ||
                  !transitionGuards.hasSecondHalfMinimum)
              ? !transitionGuards.hasSecondHalfMinimum
                ? transitionGuards.minimumSecondHalfReason
                : transitionGuards.transitionGuardMessage
              : currentPhase === "SECOND_HALF_EXTRA_TIME" &&
                  !transitionGuards.hasExtraSecondHalfMinimum
                ? transitionGuards.minimumExtraSecondHalfReason
                : undefined;

  return {
    ...transitionGuards,
    cockpitLocked,
    lockReason,
    transitionDisabled,
    transitionReason,
  };
};
