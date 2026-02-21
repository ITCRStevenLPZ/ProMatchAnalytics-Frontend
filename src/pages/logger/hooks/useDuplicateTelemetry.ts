import { useMemo } from "react";
import type {
  DuplicateHighlight,
  DuplicateStats,
} from "../../../store/useMatchLogStore";
import type { Match } from "../types";

export interface UseDuplicateTelemetryResult {
  lastDuplicateTeamName: string | null;
  lastDuplicateSeenAt: string | null;
  lastDuplicateSummaryDetails: string;
  lastDuplicateSummaryDefault: string;
  duplicateSessionDetails: string;
  duplicateSessionDetailsSuffix: string;
  duplicateSessionSummaryDefault: string;
  duplicateDetailsDefault: string;
  duplicateExistingEventDefault: string;
}

export const useDuplicateTelemetry = (
  match: Match | null,
  duplicateStats: DuplicateStats,
  duplicateHighlight: DuplicateHighlight | null,
): UseDuplicateTelemetryResult => {
  return useMemo(() => {
    const lastDuplicateTeamName = duplicateStats.lastTeamId
      ? duplicateStats.lastTeamId === match?.home_team.id
        ? match.home_team.short_name
        : duplicateStats.lastTeamId === match?.away_team.id
          ? match.away_team.short_name
          : duplicateStats.lastTeamId
      : null;

    const lastDuplicateSeenAt = duplicateStats.lastSeenAt
      ? new Date(duplicateStats.lastSeenAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : null;

    const lastDuplicateSummaryParts: string[] = [
      duplicateStats.lastEventType || "Event",
    ];
    if (duplicateStats.lastMatchClock) {
      lastDuplicateSummaryParts.push(`@ ${duplicateStats.lastMatchClock}`);
    }
    if (lastDuplicateTeamName) {
      lastDuplicateSummaryParts.push(lastDuplicateTeamName);
    }
    if (lastDuplicateSeenAt) {
      lastDuplicateSummaryParts.push(`(${lastDuplicateSeenAt})`);
    }

    const lastDuplicateSummaryDetails = lastDuplicateSummaryParts.join(" • ");
    const lastDuplicateSummaryDefault = `Last: ${lastDuplicateSummaryDetails}`;

    const duplicateSessionParts: string[] = [];
    if (lastDuplicateTeamName) {
      duplicateSessionParts.push(`Last: ${lastDuplicateTeamName}`);
    }
    if (duplicateStats.lastEventType) {
      duplicateSessionParts.push(duplicateStats.lastEventType);
    }
    if (duplicateStats.lastMatchClock) {
      duplicateSessionParts.push(`@ ${duplicateStats.lastMatchClock}`);
    }
    if (lastDuplicateSeenAt) {
      duplicateSessionParts.push(lastDuplicateSeenAt);
    }

    const duplicateSessionDetails = duplicateSessionParts.join(" • ");
    const duplicateSessionDetailsSuffix = duplicateSessionParts.length
      ? ` • ${duplicateSessionDetails}`
      : "";
    const duplicateSessionSummaryDefault = `Session duplicates: ${duplicateStats.count}${duplicateSessionDetailsSuffix}`;
    const duplicateDetailsDefault = duplicateHighlight
      ? `An event is already recorded at ${duplicateHighlight.match_clock} (period ${duplicateHighlight.period}).`
      : "";
    const duplicateExistingEventDefault = duplicateHighlight?.existing_event_id
      ? `Existing event ID: ${duplicateHighlight.existing_event_id}`
      : "";

    return {
      lastDuplicateTeamName,
      lastDuplicateSeenAt,
      lastDuplicateSummaryDetails,
      lastDuplicateSummaryDefault,
      duplicateSessionDetails,
      duplicateSessionDetailsSuffix,
      duplicateSessionSummaryDefault,
      duplicateDetailsDefault,
      duplicateExistingEventDefault,
    };
  }, [duplicateHighlight, duplicateStats, match]);
};
