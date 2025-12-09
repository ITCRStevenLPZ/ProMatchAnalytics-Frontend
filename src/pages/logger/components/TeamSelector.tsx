import { Match } from '../types';

interface TeamSelectorProps {
  match: Match;
  selectedTeam: 'home' | 'away' | 'both';
  onTeamChange: (team: 'home' | 'away' | 'both') => void;
  disabled?: boolean;
}

const TeamSelector = ({ match, selectedTeam, onTeamChange, disabled = false }: TeamSelectorProps) => (
  <div className="bg-white rounded-lg shadow p-4">
    <div className="flex gap-2">
      <button
        onClick={() => onTeamChange('home')}
        disabled={disabled}
        className={`flex-1 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          selectedTeam === 'home'
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        {match.home_team.short_name}
      </button>
      <button
        onClick={() => onTeamChange('away')}
        disabled={disabled}
        className={`flex-1 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          selectedTeam === 'away'
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        {match.away_team.short_name}
      </button>
      <button
        onClick={() => onTeamChange('both')}
        disabled={disabled}
        className={`flex-1 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          selectedTeam === 'both'
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        Both
      </button>
    </div>
  </div>
);

export default TeamSelector;
