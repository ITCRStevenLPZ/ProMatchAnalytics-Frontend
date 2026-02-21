import { useMemo } from "react";
import type { Match } from "../types";

interface UseCockpitStatusProjectionParams {
  match: Match | null;
}

interface CockpitStatusProjection {
  isZeroedMatch: boolean;
  statusOverride: Match["status"] | undefined;
  matchForPhase: Match | null;
}

export const useCockpitStatusProjection = ({
  match,
}: UseCockpitStatusProjectionParams): CockpitStatusProjection => {
  const isZeroedMatch = useMemo(() => {
    if (!match) return false;
    return (
      (match.match_time_seconds || 0) === 0 &&
      (match.ineffective_time_seconds || 0) === 0 &&
      !match.current_period_start_timestamp
    );
  }, [match]);

  const statusOverride = useMemo<Match["status"] | undefined>(() => {
    if (!match) return undefined;
    if (
      isZeroedMatch &&
      (match.status === "Fulltime" || match.status === "Completed")
    ) {
      return "Pending";
    }
    return match.status;
  }, [match, isZeroedMatch]);

  const matchForPhase = useMemo(() => {
    if (!match) return null;
    return { ...match, status: statusOverride ?? match.status } as Match;
  }, [match, statusOverride]);

  return {
    isZeroedMatch,
    statusOverride,
    matchForPhase,
  };
};
