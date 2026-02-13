import { AlertCircle, XCircle } from "lucide-react";
import { TFunction } from "i18next";

type CardSelection = "Yellow" | "Red" | "Cancelled";

interface QuickCardPanelProps {
  activeCard: CardSelection | null;
  onSelectCard: (card: CardSelection) => void;
  onCancelSelection: () => void;
  selectedTeam?: "home" | "away" | "both";
  onSelectTeam?: (team: "home" | "away") => void;
  disabled?: boolean;
  t: TFunction<"logger">;
}

const QuickCardPanel = ({
  activeCard,
  onSelectCard,
  onCancelSelection,
  selectedTeam = "home",
  onSelectTeam,
  disabled = false,
  t,
}: QuickCardPanelProps) => {
  const isActive = (card: CardSelection) => activeCard === card;

  return (
    <div className="bg-slate-800 rounded-lg shadow p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {t("cardPanelTitle", "Cards")}
        </div>
        {activeCard && (
          <button
            type="button"
            onClick={onCancelSelection}
            disabled={disabled}
            data-testid="card-selection-cancel"
            className="text-xs text-slate-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("cancel", "Cancel")}
          </button>
        )}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          data-testid="card-team-home"
          onClick={() => onSelectTeam?.("home")}
          className={`px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            selectedTeam !== "away"
              ? "bg-slate-700 text-slate-100 border-slate-500"
              : "bg-slate-900/40 text-slate-300 border-slate-700 hover:bg-slate-800"
          }`}
        >
          {t("homeTeam", "Home")}
        </button>
        <button
          type="button"
          disabled={disabled}
          data-testid="card-team-away"
          onClick={() => onSelectTeam?.("away")}
          className={`px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            selectedTeam === "away"
              ? "bg-slate-700 text-slate-100 border-slate-500"
              : "bg-slate-900/40 text-slate-300 border-slate-700 hover:bg-slate-800"
          }`}
        >
          {t("awayTeam", "Away")}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onSelectCard("Yellow")}
          disabled={disabled}
          data-testid="card-select-yellow"
          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isActive("Yellow")
              ? "bg-yellow-600 text-yellow-50 border border-yellow-300/70"
              : "bg-yellow-500/20 text-yellow-100 border border-yellow-400/40 hover:bg-yellow-500/30"
          }`}
        >
          <AlertCircle size={16} className="text-yellow-300" />
          {t("cardSelectYellow", "Yellow")}
        </button>
        <button
          type="button"
          onClick={() => onSelectCard("Red")}
          disabled={disabled}
          data-testid="card-select-red"
          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isActive("Red")
              ? "bg-red-600 text-red-50 border border-red-300/70"
              : "bg-red-500/20 text-red-100 border border-red-400/40 hover:bg-red-500/30"
          }`}
        >
          <AlertCircle size={16} className="text-red-300" />
          {t("cardSelectRed", "Red")}
        </button>
        <button
          type="button"
          onClick={() => onSelectCard("Cancelled")}
          disabled={disabled}
          data-testid="card-select-cancelled"
          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isActive("Cancelled")
              ? "bg-slate-600 text-white border border-slate-300/70"
              : "bg-slate-700/60 text-slate-100 border border-slate-500/50 hover:bg-slate-700"
          }`}
        >
          <XCircle size={16} className="text-slate-200" />
          {t("cardSelectCancel", "Cancel")}
        </button>
      </div>
      {activeCard && (
        <p className="mt-3 text-xs text-slate-300">
          {t("cardSelectPrompt", "Select a player for the card.")}
        </p>
      )}
    </div>
  );
};

export type { CardSelection };
export default QuickCardPanel;
