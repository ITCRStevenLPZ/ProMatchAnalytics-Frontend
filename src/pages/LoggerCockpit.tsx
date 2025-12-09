import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useMatchLogStore, MatchEvent } from '../store/useMatchLogStore';
import { useMatchSocket } from '../hooks/useMatchSocket';
import { useKeyboardInput } from '../hooks/useKeyboardInput';
import {
  fetchLoggerWithAuth,
  LOGGER_API_URL,
  IS_E2E_TEST_MODE,
  fetchAllMatchEvents,
} from '../lib/loggerApi';
import {
  Clock,
  AlertCircle,
  Wifi,
  WifiOff,
  CornerUpLeft,
  BarChart3,
  List,
  RotateCcw,
} from 'lucide-react';
import {
  Match,
  Player,
  LoggerHarness,
  QueuedEventSummary,
} from './logger/types';
import { DEFAULT_PERIOD_MAP, KEY_ACTION_MAP } from './logger/constants';
import { normalizeMatchPayload, formatMatchClock } from './logger/utils';
import { useActionFlow } from './logger/hooks/useActionFlow';
import TeamSelector from './logger/components/TeamSelector';
import InstructionBanner from './logger/components/InstructionBanner';
import PlayerSelectorPanel from './logger/components/PlayerSelectorPanel';
import ActionSelectionPanel from './logger/components/ActionSelectionPanel';
import OutcomeSelectionPanel from './logger/components/OutcomeSelectionPanel';
import RecipientSelectionPanel from './logger/components/RecipientSelectionPanel';
import { useMatchTimer } from './logger/hooks/useMatchTimer';
import MatchTimerDisplay from './logger/components/MatchTimerDisplay';
import LiveEventFeed from './logger/components/LiveEventFeed';
import { MatchPeriodSelector } from './logger/components/MatchPeriodSelector';
import { usePeriodManager } from './logger/hooks/usePeriodManager';
import ExtraTimeAlert from './logger/components/ExtraTimeAlert';
import HalftimePanel from './logger/components/HalftimePanel';
import SubstitutionFlow from './logger/components/SubstitutionFlow';
import { MatchAnalytics } from './logger/components/MatchAnalytics';
import TurboModeInput from './logger/components/TurboModeInput';
import { useTurboMode } from './logger/hooks/useTurboMode';
import { useAudioFeedback, getSoundForEvent } from './logger/hooks/useAudioFeedback';
import { useAuthStore } from '../store/authStore';

// Normalize timestamps for drift calculations
const parseTimestampSafe = (timestamp?: string | null): number => {
  if (!timestamp) return 0;
  const normalized = timestamp.endsWith('Z') || timestamp.includes('+') || timestamp.includes('-', 10)
    ? timestamp
    : `${timestamp}Z`;
  return new Date(normalized).getTime();
};

const parseClockToSeconds = (clock?: string): number => {
  if (!clock) return 0;
  const [mm, rest] = clock.split(':');
  const seconds = parseFloat(rest || '0');
  return Number(mm) * 60 + seconds;
};

