import { TFunction } from "i18next";
import { ArrowLeftRight, CornerUpLeft } from "lucide-react";

interface TeamSelectorProps {
  isFlipped: boolean;
  onFlip: () => void;
  onUndo: () => void;
  undoDisabled: boolean;
  disabled?: boolean;
  t: TFunction<"logger">;
}

const TeamSelector = ({
  isFlipped,
  onFlip,
  onUndo,
  undoDisabled,
  disabled = false,
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
    </div>
  </div>
);

export default TeamSelector;
