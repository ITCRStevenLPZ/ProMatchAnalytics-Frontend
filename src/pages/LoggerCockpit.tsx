import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useMatchLogStore } from '../store/useMatchLogStore';
import { useMatchSocket } from '../hooks/useMatchSocket';
import { 
  Clock, Users, 
  CheckCircle, XCircle, AlertCircle, Wifi, WifiOff
} from 'lucide-react';

// API Base URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Player {
  id: string;
  full_name: string;
  jersey_number: number;
  position: 'GK' | 'DF' | 'MF' | 'FW';
}

interface Team {
  id: string;
  name: string;
  short_name: string;
  players: Player[];
}

interface Match {
  id: string;
  home_team: Team;
  away_team: Team;
  status: 'Scheduled' | 'Live' | 'HalfTime' | 'Completed';
  match_time_seconds?: number;
}

type EventType = 'Pass' | 'Shot' | 'Duel' | 'FoulCommitted' | 'Card' | 'Substitution' | 'GameStoppage' | 'VARDecision';
type ActionStep = 'selectPlayer' | 'selectAction' | 'selectOutcome' | 'selectRecipient';

interface ActionConfig {
  actions: string[];
  outcomes?: Record<string, string[]>;
  needsRecipient?: boolean;
}

const ACTION_FLOWS: Record<string, ActionConfig> = {
  Pass: {
    actions: ['Pass'],
    outcomes: { Pass: ['Complete', 'Incomplete', 'Out'] },
    needsRecipient: true,
  },
  Shot: {
    actions: ['Shot'],
    outcomes: { Shot: ['Goal', 'OnTarget', 'OffTarget', 'Blocked'] },
  },
  Duel: {
    actions: ['Duel'],
    outcomes: { Duel: ['Won', 'Lost'] },
  },
  FoulCommitted: {
    actions: ['Foul'],
    outcomes: { Foul: ['Standard', 'Advantage'] },
  },
  Card: {
    actions: ['Card'],
    outcomes: { Card: ['Yellow', 'Red'] },
  },
  Carry: {
    actions: ['Carry'],
    outcomes: { Carry: ['Successful', 'Dispossessed'] },
  },
};