declare global {
  interface Window {
    __PROMATCH_LOGGER_HARNESS__?: LoggerHarness;
  }
}

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
    setOperatorClock,
    isBallInPlay,
    setIsBallInPlay,
    resetOperatorControls,
    setCurrentMatch,
    setLiveEvents,
    removeQueuedEvent,
    removeLiveEventByClientId,
    removeUndoCandidate,
    clearDuplicateHighlight,
    resetDuplicateStats,
    clearQueuedEvents,
    clearUndoStack,
    lastTimelineRefreshRequest,
  } = useMatchLogStore();
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === 'admin';
  const pendingAckCount = Object.keys(pendingAcks).length;
  const isSubmitting = pendingAckCount > 0;
  const queuedCount = queuedEvents.length;


  
  const { sendEvent, undoEvent } = useMatchSocket({ 
    matchId: matchId!, 
    enabled: !!matchId, 
  });

  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<'home' | 'away' | 'both'>('home');
  const [undoError, setUndoError] = useState<string | null>(null);
  const [showSubstitutionFlow, setShowSubstitutionFlow] = useState(false);
  const [substitutionTeam, setSubstitutionTeam] = useState<'home' | 'away'>('home');
  const [viewMode, setViewMode] = useState<'logger' | 'analytics'>('logger');
  const [turboModeEnabled, setTurboModeEnabled] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; actionLabel?: string; action?: () => void } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const lastDriftAutoSyncRef = useRef<number>(0);
  const driftExceededAtRef = useRef<number | null>(null);

  const recentPlayers = useMemo(() => {
    if (!match) return [] as Player[];
    const allPlayers = [...match.home_team.players, ...match.away_team.players];
    const seen = new Set<string>();
    const ordered: Player[] = [];
    [...liveEvents].reverse().forEach((event) => {
      if (event.player_id && !seen.has(event.player_id)) {
        const found = allPlayers.find((p) => p.id === event.player_id);
        if (found) {
          seen.add(event.player_id);
          ordered.push(found);
        }
      }
    });
    return ordered.slice(0, 5);
  }, [liveEvents, match]);

  const hotkeyHints = useMemo(() => {
    const entries = Object.entries(KEY_ACTION_MAP)
      .filter(([key]) => key.length === 1)
      .filter(([key]) => key === key.toLowerCase())
      .map(([key, action]) => ({ key, action }));
    const seen = new Set<string>();
    const deduped: { key: string; action: string }[] = [];
    for (const entry of entries) {
      if (!seen.has(entry.action)) {
        seen.add(entry.action);
        deduped.push(entry);
      }
      if (deduped.length >= 8) break;
    }
    return deduped;
  }, []);


  // Fetch match data
  const fetchMatch = useCallback(async () => {
    if (!matchId || !isLoggerReady) return;
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
  }, [matchId, isLoggerReady, t]);

  useEffect(() => {
    fetchMatch();
  }, [fetchMatch]);

  const {
    globalClock,
    effectiveClock,
    effectiveTime,
    ineffectiveClock,
    timeOffClock,
    clockMode,
    isClockRunning: isGlobalClockRunning,
    handleGlobalClockStart,
    handleGlobalClockStop,
    handleGlobalClockReset: resetMatchTimer,
    handleModeSwitch,
  } = useMatchTimer(match, fetchMatch);

  useEffect(() => {
    setIsBallInPlay(isGlobalClockRunning);
  }, [isGlobalClockRunning, setIsBallInPlay]);

  const isZeroedMatch = useMemo(() => {
    if (!match) return false;
    return (match.match_time_seconds || 0) === 0
      && (match.ineffective_time_seconds || 0) === 0
      && (match.time_off_seconds || 0) === 0
      && !match.current_period_start_timestamp;
  }, [match]);

  const statusOverride = useMemo<Match['status'] | undefined>(() => {
    if (!match) return undefined;
    if (isZeroedMatch && (match.status === 'Fulltime' || match.status === 'Completed')) {
      return 'Pending';
    }
    return match.status;
  }, [match, isZeroedMatch]);

  const matchForPhase = useMemo(() => {
    if (!match) return null;
    return { ...match, status: statusOverride ?? match.status } as Match;
  }, [match, statusOverride]);

  const serverSeconds = useMemo(() => {
    if (!match) return 0;
    const base = (match.match_time_seconds || 0) + (match.ineffective_time_seconds || 0) + (match.time_off_seconds || 0);
    if (!match.current_period_start_timestamp) return base;
    const start = parseTimestampSafe(match.current_period_start_timestamp);
    const elapsed = Math.max(0, (Date.now() - start) / 1000);
    return base + elapsed;
  }, [match, globalClock]);

  const localSeconds = useMemo(() => parseClockToSeconds(globalClock), [globalClock]);
  const driftSeconds = Math.abs(localSeconds - serverSeconds);
  const showDriftNudge = driftSeconds > 2;


  useEffect(() => {
    const now = Date.now();
    if (driftSeconds > 2) {
      if (driftExceededAtRef.current === null) {
        driftExceededAtRef.current = now;
      }
      const lingered = now - (driftExceededAtRef.current || now);
      const sinceLastSync = now - (lastDriftAutoSyncRef.current || 0);
      if (lingered > 1000 && sinceLastSync > 15000) {
        lastDriftAutoSyncRef.current = now;
        console.info('[Logger] Auto-resync due to clock drift', {
          driftSeconds: driftSeconds.toFixed(3),
          localSeconds,
          serverSeconds,
          lingered,
          sinceLastSync,
        });
        fetchMatch();
      }
    } else {
      driftExceededAtRef.current = null;
    }
  }, [driftSeconds, fetchMatch]);

  const {
    operatorPeriod,
    currentPhase,
    periodInfo,
    showExtraTimeAlert,
    transitionToHalftime,
    transitionToSecondHalf,
    transitionToFulltime,
    dismissExtraTimeAlert,
  } = usePeriodManager(
    matchForPhase,
    effectiveTime,
    clockMode,
    isGlobalClockRunning,
    handleModeSwitch,
    fetchMatch,
    ({ target, error }) => {
      const message = `Failed to update status to ${target}. ${error instanceof Error ? error.message : ''}`;
      setToast({
        message,
        actionLabel: 'Retry',
        action: () => {
          if (target === 'Halftime') guardTransition('Halftime', transitionToHalftime);
          if (target === 'Live_Second_Half') guardTransition('Live_Second_Half', transitionToSecondHalf);
          if (target === 'Fulltime') guardTransition('Fulltime', transitionToFulltime);
        },
      });
    }
  );

  // Comprehensive reset handler: clears all events and resets all timers
  const handleGlobalClockReset = useCallback(async () => {
    if (!match || !matchId || !isAdmin) return;
    
    try {
      // 1. Try to delete all events from the backend
      let backendDeleteSuccess = false;
      try {
        const deleteResponse = await fetchLoggerWithAuth(
          `${LOGGER_API_URL}/matches/${matchId}/clear-events`, 
          { method: 'POST' }
        );
        
        if (deleteResponse.ok) {
          console.log('✅ Successfully deleted all events from backend');
          backendDeleteSuccess = true;
          
          // Verify events are deleted by fetching
          const remainingEvents = await fetchAllMatchEvents(matchId);
          console.log('Events remaining after delete:', remainingEvents.length);
        } else {
          console.warn('⚠️ Backend delete failed:', deleteResponse.status, deleteResponse.statusText);
          console.warn('⚠️ Continuing with frontend reset. Please restart backend server to enable event deletion.');
        }
      } catch (deleteError) {
        console.warn('⚠️ Could not delete events from backend (endpoint may not exist):', deleteError);
        console.warn('⚠️ Continuing with frontend reset. Events will reload on page refresh until backend is restarted.');
      }
      
      // 2. Reset match timer (this will reset all clocks, period, and accumulated times)
      await resetMatchTimer();

      // Optimistically reset local state so UI reflects zeroed clocks and pending status immediately
      setMatch((prev) => prev ? {
        ...prev,
        match_time_seconds: 0,
        clock_seconds_at_period_start: 0,
        ineffective_time_seconds: 0,
        time_off_seconds: 0,
        current_period_start_timestamp: undefined,
        last_mode_change_timestamp: undefined,
        period_timestamps: {},
        clock_mode: 'EFFECTIVE',
        status: 'Pending',
      } : prev);
      resetOperatorControls({ clock: '00:00.000', period: 1 });

      // Rehydrate events/timeline to reflect cleared state
      await hydrateEvents();
      
      // 3. Clear all event-related state from the store (this will persist to IndexedDB)
      setLiveEvents([]);
      clearQueuedEvents();
      clearUndoStack();
      
      // 4. Reset duplicate tracking
      resetDuplicateStats();
      clearDuplicateHighlight();
      
      if (backendDeleteSuccess) {
        console.log('✅ Reset complete: all events cleared from backend and frontend, timers reset');
      } else {
        console.log('✅ Frontend reset complete. Note: Events will reappear on refresh until backend server is restarted.');
      }
      
    } catch (error) {
      console.error('Failed to reset match:', error);
    }
  }, [match, matchId, isAdmin, resetMatchTimer, setLiveEvents, clearQueuedEvents, clearUndoStack, resetDuplicateStats, clearDuplicateHighlight]);

  const {
    currentStep,
    currentTeam,
    selectedPlayer,
    selectedAction,
    availableActions,
    availableOutcomes,
    handlePlayerClick,
    handleActionClick,
    handleOutcomeClick,
    handleRecipientClick,
    resetFlow,
    currentStepRef,
  } = useActionFlow({
    match,
    globalClock,
    operatorClock,
    operatorPeriod,
    selectedTeam,
    isSubmitting,
    sendEvent,
  });

  const normalizeStatus = useCallback((status?: Match['status']): Match['status'] => {
    if (status === 'Live') return 'Live_First_Half';
    if (status === 'Completed') return 'Fulltime';
    return status || 'Pending';
  }, []);

  const isTransitionAllowed = useCallback((target: Match['status']): boolean => {
    const current = normalizeStatus(statusOverride);
    const allowed: Record<Match['status'], Match['status'][]> = {
      Pending: ['Live_First_Half'],
      Live_First_Half: ['Halftime'],
      Halftime: ['Live_Second_Half'],
      Live_Second_Half: ['Fulltime'],
      Live: ['Halftime'],
      Fulltime: [],
      Abandoned: [],
      Live_Extra_First: [],
      Extra_Halftime: [],
      Live_Extra_Second: [],
      Penalties: [],
      Completed: [],
      Scheduled: ['Live_First_Half'],
    };
    const allowedTargets = allowed[current] || [];
    return allowedTargets.includes(target);
  }, [statusOverride, normalizeStatus]);

  const guardTransition = useCallback((target: Match['status'], fn?: () => void) => {
    if (!fn) return;
    const current = normalizeStatus(statusOverride);
    if (!isTransitionAllowed(target)) {
      setTransitionError(
        `Transition not allowed: ${current} → ${target}. Follow Pending → Live_First_Half → Halftime → Live_Second_Half → Fulltime.`
      );
      return;
    }
    setTransitionError(null);
    fn();
  }, [isTransitionAllowed, statusOverride, normalizeStatus]);

  const currentStatusNormalized = normalizeStatus(statusOverride);
  const cockpitLocked = currentStatusNormalized === 'Fulltime';
  const lockReason = cockpitLocked ? t('lockReasonFulltime', 'Match is Fulltime. Cockpit is read-only.') : undefined;


  // Audio feedback for events
  const { playSound } = useAudioFeedback({ enabled: true, volume: 0.3 });

  // Turbo Mode for ultra-fast logging
  const {
    turboBuffer,
    lastResult: turboParseResult,
    isProcessing: isTurboProcessing,
    payloadPreview: turboPayloadPreview,
    safetyWarning: turboSafetyWarning,
    missingRecipient: turboMissingRecipient,
    handleInputChange: handleTurboInput,
    executeTurbo,
    clearTurbo,
    inputRef: turboInputRef,
  } = useTurboMode({
    enabled: turboModeEnabled,
    match,
    selectedTeam,
    globalClock,
    operatorPeriod,
    sendEvent,
    onEventDispatched: (result: { action: string; outcome?: string }) => {
      const soundType = getSoundForEvent(result.action, result.outcome ?? undefined);
      playSound(soundType);
    },
    onError: (error: string) => {
      console.warn('Turbo mode error:', error);
      playSound('error');
    },
  });

  const handleTurboInputGuarded = useCallback((value: string) => {
    if (cockpitLocked) return;
    handleTurboInput(value);
  }, [cockpitLocked, handleTurboInput]);

  const executeTurboGuarded = useCallback(() => {
    if (cockpitLocked) return;
    executeTurbo();
  }, [cockpitLocked, executeTurbo]);

  const clearTurboGuarded = useCallback(() => {
    if (cockpitLocked) return;
    clearTurbo();
  }, [cockpitLocked, clearTurbo]);

  const handleGlobalClockStartGuarded = useCallback(() => {
    if (cockpitLocked) return;
    setIsBallInPlay(true);
    handleGlobalClockStart();
  }, [cockpitLocked, handleGlobalClockStart, setIsBallInPlay]);

  const handleGlobalClockStopGuarded = useCallback(() => {
    if (cockpitLocked) return;
    setIsBallInPlay(false);
    handleGlobalClockStop();
  }, [cockpitLocked, handleGlobalClockStop, setIsBallInPlay]);

  const handleModeSwitchGuarded = useCallback((mode: 'EFFECTIVE' | 'INEFFECTIVE' | 'TIMEOFF') => {
    if (cockpitLocked) return;
    handleModeSwitch(mode);
  }, [cockpitLocked, handleModeSwitch]);

  const toggleTurboMode = useCallback(() => {
    if (cockpitLocked) return;
    setTurboModeEnabled(prev => !prev);
    if (!turboModeEnabled) {
      // Reset normal flow when entering turbo mode
      resetFlow();
    }
  }, [cockpitLocked, turboModeEnabled, resetFlow]);

  const determinePlayerTeam = useCallback(
    (player: Player): 'home' | 'away' | null => {
      if (!match) return null;
      if (match.home_team.players.some((homePlayer) => homePlayer.id === player.id)) {
        return 'home';
      }
      if (match.away_team.players.some((awayPlayer) => awayPlayer.id === player.id)) {
        return 'away';
      }
      return null;
    },
    [match]
  );

  const handlePlayerSelection = useCallback(
    (player: Player) => {
      if (cockpitLocked) return;
      const playerTeam = determinePlayerTeam(player);
      if (!playerTeam) return;
      if (playerTeam !== selectedTeam) {
        setSelectedTeam(playerTeam);
      }
      handlePlayerClick(player);
    },
    [cockpitLocked, determinePlayerTeam, handlePlayerClick, selectedTeam, setSelectedTeam]
  );

  const handleTeamChange = useCallback(
    (team: 'home' | 'away' | 'both') => {
      if (cockpitLocked) return;
      setSelectedTeam(team);
      resetFlow();
    },
    [cockpitLocked, resetFlow]
  );

  // Override action click for substitution - open modal instead
  const handleActionClickOverride = useCallback(
    (action: string) => {
      if (cockpitLocked) return;
      if (action === 'Substitution') {
        const teamForSub = selectedPlayer
          ? determinePlayerTeam(selectedPlayer) || 'home'
          : selectedTeam === 'both'
            ? 'home'
            : selectedTeam;
        setSubstitutionTeam(teamForSub);
        setShowSubstitutionFlow(true);
        resetFlow();
      } else {
        handleActionClick(action);
      }
    },
    [cockpitLocked, selectedPlayer, determinePlayerTeam, selectedTeam, resetFlow, handleActionClick]
  );

  const handleOutcomeSelect = useCallback(
    (outcome: string) => {
      if (cockpitLocked) return;
      handleOutcomeClick(outcome);
    },
    [cockpitLocked, handleOutcomeClick]
  );

  const handleRecipientSelect = useCallback(
    (player: Player) => {
      if (cockpitLocked) return;
      handleRecipientClick(player);
    },
    [cockpitLocked, handleRecipientClick]
  );

  const { buffer } = useKeyboardInput({
    disabled: isSubmitting || cockpitLocked,
    onNumberCommit: (number) => {
      if (cockpitLocked) return;
      if (currentStep === 'selectPlayer') {
        if (!match) return;
        const homePlayer = match.home_team.players.find((player) => player.jersey_number === number);
        const awayPlayer = match.away_team.players.find((player) => player.jersey_number === number);
        const player = homePlayer || awayPlayer;
        if (player) {
          const playerTeam: 'home' | 'away' = homePlayer ? 'home' : 'away';
          if (playerTeam !== selectedTeam) {
            setSelectedTeam(playerTeam);
          }
          handlePlayerClick(player);
        }
        return;
      }

      if (!currentTeam) return;

      if (currentStep === 'selectRecipient') {
        const recipient = currentTeam.players?.find((p) => p.jersey_number === number);
        if (recipient) handleRecipientClick(recipient);
        return;
      }
      if (currentStep === 'selectOutcome') {
        const outcome = availableOutcomes[number - 1];
        if (outcome) handleOutcomeClick(outcome);
      }
    },
    onKeyAction: (key) => {
      if (cockpitLocked) return;
      if (key === 'Escape') {
        resetFlow();
        return;
      }

      const normalizedKey = key.length === 1 ? key : key.toUpperCase();
      const mappedAction = KEY_ACTION_MAP[normalizedKey] || KEY_ACTION_MAP[key.toUpperCase()];

      if (mappedAction === 'ToggleClock' || key === ' ') {
        // Toggle global clock via backend
        if (match?.current_period_start_timestamp) {
          handleGlobalClockStop();
        } else {
          handleGlobalClockStart();
        }
        return;
      }

      if (mappedAction && currentStep === 'selectAction') {
        handleActionClick(mappedAction);
      }
    },
  });

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
    if (!match) return;
    const defaultClock = formatMatchClock(match.match_time_seconds);
    const defaultPeriod = DEFAULT_PERIOD_MAP[statusOverride || match.status] ?? 1;
    resetOperatorControls({ clock: defaultClock, period: defaultPeriod });
  }, [match, resetOperatorControls]);

  useEffect(() => {
    if (cockpitLocked) {
      setTurboModeEnabled(false);
      clearTurbo();
      resetFlow();
    }
  }, [cockpitLocked, clearTurbo, resetFlow]);

  useEffect(() => {
    if (!IS_E2E_TEST_MODE || !match) return;

    const ensurePlayers = (team: Match['home_team'], prefix: 'HOME' | 'AWAY') => {
      const hasRoster = Array.isArray(team.players) && team.players.length >= 2;
      if (hasRoster) return team.players;
      const teamLabel = prefix === 'HOME' ? 'Home' : 'Away';
      return [1, 2].map((n) => ({
        id: `${prefix}-${n}`,
        jersey_number: n,
        full_name: `${teamLabel} Player ${n}`,
        short_name: `${teamLabel[0]}P${n}`,
        position: 'MF',
      })) as Match['home_team']['players'];
    };

    match.home_team.players = ensurePlayers(match.home_team, 'HOME');
    match.away_team.players = ensurePlayers(match.away_team, 'AWAY');
  }, [match]);

  useEffect(() => {
    if (!duplicateHighlight) return;
    const timer = setTimeout(() => {
      clearDuplicateHighlight();
    }, 5000);
    return () => clearTimeout(timer);
  }, [duplicateHighlight, clearDuplicateHighlight]);

  // Note: WebSocket connection is automatically managed by useMatchSocket hook

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
    !lastUndoEvent || cockpitLocked || (undoRequiresConnection && !isConnected);

  const handleUndoLastEvent = useCallback(async () => {
    if (cockpitLocked) {
      setUndoError(lockReason || t('undoLocked', 'Cannot undo while cockpit is locked.'));
      return;
    }
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
    cockpitLocked,
    lockReason,
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

  const canHalftime = isTransitionAllowed('Halftime');
  const canSecondHalf = isTransitionAllowed('Live_Second_Half');
  const canFulltime = isTransitionAllowed('Fulltime');
  const transitionGuardMessage = t(
    'transitionGuardMessage',
    'Follow order: Pending → Live_First_Half → Halftime → Live_Second_Half → Fulltime (current: {{status}}).',
    { status: currentStatusNormalized }
  );

  const isFulltime = match?.status === 'Completed';
  const resetBlocked = queuedCount > 0 || pendingAckCount > 0;
  const resetBlockReason = queuedCount > 0
    ? t('resetBlockedQueued', '{{count}} event(s) queued — clear them before reset.', { count: queuedCount })
    : pendingAckCount > 0
      ? t('resetBlockedPending', '{{count}} event(s) awaiting server confirmation.', { count: pendingAckCount })
      : undefined;
  const resetDisabledReason = resetBlockReason;
  const resetTooltip = resetDisabledReason || (isFulltime ? t('resetAfterFulltimeTooltip', 'Match is completed; reset will wipe data and restart.') : undefined);

  const openResetModal = () => {
    if (!isAdmin) return;
    setShowResetModal(true);
    setResetConfirmText('');
  };

  const confirmGlobalReset = async () => {
    if (resetBlocked || resetConfirmText !== 'RESET') return;
    await handleGlobalClockReset();
    setShowResetModal(false);
    setResetConfirmText('');
  };

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
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openResetModal}
                    disabled={resetBlocked}
                    data-testid="btn-reset-clock"
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                      resetBlocked
                        ? 'text-red-300 border-red-100 cursor-not-allowed'
                        : 'text-red-700 border-red-300 hover:bg-red-50'
                    }`}
                    title={resetTooltip}
                  >
                    <RotateCcw size={14} />
                    {t('reset', 'Reset')}
                  </button>
                )}
              </div>
              {showResetModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
                    <h3 className="text-lg font-bold mb-3 text-red-600 flex items-center gap-2">
                      <RotateCcw size={20} />
                      {t('confirmReset', 'Confirm Reset')}
                    </h3>
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
                      <p className="text-red-800 font-semibold mb-2">⚠️ {t('warning', 'WARNING')}</p>
                      <p className="text-red-700 text-sm mb-1">
                        {t('resetWarning1', 'This will permanently delete ALL logged events and reset all timers!')}
                      </p>
                      <p className="text-red-700 text-sm">
                        {t('resetWarning2', 'This action CANNOT be undone. All match data will be lost.')}
                      </p>
                      {isFulltime && (
                        <p className="text-red-700 text-sm mt-2">
                          {t('resetAfterFulltimeWarning', 'Match is fulltime. Resetting will clear logs and restart clocks from zero.')}
                        </p>
                      )}
                      {resetBlocked && (
                        <p className="text-red-700 text-sm mt-2">
                          {resetDisabledReason || t('resetBlockedUnsent', 'Unsent events detected. Clear queue/acks before resetting.')}
                        </p>
                      )}
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('typeResetToConfirm', 'Type RESET in capital letters to confirm:')}
                      </label>
                      <input
                        type="text"
                        value={resetConfirmText}
                        onChange={(e) => setResetConfirmText(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="RESET"
                        autoFocus
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => {
                          setShowResetModal(false);
                          setResetConfirmText('');
                        }}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                      >
                        {t('cancel', 'Cancel')}
                      </button>
                      <button
                        onClick={confirmGlobalReset}
                        disabled={resetConfirmText !== 'RESET' || resetBlocked}
                        className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('yesReset', 'Yes, Reset')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {undoError && (
              <p className="text-xs text-red-600 mt-1" data-testid="undo-error">
                {undoError}
              </p>
            )}
            
            <div className="flex items-center gap-4">
              {/* View Toggle */}
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('logger')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                    viewMode === 'logger'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <List size={16} />
                  {t('logger.view', 'Logger')}
                </button>
                <button
                  onClick={() => setViewMode('analytics')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                    viewMode === 'analytics'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  data-testid="toggle-analytics"
                >
                  <BarChart3 size={16} />
                  {t('logger.analytics', 'Analytics')}
                </button>
              </div>
              <div className="text-sm text-gray-600">
                <Clock className="inline mr-1" size={16} />
                {Math.floor((match.match_time_seconds || 0) / 60)}:{String((match.match_time_seconds || 0) % 60).padStart(2, '0')}
              </div>
              {(() => {
                const statusForDisplay = (statusOverride || match.status || 'Pending').toLowerCase();
                const colorClass = statusForDisplay === 'live' || statusForDisplay === 'live_first_half'
                  ? 'bg-green-100 text-green-700'
                  : statusForDisplay === 'halftime'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-700';
                return (
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${colorClass}`}>
                    {t(`status.${statusForDisplay}`)}
                  </span>
                );
              })()}
            </div>
          </div>
          
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xl font-semibold">
              {t('matchTitle', '{{home}} vs {{away}}', {
                home: match.home_team.name,
                away: match.away_team.name,
              })}
            </div>
            <div className="flex items-center gap-2 text-xs">
              {queuedCount > 0 && (
                <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200" title="Events queued for send">
                  🔄 {t('queuedLabel', 'Queued: {{count}}', { count: queuedCount })}
                </span>
              )}
              {pendingAckCount > 0 && (
                <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-semibold border border-blue-200" title="Awaiting server acknowledgements">
                  ⏳ {t('pendingAckLabel', 'Pending acks: {{count}}', { count: pendingAckCount })}
                </span>
              )}
              {(transitionError || toast?.message) && (
                <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-800 font-semibold border border-red-200" title="Last error">
                  ⚠️ {transitionError || toast?.message}
                </span>
              )}
            </div>
          </div>

          {/* Status Ribbon */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2">
              <span className="font-semibold text-gray-700">{t('statusLabel', 'Status')}</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">{currentStatusNormalized}</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2">
              <span className="font-semibold text-gray-700">{t('phaseLabel', 'Phase')}</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">{currentPhase}</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2">
              <span className="font-semibold text-gray-700">{t('clockModeLabel', 'Clock Mode')}</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">{clockMode}</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2">
              <span className="font-semibold text-gray-700">{t('runningLabel', 'Running')}</span>
              <span className={`px-2 py-0.5 rounded-full font-semibold ${isGlobalClockRunning ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {isGlobalClockRunning ? t('runningYes', 'Yes') : t('runningNo', 'No')}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2">
              <label htmlFor="operator-clock-input" className="font-semibold text-gray-700">
                {t('clockInputLabel', 'Clock')}
              </label>
              <input
                id="operator-clock-input"
                data-testid="operator-clock-input"
                value={operatorClock === '00:00.000' ? '' : operatorClock}
                placeholder="00:00.000"
                onChange={(e) => setOperatorClock(e.target.value)}
                className="w-24 px-2 py-1 rounded border border-gray-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {cockpitLocked && (
            <div className="mt-3 flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2" data-testid="cockpit-lock-banner">
              🔒 {lockReason || t('lockBanner', 'Match is closed (Fulltime). Editing is disabled.')}
            </div>
          )}

          {/* Extra Time Alert */}
          {showExtraTimeAlert && (currentPhase === 'FIRST_HALF_EXTRA_TIME' || currentPhase === 'SECOND_HALF_EXTRA_TIME') && (
            <div className="mt-4">
              <ExtraTimeAlert
                phase={currentPhase}
                extraTimeSeconds={periodInfo.extraTimeSeconds}
                onTransition={currentPhase === 'FIRST_HALF_EXTRA_TIME' ? transitionToHalftime : transitionToFulltime}
                onDismiss={dismissExtraTimeAlert}
                t={t}
              />
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MatchTimerDisplay
              match={match}
              operatorPeriod={operatorPeriod}
              globalClock={globalClock}
              effectiveClock={effectiveClock}
              ineffectiveClock={ineffectiveClock}
              timeOffClock={timeOffClock}
              clockMode={clockMode}
              isClockRunning={isGlobalClockRunning}
              isBallInPlay={isBallInPlay}
              locked={cockpitLocked}
              lockReason={lockReason}
              onGlobalStart={handleGlobalClockStartGuarded}
              onGlobalStop={handleGlobalClockStopGuarded}
              onModeSwitch={handleModeSwitchGuarded}
              t={t}
            />

            {showDriftNudge && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                <div className="text-xs font-medium">
                  {t('clockDriftDetected', 'Clock drift detected (~{{seconds}}s). Refresh to resync with server time.', {
                    seconds: driftSeconds.toFixed(1),
                  })}
                </div>
                <button
                  type="button"
                  onClick={fetchMatch}
                  className="text-xs font-semibold px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700"
                >
                  {t('resync', 'Resync')}
                </button>
              </div>
            )}

            <MatchPeriodSelector
              match={match}
              operatorPeriod={operatorPeriod}
              currentPhase={currentPhase}
              isExtraTime={periodInfo.isExtraTime}
              extraTimeSeconds={periodInfo.extraTimeSeconds}
              globalClock={globalClock}
              isClockRunning={isGlobalClockRunning}
              onTransitionToHalftime={() => guardTransition('Halftime', transitionToHalftime)}
              onTransitionToSecondHalf={() => guardTransition('Live_Second_Half', transitionToSecondHalf)}
              onTransitionToFulltime={() => guardTransition('Fulltime', transitionToFulltime)}
              transitionDisabled={
                cockpitLocked || !isAdmin ||
                ((currentPhase === 'FIRST_HALF' || currentPhase === 'FIRST_HALF_EXTRA_TIME') ? !canHalftime :
                currentPhase === 'HALFTIME' ? !canSecondHalf :
                (currentPhase === 'SECOND_HALF' || currentPhase === 'SECOND_HALF_EXTRA_TIME') ? !canFulltime : false)
              }
              transitionReason={
                cockpitLocked
                  ? lockReason
                  : !isAdmin
                    ? t('adminOnlyTransitions', 'Admin only: match status changes are locked.')
                    : (currentPhase === 'FIRST_HALF' || currentPhase === 'FIRST_HALF_EXTRA_TIME') && !canHalftime
                      ? transitionGuardMessage
                      : currentPhase === 'HALFTIME' && !canSecondHalf
                        ? transitionGuardMessage
                        : (currentPhase === 'SECOND_HALF' || currentPhase === 'SECOND_HALF_EXTRA_TIME') && !canFulltime
                          ? transitionGuardMessage
                          : undefined
              }
              t={t}
            />

            {transitionError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3" data-testid="transition-error">
                {transitionError}
              </div>
            )}

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

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded shadow-lg max-w-sm flex items-start gap-3" data-testid="logger-toast">
          <div className="flex-1 text-sm leading-snug">{toast.message}</div>
          {toast.action && toast.actionLabel && (
            <button
              onClick={toast.action}
              className="text-xs font-semibold bg-white/10 hover:bg-white/20 px-2 py-1 rounded"
            >
              {toast.actionLabel}
            </button>
          )}
          <button
            onClick={() => setToast(null)}
            className="text-xs text-gray-300 hover:text-white"
            aria-label="Dismiss toast"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {buffer && (
          <div
            data-testid="keyboard-buffer"
            className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-2xl font-mono tracking-widest z-50"
          >
            <div className="text-xs uppercase text-gray-400 leading-none mb-1">Input</div>
            <div className="text-3xl font-mono font-bold" data-testid="keyboard-buffer-value">{buffer}</div>
          </div>
        )}
        
        {/* Halftime Panel */}
        {currentPhase === 'HALFTIME' && (
          <div className="mb-6">
            <HalftimePanel
              timeOffSeconds={match?.time_off_seconds || 0}
              onStartSecondHalf={transitionToSecondHalf}
              t={t}
            />
          </div>
        )}
        
        {/* Analytics View */}
        {viewMode === 'analytics' ? (
          <div className="mb-6">
            <MatchAnalytics
              match={match}
              events={liveEvents}
              effectiveTime={effectiveTime}
              t={t}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Team Selection & Player Grid */}
            <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col gap-2 bg-gray-900/70 border border-gray-800 rounded-xl px-4 py-3 text-xs text-gray-200">
              <div className="flex flex-wrap items-center gap-2">
                <span className="uppercase tracking-wide text-[11px] text-gray-400">Recent</span>
                {recentPlayers.length === 0 && (
                  <span className="text-gray-500">No players yet</span>
                )}
                {recentPlayers.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => handlePlayerSelection(player)}
                    className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors"
                    title={`Select ${player.full_name}`}
                  >
                    <span className="font-mono text-yellow-300 font-semibold">#{player.jersey_number}</span>
                    <span className="text-gray-100 text-xs font-medium truncate max-w-[120px]">
                      {player.short_name || player.full_name}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="uppercase tracking-wide text-[11px] text-gray-400">Hotkeys</span>
                {hotkeyHints.map((hint) => (
                  <span
                    key={hint.action}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-gray-800 border border-gray-700"
                  >
                    <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-gray-700 text-yellow-200 font-semibold text-[11px]">
                      {hint.key}
                    </kbd>
                    <span className="text-gray-200 text-xs">{hint.action}</span>
                  </span>
                ))}
              </div>
            </div>

            <TeamSelector match={match} selectedTeam={selectedTeam} onTeamChange={handleTeamChange} disabled={cockpitLocked} />

            <InstructionBanner
              t={t}
              currentStep={currentStep}
              selectedPlayer={selectedPlayer}
              selectedAction={selectedAction}
            />

            {currentStep === 'selectPlayer' && match && (
              <PlayerSelectorPanel
                match={match}
                selectedPlayer={selectedPlayer}
                selectedTeam={selectedTeam}
                onPlayerClick={handlePlayerSelection}
                t={t}
              />
            )}

            {currentStep === 'selectAction' && (
              <ActionSelectionPanel
                actions={availableActions}
                selectedPlayer={selectedPlayer}
                isSubmitting={isSubmitting || cockpitLocked}
                keyHints={KEY_ACTION_MAP}
                onActionSelect={handleActionClickOverride}
                onCancel={resetFlow}
                t={t}
              />
            )}

            {currentStep === 'selectOutcome' && (
              <OutcomeSelectionPanel
                selectedAction={selectedAction}
                outcomes={availableOutcomes}
                isSubmitting={isSubmitting || cockpitLocked}
                onOutcomeSelect={handleOutcomeSelect}
                onCancel={resetFlow}
                t={t}
              />
            )}

            {currentStep === 'selectRecipient' && (
              <RecipientSelectionPanel
                team={currentTeam}
                selectedAction={selectedAction}
                isSubmitting={isSubmitting || cockpitLocked}
                onRecipientSelect={handleRecipientSelect}
                onCancel={resetFlow}
                t={t}
              />
            )}

            {/* Turbo Mode Input */}
            <TurboModeInput
              enabled={turboModeEnabled}
              buffer={turboBuffer}
              parseResult={turboParseResult}
              match={match}
              isProcessing={isTurboProcessing}
              payloadPreview={turboPayloadPreview}
              safetyWarning={turboSafetyWarning}
              missingRecipient={turboMissingRecipient}
              onInputChange={handleTurboInputGuarded}
              onExecute={executeTurboGuarded}
              onClear={clearTurboGuarded}
              onToggle={toggleTurboMode}
              inputRef={turboInputRef}
              t={t}
            />
          </div>

            {/* Right: Live Event Feed */}
            <div className="lg:col-span-1">
              <div className="sticky top-4">
                <LiveEventFeed
                  events={liveEvents}
                  match={match}
                  duplicateHighlight={duplicateHighlight}
                  t={t}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Substitution Flow Modal */}
      {showSubstitutionFlow && match && (
        <SubstitutionFlow
          matchId={matchId!}
          team={substitutionTeam === 'home' ? match.home_team : match.away_team}
          availablePlayers={
            substitutionTeam === 'home' ? match.home_team.players : match.away_team.players
          }
          onField={(() => {
            const roster = substitutionTeam === 'home' ? match.home_team.players : match.away_team.players;
            const starters = roster.slice(0, Math.max(1, roster.length - 1));
            return new Set(starters.map((p) => p.id));
          })()}
          period={operatorPeriod}
          globalClock={globalClock}
          onSubmit={(playerOffId, playerOnId, isConcussion) => {
            if (cockpitLocked) return;
            // Create substitution event
            const team = substitutionTeam === 'home' ? match.home_team : match.away_team;
            const eventData: Omit<MatchEvent, 'match_id' | 'timestamp'> = {
              match_clock: globalClock,
              period: operatorPeriod,
              team_id: team.id,
              player_id: playerOffId,  // Player leaving the field
              type: 'Substitution',
              data: {
                player_off_id: playerOffId,
                player_on_id: playerOnId,
                is_concussion: isConcussion,
              },
            };
            sendEvent(eventData);
            setShowSubstitutionFlow(false);
          }}
          onCancel={() => setShowSubstitutionFlow(false)}
        />
      )}
    </div>
  );
}
