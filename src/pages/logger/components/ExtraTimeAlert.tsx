import React from "react";
import { AlertTriangle, Clock, ChevronRight } from "lucide-react";

interface ExtraTimeAlertProps {
  phase: "FIRST_HALF_EXTRA_TIME" | "SECOND_HALF_EXTRA_TIME";
  extraTimeSeconds: number;
  onTransition: () => void;
  onDismiss: () => void;
  t: any;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

export const ExtraTimeAlert: React.FC<ExtraTimeAlertProps> = ({
  phase,
  extraTimeSeconds,
  onTransition,
  onDismiss,
  t,
}) => {
  const isFirstHalf = phase === "FIRST_HALF_EXTRA_TIME";

  return (
    <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg shadow-md animate-pulse">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <AlertTriangle size={24} className="text-amber-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-amber-900">
              {isFirstHalf
                ? t("extraTime.firstHalfAlert", "First Half Extra Time")
                : t("extraTime.secondHalfAlert", "Second Half Extra Time")}
            </h3>
            <span className="inline-flex items-center gap-1 bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full text-xs font-mono font-bold">
              <Clock size={12} />+{formatTime(extraTimeSeconds)}
            </span>
          </div>

          <p className="text-sm text-amber-800 mb-3">
            {isFirstHalf
              ? t(
                  "extraTime.firstHalfMessage",
                  "The first half has exceeded 45 minutes. Transition to halftime when ready.",
                )
              : t(
                  "extraTime.secondHalfMessage",
                  "The second half has exceeded 45 minutes. You can end the match when ready.",
                )}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={onTransition}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition-colors shadow-sm"
            >
              {isFirstHalf
                ? t("extraTime.goToHalftime", "Go to Halftime")
                : t("extraTime.endMatch", "End Match")}
              <ChevronRight size={14} />
            </button>

            <button
              onClick={onDismiss}
              className="px-3 py-1.5 text-amber-700 hover:text-amber-900 text-sm font-medium"
            >
              {t("extraTime.continuePlay", "Continue Play")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExtraTimeAlert;
