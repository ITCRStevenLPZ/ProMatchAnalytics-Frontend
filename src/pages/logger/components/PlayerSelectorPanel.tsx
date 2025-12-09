import { useState } from 'react';
import { TFunction } from 'i18next';
import { Users, LayoutGrid, Map } from 'lucide-react';
import SoccerField from '../../../components/SoccerField';
import { Match, Player } from '../types';

interface PlayerSelectorPanelProps {
  match: Match;
  selectedPlayer: Player | null;
  selectedTeam: 'home' | 'away' | 'both';
  onPlayerClick: (player: Player) => void;
  t: TFunction<'logger'>;
}

const PlayerSelectorPanel = ({ match, selectedPlayer, selectedTeam, onPlayerClick, t }: PlayerSelectorPanelProps) => {
  const [viewMode, setViewMode] = useState<'list' | 'field'>('list');
  
  // Filter teams based on selected team
  const teamsToShow = selectedTeam === 'home'
    ? [{ labelColor: 'bg-red-600' as const, team: match.home_team, tone: 'home' as const }]
    : selectedTeam === 'away'
      ? [{ labelColor: 'bg-blue-600' as const, team: match.away_team, tone: 'away' as const }]
      : [
          { labelColor: 'bg-red-600' as const, team: match.home_team, tone: 'home' as const },
          { labelColor: 'bg-blue-600' as const, team: match.away_team, tone: 'away' as const },
        ];

  return (
    <div className="bg-white rounded-lg shadow p-6" data-testid="player-grid">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Users size={20} />
          {t('selectPlayer', 'Select Player')}
        </h2>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md ${
              viewMode === 'list'
                ? 'bg-white shadow text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="List View"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => setViewMode('field')}
            className={`p-1.5 rounded-md ${
              viewMode === 'field'
                ? 'bg-white shadow text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="Field View"
          >
            <Map size={18} />
          </button>
        </div>
      </div>

      {viewMode === 'field' ? (
        <div className="mb-6">
          <SoccerField
            homeTeamName={match.home_team.name}
            awayTeamName={match.away_team.name}
            homePlayers={match.home_team.players}
            awayPlayers={match.away_team.players}
            onPlayerClick={onPlayerClick}
          />
        </div>
      ) : (
        <div className="mb-6">
          {teamsToShow.map(({ labelColor, team, tone }) => (
            <div className="space-y-2" key={team.id}>
              <h3 className="font-medium text-gray-700 flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${labelColor}`}></span>
                {team.name}
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {team.players.map((player) => (
                  <button
                    key={player.id}
                    data-testid={`player-card-${player.id}`}
                    onClick={() => onPlayerClick(player)}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      selectedPlayer?.id === player.id
                        ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                        : tone === 'home'
                          ? 'bg-red-50/80 border-red-200 hover:border-red-300 hover:bg-red-50'
                          : 'bg-blue-50/80 border-blue-200 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900">#{player.jersey_number}</span>
                      <span className="text-xs text-gray-500 font-mono">
                        {player.position}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 truncate">{player.full_name}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlayerSelectorPanel;
