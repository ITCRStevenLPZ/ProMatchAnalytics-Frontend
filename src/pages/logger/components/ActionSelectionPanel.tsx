import { TFunction } from "i18next";
import { Player } from "../types";

interface ActionSelectionPanelProps {
  actions: string[];
  selectedPlayer: Player | null;
  isSubmitting: boolean;
  keyHints: Record<string, string>;
  onActionSelect: (action: string) => void;
  onCancel: () => void;
  t: TFunction<"logger">;
}

const getShortcutForAction = (
  action: string,
  keyHints: Record<string, string>,
) => {
  return Object.keys(keyHints).find(
    (key) => keyHints[key] === action && key === key.toUpperCase(),
  );
};

const ActionSelectionPanel = ({
  actions,
  selectedPlayer,
  isSubmitting,
  keyHints,
  onActionSelect,
  onCancel,
  t,
}: ActionSelectionPanelProps) => (
  <div
    className="bg-white rounded-lg shadow p-6"
    data-testid="action-selection"
  >
    <h2 className="text-lg font-semibold mb-4">
      {t("selectAction")} - {selectedPlayer?.full_name} #
      {selectedPlayer?.jersey_number}
    </h2>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {actions.map((action) => (
        <button
          key={action}
          onClick={() => onActionSelect(action)}
          disabled={isSubmitting}
          data-testid={`action-btn-${action}`}
          className={`py-4 rounded-lg font-medium transition-colors ${
            isSubmitting
              ? "bg-blue-300 text-white cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {t(`action${action}`)}
          <span className="block text-xs opacity-60 font-mono mt-1">
            [{getShortcutForAction(action, keyHints) ?? " "}]
          </span>
        </button>
      ))}
      <button
        onClick={onCancel}
        className="py-4 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium transition-colors"
      >
        {t("cancel")}
      </button>
    </div>
  </div>
);

export default ActionSelectionPanel;
