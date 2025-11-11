import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Plus, Edit, Trash2, Search, X, ChevronRight } from 'lucide-react';
import { apiClient } from '../lib/api';
import type { Team, TeamPlayer, PlayerPosition } from '../types';

interface Competition {
  competition_id: string;
  name: string;
}

interface Venue {
  venue_id: string;
  name: string;
  city: string;
}

interface Referee {
  referee_id: string;
  name: string;
}

interface Match {
  _id?: string;
  match_id: string;
  competition_id: string;
  home_team_id: string;
  away_team_id: string;
  match_date: string;
  kickoff_time: string;
  venue_id: string;
  referee_id?: string;
  status: string;
  home_lineup?: LineupPlayer[];
  away_lineup?: LineupPlayer[];
}

interface LineupPlayer {
  player_id: string;
  position: PlayerPosition;
  jersey_number: number;
  is_starter: boolean;
}

export default function MatchesManager() {
  const { t } = useTranslation('admin');
  const [matches, setMatches] = useState<Match[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [referees, setReferees] = useState<Referee[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editingItem, setEditingItem] = useState<Match | null>(null);

  // Wizard form data
  const [matchData, setMatchData] = useState<Partial<Match>>({
    match_id: '',
    competition_id: '',
    home_team_id: '',
    away_team_id: '',
    match_date: '',
    kickoff_time: '',
    venue_id: '',
    referee_id: '',
    status: 'scheduled',
    home_lineup: [],
    away_lineup: [],
  });

  // Team rosters for lineup builder
  const [homeRoster, setHomeRoster] = useState<TeamPlayer[]>([]);
  const [awayRoster, setAwayRoster] = useState<TeamPlayer[]>([]);

  useEffect(() => {
    fetchMatches();
    fetchCompetitions();
    fetchVenues();
    fetchReferees();
    fetchTeams();
  }, []);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.get<Match[]>('/matches/');
      setMatches(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errorFetchingData'));
    } finally {
      setLoading(false);
    }
  };

  const fetchCompetitions = async () => {
    try {
      const data = await apiClient.get<Competition[]>('/competitions/');
      setCompetitions(data);
    } catch (err) {
      console.error('Error fetching competitions:', err);
    }
  };

  const fetchVenues = async () => {
    try {
      const data = await apiClient.get<Venue[]>('/venues/');
      setVenues(data);
    } catch (err) {
      console.error('Error fetching venues:', err);
    }
  };

  const fetchReferees = async () => {
    try {
      const data = await apiClient.get<Referee[]>('/referees/');
      setReferees(data);
    } catch (err) {
      console.error('Error fetching referees:', err);
    }
  };

  const fetchTeams = async () => {
    try {
      const data = await apiClient.get<Team[]>('/teams/');
      setTeams(data);
    } catch (err) {
      console.error('Error fetching teams:', err);
    }
  };

  const fetchTeamRoster = async (teamId: string): Promise<TeamPlayer[]> => {
    try {
      const data = await apiClient.get<TeamPlayer[]>(`/teams/${teamId}/players`);
      return data;
    } catch (err) {
      console.error('Error fetching team roster:', err);
      return [];
    }
  };

  const handleTeamSelection = async () => {
    if (matchData.home_team_id) {
      const roster = await fetchTeamRoster(matchData.home_team_id);
      setHomeRoster(roster);
    }
    if (matchData.away_team_id) {
      const roster = await fetchTeamRoster(matchData.away_team_id);
      setAwayRoster(roster);
    }
  };

  const handleSubmit = async () => {
    try {
      if (editingItem) {
        await apiClient.put(`/matches/${editingItem.match_id}`, matchData);
      } else {
        await apiClient.post('/matches/', matchData);
      }
      await fetchMatches();
      handleCloseWizard();
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errorSavingData'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await apiClient.delete(`/matches/${id}`);
      await fetchMatches();
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errorDeletingData'));
    }
  };

  const handleEdit = (item: Match) => {
    setEditingItem(item);
    setMatchData(item);
    setShowWizard(true);
  };

  const handleCloseWizard = () => {
    setShowWizard(false);
    setWizardStep(1);
    setEditingItem(null);
    setMatchData({
      match_id: '',
      competition_id: '',
      home_team_id: '',
      away_team_id: '',
      match_date: '',
      kickoff_time: '',
      venue_id: '',
      referee_id: '',
      status: 'scheduled',
      home_lineup: [],
      away_lineup: [],
    });
    setHomeRoster([]);
    setAwayRoster([]);
  };

  const handleNextStep = async () => {
    if (wizardStep === 1) {
      // Validate basic info
      if (!matchData.match_id || !matchData.competition_id || !matchData.home_team_id || 
          !matchData.away_team_id || !matchData.match_date || !matchData.kickoff_time || !matchData.venue_id) {
        setError(t('required'));
        return;
      }
      await handleTeamSelection();
    }
    setWizardStep(wizardStep + 1);
  };

  const handlePreviousStep = () => {
    setWizardStep(wizardStep - 1);
  };

  const toggleLineupPlayer = (teamType: 'home' | 'away', player: TeamPlayer, isStarter: boolean) => {
    const lineupKey = teamType === 'home' ? 'home_lineup' : 'away_lineup';
    const currentLineup = matchData[lineupKey] || [];
    
    const existingIndex = currentLineup.findIndex(p => p.player_id === player.player_id);
    
    if (existingIndex >= 0) {
      // Remove player
      const newLineup = currentLineup.filter(p => p.player_id !== player.player_id);
      setMatchData({ ...matchData, [lineupKey]: newLineup });
    } else {
      // Add player
      const newPlayer: LineupPlayer = {
        player_id: player.player_id,
        position: player.position,
        jersey_number: player.jersey_number,
        is_starter: isStarter,
      };
      setMatchData({ ...matchData, [lineupKey]: [...currentLineup, newPlayer] });
    }
  };

  const isPlayerInLineup = (teamType: 'home' | 'away', playerId: string): boolean => {
    const lineupKey = teamType === 'home' ? 'home_lineup' : 'away_lineup';
    const lineup = matchData[lineupKey] || [];
    return lineup.some(p => p.player_id === playerId);
  };

  const getLineupCount = (teamType: 'home' | 'away', starterOnly: boolean = false): number => {
    const lineupKey = teamType === 'home' ? 'home_lineup' : 'away_lineup';
    const lineup = matchData[lineupKey] || [];
    return starterOnly ? lineup.filter(p => p.is_starter).length : lineup.length;
  };

  const getTeamName = (teamId: string): string => {
    const team = teams.find(t => t.team_id === teamId);
    return team?.name || teamId;
  };

  const getPositionBadgeColor = (position: PlayerPosition) => {
    switch (position) {
      case 'GK': return 'bg-purple-100 text-purple-800';
      case 'DF': return 'bg-blue-100 text-blue-800';
      case 'MF': return 'bg-green-100 text-green-800';
      case 'FW': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredMatches = matches.filter((item) =>
    getTeamName(item.home_team_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    getTeamName(item.away_team_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.match_date.includes(searchTerm)
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64">{t('loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Calendar className="h-8 w-8 text-purple-600" />
          <h1 className="text-3xl font-bold text-gray-900">{t('matches')}</h1>
        </div>
        <button onClick={() => setShowWizard(true)} className="btn btn-primary flex items-center space-x-2">
          <Plus className="h-5 w-5" />
          <span>{t('createMatch')}</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
      </div>

      <div className="card">
        {filteredMatches.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {searchTerm ? t('noData') : t('noMatches')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('matchDate')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('homeTeam')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('awayTeam')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('venue')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMatches.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {item.match_date} {item.kickoff_time}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{getTeamName(item.home_team_id)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{getTeamName(item.away_team_id)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {venues.find(v => v.venue_id === item.venue_id)?.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        item.status === 'completed' ? 'bg-green-100 text-green-800' :
                        item.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                      <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-900" title={t('edit')}>
                        <Edit className="h-5 w-5 inline" />
                      </button>
                      <button onClick={() => handleDelete(item.match_id)} className="text-red-600 hover:text-red-900" title={t('delete')}>
                        <Trash2 className="h-5 w-5 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Match Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <div>
                <h2 className="text-2xl font-bold">{editingItem ? t('edit') : t('createMatch')}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {t('competitionStage')} {wizardStep} / 3
                </p>
              </div>
              <button onClick={handleCloseWizard} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6">
              {/* Step Indicator */}
              <div className="flex items-center justify-center mb-8">
                <div className="flex items-center space-x-4">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                    wizardStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    1
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                    wizardStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    2
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                    wizardStep >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    3
                  </div>
                </div>
              </div>

              {/* Step 1: Basic Info */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">{t('details')}</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('id')} *</label>
                    <input
                      type="text"
                      required
                      disabled={!!editingItem}
                      value={matchData.match_id}
                      onChange={(e) => setMatchData({ ...matchData, match_id: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('competitions')} *</label>
                    <select
                      required
                      value={matchData.competition_id}
                      onChange={(e) => setMatchData({ ...matchData, competition_id: e.target.value })}
                      className="input w-full"
                    >
                      <option value="">Select...</option>
                      {competitions.map(comp => (
                        <option key={comp.competition_id} value={comp.competition_id}>
                          {comp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('homeTeam')} *</label>
                      <select
                        required
                        value={matchData.home_team_id}
                        onChange={(e) => setMatchData({ ...matchData, home_team_id: e.target.value })}
                        className="input w-full"
                      >
                        <option value="">{t('selectTeam')}</option>
                        {teams.map(team => (
                          <option key={team.team_id} value={team.team_id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('awayTeam')} *</label>
                      <select
                        required
                        value={matchData.away_team_id}
                        onChange={(e) => setMatchData({ ...matchData, away_team_id: e.target.value })}
                        className="input w-full"
                      >
                        <option value="">{t('selectTeam')}</option>
                        {teams.map(team => (
                          <option key={team.team_id} value={team.team_id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('matchDate')} *</label>
                      <input
                        type="date"
                        required
                        value={matchData.match_date}
                        onChange={(e) => setMatchData({ ...matchData, match_date: e.target.value })}
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('kickoffTime')} *</label>
                      <input
                        type="time"
                        required
                        value={matchData.kickoff_time}
                        onChange={(e) => setMatchData({ ...matchData, kickoff_time: e.target.value })}
                        className="input w-full"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('venue')} *</label>
                      <select
                        required
                        value={matchData.venue_id}
                        onChange={(e) => setMatchData({ ...matchData, venue_id: e.target.value })}
                        className="input w-full"
                      >
                        <option value="">Select...</option>
                        {venues.map(venue => (
                          <option key={venue.venue_id} value={venue.venue_id}>
                            {venue.name} - {venue.city}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('referee')}</label>
                      <select
                        value={matchData.referee_id}
                        onChange={(e) => setMatchData({ ...matchData, referee_id: e.target.value })}
                        className="input w-full"
                      >
                        <option value="">Select...</option>
                        {referees.map(ref => (
                          <option key={ref.referee_id} value={ref.referee_id}>
                            {ref.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Home Team Lineup */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">
                    {t('lineup')} - {getTeamName(matchData.home_team_id!)}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {t('starters')}: {getLineupCount('home', true)} | {t('substitutes')}: {getLineupCount('home', false) - getLineupCount('home', true)}
                  </p>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-3">{t('starters')}</h4>
                      <div className="space-y-2">
                        {homeRoster.filter(p => p.is_active).map(player => (
                          <div key={player.player_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-3">
                              <input
                                type="checkbox"
                                checked={isPlayerInLineup('home', player.player_id)}
                                onChange={() => toggleLineupPlayer('home', player, true)}
                                className="h-4 w-4"
                              />
                              <span className="font-semibold">#{player.jersey_number}</span>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getPositionBadgeColor(player.position)}`}>
                                {t(`positions.${player.position}`)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-3">{t('substitutes')}</h4>
                      <div className="space-y-2">
                        {homeRoster.filter(p => p.is_active).map(player => (
                          <div key={player.player_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-3">
                              <input
                                type="checkbox"
                                checked={isPlayerInLineup('home', player.player_id)}
                                onChange={() => toggleLineupPlayer('home', player, false)}
                                className="h-4 w-4"
                              />
                              <span className="font-semibold">#{player.jersey_number}</span>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getPositionBadgeColor(player.position)}`}>
                                {t(`positions.${player.position}`)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Away Team Lineup */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">
                    {t('lineup')} - {getTeamName(matchData.away_team_id!)}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {t('starters')}: {getLineupCount('away', true)} | {t('substitutes')}: {getLineupCount('away', false) - getLineupCount('away', true)}
                  </p>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-3">{t('starters')}</h4>
                      <div className="space-y-2">
                        {awayRoster.filter(p => p.is_active).map(player => (
                          <div key={player.player_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-3">
                              <input
                                type="checkbox"
                                checked={isPlayerInLineup('away', player.player_id)}
                                onChange={() => toggleLineupPlayer('away', player, true)}
                                className="h-4 w-4"
                              />
                              <span className="font-semibold">#{player.jersey_number}</span>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getPositionBadgeColor(player.position)}`}>
                                {t(`positions.${player.position}`)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-3">{t('substitutes')}</h4>
                      <div className="space-y-2">
                        {awayRoster.filter(p => p.is_active).map(player => (
                          <div key={player.player_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-3">
                              <input
                                type="checkbox"
                                checked={isPlayerInLineup('away', player.player_id)}
                                onChange={() => toggleLineupPlayer('away', player, false)}
                                className="h-4 w-4"
                              />
                              <span className="font-semibold">#{player.jersey_number}</span>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getPositionBadgeColor(player.position)}`}>
                                {t(`positions.${player.position}`)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between pt-6 border-t mt-6">
                <button
                  type="button"
                  onClick={wizardStep > 1 ? handlePreviousStep : handleCloseWizard}
                  className="btn btn-secondary"
                >
                  {wizardStep > 1 ? t('previous') : t('cancel')}
                </button>
                {wizardStep < 3 ? (
                  <button type="button" onClick={handleNextStep} className="btn btn-primary">
                    {t('next')} <ChevronRight className="h-5 w-5 inline ml-1" />
                  </button>
                ) : (
                  <button type="button" onClick={handleSubmit} className="btn btn-primary">
                    {t('save')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
