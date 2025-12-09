import React from 'react';
import { TFunction } from 'i18next';
import { ArrowLeftRight } from 'lucide-react';
import { Match } from '../types';

interface PossessionIndicatorProps {
  match: Match;
  possession: 'home' | 'away';
  homeTeamColor?: string;
  awayTeamColor?: string;
  onTogglePossession: () => void;
  lastEventTeam?: 'home' | 'away' | null;
  t: TFunction<'logger'>;
}

const PossessionIndicator: React.FC<PossessionIndicatorProps> = ({
  match,
  possession,
  homeTeamColor = 'bg-red-500',
  awayTeamColor = 'bg-blue-500',
  onTogglePossession,
  lastEventTeam,
  t,
}) => {
  const isHome = possession === 'home';

  return (
    <div 
      className="flex items-center gap-2 bg-gray-100 rounded-lg p-2"
      data-testid="possession-indicator"
    >
      {/* Home Team Side */}
      <div 
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300
          ${isHome 
            ? `${homeTeamColor} text-white shadow-lg scale-105` 
            : 'bg-white text-gray-600 hover:bg-gray-50'}
        `}
      >
        <div className={`w-3 h-3 rounded-full ${isHome ? 'bg-white animate-pulse' : 'bg-gray-300'}`} />
        <span className="font-medium text-sm whitespace-nowrap">
          {match.home_team.short_name}
        </span>
        {lastEventTeam === 'home' && !isHome && (
          <span className="text-xs bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded animate-bounce">
            !
          </span>
        )}
      </div>

      {/* Toggle Button */}
      <button
        onClick={onTogglePossession}
        className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors"
        title={t('togglePossession', 'Toggle Possession')}
      >
        <ArrowLeftRight size={16} className="text-gray-600" />
      </button>

      {/* Away Team Side */}
      <div 
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300
          ${!isHome 
            ? `${awayTeamColor} text-white shadow-lg scale-105` 
            : 'bg-white text-gray-600 hover:bg-gray-50'}
        `}
      >
        <span className="font-medium text-sm whitespace-nowrap">
          {match.away_team.short_name}
        </span>
        <div className={`w-3 h-3 rounded-full ${!isHome ? 'bg-white animate-pulse' : 'bg-gray-300'}`} />
        {lastEventTeam === 'away' && isHome && (
          <span className="text-xs bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded animate-bounce">
            !
          </span>
        )}
      </div>
    </div>
  );
};

export default PossessionIndicator;

// Hook to manage possession state with auto-switch
export const usePossessionTracker = (initialTeam: 'home' | 'away' = 'home') => {
  const [possession, setPossession] = React.useState<'home' | 'away'>(initialTeam);
  const [lastEventTeam, setLastEventTeam] = React.useState<'home' | 'away' | null>(null);

  const togglePossession = React.useCallback(() => {
    setPossession(prev => prev === 'home' ? 'away' : 'home');
    setLastEventTeam(null);
  }, []);

  const setPossessionTeam = React.useCallback((team: 'home' | 'away') => {
    setPossession(team);
    setLastEventTeam(null);
  }, []);

  // Track last event team for "possession hint" feature
  const recordEventTeam = React.useCallback((team: 'home' | 'away') => {
    setLastEventTeam(team);
  }, []);

  // Auto-switch based on turnover events (interception, tackle, etc.)
  const handleTurnoverEvent = React.useCallback((fromTeam: 'home' | 'away') => {
    const newPossession = fromTeam === 'home' ? 'away' : 'home';
    setPossession(newPossession);
    setLastEventTeam(null);
  }, []);

  return {
    possession,
    lastEventTeam,
    togglePossession,
    setPossessionTeam,
    recordEventTeam,
    handleTurnoverEvent,
  };
};
