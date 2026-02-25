import { TFunction } from "i18next";
import {
  ArrowLeftRight,
  BarChart3,
  CornerUpLeft,
  List,
  Lock,
  Unlock,
} from "lucide-react";

interface TeamSelectorProps {
  isFlipped: boolean;
  onFlip: () => void;
  onUndo: () => void;
  undoDisabled: boolean;
  disabled?: boolean;
  viewMode?: "logger" | "analytics";
  setViewMode?: (mode: "logger" | "analytics") => void;
  dragLocked?: boolean;
  onToggleDragLock?: () => void;
  t: TFunction<"logger">;
}

const TeamSelector = ({
  isFlipped,
  onFlip,
  onUndo,
  undoDisabled,
  disabled = false,
  viewMode,
  setViewMode,
  dragLocked,
  onToggleDragLock,
  t,
}: TeamSelectorProps) => (
  <div className="bg-slate-800 rounded-lg shadow p-5 border border-slate-700">
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onFlip}
        disabled={disabled}
        data-testid="toggle-field-flip"
        className={`flex-1 inline-flex items-center justify-center gap-2.5 py-3.5 rounded-lg text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          disabled
            ? "text-slate-600 border border-slate-700"
            : isFlipped
              ? "text-amber-200 border border-amber-400/60 bg-amber-500/10 hover:bg-amber-500/20"
              : "text-slate-300 border border-slate-600 bg-slate-700 hover:bg-slate-600"
        }`}
      >
        <ArrowLeftRight size={20} />
        {t("flipField", "Flip field")}
      </button>
      <button
        type="button"
        onClick={onUndo}
        disabled={undoDisabled}
        data-testid="undo-button"
        className={`flex-1 inline-flex items-center justify-center gap-2.5 py-3.5 rounded-lg text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          undoDisabled
            ? "text-slate-600 border border-slate-700"
            : "text-slate-300 border border-slate-600 bg-slate-700 hover:bg-slate-600"
        }`}
      >
        <CornerUpLeft size={20} />
        {t("undoLast", "Undo last")}
      </button>
      {setViewMode && (
        <button
          type="button"
          data-testid="toggle-analytics"
          onClick={() =>
            setViewMode(viewMode === "analytics" ? "logger" : "analytics")
          }
          className={`flex-1 inline-flex items-center justify-center gap-2.5 py-3.5 rounded-lg text-base font-semibold transition-colors ${
            viewMode === "analytics"
              ? "text-purple-200 border border-purple-400/60 bg-purple-500/20 hover:bg-purple-500/30"
              : "text-purple-300 border border-purple-500/40 bg-purple-900/30 hover:bg-purple-900/50"
          }`}
        >
          {viewMode === "analytics" ? (
            <>
              <List size={20} />
              {t("logger.view", "Logger")}
            </>
          ) : (
            <>
              <BarChart3 size={20} />
              {t("logger.analytics", "Analytics")}
            </>
          )}
        </button>
      )}
      {onToggleDragLock && (
        <button
          type="button"
          data-testid="toggle-drag-lock"
          onClick={onToggleDragLock}
          className={`inline-flex items-center justify-center gap-2 px-3 py-3.5 rounded-lg text-base font-semibold transition-colors ${
            dragLocked
              ? "text-slate-400 border border-slate-600 bg-slate-700 hover:bg-slate-600"
              : "text-emerald-200 border border-emerald-400/60 bg-emerald-500/15 hover:bg-emerald-500/25"
          }`}
          title={
            dragLocked
              ? t("unlockDrag", "Unlock node dragging")
              : t("lockDrag", "Lock node dragging")
          }
        >
          {dragLocked ? <Lock size={20} /> : <Unlock size={20} />}
        </button>
      )}
    </div>
  </div>
);

export default TeamSelector;