export default function LoggerCockpit() {
  const { t } = useTranslation('logger');
  const { matchId } = useParams();
  
  const { 
    isConnected, 
    liveEvents, 
    queuedEvents
  } = useMatchLogStore();
  
  const { sendEvent } = useMatchSocket({ 
    matchId: matchId!, 
    enabled: !!matchId 
  });
  
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<'home' | 'away'>('home');
  
  // Contextual menu state
  const [currentStep, setCurrentStep] = useState<ActionStep>('selectPlayer');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);

  // Fetch match data
  useEffect(() => {
    const fetchMatch = async () => {
      try {
        const response = await fetch(`${API_URL}/matches/${matchId}`);
        if (!response.ok) throw new Error('Failed to fetch match');
        const data = await response.json();
        setMatch(data);
      } catch (err: any) {
        setError(err.message || t('errorLoadingMatch'));
      } finally {
        setLoading(false);
      }
    };

    if (matchId) {
      fetchMatch();
    }
  }, [matchId, t]);

  // Note: WebSocket connection is automatically managed by useMatchSocket hook

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayer(player);
    setCurrentStep('selectAction');
    setSelectedAction(null);
    setSelectedOutcome(null);
  };

  const handleActionClick = (action: string) => {
    setSelectedAction(action);
    const actionConfig = Object.entries(ACTION_FLOWS).find(
      ([_, config]) => config.actions.includes(action)
    )?.[1];
    
    if (actionConfig?.outcomes) {
      setCurrentStep('selectOutcome');
    } else {
      // No outcomes, create event directly
      createEvent(action, null, null);
      resetFlow();
    }
  };

  const handleOutcomeClick = (outcome: string) => {
    setSelectedOutcome(outcome);
    
    const actionConfig = Object.entries(ACTION_FLOWS).find(
      ([_, config]) => config.actions.includes(selectedAction!)
    )?.[1];
    
    if (actionConfig?.needsRecipient) {
      setCurrentStep('selectRecipient');
    } else {
      createEvent(selectedAction!, outcome, null);
      resetFlow();
    }
  };

  const handleRecipientClick = (recipient: Player) => {
    createEvent(selectedAction!, selectedOutcome!, recipient);
    resetFlow();
  };

  const createEvent = (action: string, outcome: string | null, recipient: Player | null) => {
    if (!selectedPlayer || !match) return;

    // Determine event type
    let eventType: EventType = 'Pass';
    if (action === 'Pass') eventType = 'Pass';
    else if (action === 'Shot') eventType = 'Shot';
    else if (action === 'Duel') eventType = 'Duel';
    else if (action === 'Foul') eventType = 'FoulCommitted';
    else if (action === 'Card') eventType = 'Card';

    // Build event payload
    const eventData: any = {
      match_id: matchId,
      event_type: eventType,
      timestamp_utc: new Date().toISOString(),
      match_time_seconds: match.match_time_seconds || 0,
      period: match.status === 'Live' ? 1 : 2, // Simplified
      team_id: selectedTeam === 'home' ? match.home_team.id : match.away_team.id,
      player_id: selectedPlayer.id,
    };

    // Add type-specific data
    if (eventType === 'Pass') {
      eventData.data = {
        pass_type: 'Standard',
        outcome: outcome || 'Complete',
        receiver_id: recipient?.id,
        receiver_name: recipient?.full_name,
      };
    } else if (eventType === 'Shot') {
      eventData.data = {
        shot_type: 'Standard',
        outcome: outcome || 'OnTarget',
      };
    } else if (eventType === 'Duel') {
      eventData.data = {
        duel_type: 'Ground',
        outcome: outcome || 'Won',
      };
    } else if (eventType === 'FoulCommitted') {
      eventData.data = {
        foul_type: 'Standard',
        outcome: outcome || 'Standard',
      };
    } else if (eventType === 'Card') {
      eventData.data = {
        card_type: outcome || 'Yellow',
        reason: 'Foul',
      };
    }

    // Send event via WebSocket
    sendEvent(eventData);
  };

  const resetFlow = () => {
    setCurrentStep('selectPlayer');
    setSelectedPlayer(null);
    setSelectedAction(null);
    setSelectedOutcome(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">{t('loading')}</div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-red-600">{error || t('errorLoadingMatch')}</div>
      </div>
    );
  }

  const currentTeam = selectedTeam === 'home' ? match.home_team : match.away_team;
  const availableActions = selectedPlayer 
    ? Object.entries(ACTION_FLOWS).flatMap(([_, config]) => config.actions)
    : [];
  
  const availableOutcomes = selectedAction
    ? ACTION_FLOWS[selectedAction]?.outcomes?.[selectedAction] || []
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">{t('cockpit')}</h1>
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <span className="flex items-center gap-1 text-green-600 text-sm">
                    <Wifi size={16} />
                    {t('connected')}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600 text-sm">
                    <WifiOff size={16} />
                    {t('disconnected')}
                  </span>
                )}
                {queuedEvents.length > 0 && (
                  <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs">
                    {queuedEvents.length} {t('queued')}
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                <Clock className="inline mr-1" size={16} />
                {Math.floor((match.match_time_seconds || 0) / 60)}:{String((match.match_time_seconds || 0) % 60).padStart(2, '0')}
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                match.status === 'Live' ? 'bg-green-100 text-green-700' :
                match.status === 'HalfTime' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {t(`status.${match.status.toLowerCase()}`)}
              </span>
            </div>
          </div>
          
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xl font-semibold">
              {match.home_team.name} vs {match.away_team.name}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Team Selection & Player Grid */}
          <div className="lg:col-span-2 space-y-4">
            {/* Team Selector */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedTeam('home');
                    resetFlow();
                  }}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                    selectedTeam === 'home'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {match.home_team.short_name}
                </button>
                <button
                  onClick={() => {
                    setSelectedTeam('away');
                    resetFlow();
                  }}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                    selectedTeam === 'away'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {match.away_team.short_name}
                </button>
              </div>
            </div>

            {/* Contextual Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="text-blue-600 mt-0.5" size={20} />
                <div className="text-sm text-blue-800">
                  {currentStep === 'selectPlayer' && t('instructionSelectPlayer')}
                  {currentStep === 'selectAction' && t('instructionSelectAction', { player: selectedPlayer?.full_name })}
                  {currentStep === 'selectOutcome' && t('instructionSelectOutcome', { action: selectedAction })}
                  {currentStep === 'selectRecipient' && t('instructionSelectRecipient')}
                </div>
              </div>
            </div>

            {/* Player Grid */}
            {currentStep === 'selectPlayer' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Users size={20} />
                  {currentTeam.name} - {t('selectPlayer')}
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {currentTeam.players?.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => handlePlayerClick(player)}
                      className="aspect-square bg-primary-600 hover:bg-primary-700 text-white rounded-lg flex flex-col items-center justify-center transition-colors"
                    >
                      <div className="text-3xl font-bold">{player.jersey_number}</div>
                      <div className="text-xs text-center px-1 mt-1 line-clamp-2">{player.full_name}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action Selection */}
            {currentStep === 'selectAction' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4">
                  {t('selectAction')} - {selectedPlayer?.full_name} #{selectedPlayer?.jersey_number}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {availableActions.map((action) => (
                    <button
                      key={action}
                      onClick={() => handleActionClick(action)}
                      className="py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                      {t(`logger.action${action}`)}
                    </button>
                  ))}
                  <button
                    onClick={resetFlow}
                    className="py-4 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium transition-colors"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            )}

            {/* Outcome Selection */}
            {currentStep === 'selectOutcome' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4">
                  {t('selectOutcome')} - {selectedAction}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {availableOutcomes.map((outcome) => (
                    <button
                      key={outcome}
                      onClick={() => handleOutcomeClick(outcome)}
                      className="py-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                    >
                      {t(`logger.outcome${outcome}`)}
                    </button>
                  ))}
                  <button
                    onClick={resetFlow}
                    className="py-4 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium transition-colors"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            )}

            {/* Recipient Selection */}
            {currentStep === 'selectRecipient' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4">
                  {t('selectRecipient')} - {selectedAction}
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {currentTeam.players?.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => handleRecipientClick(player)}
                      className="aspect-square bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex flex-col items-center justify-center transition-colors"
                    >
                      <div className="text-3xl font-bold">{player.jersey_number}</div>
                      <div className="text-xs text-center px-1 mt-1 line-clamp-2">{player.full_name}</div>
                    </button>
                  ))}
                  <button
                    onClick={resetFlow}
                    className="aspect-square bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg flex items-center justify-center font-medium"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Live Event Feed */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-4 sticky top-4">
              <h2 className="text-lg font-semibold mb-4">{t('liveEvents')}</h2>
              <div className="space-y-2 max-h-[calc(100vh-12rem)] overflow-y-auto">
                {liveEvents.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-8">
                    {t('noEvents')}
                  </div>
                ) : (
                  liveEvents.slice().reverse().map((event, index) => (
                    <div
                      key={event._id || index}
                      className="border border-gray-200 rounded p-3 text-sm"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{event.type}</span>
                        <span className="text-xs text-gray-500">
                          {event.match_clock}
                        </span>
                      </div>
                      <div className="text-gray-600 text-xs">
                        {event.player_id || 'Team Event'}
                      </div>
                      {event.data && (
                        <div className="mt-1 flex items-center gap-1 text-xs">
                          {event.data.outcome === 'Complete' && <CheckCircle size={12} className="text-green-600" />}
                          {event.data.outcome === 'Incomplete' && <XCircle size={12} className="text-red-600" />}
                          {event.data.outcome && (
                            <span className="text-gray-500">{event.data.outcome}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
