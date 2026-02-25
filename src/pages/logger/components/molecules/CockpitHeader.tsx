import { Clock, RotateCcw, Wifi, WifiOff } from "lucide-react";

interface CockpitHeaderProps {
  t: any;
  isConnected: boolean;
  queuedCount: number;
  isSubmitting: boolean;
  isAdmin: boolean;
  openResetModal: () => void;
  resetBlocked: boolean;
  resetTooltip?: string;
  undoError: string | null;
  viewMode?: "logger" | "analytics";
  setViewMode?: (mode: "logger" | "analytics") => void;
  matchTimeSeconds: number;
  statusOverride?: string | null;
  matchStatus?: string;
}

export default function CockpitHeader({
  t,
  isConnected,
  queuedCount,
  isSubmitting,
  isAdmin,
  openResetModal,
  resetBlocked,
  resetTooltip,
  undoError,
  matchTimeSeconds,
  statusOverride,
  matchStatus,
}: CockpitHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-slate-100">{t("cockpit")}</h1>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <span
                data-testid="connection-status"
                data-status="connected"
                className="flex items-center gap-1 text-green-600 text-sm"
              >
                <Wifi size={16} />
                {t("connected")}
              </span>
            ) : (
              <span
                data-testid="connection-status"
                data-status="disconnected"
                className="flex items-center gap-1 text-red-600 text-sm"
              >
                <WifiOff size={16} />
                {t("disconnected")}
              </span>
            )}
            {queuedCount > 0 && (
              <span
                data-testid="queued-badge"
                className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs"
              >
                {queuedCount} {t("queued")}
              </span>
            )}
            {isSubmitting && (
              <span
                className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs"
                data-testid="pending-ack-badge"
              >
                {t("waitingForServer", "Awaiting server confirmation…")}
              </span>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={openResetModal}
                data-testid="btn-reset-clock"
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                  resetBlocked
                    ? "text-red-300 border-red-100 cursor-not-allowed"
                    : "text-red-700 border-red-300 hover:bg-red-50"
                }`}
                title={resetTooltip}
              >
                <RotateCcw size={14} />
                {t("reset", "Reset")}
              </button>
            )}
          </div>
        </div>
        {undoError && (
          <p className="text-xs text-red-600 mt-1" data-testid="undo-error">
            {undoError}
          </p>
        )}

        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-400 font-mono font-bold">
            <Clock className="inline mr-1" size={16} />
            {Math.floor((matchTimeSeconds || 0) / 60)}:
            {String((matchTimeSeconds || 0) % 60).padStart(2, "0")}
          </div>
          {(() => {
            const statusForDisplay = (
              statusOverride ||
              matchStatus ||
              "Pending"
            ).toLowerCase();
            const colorClass =
              statusForDisplay === "live" ||
              statusForDisplay === "live_first_half"
                ? "bg-green-100 text-green-700"
                : statusForDisplay === "halftime"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-700";
            return (
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${colorClass}`}
              >
                {t(`status.${statusForDisplay}`)}
              </span>
            );
          })()}
        </div>
      </div>
    </>
  );
}
