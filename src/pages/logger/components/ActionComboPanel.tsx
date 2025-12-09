import React from 'react';
import { TFunction } from 'i18next';
import { Zap, ArrowRight } from 'lucide-react';

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
    id: 'counter-attack',
    name: 'Counter Attack',
    description: 'Recovery → Pass → Shot sequence',
    actions: [
      { action: 'Recovery', outcome: 'Interception' },
      { action: 'Pass', outcome: 'Complete' },
    ],
    icon: <Zap size={16} />,
    color: 'bg-orange-500 hover:bg-orange-600',
    hotkey: '1',
  },
  {
    id: 'foul-to-card',
    name: 'Foul + Card',
    description: 'Foul with card shown',
    actions: [
      { action: 'Foul', outcome: 'Standard' },
    ],
    icon: <ArrowRight size={16} />,
    color: 'bg-red-500 hover:bg-red-600',
    hotkey: '2',
  },
  {
    id: 'build-up',
    name: 'Build-up Play',
    description: 'Multiple passes in sequence',
    actions: [
      { action: 'Pass', outcome: 'Complete' },
    ],
    icon: <ArrowRight size={16} />,
    color: 'bg-blue-500 hover:bg-blue-600',
    hotkey: '3',
  },
  {
    id: 'goal-sequence',
    name: 'Goal Sequence',
    description: 'Pass → Shot (Goal)',
    actions: [
      { action: 'Pass', outcome: 'Complete' },
      { action: 'Shot', outcome: 'Goal' },
    ],
    icon: <Zap size={16} />,
    color: 'bg-green-500 hover:bg-green-600',
    hotkey: '4',
  },
  {
    id: 'set-piece-goal',
    name: 'Set Piece → Goal',
    description: 'Corner/FK leading to goal',
    actions: [
      { action: 'Corner', outcome: 'Complete' },
      { action: 'Shot', outcome: 'Goal' },
    ],
    icon: <Zap size={16} />,
    color: 'bg-purple-500 hover:bg-purple-600',
    hotkey: '5',
  },
];

interface ActionComboPanelProps {
  onComboStart: (combo: ActionCombo) => void;
  activeCombo: ActionCombo | null;
  comboProgress: number;
  disabled?: boolean;
  t: TFunction<'logger'>;
}

const ActionComboPanel: React.FC<ActionComboPanelProps> = ({
  onComboStart,
  activeCombo,
  comboProgress,
  disabled = false,
  t,
}) => {
  return (
    <div className="bg-gray-900 rounded-lg p-3 mb-4" data-testid="action-combo-panel">
      <div className="flex items-center gap-2 mb-2">
        <Zap size={14} className="text-yellow-400" />
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          {t('combos', 'Quick Combos')}
        </span>
        {activeCombo && (
          <span className="text-xs text-yellow-400 ml-auto">
            Step {comboProgress + 1}/{activeCombo.actions.length}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {PRESET_COMBOS.map((combo) => {
          const isActive = activeCombo?.id === combo.id;
          return (
            <button
              key={combo.id}
              onClick={() => onComboStart(combo)}
              disabled={disabled || (activeCombo !== null && !isActive)}
              title={combo.description}
              className={`
                flex items-center gap-1.5 px-3 py-2 rounded-md text-white text-sm font-medium
                transition-all duration-150 whitespace-nowrap
                ${isActive 
                  ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-900' 
                  : ''}
                ${disabled || (activeCombo !== null && !isActive)
                  ? 'opacity-40 cursor-not-allowed' 
                  : combo.color}
              `}
            >
              {combo.icon}
              <span>{combo.name}</span>
              {combo.hotkey && (
                <kbd className="ml-1 text-xs bg-black/30 px-1.5 py-0.5 rounded">
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
                          ? 'bg-green-400' 
                          : i === comboProgress 
                            ? 'bg-yellow-400 animate-pulse' 
                            : 'bg-gray-600'
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
  const [activeCombo, setActiveCombo] = React.useState<ActionCombo | null>(null);
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
    
    setComboProgress(prev => prev + 1);
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
