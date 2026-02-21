interface DuplicateHighlight {
  match_clock: string;
  period: number | string;
  existing_event_id?: string | null;
}

interface DuplicateStats {
  count: number;
  lastEventType?: string;
  lastMatchClock?: string;
}

interface DuplicateHighlightBannerProps {
  t: any;
  duplicateHighlight: DuplicateHighlight;
  duplicateStats: DuplicateStats;
  duplicateDetailsDefault: string;
  duplicateSessionDetailsSuffix: string;
  duplicateSessionSummaryDefault: string;
  duplicateExistingEventDefault: string;
  lastDuplicateTeamName: string | null;
  lastDuplicateSeenAt: string | null;
  onDismiss: () => void;
  onResetDuplicateStats: () => void;
}

export default function DuplicateHighlightBanner({
  t,
  duplicateHighlight,
  duplicateStats,
  duplicateDetailsDefault,
  duplicateSessionDetailsSuffix,
  duplicateSessionSummaryDefault,
  duplicateExistingEventDefault,
  lastDuplicateTeamName,
  lastDuplicateSeenAt,
  onDismiss,
  onResetDuplicateStats,
}: DuplicateHighlightBannerProps) {
  return (
    <div
      className="w-full max-w-none px-4 sm:px-6 xl:px-8 2xl:px-10 pt-4"
      data-testid="duplicate-banner"
    >
      <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">
            {t("duplicateNotice", "Already logged")}
          </p>
          <p className="text-sm">
            {t("duplicateDetails", {
              matchClock: duplicateHighlight.match_clock,
              period: duplicateHighlight.period,
              defaultValue: duplicateDetailsDefault,
            })}
          </p>
          {duplicateStats.count > 0 && (
            <p className="text-xs mt-2 text-blue-700">
              {t("duplicateSessionSummary", {
                count: duplicateStats.count,
                details: duplicateSessionDetailsSuffix,
                teamName: lastDuplicateTeamName,
                eventType: duplicateStats.lastEventType,
                matchClock: duplicateStats.lastMatchClock,
                seenAt: lastDuplicateSeenAt,
                defaultValue: duplicateSessionSummaryDefault,
              })}
            </p>
          )}
          {duplicateHighlight.existing_event_id && (
            <p className="text-xs text-blue-600 mt-1 font-mono">
              {t("duplicateExistingEventId", {
                eventId: duplicateHighlight.existing_event_id,
                defaultValue: duplicateExistingEventDefault,
              })}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <button
            type="button"
            onClick={onDismiss}
            className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
          >
            {t("dismiss", "Dismiss")}
          </button>
          {duplicateStats.count > 0 && (
            <button
              type="button"
              onClick={onResetDuplicateStats}
              className="text-blue-600 hover:text-blue-800 text-xs font-semibold"
            >
              {t("resetDuplicateCounter", "Reset counter")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
