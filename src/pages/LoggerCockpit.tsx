import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useMatchLogStore, MatchEvent } from '../store/useMatchLogStore';
import { useMatchSocket } from '../hooks/useMatchSocket';
import {
  fetchLoggerWithAuth,
  LOGGER_API_URL,
  IS_E2E_TEST_MODE,
  fetchAllMatchEvents,
} from '../lib/loggerApi';
import { 
  Clock, Users, 
  CheckCircle, XCircle, AlertCircle, Wifi, WifiOff,
  Play, Pause, RotateCcw, CornerUpLeft
} from 'lucide-react';

// API helpers centralized in ../lib/loggerApi

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

interface LoggerHarness {
  resetFlow: () => void;
  setSelectedTeam: (team: 'home' | 'away') => void;
  getCurrentStep: () => ActionStep;
  sendPassEvent: (options: { team: 'home' | 'away'; passerId: string; recipientId: string }) => void;
  sendRawEvent: (payload: Record<string, any>) => void;
  getMatchContext: () => {
    matchId: string;
    homeTeamId: string;
    awayTeamId: string;
  };
  undoLastEvent: () => Promise<void> | void;
  getQueueSnapshot: () => QueueSnapshot;
}

interface QueuedEventSummary {
  match_id: string;
  timestamp: string;
  client_id?: string;
  type: string;
}

interface QueueSnapshot {
  currentMatchId: string | null;
  queuedEvents: QueuedEventSummary[];
  queuedEventsByMatch: Record<string, QueuedEventSummary[]>;
}

