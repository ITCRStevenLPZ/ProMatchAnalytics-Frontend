import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useMatchLogStore, MatchEvent } from "../store/useMatchLogStore";
import { useMatchSocket } from "../hooks/useMatchSocket";
import { useKeyboardInput } from "../hooks/useKeyboardInput";
import {
  fetchLoggerWithAuth,
  LOGGER_API_URL,
  IS_E2E_TEST_MODE,
  fetchAllMatchEvents,
  resetMatch,
} from "../lib/loggerApi";
import {
  Clock,
  AlertCircle,
  Wifi,
  WifiOff,
  CornerUpLeft,
  BarChart3,
  List,
  RotateCcw,
} from "lucide-react";
import {
  Match,
  Player,
  LoggerHarness,
  QueuedEventSummary,
} from "./logger/types";
import {
  DEFAULT_PERIOD_MAP,
  KEY_ACTION_MAP,
  QUICK_ACTIONS,
} from "./logger/constants";
import {
  normalizeMatchPayload,
  formatMatchClock,
  normalizeMatchClock,
} from "./logger/utils";
import { useActionFlow } from "./logger/hooks/useActionFlow";
import TeamSelector from "./logger/components/TeamSelector";
import InstructionBanner from "./logger/components/InstructionBanner";
import PlayerSelectorPanel from "./logger/components/PlayerSelectorPanel";
import ActionSelectionPanel from "./logger/components/ActionSelectionPanel";
import OutcomeSelectionPanel from "./logger/components/OutcomeSelectionPanel";
import RecipientSelectionPanel from "./logger/components/RecipientSelectionPanel";
import QuickActionMenu from "./logger/components/QuickActionMenu";
import { useMatchTimer } from "./logger/hooks/useMatchTimer";
import MatchTimerDisplay from "./logger/components/MatchTimerDisplay";
import LiveEventFeed from "./logger/components/LiveEventFeed";
import { MatchPeriodSelector } from "./logger/components/MatchPeriodSelector";
import {
  usePeriodManager,
  REGULATION_FIRST_HALF_SECONDS,
  REGULATION_SECOND_HALF_SECONDS,
  EXTRA_FIRST_HALF_END_SECONDS,
  EXTRA_SECOND_HALF_END_SECONDS,
} from "./logger/hooks/usePeriodManager";
import ExtraTimeAlert from "./logger/components/ExtraTimeAlert";
import HalftimePanel from "./logger/components/HalftimePanel";
import SubstitutionFlow from "./logger/components/SubstitutionFlow";
import { MatchAnalytics } from "./logger/components/MatchAnalytics";

import { useAuthStore } from "../store/authStore";

// Normalize timestamps for drift calculations
const parseTimestampSafe = (timestamp?: string | null): number => {
  if (!timestamp) return 0;
  const normalized =
    timestamp.endsWith("Z") ||
    timestamp.includes("+") ||
    timestamp.includes("-", 10)
      ? timestamp
      : `${timestamp}Z`;
  return new Date(normalized).getTime();
};

const parseClockToSeconds = (clock?: string): number => {
  if (!clock) return 0;
  const [mm, rest] = clock.split(":");
  const seconds = parseFloat(rest || "0");
  return Number(mm) * 60 + seconds;
};

const formatSecondsAsClock = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

declare global {
  interface Window {
    __PROMATCH_LOGGER_HARNESS__?: LoggerHarness;
  }
}

