import { AlertCircle } from "lucide-react";

interface DuplicateTelemetryPanelProps {
  t: any;
  duplicateStats: {
    count: number;
    lastEventType?: string;
    lastMatchClock?: string;
  };
  lastDuplicateSummaryDetails: string;
  lastDuplicateSummaryDefault: string;
  lastDuplicateTeamName: string | null;
  lastDuplicateSeenAt: string | null;
  onResetDuplicateStats: () => void;
}

export default function DuplicateTelemetryPanel({
  t,
  duplicateStats,
  lastDuplicateSummaryDetails,
  lastDuplicateSummaryDefault,
  lastDuplicateTeamName,
  lastDuplicateSeenAt,
  onResetDuplicateStats,
}: DuplicateTelemetryPanelProps) {
  return (
    <div className="bg-white rounded-lg p-4 border border-blue-100 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
          <AlertCircle size={16} className="text-blue-500" />
          {t("duplicateTelemetry", "Duplicate telemetry")}
        </p>
        <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-1 rounded">
          {duplicateStats.count} {t("eventsLabel", "events")}
        </span>
      </div>
      <div className="text-sm text-gray-700">
        {duplicateStats.count > 0 ? (
          <>
            <p className="font-medium text-gray-900">
              {t("sessionDuplicates", "{{count}} duplicates this session", {
                count: duplicateStats.count,
              })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {t("lastDuplicateSummary", {
                details: lastDuplicateSummaryDetails,
                eventType: duplicateStats.lastEventType || "Event",
                matchClock: duplicateStats.lastMatchClock,
                teamName: lastDuplicateTeamName,
                seenAt: lastDuplicateSeenAt,
                defaultValue: lastDuplicateSummaryDefault,
              })}
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500">
            {t("noDuplicatesYet", "No duplicates detected this session.")}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onResetDuplicateStats}
        className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800 self-start"
        disabled={duplicateStats.count === 0}
      >
        {t("resetDuplicateCounter", "Reset counter")}
      </button>
    </div>
  );
}
