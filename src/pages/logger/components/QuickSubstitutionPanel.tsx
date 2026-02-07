import { ArrowRightLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

interface QuickSubstitutionPanelProps {
  onHomeSubstitution: () => void;
  onAwaySubstitution: () => void;
  homeTeamName: string;
  awayTeamName: string;
  disabled?: boolean;
}

const QuickSubstitutionPanel = ({
  onHomeSubstitution,
  onAwaySubstitution,
  homeTeamName,
  awayTeamName,
  disabled = false,
}: QuickSubstitutionPanelProps) => {
  const { t } = useTranslation("logger");

  return (
    <div className="grid grid-cols-2 gap-4 mt-2">
      <button
        type="button"
        onClick={onHomeSubstitution}
        disabled={disabled}
        data-testid="btn-sub-home"
        className="flex items-center justify-center gap-2 px-4 py-3 bg-red-900/30 text-red-100 border border-red-500/30 rounded-lg hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <ArrowRightLeft size={18} />
        <span className="font-medium truncate">
          {t("substitutionAction", { team: homeTeamName })}
        </span>
      </button>
      <button
        type="button"
        onClick={onAwaySubstitution}
        disabled={disabled}
        data-testid="btn-sub-away"
        className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-900/30 text-blue-100 border border-blue-500/30 rounded-lg hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <ArrowRightLeft size={18} />
        <span className="font-medium truncate">
          {t("substitutionAction", { team: awayTeamName })}
        </span>
      </button>
    </div>
  );
};

export default QuickSubstitutionPanel;
