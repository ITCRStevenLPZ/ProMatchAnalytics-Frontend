import React from "react";
import { TFunction } from "i18next";
import { Zap, ArrowRight } from "lucide-react";

interface ActionCombo {
  id: string;
  name: string;
  description: string;
  actions: { action: string; outcome?: string }[];
  icon: React.ReactNode;
  color: string;
  hotkey?: string;
}

const PRESET_COMBOS: ActionCombo[] = [
  {
    id: "counter-attack",
    name: "Counter Attack",
    description: "Recovery → Pass → Shot sequence",
    actions: [
      { action: "Recovery", outcome: "Interception" },
      { action: "Pass", outcome: "Complete" },
    ],
    icon: <Zap size={16} />,
    color: "bg-orange-500 hover:bg-orange-600",
    hotkey: "1",
  },
  {
    id: "foul-to-card",
    name: "Foul + Card",
    description: "Foul with card shown",
    actions: [{ action: "Foul", outcome: "Standard" }],
    icon: <ArrowRight size={16} />,
    color: "bg-red-500 hover:bg-red-600",
    hotkey: "2",
  },
  {
    id: "build-up",
    name: "Build-up Play",
    description: "Multiple passes in sequence",
    actions: [{ action: "Pass", outcome: "Complete" }],
    icon: <ArrowRight size={16} />,
    color: "bg-blue-500 hover:bg-blue-600",
    hotkey: "3",
  },
  {
    id: "goal-sequence",
    name: "Goal Sequence",
    description: "Pass → Shot (Goal)",
    actions: [
      { action: "Pass", outcome: "Complete" },
      { action: "Shot", outcome: "Goal" },
    ],
    icon: <Zap size={16} />,
    color: "bg-green-500 hover:bg-green-600",
    hotkey: "4",
  },
  {
    id: "set-piece-goal",
    name: "Set Piece → Goal",
    description: "Corner/FK leading to goal",
    actions: [
      { action: "Corner", outcome: "Complete" },
      { action: "Shot", outcome: "Goal" },
    ],
    icon: <Zap size={16} />,
    color: "bg-purple-500 hover:bg-purple-600",
    hotkey: "5",
  },
];

interface ActionComboPanelProps {
  onComboStart: (combo: ActionCombo) => void;
  activeCombo: ActionCombo | null;
  comboProgress: number;
  disabled?: boolean;
  t: TFunction<"logger">;
}

const ActionComboPanel: React.FC<ActionComboPanelProps> = ({
  onComboStart,
  activeCombo,
  comboProgress,
  disabled = false,
  t,
}) => {
  return (
    <div
      className="bg-gray-900 rounded-lg p-[clamp(0.7rem,0.55rem+0.35vw,1.2rem)] mb-4"
      data-testid="action-combo-panel"
    >
      <div className="flex items-center gap-[clamp(0.35rem,0.28rem+0.12vw,0.6rem)] mb-[clamp(0.4rem,0.32rem+0.16vw,0.7rem)]">
        <Zap size={16} className="text-yellow-400" />
        <span className="text-[clamp(0.68rem,0.6rem+0.2vw,0.92rem)] font-medium text-gray-400 uppercase tracking-wide">
          {t("combos", "Quick Combos")}
        </span>
        {activeCombo && (
          <span className="text-[clamp(0.68rem,0.6rem+0.2vw,0.92rem)] text-yellow-400 ml-auto">
            Step {comboProgress + 1}/{activeCombo.actions.length}
          </span>
        )}
      </div>
      <div className="flex items-center gap-[clamp(0.35rem,0.28rem+0.12vw,0.6rem)] overflow-x-auto pb-1">
        {PRESET_COMBOS.map((combo) => {
          const isActive = activeCombo?.id === combo.id;
          return (
            <button
              key={combo.id}
              onClick={() => onComboStart(combo)}
              disabled={disabled || (activeCombo !== null && !isActive)}
              title={combo.description}
              className={`
                flex items-center gap-[clamp(0.3rem,0.24rem+0.1vw,0.5rem)] px-[clamp(0.65rem,0.54rem+0.2vw,0.95rem)] py-[clamp(0.44rem,0.36rem+0.16vw,0.7rem)] rounded-md text-white text-[clamp(0.74rem,0.66rem+0.2vw,1rem)] font-medium
                transition-all duration-150 whitespace-nowrap
                ${
                  isActive
                    ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-900"
                    : ""
                }
                ${
                  disabled || (activeCombo !== null && !isActive)
                    ? "opacity-40 cursor-not-allowed"
                    : combo.color
                }
              `}
            >
              {combo.icon}
              <span>{combo.name}</span>
              {combo.hotkey && (
                <kbd className="ml-1 text-[clamp(0.62rem,0.56rem+0.14vw,0.82rem)] bg-black/30 px-[clamp(0.28rem,0.24rem+0.08vw,0.45rem)] py-[clamp(0.1rem,0.09rem+0.04vw,0.18rem)] rounded">
                  {combo.hotkey}
                </kbd>
              )}
              {isActive && (
                <div className="flex gap-0.5 ml-2">
                  {combo.actions.map((_, i) => (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full ${
                        i < comboProgress
                          ? "bg-green-400"
                          : i === comboProgress
                            ? "bg-yellow-400 animate-pulse"
                            : "bg-gray-600"
                      }`}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ActionComboPanel;
export type { ActionCombo };
export { PRESET_COMBOS };

// Hook to manage combo state
export const useActionCombo = () => {
  const [activeCombo, setActiveCombo] = React.useState<ActionCombo | null>(
    null,
  );
  const [comboProgress, setComboProgress] = React.useState(0);

  const startCombo = React.useCallback((combo: ActionCombo) => {
    setActiveCombo(combo);
    setComboProgress(0);
  }, []);

  const advanceCombo = React.useCallback(() => {
    if (!activeCombo) return false;

    if (comboProgress + 1 >= activeCombo.actions.length) {
      // Combo complete
      setActiveCombo(null);
      setComboProgress(0);
      return true; // Combo finished
    }

    setComboProgress((prev) => prev + 1);
    return false; // Combo still in progress
  }, [activeCombo, comboProgress]);

  const cancelCombo = React.useCallback(() => {
    setActiveCombo(null);
    setComboProgress(0);
  }, []);

  const getCurrentAction = React.useCallback(() => {
    if (!activeCombo) return null;
    return activeCombo.actions[comboProgress];
  }, [activeCombo, comboProgress]);

  return {
    activeCombo,
    comboProgress,
    startCombo,
    advanceCombo,
    cancelCombo,
    getCurrentAction,
  };
};