export default function LoggerCockpit() {
  const { t, ready: isLoggerReady } = useTranslation("logger");
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
    removeUndoCandidate,
    clearDuplicateHighlight,
    resetDuplicateStats,
    clearQueuedEvents,
    clearUndoStack,
    clearPendingAcks,
    removeLiveEventByClientId,
    removeQueuedEventByClientId,
    rejectPendingAck,
    lastTimelineRefreshRequest,
  } = useMatchLogStore();
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === "admin";
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
  const [selectedTeam, setSelectedTeam] = useState<"home" | "away" | "both">(
    "home",
  );
  const [undoError, setUndoError] = useState<string | null>(null);
  const [showSubstitutionFlow, setShowSubstitutionFlow] = useState(false);
  const [substitutionTeam, setSubstitutionTeam] = useState<"home" | "away">(
    "home",
  );
  const [onFieldIds, setOnFieldIds] = useState<{
    home: Set<string>;
    away: Set<string>;
  }>({
    home: new Set(),
    away: new Set(),
  });
  const [viewMode, setViewMode] = useState<"logger" | "analytics">("logger");
  const [priorityPlayerId, setPriorityPlayerId] = useState<string | null>(null);
  const [turboOpen, setTurboOpen] = useState(false);
  const [turboInput, setTurboInput] = useState("");
  const [turboError, setTurboError] = useState<string | null>(null);

  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    actionLabel?: string;
    action?: () => void;
  } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const lastDriftAutoSyncRef = useRef<number>(0);
  const driftExceededAtRef = useRef<number | null>(null);
  const lastGoalClientIdRef = useRef<string | null>(null);

  const getInitialOnField = useCallback((players: Player[]) => {
    const starters = players.filter((p) => p.is_starter !== false);
    if (starters.length) return starters;
    return players.slice(0, Math.min(11, players.length));
  }, []);

  useEffect(() => {
    if (!match) return;
    const home = new Set(
      getInitialOnField(match.home_team.players).map((p) => p.id),
    );
    const away = new Set(
      getInitialOnField(match.away_team.players).map((p) => p.id),
    );

    const applySubstitution = (
      teamId: string,
      playerOffId?: string,
      playerOnId?: string,
    ) => {
      const target =
        teamId === match.home_team.id
          ? home
          : teamId === match.away_team.id
            ? away
            : null;
      if (!target) return;
      if (playerOffId) target.delete(playerOffId);
      if (playerOnId) target.add(playerOnId);
    };

    liveEvents.forEach((event) => {
      if (event.type !== "Substitution") return;
      applySubstitution(
        event.team_id,
        event.data?.player_off_id,
        event.data?.player_on_id,
      );
    });

    setOnFieldIds({ home, away });
  }, [getInitialOnField, liveEvents, match]);

  const applyOnFieldChange = useCallback(
    (team: "home" | "away", playerOffId?: string, playerOnId?: string) => {
      setOnFieldIds((prev) => {
        const nextHome = new Set(prev.home);
        const nextAway = new Set(prev.away);
        const target = team === "home" ? nextHome : nextAway;
        if (playerOffId) target.delete(playerOffId);
        if (playerOnId) target.add(playerOnId);
        return { home: nextHome, away: nextAway };
      });
    },
    [],
  );

  // Fetch match data
  const fetchMatch = useCallback(async () => {
    if (!matchId || !isLoggerReady) return;
    try {
      const response = await fetchLoggerWithAuth(
        `${LOGGER_API_URL}/matches/${matchId}`,
      );
      if (!response.ok) {
        const errorPayload = await response.text().catch(() => "");
        console.error("Failed to fetch match payload", {
          status: response.status,
          statusText: response.statusText,
          body: errorPayload,
        });
        throw new Error("Failed to fetch match");
      }
      const data = await response.json();
      setMatch(normalizeMatchPayload(data));
    } catch (err: any) {
      setError(err.message || t("errorLoadingMatch"));
    } finally {
      setLoading(false);
    }
  }, [matchId, isLoggerReady, t]);

  useEffect(() => {
    fetchMatch();
  }, [fetchMatch]);

  useEffect(() => {
    setPriorityPlayerId(null);
  }, [matchId]);

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
    handleModeSwitch,
  } = useMatchTimer(match, fetchMatch);

  useEffect(() => {
    setIsBallInPlay(isGlobalClockRunning);
  }, [isGlobalClockRunning, setIsBallInPlay]);

  const isZeroedMatch = useMemo(() => {
    if (!match) return false;
    return (
      (match.match_time_seconds || 0) === 0 &&
      (match.ineffective_time_seconds || 0) === 0 &&
      (match.time_off_seconds || 0) === 0 &&
      !match.current_period_start_timestamp
    );
  }, [match]);

  const statusOverride = useMemo<Match["status"] | undefined>(() => {
    if (!match) return undefined;
    if (
      isZeroedMatch &&
      (match.status === "Fulltime" || match.status === "Completed")
    ) {
      return "Pending";
    }
    return match.status;
  }, [match, isZeroedMatch]);

  const matchForPhase = useMemo(() => {
    if (!match) return null;
    return { ...match, status: statusOverride ?? match.status } as Match;
  }, [match, statusOverride]);

  const serverSeconds = useMemo(() => {
    if (!match) return 0;
    const base =
      (match.match_time_seconds || 0) +
      (match.ineffective_time_seconds || 0) +
      (match.time_off_seconds || 0);
    if (!match.current_period_start_timestamp) return base;
    const start = parseTimestampSafe(match.current_period_start_timestamp);
    const elapsed = Math.max(0, (Date.now() - start) / 1000);
    return base + elapsed;
  }, [match, globalClock]);

  const localSeconds = useMemo(
    () => parseClockToSeconds(globalClock),
    [globalClock],
  );
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
        console.info("[Logger] Auto-resync due to clock drift", {
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
    transitionToExtraFirst,
    transitionToExtraHalftime,
    transitionToExtraSecond,
    transitionToPenalties,
    finishMatch,
    dismissExtraTimeAlert,
  } = usePeriodManager(
    matchForPhase,
    effectiveTime,
    clockMode,
    isGlobalClockRunning,
    handleModeSwitch,
    fetchMatch,
    ({ target, error }) => {
      const message = `Failed to update status to ${target}. ${
        error instanceof Error ? error.message : ""
      }`;
      setToast({
        message,
        actionLabel: "Retry",
        action: () => {
          if (target === "Halftime")
            guardTransition("Halftime", transitionToHalftime);
          if (target === "Live_Second_Half")
            guardTransition("Live_Second_Half", transitionToSecondHalf);
          if (target === "Fulltime")
            guardTransition("Fulltime", transitionToFulltime);
        },
      });
    },
  );

  const hydrateEvents = useCallback(async () => {
    if (!matchId) return;
    try {
      const events = await fetchAllMatchEvents(matchId);
      if (IS_E2E_TEST_MODE) {
        console.log("[hydrateEvents]", matchId, "items", events.length);
      }
      setLiveEvents(events);
    } catch (err) {
      console.error("Failed to hydrate match events", err);
    }
  }, [matchId, setLiveEvents]);

  // Comprehensive reset handler: clears all events and resets all timers
  const handleGlobalClockReset = useCallback(async () => {
    if (!matchId || !isAdmin) return;

    try {
      // Single backend call to clear events and reset clocks/status/scores
      const refreshed = await resetMatch(matchId);

      // Reflect backend truth locally
      setMatch(normalizeMatchPayload(refreshed as any));
      resetOperatorControls({ clock: "00:00.000", period: 1 });

      // Rehydrate events/timeline to reflect cleared state
      await hydrateEvents();

      // Clear all event-related state from the store (persists to IndexedDB)
      setLiveEvents([]);
      clearQueuedEvents();
      clearPendingAcks();
      clearUndoStack();

      // Reset duplicate tracking
      resetDuplicateStats();
      clearDuplicateHighlight();

      console.log("✅ Reset complete: backend match cleared and timers reset");
    } catch (error) {
      console.error("Failed to reset match:", error);
    }
  }, [
    matchId,
    isAdmin,
    setLiveEvents,
    clearQueuedEvents,
    clearUndoStack,
    resetDuplicateStats,
    clearDuplicateHighlight,
    resetOperatorControls,
    hydrateEvents,
    clearPendingAcks,
    setMatch,
  ]);

  const handleDeletePendingEvent = useCallback(
    (clientId: string) => {
      if (!clientId) return;
      // Remove from UI, Queue, and Pending Acks to prevent reappearance
      removeLiveEventByClientId(clientId);
      removeQueuedEventByClientId(clientId);
      rejectPendingAck(clientId);
    },
    [removeLiveEventByClientId, removeQueuedEventByClientId, rejectPendingAck],
  );

  const {
    currentStep,
    currentTeam,
    selectedPlayer,
    selectedAction,
    fieldAnchor,
    availableActions,
    availableOutcomes,
    handlePlayerClick,
    handleQuickActionSelect,
    handleOpenMoreActions,
    handleDestinationClick,
    handleActionClick,
    handleOutcomeClick,
    handleRecipientClick,
    resetFlow,
    currentStepRef,
  } = useActionFlow({
    match,
    globalClock,
    operatorPeriod,
    selectedTeam,
    isSubmitting,
    sendEvent,
  });

  const normalizeStatus = useCallback(
    (status?: Match["status"]): Match["status"] => {
      if (status === "Live") return "Live_First_Half";
      if (status === "Completed") return "Fulltime";
      return status || "Pending";
    },
    [],
  );

  const isTransitionAllowed = useCallback(
    (target: Match["status"]): boolean => {
      const current = normalizeStatus(statusOverride);
      const allowed: Record<Match["status"], Match["status"][]> = {
        Pending: ["Live_First_Half"],
        Live_First_Half: ["Halftime"],
        Halftime: ["Live_Second_Half"],
        Live_Second_Half: ["Fulltime"],
        Live: ["Halftime"],
        Fulltime: ["Live_Extra_First", "Penalties"], // Allow branching to Extra Time or Penalties
        Abandoned: [],
        Live_Extra_First: ["Extra_Halftime"],
        Extra_Halftime: ["Live_Extra_Second"],
        Live_Extra_Second: ["Penalties", "Fulltime"], // End match or Penalties
        Penalties: ["Fulltime"],
        Completed: [],
        Scheduled: ["Live_First_Half"],
      };
      const allowedTargets = allowed[current] || [];
      return allowedTargets.includes(target);
    },
    [statusOverride, normalizeStatus],
  );

  const bypassMinimums =
    IS_E2E_TEST_MODE &&
    !(
      typeof window !== "undefined" &&
      (window as any).__PROMATCH_E2E_ENFORCE_MINIMUMS__
    );

  // Use global time (not effective time) for phase transition validation
  const globalTimeSeconds = parseClockToSeconds(globalClock);

  const hasFirstHalfMinimum =
    bypassMinimums || globalTimeSeconds >= REGULATION_FIRST_HALF_SECONDS;
  const hasSecondHalfMinimum =
    bypassMinimums || globalTimeSeconds >= REGULATION_SECOND_HALF_SECONDS;
  const hasExtraFirstHalfMinimum =
    bypassMinimums || globalTimeSeconds >= EXTRA_FIRST_HALF_END_SECONDS;
  const hasExtraSecondHalfMinimum =
    bypassMinimums || globalTimeSeconds >= EXTRA_SECOND_HALF_END_SECONDS;
  const minimumFirstHalfReason = t(
    "transitionMinimumFirstHalf",
    "Need at least 45:00 of global time to end 1st half (current {{clock}}).",
    { clock: globalClock },
  );
  const minimumSecondHalfReason = t(
    "transitionMinimumSecondHalf",
    "Need at least 90:00 of global time to end 2nd half (current {{clock}}).",
    { clock: globalClock },
  );
  const minimumExtraFirstHalfReason = t(
    "transitionMinimumExtraFirstHalf",
    "Need at least 15:00 of extra time to end ET 1st half (current {{clock}}).",
    {
      clock: formatSecondsAsClock(
        Math.max(0, globalTimeSeconds - REGULATION_SECOND_HALF_SECONDS),
      ),
    },
  );
  const minimumExtraSecondHalfReason = t(
    "transitionMinimumExtraSecondHalf",
    "Need at least 15:00 of extra time to end ET 2nd half (current {{clock}}).",
    {
      clock: formatSecondsAsClock(
        Math.max(0, globalTimeSeconds - EXTRA_FIRST_HALF_END_SECONDS),
      ),
    },
  );

  const guardTransition = useCallback(
    (target: Match["status"], fn?: () => void) => {
      if (!fn) return;
      const current = normalizeStatus(statusOverride);
      if (
        target === "Halftime" &&
        currentPhase === "FIRST_HALF" &&
        !hasFirstHalfMinimum
      ) {
        setTransitionError(minimumFirstHalfReason);
        return;
      }

      if (
        target === "Fulltime" &&
        currentPhase === "SECOND_HALF" &&
        !hasSecondHalfMinimum
      ) {
        setTransitionError(minimumSecondHalfReason);
        return;
      }

      if (
        target === "Extra_Halftime" &&
        currentPhase === "FIRST_HALF_EXTRA_TIME" &&
        !hasExtraFirstHalfMinimum
      ) {
        setTransitionError(minimumExtraFirstHalfReason);
        return;
      }

      if (
        (target === "Penalties" || target === "Fulltime") &&
        currentPhase === "SECOND_HALF_EXTRA_TIME" &&
        !hasExtraSecondHalfMinimum
      ) {
        setTransitionError(minimumExtraSecondHalfReason);
        return;
      }
      // Allow Fulltime button to auto-walk Halftime -> Live_Second_Half -> Fulltime even if current status is earlier.
      if (!isTransitionAllowed(target)) {
        const canAutoAdvance =
          target === "Fulltime" &&
          ["Pending", "Live", "Live_First_Half", "Halftime"].includes(
            current as Match["status"],
          );

        if (!canAutoAdvance) {
          setTransitionError(
            `Transition not allowed: ${current} → ${target}. Follow Pending → Live_First_Half → Halftime → Live_Second_Half → Fulltime.`,
          );
          return;
        }
      }
      setTransitionError(null);
      fn();
    },
    [
      currentPhase,
      hasFirstHalfMinimum,
      hasSecondHalfMinimum,
      hasExtraFirstHalfMinimum,
      hasExtraSecondHalfMinimum,
      isTransitionAllowed,
      minimumFirstHalfReason,
      minimumSecondHalfReason,
      minimumExtraFirstHalfReason,
      minimumExtraSecondHalfReason,
      statusOverride,
      normalizeStatus,
    ],
  );

  const currentStatusNormalized = normalizeStatus(statusOverride);
  const cockpitLocked = currentStatusNormalized === "Fulltime";
  const lockReason = cockpitLocked
    ? t("lockReasonFulltime", "Match is Fulltime. Cockpit is read-only.")
    : undefined;

  const determinePlayerTeam = useCallback(
    (player: Player): "home" | "away" | null => {
      if (!match) return null;
      if (
        match.home_team.players.some(
          (homePlayer) => homePlayer.id === player.id,
        )
      ) {
        return "home";
      }
      if (
        match.away_team.players.some(
          (awayPlayer) => awayPlayer.id === player.id,
        )
      ) {
        return "away";
      }
      return null;
    },
    [match],
  );

  const getTeamSide = useCallback(
    (teamId?: string | null): "home" | "away" | null => {
      if (!match || !teamId) return null;
      if (teamId === match.home_team.id) return "home";
      if (teamId === match.away_team.id) return "away";
      return null;
    },
    [match],
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
    [
      cockpitLocked,
      determinePlayerTeam,
      handlePlayerClick,
      selectedTeam,
      setSelectedTeam,
    ],
  );

  const handleFieldPlayerSelection = useCallback(
    (
      player: Player,
      anchor: { xPercent: number; yPercent: number },
      location: [number, number],
      side: "home" | "away",
    ) => {
      if (cockpitLocked) return;

      if (currentStep === "selectDestination") {
        const result = handleDestinationClick({
          destination: {
            xPercent: anchor.xPercent,
            yPercent: anchor.yPercent,
            statsbomb: location,
            isOutOfBounds: false,
          },
          targetPlayer: player,
        });
        if (result?.outOfBounds || result?.isGoal) {
          handleModeSwitch("INEFFECTIVE");
          setIsBallInPlay(false);
        }
        return;
      }

      if (side !== selectedTeam) {
        setSelectedTeam(side);
      }
      handlePlayerClick(player, anchor, location);
    },
    [
      cockpitLocked,
      currentStep,
      handleDestinationClick,
      handleModeSwitch,
      handlePlayerClick,
      selectedTeam,
      setIsBallInPlay,
      setSelectedTeam,
    ],
  );

  const handleFieldDestination = useCallback(
    (destination: {
      xPercent: number;
      yPercent: number;
      statsbomb: [number, number];
      isOutOfBounds: boolean;
    }) => {
      if (cockpitLocked || currentStep !== "selectDestination") return;
      const result = handleDestinationClick({ destination });
      if (result?.outOfBounds || result?.isGoal) {
        handleModeSwitch("INEFFECTIVE");
        setIsBallInPlay(false);
      }
    },
    [
      cockpitLocked,
      currentStep,
      handleDestinationClick,
      handleModeSwitch,
      setIsBallInPlay,
    ],
  );

  const handleTeamChange = useCallback(
    (team: "home" | "away" | "both") => {
      if (cockpitLocked) return;
      setSelectedTeam(team);
      resetFlow();
    },
    [cockpitLocked, resetFlow],
  );

  // Override action click for substitution - open modal instead
  const handleActionClickOverride = useCallback(
    (action: string) => {
      if (cockpitLocked) return;
      if (action === "Substitution") {
        const teamForSub = selectedPlayer
          ? determinePlayerTeam(selectedPlayer) || "home"
          : selectedTeam === "both"
            ? "home"
            : selectedTeam;
        setSubstitutionTeam(teamForSub);
        setShowSubstitutionFlow(true);
        resetFlow();
      } else {
        handleActionClick(action);
      }
    },
    [
      cockpitLocked,
      selectedPlayer,
      determinePlayerTeam,
      selectedTeam,
      resetFlow,
      handleActionClick,
    ],
  );

  const handleOutcomeSelect = useCallback(
    (outcome: string) => {
      if (cockpitLocked) return;
      handleOutcomeClick(outcome);
    },
    [cockpitLocked, handleOutcomeClick],
  );

  const handleRecipientSelect = useCallback(
    (player: Player) => {
      if (cockpitLocked) return;
      setPriorityPlayerId(player.id);
      handleRecipientClick(player);
    },
    [cockpitLocked, handleRecipientClick],
  );

  const eligibleRecipients = useMemo(() => {
    if (!currentTeam || !match) return [] as Player[];
    const side = getTeamSide(currentTeam.id);
    if (!side) return [] as Player[];
    const onField = onFieldIds[side];
    return currentTeam.players.filter(
      (p) => onField.has(p.id) && p.id !== selectedPlayer?.id,
    );
  }, [currentTeam, match, getTeamSide, onFieldIds, selectedPlayer]);

  const { buffer } = useKeyboardInput({
    disabled: isSubmitting || cockpitLocked,
    onNumberCommit: (number) => {
      if (cockpitLocked) return;
      if (currentStep === "selectPlayer") {
        if (!match) return;
        const homePlayer = match.home_team.players.find(
          (player) => player.jersey_number === number,
        );
        const awayPlayer = match.away_team.players.find(
          (player) => player.jersey_number === number,
        );
        const player = homePlayer || awayPlayer;
        if (player) {
          const playerTeam: "home" | "away" = homePlayer ? "home" : "away";
          if (playerTeam !== selectedTeam) {
            setSelectedTeam(playerTeam);
          }
          handlePlayerClick(player);
        }
        return;
      }

      if (!currentTeam) return;

      if (currentStep === "selectRecipient") {
        const recipient = eligibleRecipients.find(
          (p) => p.jersey_number === number,
        );
        if (recipient) {
          setPriorityPlayerId(recipient.id);
          handleRecipientClick(recipient);
        }
        return;
      }
      if (currentStep === "selectOutcome") {
        const outcome = availableOutcomes[number - 1];
        if (outcome) handleOutcomeClick(outcome);
      }
    },
    onKeyAction: (key) => {
      if (cockpitLocked) return;
      if (key === "Escape") {
        resetFlow();
        return;
      }

      const normalizedKey = key.length === 1 ? key : key.toUpperCase();
      const mappedAction =
        KEY_ACTION_MAP[normalizedKey] || KEY_ACTION_MAP[key.toUpperCase()];

      if (mappedAction === "ToggleClock" || key === " ") {
        // Toggle ball in play state via backend
        if (isBallInPlay) {
          setIsBallInPlay(false);
          handleGlobalClockStop();
        } else {
          setIsBallInPlay(true);
          handleGlobalClockStart();
        }
        return;
      }

      if (mappedAction && currentStep === "selectQuickAction") {
        if (QUICK_ACTIONS.includes(mappedAction as any)) {
          handleQuickActionSelect(mappedAction);
        } else {
          handleActionClick(mappedAction);
        }
      }

      if (mappedAction && currentStep === "selectAction") {
        handleActionClick(mappedAction);
      }
    },
  });

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
    const defaultPeriod =
      DEFAULT_PERIOD_MAP[statusOverride || match.status] ?? 1;
    resetOperatorControls({ clock: defaultClock, period: defaultPeriod });
  }, [match, resetOperatorControls]);

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

  const handleModeSwitchGuarded = useCallback(
    (mode: "EFFECTIVE" | "INEFFECTIVE" | "TIMEOFF") => {
      if (cockpitLocked) return;
      handleModeSwitch(mode);
    },
    [cockpitLocked, handleModeSwitch],
  );

  const handleClockBlur = useCallback(() => {
    if (!operatorClock || operatorClock === "00:00.000") return;
    const normalized = normalizeMatchClock(operatorClock);
    if (normalized) {
      setOperatorClock(normalized);
    } else {
      // Invalid input; revert to global clock or show error toast?
      // For now, let's just revert to global clock (safe state)
      setOperatorClock(globalClock);
      setToast({
        message: t(
          "invalidClockFormat",
          "Invalid clock format. Reverted to system time.",
        ),
      });
      setTimeout(() => setToast(null), 3000);
    }
  }, [operatorClock, globalClock, setOperatorClock, t]);

  useEffect(() => {
    if (cockpitLocked) {
      resetFlow();
    }
  }, [cockpitLocked, resetFlow]);

  useEffect(() => {
    if (!IS_E2E_TEST_MODE || !match) return;

    const ensurePlayers = (
      team: Match["home_team"],
      prefix: "HOME" | "AWAY",
    ) => {
      const hasRoster = Array.isArray(team.players) && team.players.length >= 2;
      if (hasRoster) return team.players;
      const teamLabel = prefix === "HOME" ? "Home" : "Away";
      return [1, 2].map((n) => ({
        id: `${prefix}-${n}`,
        jersey_number: n,
        full_name: `${teamLabel} Player ${n}`,
        short_name: `${teamLabel[0]}P${n}`,
        position: "MF",
      })) as Match["home_team"]["players"];
    };

    match.home_team.players = ensurePlayers(match.home_team, "HOME");
    match.away_team.players = ensurePlayers(match.away_team, "AWAY");
  }, [match]);

  const goalEvents = useMemo(() => {
    if (!match) return { home: [] as MatchEvent[], away: [] as MatchEvent[] };
    const homeIds = new Set(match.home_team.players.map((p) => p.id));
    const awayIds = new Set(match.away_team.players.map((p) => p.id));
    const goals = liveEvents.filter(
      (event) => event.type === "Shot" && event.data?.outcome === "Goal",
    );
    return {
      home: goals.filter((event) => homeIds.has(event.player_id ?? "")),
      away: goals.filter((event) => awayIds.has(event.player_id ?? "")),
    };
  }, [liveEvents, match]);

  const liveScore = useMemo(() => {
    if (!match) return { home: 0, away: 0 };
    return {
      home: goalEvents.home.length,
      away: goalEvents.away.length,
    };
  }, [goalEvents, match]);

  const formatGoalLabel = useCallback(
    (event: MatchEvent) => {
      if (!match) return `${event.match_clock}`;
      const player =
        match.home_team.players.find((p) => p.id === event.player_id) ||
        match.away_team.players.find((p) => p.id === event.player_id);
      const playerLabel = player
        ? `#${player.jersey_number} ${player.full_name}`
        : event.player_id ?? "";
      return `${event.match_clock} · ${playerLabel}`;
    },
    [match],
  );

  useEffect(() => {
    if (!duplicateHighlight) return;
    const timer = setTimeout(() => {
      clearDuplicateHighlight();
    }, 5000);
    return () => clearTimeout(timer);
  }, [duplicateHighlight, clearDuplicateHighlight]);

  useEffect(() => {
    if (!liveEvents.length) return;
    const latest = liveEvents[liveEvents.length - 1];
    if (!latest) return;
    if (latest.type !== "Shot" || latest.data?.outcome !== "Goal") return;
    if (!latest.client_id) return;
    if (lastGoalClientIdRef.current === latest.client_id) return;

    lastGoalClientIdRef.current = latest.client_id;
    handleModeSwitch("INEFFECTIVE");
    setIsBallInPlay(false);
  }, [liveEvents, handleModeSwitch, setIsBallInPlay]);

  const parseTurboInput = useCallback(() => {
    if (!match) return { error: t("turbo.invalidCode", "Enter a turbo code") };
    const raw = turboInput.trim().toLowerCase();
    if (!raw) return { error: t("turbo.invalidCode", "Enter a turbo code") };

    const parsed = raw.match(
      /^(?<team>[ha])?(?<jersey>\d+)p(?<outcome>[123])(?:>(?<recipient>\d+))?$/i,
    );
    const groups = parsed?.groups;
    if (!groups) return { error: t("turbo.invalidCode", "Enter a turbo code") };

    const teamFromPrefix =
      groups.team === "a" ? "away" : groups.team === "h" ? "home" : null;
    const teamSide: "home" | "away" =
      teamFromPrefix || (selectedTeam === "away" ? "away" : "home");
    const passerJersey = Number(groups.jersey);
    const recipientJersey = groups.recipient ? Number(groups.recipient) : null;
    if (!recipientJersey) {
      return { error: "Pass needs a recipient" };
    }

    const outcomeMap: Record<string, "Complete" | "Incomplete" | "KeyPass"> = {
      "1": "Complete",
      "2": "Incomplete",
      "3": "KeyPass",
    };
    const outcome = outcomeMap[groups.outcome] || "Complete";

    const team = teamSide === "away" ? match.away_team : match.home_team;
    const passer =
      team.players?.find((p) => p.jersey_number === passerJersey) || null;
    const recipient =
      team.players?.find((p) => p.jersey_number === recipientJersey) || null;

    if (!passer || !recipient) {
      return {
        error: t("turbo.invalidCode", "Player not found for turbo code"),
      };
    }

    return { team, passer, recipient, outcome };
  }, [match, selectedTeam, turboInput, t]);

  useEffect(() => {
    if (!turboInput.trim()) {
      setTurboError(null);
      return;
    }
    const parsed = parseTurboInput();
    if (!parsed || "error" in parsed) {
      setTurboError(parsed?.error ?? "Pass needs a recipient");
    } else {
      setTurboError(null);
    }
  }, [parseTurboInput, turboInput]);

  const triggerTurboAudio = useCallback(() => {
    try {
      const AudioCtor =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = new AudioCtor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
      if (ctx.close) {
        ctx.close();
      }
    } catch (err) {
      console.warn("turbo audio failed", err);
    }
  }, []);

  const handleTurboLog = useCallback(() => {
    const parsed = parseTurboInput();
    if (!parsed || "error" in parsed) {
      setTurboError(parsed?.error ?? "Pass needs a recipient");
      return;
    }

    sendEvent({
      match_clock: globalClock,
      period: operatorPeriod,
      team_id: parsed.team.id,
      player_id: parsed.passer.id,
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: parsed.outcome,
        receiver_id: parsed.recipient.id,
        receiver_name: parsed.recipient.full_name,
      },
    });
    triggerTurboAudio();
    setTurboError(null);
    setTurboInput("");
  }, [
    parseTurboInput,
    sendEvent,
    globalClock,
    operatorPeriod,
    triggerTurboAudio,
  ]);

  // Note: WebSocket connection is automatically managed by useMatchSocket hook

  const sendHarnessPassEvent = useCallback(
    (options: {
      team: "home" | "away";
      passerId: string;
      recipientId: string;
    }) => {
      if (!match) return;
      const { team, passerId, recipientId } = options;
      const targetTeam = team === "home" ? match.home_team : match.away_team;
      const passer = targetTeam.players?.find(
        (player) => player.id === passerId,
      );
      const recipient = targetTeam.players?.find(
        (player) => player.id === recipientId,
      );
      if (!passer || !recipient) return;

      const eventData: Omit<MatchEvent, "match_id" | "timestamp"> = {
        match_clock: operatorClock?.trim()
          ? operatorClock
          : formatMatchClock(match.match_time_seconds),
        period: operatorPeriod,
        team_id: targetTeam.id,
        player_id: passer.id,
        type: "Pass",
        data: {
          pass_type: "Standard",
          outcome: "Complete",
          receiver_id: recipient.id,
          receiver_name: recipient.full_name,
        },
      };

      sendEvent(eventData);
    },
    [match, operatorClock, operatorPeriod, sendEvent],
  );

  const sendHarnessRawEvent = useCallback(
    (payload: Record<string, any>) => {
      sendEvent(payload as Omit<MatchEvent, "match_id" | "timestamp">);
    },
    [sendEvent],
  );

  const lastUndoClientId = undoStack.length
    ? undoStack[undoStack.length - 1]
    : null;
  const lastUndoEvent = lastUndoClientId
    ? liveEvents.find((event) => event.client_id === lastUndoClientId) ||
      queuedEvents.find((event) => event.client_id === lastUndoClientId)
    : null;
  const undoRequiresConnection = Boolean(
    lastUndoClientId && (pendingAcks[lastUndoClientId] || lastUndoEvent?._id),
  );
  const undoDisabled =
    !lastUndoEvent || cockpitLocked || (undoRequiresConnection && !isConnected);

  const handleUndoLastEvent = useCallback(async () => {
    if (cockpitLocked) {
      setUndoError(
        lockReason || t("undoLocked", "Cannot undo while cockpit is locked."),
      );
      return;
    }
    if (!lastUndoClientId || !lastUndoEvent) {
      setUndoError(t("undoUnavailable", "No event available to undo."));
      return;
    }

    setUndoError(null);

    const isOfflineQueued =
      !pendingAcks[lastUndoClientId] && !lastUndoEvent._id;

    if (isOfflineQueued || !undoRequiresConnection) {
      removeLiveEventByClientId(lastUndoClientId);
      removeQueuedEvent(lastUndoEvent);
      removeUndoCandidate(lastUndoClientId);
      return;
    }

    try {
      undoEvent(lastUndoEvent);
    } catch (error) {
      console.error("Undo failed", error);
      setUndoError(
        t(
          "undoFailed",
          "Unable to undo the last event. Try again when the connection is back.",
        ),
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
            Object.entries(state.queuedEventsByMatch).map(
              ([matchKey, events]) => [matchKey, summarize(events)],
            ),
          ),
        };
      },
      clearQueue: () => {
        useMatchLogStore.getState().clearQueuedEvents();
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
        <div className="text-xl">{t("loading")}</div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-red-600">
          {error || t("errorLoadingMatch")}
        </div>
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
    ? new Date(duplicateStats.lastSeenAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;
  const lastDuplicateSummaryParts: string[] = [
    duplicateStats.lastEventType || "Event",
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
  const lastDuplicateSummaryDetails = lastDuplicateSummaryParts.join(" • ");
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
  const duplicateSessionDetails = duplicateSessionParts.join(" • ");
  const duplicateSessionDetailsSuffix = duplicateSessionParts.length
    ? ` • ${duplicateSessionDetails}`
    : "";
  const duplicateSessionSummaryDefault = `Session duplicates: ${duplicateStats.count}${duplicateSessionDetailsSuffix}`;
  const duplicateDetailsDefault = duplicateHighlight
    ? `An event is already recorded at ${duplicateHighlight.match_clock} (period ${duplicateHighlight.period}).`
    : "";
  const duplicateExistingEventDefault = duplicateHighlight?.existing_event_id
    ? `Existing event ID: ${duplicateHighlight.existing_event_id}`
    : "";

  const canHalftime = isTransitionAllowed("Halftime");
  const canSecondHalf = isTransitionAllowed("Live_Second_Half");
  const canFulltime = isTransitionAllowed("Fulltime");
  const transitionGuardMessage = t(
    "transitionGuardMessage",
    "Follow order: Pending → Live_First_Half → Halftime → Live_Second_Half → Fulltime (current: {{status}}).",
    { status: currentStatusNormalized },
  );

  const isFulltime =
    match?.status === "Completed" || match?.status === "Fulltime";
  const resetBlocked = queuedCount > 0 || pendingAckCount > 0;
  const resetBlockReason =
    queuedCount > 0
      ? t(
          "resetBlockedQueued",
          "{{count}} event(s) queued — clear them before reset.",
          { count: queuedCount },
        )
      : pendingAckCount > 0
        ? t(
            "resetBlockedPending",
            "{{count}} event(s) awaiting server confirmation.",
            { count: pendingAckCount },
          )
        : undefined;
  const resetDisabledReason = resetBlockReason;
  const resetTooltip =
    resetDisabledReason ||
    (isFulltime
      ? t(
          "resetAfterFulltimeTooltip",
          "Match is completed; reset will wipe data and restart.",
        )
      : undefined);

  const openResetModal = () => {
    if (!isAdmin) return;
    setShowResetModal(true);
    setResetConfirmText("");
  };

  const confirmGlobalReset = async () => {
    if (resetBlocked || resetConfirmText !== "RESET") return;
    await handleGlobalClockReset();
    setShowResetModal(false);
    setResetConfirmText("");
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="bg-slate-900 shadow-sm border-b border-slate-700">
        <div className="max-w-screen-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-slate-100">
                {t("cockpit")}
              </h1>
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <span
                    data-testid="connection-status"
                    data-status="connected"
                    className="flex items-center gap-1 text-green-600 text-sm"
                  >
                    <Wifi size={16} />
                    {t("connected")}
                  </span>
                ) : (
                  <span
                    data-testid="connection-status"
                    data-status="disconnected"
                    className="flex items-center gap-1 text-red-600 text-sm"
                  >
                    <WifiOff size={16} />
                    {t("disconnected")}
                  </span>
                )}
                {queuedEvents.length > 0 && (
                  <span
                    data-testid="queued-badge"
                    className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs"
                  >
                    {queuedEvents.length} {t("queued")}
                  </span>
                )}
                {isSubmitting && (
                  <span
                    className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs"
                    data-testid="pending-ack-badge"
                  >
                    {t("waitingForServer", "Awaiting server confirmation…")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleUndoLastEvent}
                  disabled={undoDisabled}
                  data-testid="undo-button"
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                    undoDisabled
                      ? "text-slate-600 border-slate-700 cursor-not-allowed"
                      : "text-slate-300 border-slate-600 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <CornerUpLeft size={14} />
                  {t("undoLast", "Undo last")}
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openResetModal}
                    // disabled={resetBlocked} // ALLOW FORCE RESET
                    data-testid="btn-reset-clock"
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                      resetBlocked
                        ? "text-red-300 border-red-100 cursor-not-allowed"
                        : "text-red-700 border-red-300 hover:bg-red-50"
                    }`}
                    title={resetTooltip}
                  >
                    <RotateCcw size={14} />
                    {t("reset", "Reset")}
                  </button>
                )}
              </div>
              {showResetModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
                    <h3 className="text-lg font-bold mb-3 text-red-600 flex items-center gap-2">
                      <RotateCcw size={20} />
                      {t("confirmReset", "Confirm Reset")}
                    </h3>
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
                      <p className="text-red-800 font-semibold mb-2">
                        ⚠️ {t("warning", "WARNING")}
                      </p>
                      <p className="text-red-700 text-sm mb-1">
                        {t(
                          "resetWarning1",
                          "This will permanently delete ALL logged events and reset all timers!",
                        )}
                      </p>
                      <p className="text-red-700 text-sm">
                        {t(
                          "resetWarning2",
                          "This action CANNOT be undone. All match data will be lost.",
                        )}
                      </p>
                      {isFulltime && (
                        <p className="text-red-700 text-sm mt-2">
                          {t(
                            "resetAfterFulltimeWarning",
                            "Match is fulltime. Resetting will clear logs and restart clocks from zero.",
                          )}
                        </p>
                      )}
                      {resetBlocked && (
                        <p className="text-red-700 text-sm mt-2">
                          {resetDisabledReason ||
                            t(
                              "resetBlockedUnsent",
                              "Unsent events detected. Clear queue/acks before resetting.",
                            )}
                        </p>
                      )}
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t(
                          "typeResetToConfirm",
                          "Type RESET in capital letters to confirm:",
                        )}
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
                          setResetConfirmText("");
                        }}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                      >
                        {t("cancel", "Cancel")}
                      </button>
                      <button
                        onClick={confirmGlobalReset}
                        disabled={resetConfirmText !== "RESET"}
                        className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t("yesReset", "Yes, Reset")}
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
              <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1 border border-slate-700">
                <button
                  onClick={() => setViewMode("logger")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                    viewMode === "logger"
                      ? "bg-slate-700 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <List size={16} />
                  {t("logger.view", "Logger")}
                </button>
                <button
                  onClick={() => setViewMode("analytics")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                    viewMode === "analytics"
                      ? "bg-slate-700 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  data-testid="toggle-analytics"
                >
                  <BarChart3 size={16} />
                  {t("logger.analytics", "Analytics")}
                </button>
              </div>
              <div className="text-sm text-slate-400 font-mono font-bold">
                <Clock className="inline mr-1" size={16} />
                {Math.floor((match.match_time_seconds || 0) / 60)}:
                {String((match.match_time_seconds || 0) % 60).padStart(2, "0")}
              </div>
              {(() => {
                const statusForDisplay = (
                  statusOverride ||
                  match.status ||
                  "Pending"
                ).toLowerCase();
                const colorClass =
                  statusForDisplay === "live" ||
                  statusForDisplay === "live_first_half"
                    ? "bg-green-100 text-green-700"
                    : statusForDisplay === "halftime"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-700";
                return (
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${colorClass}`}
                  >
                    {t(`status.${statusForDisplay}`)}
                  </span>
                );
              })()}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex flex-col flex-1">
              <div className="text-xl font-bold text-slate-100 text-center">
                {t("matchTitle", "{{home}} vs {{away}}", {
                  home: match.home_team.name,
                  away: match.away_team.name,
                })}
              </div>
              {/* Stadium Score Display */}
              <div className="mt-3 w-full flex justify-center">
                <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 shadow-lg bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-3 flex items-center gap-4 min-w-[260px]">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.06),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.04),transparent_30%)]" />
                  <div className="flex flex-col items-center z-10">
                    <span className="text-xs uppercase tracking-wide text-slate-300">
                      {match.home_team.name}
                    </span>
                    <span
                      className="text-4xl font-black text-emerald-300 drop-shadow"
                      data-testid="home-score"
                    >
                      {liveScore.home || match.home_team.score || 0}
                    </span>
                  </div>
                  <div className="z-10 flex flex-col items-center px-4">
                    <span className="text-xs font-semibold text-slate-400">
                      {t("statusLabel", "Status")}
                    </span>
                    <span className="text-lg font-black text-slate-200">
                      {t("vs", "VS")}
                    </span>
                  </div>
                  <div className="flex flex-col items-center z-10">
                    <span className="text-xs uppercase tracking-wide text-slate-300 text-right">
                      {match.away_team.name}
                    </span>
                    <span
                      className="text-4xl font-black text-amber-300 drop-shadow"
                      data-testid="away-score"
                    >
                      {liveScore.away || match.away_team.score || 0}
                    </span>
                  </div>
                </div>
              </div>
              {(goalEvents.home.length > 0 || goalEvents.away.length > 0) && (
                <div
                  className="mt-3 w-full flex flex-col items-center gap-2"
                  data-testid="goal-log-board"
                >
                  <span className="text-xs uppercase tracking-widest text-slate-400">
                    {t("goalIndicator", "Goal")}
                  </span>
                  <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="flex flex-col items-center gap-1">
                      {goalEvents.home.map((event) => (
                        <span
                          key={
                            event.client_id || event._id || event.match_clock
                          }
                          data-testid="goal-log-home"
                          className="text-xs text-emerald-200 bg-emerald-900/30 border border-emerald-700/40 px-2 py-1 rounded-full"
                        >
                          {formatGoalLabel(event)}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      {goalEvents.away.map((event) => (
                        <span
                          key={
                            event.client_id || event._id || event.match_clock
                          }
                          data-testid="goal-log-away"
                          className="text-xs text-amber-200 bg-amber-900/30 border border-amber-700/40 px-2 py-1 rounded-full"
                        >
                          {formatGoalLabel(event)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              {queuedCount > 0 && (
                <span
                  className="flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200"
                  title="Events queued for send"
                >
                  🔄{" "}
                  {t("queuedLabel", "Queued: {{count}}", {
                    count: queuedCount,
                  })}
                </span>
              )}
              {pendingAckCount > 0 && (
                <span
                  className="flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-semibold border border-blue-200"
                  title="Awaiting server acknowledgements"
                >
                  ⏳{" "}
                  {t("pendingAckLabel", "Pending acks: {{count}}", {
                    count: pendingAckCount,
                  })}
                </span>
              )}
              {(transitionError || toast?.message) && (
                <span
                  className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-800 font-semibold border border-red-200"
                  title="Last error"
                >
                  ⚠️ {transitionError || toast?.message}
                </span>
              )}
            </div>
          </div>

          {/* Status Ribbon */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-2 bg-slate-800 rounded-md px-3 py-2 border border-slate-700">
              <span className="font-semibold text-slate-400">
                {t("statusLabel", "Status")}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-700 text-blue-300 font-semibold border border-blue-900/30">
                {currentStatusNormalized}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-slate-800 rounded-md px-3 py-2 border border-slate-700">
              <span className="font-semibold text-slate-400">
                {t("phaseLabel", "Phase")}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-700 text-emerald-300 font-semibold border border-emerald-900/30">
                {currentPhase}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-slate-800 rounded-md px-3 py-2 border border-slate-700">
              <span className="font-semibold text-slate-400">
                {t("clockModeLabel", "Clock Mode")}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-700 text-indigo-300 font-semibold border border-indigo-900/30">
                {clockMode}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-slate-800 rounded-md px-3 py-2 border border-slate-700">
              <span className="font-semibold text-slate-400">
                {t("runningLabel", "Running")}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-semibold border ${
                  isGlobalClockRunning
                    ? "bg-slate-700 text-green-400 border-green-900/30"
                    : "bg-slate-700 text-red-400 border-red-900/30"
                }`}
              >
                {isGlobalClockRunning
                  ? t("runningYes", "Yes")
                  : t("runningNo", "No")}
              </span>
            </div>
          </div>

          {cockpitLocked && (
            <div
              className="mt-3 flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2"
              data-testid="cockpit-lock-banner"
            >
              🔒{" "}
              {lockReason ||
                t(
                  "lockBanner",
                  "Match is closed (Fulltime). Editing is disabled.",
                )}
            </div>
          )}

          {/* Extra Time Alert */}
          {showExtraTimeAlert &&
            (currentPhase === "FIRST_HALF_EXTRA_TIME" ||
              currentPhase === "SECOND_HALF_EXTRA_TIME") && (
              <div className="mt-4">
                <ExtraTimeAlert
                  phase={currentPhase}
                  extraTimeSeconds={periodInfo.extraTimeSeconds}
                  onTransition={
                    currentPhase === "FIRST_HALF_EXTRA_TIME"
                      ? transitionToHalftime
                      : transitionToFulltime
                  }
                  onDismiss={dismissExtraTimeAlert}
                  t={t}
                />
              </div>
            )}

          <div className="mt-4 flex flex-col gap-4">
            {showDriftNudge && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                <div className="text-xs font-medium">
                  {t(
                    "clockDriftDetected",
                    "Clock drift detected (~{{seconds}}s). Refresh to resync with server time.",
                    {
                      seconds: driftSeconds.toFixed(1),
                    },
                  )}
                </div>
                <button
                  type="button"
                  onClick={fetchMatch}
                  className="text-xs font-semibold px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700"
                >
                  {t("resync", "Resync")}
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
              onTransitionToHalftime={() =>
                guardTransition("Halftime", transitionToHalftime)
              }
              onTransitionToSecondHalf={() =>
                guardTransition("Live_Second_Half", transitionToSecondHalf)
              }
              onTransitionToFulltime={() =>
                guardTransition("Fulltime", transitionToFulltime)
              }
              onTransitionToExtraFirst={() =>
                guardTransition("Live_Extra_First", transitionToExtraFirst)
              }
              onTransitionToExtraHalftime={() =>
                guardTransition("Extra_Halftime", transitionToExtraHalftime)
              }
              onTransitionToExtraSecond={() =>
                guardTransition("Live_Extra_Second", transitionToExtraSecond)
              }
              onTransitionToPenalties={() =>
                guardTransition("Penalties", transitionToPenalties)
              }
              onFinishMatch={() => guardTransition("Fulltime", finishMatch)}
              transitionDisabled={
                cockpitLocked ||
                !isAdmin ||
                (currentPhase === "FIRST_HALF"
                  ? !canHalftime || !hasFirstHalfMinimum
                  : currentPhase === "HALFTIME"
                    ? !canSecondHalf
                    : currentPhase === "FIRST_HALF_EXTRA_TIME"
                      ? !hasExtraFirstHalfMinimum
                      : currentPhase === "SECOND_HALF"
                        ? !canFulltime || !hasSecondHalfMinimum
                        : currentPhase === "SECOND_HALF_EXTRA_TIME"
                          ? !hasExtraSecondHalfMinimum
                          : false)
              }
              transitionReason={
                cockpitLocked
                  ? lockReason
                  : !isAdmin
                    ? t(
                        "adminOnlyTransitions",
                        "Admin only: match status changes are locked.",
                      )
                    : currentPhase === "FIRST_HALF" &&
                        (!canHalftime || !hasFirstHalfMinimum)
                      ? !hasFirstHalfMinimum
                        ? minimumFirstHalfReason
                        : transitionGuardMessage
                      : currentPhase === "HALFTIME" && !canSecondHalf
                        ? transitionGuardMessage
                        : currentPhase === "FIRST_HALF_EXTRA_TIME" &&
                            !hasExtraFirstHalfMinimum
                          ? minimumExtraFirstHalfReason
                          : currentPhase === "SECOND_HALF" &&
                              (!canFulltime || !hasSecondHalfMinimum)
                            ? !hasSecondHalfMinimum
                              ? minimumSecondHalfReason
                              : transitionGuardMessage
                            : currentPhase === "SECOND_HALF_EXTRA_TIME" &&
                                !hasExtraSecondHalfMinimum
                              ? minimumExtraSecondHalfReason
                              : undefined
              }
              t={t}
            />

            {transitionError && (
              <div
                className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3"
                data-testid="transition-error"
              >
                {transitionError}
              </div>
            )}

            <div className="bg-white rounded-lg p-4 border border-blue-100 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                  <AlertCircle size={16} className="text-blue-500" />
                  {t("duplicateTelemetry", "Duplicate telemetry")}
                </p>
                <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-1 rounded">
                  {duplicateStats.count} {t("eventsLabel", "events")}
                </span>
              </div>
              <div className="text-sm text-gray-700">
                {duplicateStats.count > 0 ? (
                  <>
                    <p className="font-medium text-gray-900">
                      {t(
                        "sessionDuplicates",
                        "{{count}} duplicates this session",
                        {
                          count: duplicateStats.count,
                        },
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {t("lastDuplicateSummary", {
                        details: lastDuplicateSummaryDetails,
                        eventType: duplicateStats.lastEventType || "Event",
                        matchClock: duplicateStats.lastMatchClock,
                        teamName: lastDuplicateTeamName,
                        seenAt: lastDuplicateSeenAt,
                        defaultValue: lastDuplicateSummaryDefault,
                      })}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">
                    {t(
                      "noDuplicatesYet",
                      "No duplicates detected this session.",
                    )}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={resetDuplicateStats}
                className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800 self-start"
                disabled={duplicateStats.count === 0}
              >
                {t("resetDuplicateCounter", "Reset counter")}
              </button>
            </div>
          </div>
        </div>
      </header>

      {duplicateHighlight && (
        <div
          className="max-w-screen-2xl mx-auto px-6 pt-4"
          data-testid="duplicate-banner"
        >
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium">
                {t("duplicateNotice", "Already logged")}
              </p>
              <p className="text-sm">
                {t("duplicateDetails", {
                  matchClock: duplicateHighlight.match_clock,
                  period: duplicateHighlight.period,
                  defaultValue: duplicateDetailsDefault,
                })}
              </p>
              {duplicateStats.count > 0 && (
                <p className="text-xs mt-2 text-blue-700">
                  {t("duplicateSessionSummary", {
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
                  {t("duplicateExistingEventId", {
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
                {t("dismiss", "Dismiss")}
              </button>
              {duplicateStats.count > 0 && (
                <button
                  type="button"
                  onClick={resetDuplicateStats}
                  className="text-blue-600 hover:text-blue-800 text-xs font-semibold"
                >
                  {t("resetDuplicateCounter", "Reset counter")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded shadow-lg max-w-sm flex items-start gap-3"
          data-testid="logger-toast"
        >
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
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        {buffer && (
          <div
            data-testid="keyboard-buffer"
            className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-2xl font-mono tracking-widest z-50"
          >
            <div className="text-xs uppercase text-gray-400 leading-none mb-1">
              Input
            </div>
            <div
              className="text-3xl font-mono font-bold"
              data-testid="keyboard-buffer-value"
            >
              {buffer}
            </div>
          </div>
        )}

        {/* Halftime Panel */}
        {currentPhase === "HALFTIME" && (
          <div className="mb-6">
            <HalftimePanel
              timeOffSeconds={match?.time_off_seconds || 0}
              onStartSecondHalf={transitionToSecondHalf}
              t={t}
            />
          </div>
        )}

        {/* Analytics View */}
        {viewMode === "analytics" ? (
          <div className="mb-6 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-900/60 border border-slate-800 px-3 py-2">
              <div className="flex items-center gap-2 text-slate-200 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">
                  {t("effectiveTime", "Effective Time")}
                </span>
                <span
                  className="font-mono font-semibold"
                  data-testid="effective-clock-value"
                >
                  {effectiveClock}
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-200 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">
                  {t("globalClock", "Global Clock")}
                </span>
                <span className="font-mono font-semibold">{globalClock}</span>
              </div>
            </div>
            <MatchAnalytics
              match={match}
              events={liveEvents}
              effectiveTime={effectiveTime}
              t={t}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-20">
            {/* 1. CLOCK (Full Width) */}
            <div className="flex-none space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {t("operatorClock", "Operator Clock")}
                </label>
                <input
                  data-testid="operator-clock-input"
                  className="w-full sm:w-48 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="00:00.000"
                  value={operatorClock || ""}
                  onChange={(e) => setOperatorClock(e.target.value)}
                  onBlur={handleClockBlur}
                  disabled={cockpitLocked}
                />
              </div>

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
            </div>

            {/* 2. TEAM SELECTOR (Full Width) */}
            <div className="flex-none">
              <TeamSelector
                match={match}
                selectedTeam={selectedTeam}
                onTeamChange={handleTeamChange}
                disabled={cockpitLocked}
              />
            </div>

            {/* 2. INSTRUCTION BANNER */}
            <div className="flex-none z-10">
              <InstructionBanner
                t={t}
                currentStep={currentStep}
                selectedPlayer={selectedPlayer}
                selectedAction={selectedAction}
              />
            </div>

            <div className="flex-none">
              <button
                type="button"
                data-testid="turbo-mode-toggle"
                onClick={() => setTurboOpen((open) => !open)}
                className="px-3 py-2 rounded-md bg-indigo-900/30 text-indigo-200 border border-indigo-500/40 hover:bg-indigo-900/50 text-xs font-semibold"
              >
                {t("turbo.label", "Turbo")}
              </button>
              {turboOpen && (
                <div
                  className="mt-2 bg-slate-900 border border-slate-700 rounded-md p-3 shadow-lg max-w-md"
                  data-testid="turbo-mode-input"
                >
                  <p className="text-xs text-slate-400 mb-2">
                    {t("turbo.enableTitle", "Enable Turbo Mode [`]")}
                  </p>
                  <input
                    value={turboInput}
                    onChange={(e) => {
                      setTurboInput(e.target.value);
                      setTurboError(null);
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100"
                    placeholder={t(
                      "turbo.formatCode",
                      "[team][jersey][action][outcome][>recipient]",
                    )}
                  />
                  {turboError && (
                    <p className="text-xs text-amber-400 mt-1">{turboError}</p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-blue-800 text-blue-100 rounded text-xs font-semibold border border-blue-500/50"
                      onClick={handleTurboLog}
                    >
                      {t("log", "Log")}
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-slate-800 text-slate-200 rounded text-xs border border-slate-600"
                      onClick={() => setTurboOpen(false)}
                    >
                      {t("dismiss", "Dismiss")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. ACTION STAGE (Field Interaction / Panels) */}
            <div className="min-h-[500px] flex-none bg-slate-800/30 rounded-xl p-4 border border-slate-700/50 relative flex flex-col">
              {match && (
                <PlayerSelectorPanel
                  match={match}
                  selectedPlayer={selectedPlayer}
                  selectedTeam={selectedTeam}
                  onFieldIds={onFieldIds}
                  onPlayerClick={handlePlayerSelection}
                  onFieldPlayerClick={handleFieldPlayerSelection}
                  onFieldDestinationClick={handleFieldDestination}
                  showDestinationControls={
                    currentStep === "selectDestination" && !cockpitLocked
                  }
                  fieldOverlay={
                    currentStep === "selectQuickAction" &&
                    selectedPlayer &&
                    fieldAnchor ? (
                      <QuickActionMenu
                        anchor={fieldAnchor}
                        actions={[...QUICK_ACTIONS]}
                        onActionSelect={handleQuickActionSelect}
                        onMoreActions={handleOpenMoreActions}
                        onCancel={resetFlow}
                        t={t}
                      />
                    ) : null
                  }
                  forceFieldMode
                  priorityPlayerId={priorityPlayerId}
                  isReadOnly={
                    !IS_E2E_TEST_MODE &&
                    (!isGlobalClockRunning || clockMode !== "EFFECTIVE")
                  }
                  t={t}
                />
              )}

              {currentStep === "selectAction" && (
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

              {currentStep === "selectOutcome" && (
                <OutcomeSelectionPanel
                  selectedAction={selectedAction}
                  outcomes={availableOutcomes}
                  isSubmitting={isSubmitting || cockpitLocked}
                  onOutcomeSelect={handleOutcomeSelect}
                  onCancel={resetFlow}
                  t={t}
                />
              )}

              {currentStep === "selectRecipient" && (
                <RecipientSelectionPanel
                  team={currentTeam}
                  eligiblePlayers={eligibleRecipients}
                  selectedAction={selectedAction}
                  isSubmitting={isSubmitting || cockpitLocked}
                  onRecipientSelect={handleRecipientSelect}
                  onCancel={resetFlow}
                  t={t}
                />
              )}
            </div>

            {/* 4. FEEDBACK: Live Event Feed (Stacked at Bottom) */}
            <div className="flex-none bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col">
              <div className="p-3 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
                <span className="font-semibold text-xs text-slate-400 uppercase tracking-wider">
                  Live Feed
                </span>
              </div>
              <div className="h-96 overflow-y-auto px-1">
                <LiveEventFeed
                  events={liveEvents}
                  match={match}
                  duplicateHighlight={duplicateHighlight}
                  onDeletePending={handleDeletePendingEvent}
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
          team={substitutionTeam === "home" ? match.home_team : match.away_team}
          availablePlayers={
            substitutionTeam === "home"
              ? match.home_team.players
              : match.away_team.players
          }
          onField={
            substitutionTeam === "home" ? onFieldIds.home : onFieldIds.away
          }
          period={operatorPeriod}
          globalClock={globalClock}
          onSubmit={(playerOffId, playerOnId, isConcussion) => {
            if (cockpitLocked) return;
            // Create substitution event
            const team =
              substitutionTeam === "home" ? match.home_team : match.away_team;
            const eventData: Omit<MatchEvent, "match_id" | "timestamp"> = {
              match_clock: globalClock,
              period: operatorPeriod,
              team_id: team.id,
              player_id: playerOffId, // Player leaving the field
              type: "Substitution",
              data: {
                player_off_id: playerOffId,
                player_on_id: playerOnId,
                is_concussion: isConcussion,
              },
            };
            applyOnFieldChange(substitutionTeam, playerOffId, playerOnId);
            sendEvent(eventData);
            setShowSubstitutionFlow(false);
          }}
          onCancel={() => setShowSubstitutionFlow(false)}
        />
      )}
    </div>
  );
}
