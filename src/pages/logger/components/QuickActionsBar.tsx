import React from 'react';
import { TFunction } from 'i18next';
import { 
  ArrowRight, 
  Target, 
  AlertTriangle, 
  Square,
  Shuffle,
  Flag,
  Hand,
  CornerUpRight,
} from 'lucide-react';

interface QuickAction {
  id: string;
  action: string;
  icon: React.ReactNode;
  color: string;
  hotkey: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'pass', action: 'Pass', icon: <ArrowRight size={20} />, color: 'bg-blue-500 hover:bg-blue-600', hotkey: 'P' },
  { id: 'shot', action: 'Shot', icon: <Target size={20} />, color: 'bg-red-500 hover:bg-red-600', hotkey: 'S' },
  { id: 'duel', action: 'Duel', icon: <Shuffle size={20} />, color: 'bg-orange-500 hover:bg-orange-600', hotkey: 'D' },
  { id: 'foul', action: 'Foul', icon: <AlertTriangle size={20} />, color: 'bg-yellow-500 hover:bg-yellow-600', hotkey: 'F' },
  { id: 'card', action: 'Card', icon: <Square size={20} />, color: 'bg-red-600 hover:bg-red-700', hotkey: 'Y' },
  { id: 'corner', action: 'Corner', icon: <CornerUpRight size={20} />, color: 'bg-green-500 hover:bg-green-600', hotkey: 'K' },
  { id: 'offside', action: 'Offside', icon: <Flag size={20} />, color: 'bg-purple-500 hover:bg-purple-600', hotkey: 'O' },
  { id: 'save', action: 'Save', icon: <Hand size={20} />, color: 'bg-teal-500 hover:bg-teal-600', hotkey: 'V' },
];

interface QuickActionsBarProps {
  onQuickAction: (action: string) => void;
  selectedAction: string | null;
  disabled?: boolean;
  t: TFunction<'logger'>;
}

const QuickActionsBar: React.FC<QuickActionsBarProps> = ({
  onQuickAction,
  selectedAction,
  disabled = false,
  t,
}) => {
  return (
    <div className="bg-gray-800 rounded-lg p-2 mb-4" data-testid="quick-actions-bar">
      <div className="flex items-center gap-1 overflow-x-auto">
        <span className="text-gray-400 text-xs font-medium px-2 whitespace-nowrap">
          Quick:
        </span>
        {QUICK_ACTIONS.map((qa) => (
          <button
            key={qa.id}
            onClick={() => onQuickAction(qa.action)}
            disabled={disabled}
            className={`
              flex items-center gap-1.5 px-3 py-2 rounded-md text-white text-sm font-medium
              transition-all duration-150 whitespace-nowrap
              ${selectedAction === qa.action 
                ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800 scale-105' 
                : ''}
              ${disabled ? 'opacity-50 cursor-not-allowed' : qa.color}
            `}
            title={`${t(`action${qa.action}`, qa.action)} [${qa.hotkey}]`}
          >
            {qa.icon}
            <span className="hidden sm:inline">{t(`action${qa.action}`, qa.action)}</span>
            <kbd className="ml-1 text-xs bg-black/20 px-1.5 py-0.5 rounded">
              {qa.hotkey}
            </kbd>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActionsBar;
