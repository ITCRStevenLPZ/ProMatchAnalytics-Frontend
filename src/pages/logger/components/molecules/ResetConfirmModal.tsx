import { RotateCcw } from "../../../../components/icons";

interface ResetConfirmModalProps {
  show: boolean;
  isFulltime: boolean;
  resetBlocked: boolean;
  resetDisabledReason?: string;
  resetConfirmText: string;
  setResetConfirmText: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  t: any;
}

export default function ResetConfirmModal({
  show,
  isFulltime,
  resetBlocked,
  resetDisabledReason,
  resetConfirmText,
  setResetConfirmText,
  onCancel,
  onConfirm,
  t,
}: ResetConfirmModalProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
        <h3 className="text-lg font-bold mb-3 text-red-600 flex items-center gap-2">
          <RotateCcw size={20} />
          {t("confirmReset", "Confirm Reset")}
        </h3>
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-red-800 font-semibold mb-2">
            ⚠️ {t("warning", "WARNING")}
          </p>
          <p className="text-red-700 text-sm mb-1">
            {t(
              "resetWarning1",
              "This will permanently delete ALL logged events and reset all timers!",
            )}
          </p>
          <p className="text-red-700 text-sm">
            {t(
              "resetWarning2",
              "This action CANNOT be undone. All match data will be lost.",
            )}
          </p>
          {isFulltime && (
            <p className="text-red-700 text-sm mt-2">
              {t(
                "resetAfterFulltimeWarning",
                "Match is fulltime. Resetting will clear logs and restart clocks from zero.",
              )}
            </p>
          )}
          {resetBlocked && (
            <p className="text-red-700 text-sm mt-2">
              {resetDisabledReason ||
                t(
                  "resetBlockedUnsent",
                  "Unsent events detected. Clear queue/acks before resetting.",
                )}
            </p>
          )}
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t(
              "typeResetToConfirm",
              "Type RESET in capital letters to confirm:",
            )}
          </label>
          <input
            type="text"
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            placeholder="RESET"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
          >
            {t("cancel", "Cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={resetConfirmText !== "RESET"}
            data-testid="reset-confirm-button"
            className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("yesReset", "Yes, Reset")}
          </button>
        </div>
      </div>
    </div>
  );
}