declare global {
  interface Window {
    __PROMATCH_LOGGER_HARNESS__?: LoggerHarness;
  }
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


const deriveShortName = (name?: string, fallback: string = 'TEAM') =>
  (name?.slice(0, 3).toUpperCase() ?? fallback);

const coercePlayers = (team: any, teamId: string): Player[] => {
  const source = Array.isArray(team?.players)
    ? team.players
    : Array.isArray(team?.lineup)
      ? team.lineup
      : [];

  return source.map((player: any, index: number) => ({
    id: player?.id ?? player?.player_id ?? `${teamId}-${index + 1}`,
    full_name: player?.full_name ?? player?.player_name ?? `Player ${index + 1}`,
    jersey_number: player?.jersey_number ?? index + 1,
    position: player?.position ?? 'MF',
  }));
};

const normalizeTeamFromApi = (team: any, fallbackLabel: string): Team => {
  const teamId = team?.id ?? team?.team_id ?? fallbackLabel;
  const name = team?.name ?? fallbackLabel;
  const shortName = team?.short_name ?? deriveShortName(name, fallbackLabel);

  return {
    id: teamId,
    name,
    short_name: shortName,
    players: coercePlayers(team, teamId),
  };
};

const normalizeMatchPayload = (payload: any): Match => {
  if (!payload) {
    throw new Error('Missing match payload');
  }

  return {
    id: payload.id ?? payload.match_id ?? 'match',
    match_time_seconds: payload.match_time_seconds ?? 0,
    status: payload.status ?? 'Live',
    home_team: normalizeTeamFromApi(payload.home_team, 'HOME'),
    away_team: normalizeTeamFromApi(payload.away_team, 'AWAY'),
  };
};

export default function LoggerCockpit() {
  const { t, ready: isLoggerReady } = useTranslation('logger');
  const { matchId } = useParams();
  
  const { 
    isConnected, 
    liveEvents, 
    queuedEvents,
    pendingAcks,
    undoStack,
    duplicateHighlight,
    duplicateStats,
    operatorClock,
    operatorPeriod,
    setOperatorClock,
    setOperatorPeriod,
    resetOperatorControls,
    setCurrentMatch,
    setLiveEvents,
    removeQueuedEvent,
    removeLiveEventByClientId,
    removeUndoCandidate,
    clearDuplicateHighlight,
    resetDuplicateStats,
    lastTimelineRefreshRequest,
  } = useMatchLogStore();
  const pendingAckCount = Object.keys(pendingAcks).length;
  const isSubmitting = pendingAckCount > 0;
  
  const { sendEvent, undoEvent } = useMatchSocket({ 
    matchId: matchId!, 
    enabled: !!matchId 
  });
  
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<'home' | 'away'>('home');
  const [isClockRunning, setClockRunning] = useState(false);
  const clockRef = useRef(operatorClock);
  const DEFAULT_PERIOD_MAP: Record<Match['status'], number> = {
    Scheduled: 1,
    Live: 1,
    HalfTime: 2,
    Completed: 2,
  };
  
  // Contextual menu state
  const [currentStep, setCurrentStep] = useState<ActionStep>('selectPlayer');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const currentStepRef = useRef<ActionStep>('selectPlayer');
  const [undoError, setUndoError] = useState<string | null>(null);

  // Fetch match data
  useEffect(() => {
    if (!matchId || !isLoggerReady) return;
    const fetchMatch = async () => {
      try {
        const response = await fetchLoggerWithAuth(`${LOGGER_API_URL}/matches/${matchId}`);
        if (!response.ok) {
          const errorPayload = await response.text().catch(() => '');
          console.error('Failed to fetch match payload', {
            status: response.status,
            statusText: response.statusText,
            body: errorPayload,
          });
          throw new Error('Failed to fetch match');
        }
        const data = await response.json();
        setMatch(normalizeMatchPayload(data));
      } catch (err: any) {
        setError(err.message || t('errorLoadingMatch'));
      } finally {
        setLoading(false);
      }
    };

    fetchMatch();
  }, [matchId, isLoggerReady, t]);

  const hydrateEvents = useCallback(async () => {
    if (!matchId) return;
    try {
      const events = await fetchAllMatchEvents(matchId);
      if (IS_E2E_TEST_MODE) {
        console.log('[hydrateEvents]', matchId, 'items', events.length);
      }
      setLiveEvents(events);
    } catch (err) {
      console.error('Failed to hydrate match events', err);
    }
  }, [matchId, setLiveEvents]);

  // Hydrate confirmed events from backend when match changes
  useEffect(() => {
    if (!matchId) return;
    setCurrentMatch(matchId);
    hydrateEvents();
  }, [matchId, setCurrentMatch, hydrateEvents]);

  // Rehydrate timeline whenever store requests an external refresh (e.g., ingestion resolution)
  useEffect(() => {
    if (!matchId || !lastTimelineRefreshRequest) return;
    hydrateEvents();
  }, [matchId, lastTimelineRefreshRequest, hydrateEvents]);

  useEffect(() => {
    if (!matchId) return;
    resetDuplicateStats();
  }, [matchId, resetDuplicateStats]);

  useEffect(() => {
    clockRef.current = operatorClock;
  }, [operatorClock]);

  useEffect(() => {
    if (!isClockRunning) return;
    const interval = setInterval(() => {
      const nextSeconds = parseClockInput(clockRef.current) + 1;
      setOperatorClock(formatMatchClock(nextSeconds));
    }, 1000);
    return () => clearInterval(interval);
  }, [isClockRunning, setOperatorClock]);

  useEffect(() => {
    if (!match) return;
    const defaultClock = formatMatchClock(match.match_time_seconds);
    const defaultPeriod = DEFAULT_PERIOD_MAP[match.status] ?? 1;
    resetOperatorControls({ clock: defaultClock, period: defaultPeriod });
    setClockRunning(false);
  }, [match, resetOperatorControls]);

  useEffect(() => {
    if (!duplicateHighlight) return;
    const timer = setTimeout(() => {
      clearDuplicateHighlight();
    }, 5000);
    return () => clearTimeout(timer);
  }, [duplicateHighlight, clearDuplicateHighlight]);

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

  const formatMatchClock = (seconds?: number): string => {
    const safeSeconds = Math.max(0, seconds ?? 0);
    const minutes = Math.floor(safeSeconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = Math.floor(safeSeconds % 60)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${secs}.000`;
  };

  const parseClockInput = (value: string): number => {
    if (!value) return 0;
    const [minPart = '0', rest = '0'] = value.split(':');
    const [secPart = '0', msPart = '0'] = rest.split('.');
    const minutes = Number(minPart) || 0;
    const seconds = Number(secPart) || 0;
    const millis = Number(msPart) || 0;
    return minutes * 60 + seconds + millis / 1000;
  };

  const createEvent = (action: string, outcome: string | null, recipient: Player | null) => {
    if (!selectedPlayer || !match || isSubmitting) return;

    // Determine event type
    let eventType: EventType = 'Pass';
    if (action === 'Pass') eventType = 'Pass';
    else if (action === 'Shot') eventType = 'Shot';
    else if (action === 'Duel') eventType = 'Duel';
    else if (action === 'Foul') eventType = 'FoulCommitted';
    else if (action === 'Card') eventType = 'Card';

    // Build event payload
    const eventData: Omit<MatchEvent, 'match_id' | 'timestamp'> = {
      match_clock: operatorClock?.trim()
        ? operatorClock
        : formatMatchClock(match.match_time_seconds),
      period: operatorPeriod,
      team_id: selectedTeam === 'home' ? match.home_team.id : match.away_team.id,
      player_id: selectedPlayer.id,
      type: eventType,
      data: {},
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

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  const sendHarnessPassEvent = useCallback(
    (options: { team: 'home' | 'away'; passerId: string; recipientId: string }) => {
      if (!match) return;
      const { team, passerId, recipientId } = options;
      const targetTeam = team === 'home' ? match.home_team : match.away_team;
      const passer = targetTeam.players?.find((player) => player.id === passerId);
      const recipient = targetTeam.players?.find((player) => player.id === recipientId);
      if (!passer || !recipient) return;

      const eventData: Omit<MatchEvent, 'match_id' | 'timestamp'> = {
        match_clock: operatorClock?.trim()
          ? operatorClock
          : formatMatchClock(match.match_time_seconds),
        period: operatorPeriod,
        team_id: targetTeam.id,
        player_id: passer.id,
        type: 'Pass',
        data: {
          pass_type: 'Standard',
          outcome: 'Complete',
          receiver_id: recipient.id,
          receiver_name: recipient.full_name,
        },
      };

      sendEvent(eventData);
    },
    [match, operatorClock, operatorPeriod, sendEvent]
  );

  const sendHarnessRawEvent = useCallback(
    (payload: Record<string, any>) => {
      sendEvent(payload as Omit<MatchEvent, 'match_id' | 'timestamp'>);
    },
    [sendEvent]
  );

  const lastUndoClientId = undoStack.length ? undoStack[undoStack.length - 1] : null;
  const lastUndoEvent = lastUndoClientId
    ? liveEvents.find((event) => event.client_id === lastUndoClientId) ||
      queuedEvents.find((event) => event.client_id === lastUndoClientId)
    : null;
  const undoRequiresConnection = Boolean(
    lastUndoClientId &&
      (pendingAcks[lastUndoClientId] || lastUndoEvent?._id)
  );
  const undoDisabled =
    !lastUndoEvent || (undoRequiresConnection && !isConnected);

  const handleUndoLastEvent = useCallback(async () => {
    if (!lastUndoClientId || !lastUndoEvent) {
      setUndoError(t('undoUnavailable', 'No event available to undo.'));
      return;
    }

    setUndoError(null);

    const isOfflineQueued = !pendingAcks[lastUndoClientId] && !lastUndoEvent._id;

    if (isOfflineQueued || !undoRequiresConnection) {
      removeLiveEventByClientId(lastUndoClientId);
      removeQueuedEvent(lastUndoEvent);
      removeUndoCandidate(lastUndoClientId);
      return;
    }

    try {
      undoEvent(lastUndoEvent);
    } catch (error) {
      console.error('Undo failed', error);
      setUndoError(
        t(
          'undoFailed',
          'Unable to undo the last event. Try again when the connection is back.'
        )
      );
    }
  }, [
    lastUndoClientId,
    lastUndoEvent,
    pendingAcks,
    removeLiveEventByClientId,
    removeQueuedEvent,
    removeUndoCandidate,
    t,
    undoEvent,
    undoRequiresConnection,
  ]);

  useEffect(() => {
    if (!IS_E2E_TEST_MODE || !match) return;

    window.__PROMATCH_LOGGER_HARNESS__ = {
      resetFlow,
      setSelectedTeam,
      getCurrentStep: () => currentStepRef.current,
      sendPassEvent: sendHarnessPassEvent,
      sendRawEvent: sendHarnessRawEvent,
      getMatchContext: () => ({
        matchId: match.id,
        homeTeamId: match.home_team.id,
        awayTeamId: match.away_team.id,
      }),
      undoLastEvent: () => handleUndoLastEvent(),
      getQueueSnapshot: () => {
        const summarize = (events: MatchEvent[]): QueuedEventSummary[] =>
          events.map((event) => ({
            match_id: event.match_id,
            timestamp: event.timestamp,
            client_id: event.client_id,
            type: event.type,
          }));
        const state = useMatchLogStore.getState();
        return {
          currentMatchId: state.currentMatchId,
          queuedEvents: summarize(state.queuedEvents),
          queuedEventsByMatch: Object.fromEntries(
            Object.entries(state.queuedEventsByMatch).map(([matchKey, events]) => [
              matchKey,
              summarize(events),
            ])
          ),
        };
      },
    };

    return () => {
      delete window.__PROMATCH_LOGGER_HARNESS__;
    };
  }, [
    match,
    resetFlow,
    setSelectedTeam,
    sendHarnessPassEvent,
    sendHarnessRawEvent,
    handleUndoLastEvent,
  ]);

  if (!isLoggerReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading logger interface…</div>
      </div>
    );
  }

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

  const lastDuplicateTeamName = duplicateStats.lastTeamId
    ? duplicateStats.lastTeamId === match.home_team.id
      ? match.home_team.short_name
      : duplicateStats.lastTeamId === match.away_team.id
        ? match.away_team.short_name
        : duplicateStats.lastTeamId
    : null;
  const lastDuplicateSeenAt = duplicateStats.lastSeenAt
    ? new Date(duplicateStats.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;
  const lastDuplicateSummaryParts: string[] = [
    duplicateStats.lastEventType || 'Event',
  ];
  if (duplicateStats.lastMatchClock) {
    lastDuplicateSummaryParts.push(`@ ${duplicateStats.lastMatchClock}`);
  }
  if (lastDuplicateTeamName) {
    lastDuplicateSummaryParts.push(lastDuplicateTeamName);
  }
  if (lastDuplicateSeenAt) {
    lastDuplicateSummaryParts.push(`(${lastDuplicateSeenAt})`);
  }
  const lastDuplicateSummaryDetails = lastDuplicateSummaryParts.join(' • ');
  const lastDuplicateSummaryDefault = `Last: ${lastDuplicateSummaryDetails}`;
  const duplicateSessionParts: string[] = [];
  if (lastDuplicateTeamName) {
    duplicateSessionParts.push(`Last: ${lastDuplicateTeamName}`);
  }
  if (duplicateStats.lastEventType) {
    duplicateSessionParts.push(duplicateStats.lastEventType);
  }
  if (duplicateStats.lastMatchClock) {
    duplicateSessionParts.push(`@ ${duplicateStats.lastMatchClock}`);
  }
  if (lastDuplicateSeenAt) {
    duplicateSessionParts.push(lastDuplicateSeenAt);
  }
  const duplicateSessionDetails = duplicateSessionParts.join(' • ');
  const duplicateSessionDetailsSuffix = duplicateSessionParts.length ? ` • ${duplicateSessionDetails}` : '';
  const duplicateSessionSummaryDefault = `Session duplicates: ${duplicateStats.count}${duplicateSessionDetailsSuffix}`;
  const duplicateDetailsDefault = duplicateHighlight
    ? `An event is already recorded at ${duplicateHighlight.match_clock} (period ${duplicateHighlight.period}).`
    : '';
  const duplicateExistingEventDefault = duplicateHighlight?.existing_event_id
    ? `Existing event ID: ${duplicateHighlight.existing_event_id}`
    : '';

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
                  <span
                    data-testid="connection-status"
                    data-status="connected"
                    className="flex items-center gap-1 text-green-600 text-sm"
                  >
                    <Wifi size={16} />
                    {t('connected')}
                  </span>
                ) : (
                  <span
                    data-testid="connection-status"
                    data-status="disconnected"
                    className="flex items-center gap-1 text-red-600 text-sm"
                  >
                    <WifiOff size={16} />
                    {t('disconnected')}
                  </span>
                )}
                {queuedEvents.length > 0 && (
                  <span
                    data-testid="queued-badge"
                    className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs"
                  >
                    {queuedEvents.length} {t('queued')}
                  </span>
                )}
                {isSubmitting && (
                  <span
                    className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs"
                    data-testid="pending-ack-badge"
                  >
                    {t('waitingForServer', 'Awaiting server confirmation…')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleUndoLastEvent}
                  disabled={undoDisabled}
                  data-testid="undo-button"
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                    undoDisabled
                      ? 'text-gray-400 border-gray-200 cursor-not-allowed'
                      : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <CornerUpLeft size={14} />
                  {t('undoLast', 'Undo last')}
                </button>
              </div>
            </div>
            {undoError && (
              <p className="text-xs text-red-600 mt-1" data-testid="undo-error">
                {undoError}
              </p>
            )}
            
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

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-700">{t('operatorClock', 'Operator clock')}</p>
                <span className="text-xs text-gray-500">{t('manualControl', 'Manual control')}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={operatorClock}
                  onChange={(e) => setOperatorClock(e.target.value)}
                  onBlur={() => setOperatorClock(formatMatchClock(parseClockInput(operatorClock)))}
                  className="flex-1 px-3 py-2 border rounded-md text-lg font-mono focus:ring-2 focus:ring-blue-500"
                  placeholder="00:00.000"
                />
                <button
                  type="button"
                  onClick={() => setClockRunning((prev) => !prev)}
                  className={`p-2 rounded-md text-white ${
                    isClockRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {isClockRunning ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setClockRunning(false);
                    setOperatorClock(formatMatchClock(match.match_time_seconds));
                  }}
                  className="p-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {t('clockHelp', 'Adjust or start the clock to match the on-field time you are logging.')}
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                {t('periodControl', 'Match period')}
              </label>
              <select
                value={operatorPeriod}
                onChange={(e) => setOperatorPeriod(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>{t('periods.firstHalf', '1st Half')}</option>
                <option value={2}>{t('periods.secondHalf', '2nd Half')}</option>
                <option value={3}>{t('periods.extraTimeOne', 'Extra Time 1')}</option>
                <option value={4}>{t('periods.extraTimeTwo', 'Extra Time 2')}</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                {t('periodHelp', 'Switch halves or extra time when the referee signals the change.')}
              </p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-blue-100 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                  <AlertCircle size={16} className="text-blue-500" />
                  {t('duplicateTelemetry', 'Duplicate telemetry')}
                </p>
                <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-1 rounded">
                  {duplicateStats.count} {t('eventsLabel', 'events')}
                </span>
              </div>
              <div className="text-sm text-gray-700">
                {duplicateStats.count > 0 ? (
                  <>
                    <p className="font-medium text-gray-900">
                      {t('sessionDuplicates', '{{count}} duplicates this session', {
                        count: duplicateStats.count,
                      })}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {t('lastDuplicateSummary', {
                        details: lastDuplicateSummaryDetails,
                        eventType: duplicateStats.lastEventType || 'Event',
                        matchClock: duplicateStats.lastMatchClock,
                        teamName: lastDuplicateTeamName,
                        seenAt: lastDuplicateSeenAt,
                        defaultValue: lastDuplicateSummaryDefault,
                      })}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">
                    {t('noDuplicatesYet', 'No duplicates detected this session.')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={resetDuplicateStats}
                className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800 self-start"
                disabled={duplicateStats.count === 0}
              >
                {t('resetDuplicateCounter', 'Reset counter')}
              </button>
            </div>
          </div>
        </div>
      </header>

      {duplicateHighlight && (
        <div className="max-w-7xl mx-auto px-4 pt-4" data-testid="duplicate-banner">
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium">{t('duplicateNotice', 'Already logged')}</p>
              <p className="text-sm">
                {t('duplicateDetails', {
                  matchClock: duplicateHighlight.match_clock,
                  period: duplicateHighlight.period,
                  defaultValue: duplicateDetailsDefault,
                })}
              </p>
              {duplicateStats.count > 0 && (
                <p className="text-xs mt-2 text-blue-700">
                  {t('duplicateSessionSummary', {
                    count: duplicateStats.count,
                    details: duplicateSessionDetailsSuffix,
                    teamName: lastDuplicateTeamName,
                    eventType: duplicateStats.lastEventType,
                    matchClock: duplicateStats.lastMatchClock,
                    seenAt: lastDuplicateSeenAt,
                    defaultValue: duplicateSessionSummaryDefault,
                  })}
                </p>
              )}
              {duplicateHighlight.existing_event_id && (
                <p className="text-xs text-blue-600 mt-1 font-mono">
                  {t('duplicateExistingEventId', {
                    eventId: duplicateHighlight.existing_event_id,
                    defaultValue: duplicateExistingEventDefault,
                  })}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <button
                type="button"
                onClick={clearDuplicateHighlight}
                className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
              >
                {t('dismiss', 'Dismiss')}
              </button>
              {duplicateStats.count > 0 && (
                <button
                  type="button"
                  onClick={resetDuplicateStats}
                  className="text-blue-600 hover:text-blue-800 text-xs font-semibold"
                >
                  {t('resetDuplicateCounter', 'Reset counter')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
                      data-testid={`player-card-${player.id}`}
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
                      disabled={isSubmitting}
                      data-testid={`action-btn-${action}`}
                      className={`py-4 rounded-lg font-medium transition-colors ${
                        isSubmitting
                          ? 'bg-blue-300 text-white cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {t(`action${action}`)}
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
                      disabled={isSubmitting}
                      data-testid={`outcome-btn-${outcome}`}
                      className={`py-4 rounded-lg font-medium transition-colors ${
                        isSubmitting
                          ? 'bg-green-300 text-white cursor-not-allowed'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      {t(`outcome${outcome}`)}
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
                      disabled={isSubmitting}
                      data-testid={`recipient-card-${player.id}`}
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center transition-colors ${
                        isSubmitting
                          ? 'bg-purple-300 text-white cursor-not-allowed'
                          : 'bg-purple-600 hover:bg-purple-700 text-white'
                      }`}
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
                  liveEvents.slice().reverse().map((event, index) => {
                    const isHighlighted =
                      !!duplicateHighlight &&
                      duplicateHighlight.match_clock === event.match_clock &&
                      duplicateHighlight.period === event.period &&
                      duplicateHighlight.team_id === event.team_id;
                    return (
                      <div
                        key={event._id || index}
                        data-testid="live-event-item"
                        className={`border rounded p-3 text-sm ${
                          isHighlighted
                            ? 'border-amber-500 bg-amber-50 shadow-md'
                            : 'border-gray-200'
                        }`}
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
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
