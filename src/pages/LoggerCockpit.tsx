import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  BarChart3,
  Clock,
  List,
  Play,
  RotateCcw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useMatchLogStore, MatchEvent } from "../store/useMatchLogStore";
import { useMatchSocket } from "../hooks/useMatchSocket";
import { useKeyboardInput } from "../hooks/useKeyboardInput";
import {
  fetchLoggerWithAuth,
  LOGGER_API_URL,
  IS_E2E_TEST_MODE,
  fetchAllMatchEvents,
  resetMatch,
  deleteMatchEvent,
  updateMatchEvent,
} from "../lib/loggerApi";
import {
  normalizeMatchPayload,
  formatMatchClock,
  buildIneffectiveBreakdownFromAggregates,
  computeIneffectiveBreakdown,
} from "./logger/utils";
import { useActionFlow } from "./logger/hooks/useActionFlow";
import {
  DEFAULT_PERIOD_MAP,
  KEY_ACTION_MAP,
  QUICK_ACTIONS,
} from "./logger/constants";
import TeamSelector from "./logger/components/TeamSelector";
import InstructionBanner from "./logger/components/InstructionBanner";
import PlayerSelectorPanel from "./logger/components/PlayerSelectorPanel";
import ActionSelectionPanel from "./logger/components/ActionSelectionPanel";
import OutcomeSelectionPanel from "./logger/components/OutcomeSelectionPanel";
import RecipientSelectionPanel from "./logger/components/RecipientSelectionPanel";
import QuickActionMenu from "./logger/components/QuickActionMenu";
import QuickCardPanel, {
  CardSelection,
} from "./logger/components/QuickCardPanel";
import { useMatchTimer } from "./logger/hooks/useMatchTimer";
import MatchTimerDisplay from "./logger/components/MatchTimerDisplay";
import LiveEventFeed from "./logger/components/LiveEventFeed";
import { MatchPeriodSelector } from "./logger/components/MatchPeriodSelector";
import {
  usePeriodManager,
  EXTRA_FIRST_HALF_END_SECONDS,
  REGULATION_FIRST_HALF_SECONDS,
  REGULATION_SECOND_HALF_SECONDS,
  EXTRA_HALF_MINUTES,
} from "./logger/hooks/usePeriodManager";
import ExtraTimeAlert from "./logger/components/ExtraTimeAlert";
import HalftimePanel from "./logger/components/HalftimePanel";
import SubstitutionFlow from "./logger/components/SubstitutionFlow";
import QuickSubstitutionPanel from "./logger/components/QuickSubstitutionPanel";
import { MatchAnalytics } from "./logger/components/MatchAnalytics";
import type {
  IneffectiveAction,
  LoggerHarness,
  Match,
  Player,
  QueuedEventSummary,
} from "./logger/types";

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

const compareCardEventOrder = (
  left: { event: MatchEvent; index: number },
  right: { event: MatchEvent; index: number },
) => {
  const leftPeriod = Number(left.event.period || 0);
  const rightPeriod = Number(right.event.period || 0);
  if (leftPeriod !== rightPeriod) return leftPeriod - rightPeriod;

  const leftTs = Date.parse(left.event.timestamp || "");
  const rightTs = Date.parse(right.event.timestamp || "");
  const leftHasTs = Number.isFinite(leftTs);
  const rightHasTs = Number.isFinite(rightTs);
  if (leftHasTs && rightHasTs && leftTs !== rightTs) return leftTs - rightTs;

  const leftClock = parseClockToSeconds(left.event.match_clock);
  const rightClock = parseClockToSeconds(right.event.match_clock);
  if (leftClock !== rightClock) return leftClock - rightClock;

  return left.index - right.index;
};

const formatSecondsAsClock = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const formatSecondsAsClockWithMs = (seconds: number): string => {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const ms = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000);
  return `${String(mins).padStart(2, "0")}:${String(wholeSeconds).padStart(
    2,
    "0",
  )}.${String(ms).padStart(3, "0")}`;
};

const addMillisecondsToClock = (clock: string, deltaMs: number): string => {
  const match = clock.match(/^(\d+):(\d{2})(?:\.(\d{3}))?$/);
  if (!match) return clock;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const milliseconds = Number(match[3] || 0);
  const totalMs = minutes * 60_000 + seconds * 1_000 + milliseconds + deltaMs;
  const safeTotal = Math.max(0, totalMs);
  const nextMinutes = Math.floor(safeTotal / 60_000);
  const remainder = safeTotal % 60_000;
  const nextSeconds = Math.floor(remainder / 1_000);
  const nextMs = remainder % 1_000;
  return `${String(nextMinutes).padStart(2, "0")}:${String(
    nextSeconds,
  ).padStart(2, "0")}.${String(nextMs).padStart(3, "0")}`;
};

const getActiveYellowCountForPlayer = (
  events: MatchEvent[],
  playerId: string,
): number => {
  let yellow = 0;
  let red = 0;

  events
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) => event.type === "Card" && event.player_id === playerId,
    )
    .sort(compareCardEventOrder)
    .forEach(({ event }) => {
      const cardType = String(event.data?.card_type || "").toLowerCase();

      if (cardType.includes("cancel")) {
        if (red > 0 && yellow >= 2) {
          red -= 1;
          yellow -= 1;
        } else if (red > 0) {
          red -= 1;
        } else if (yellow > 0) {
          yellow -= 1;
        }
        return;
      }

      if (cardType.includes("yellow")) {
        yellow += 1;
        return;
      }

      if (cardType.includes("red")) {
        red += 1;
      }
    });

  return yellow;
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
    operatorPeriod,
    isBallInPlay,
    setIsBallInPlay,
    resetOperatorControls,
    setCurrentMatch,
    setLiveEvents,
    upsertLiveEvent,
    updateEventNotes,
    removeQueuedEvent,
    removeUndoCandidate,
    clearDuplicateHighlight,
    resetDuplicateStats,
    clearQueuedEvents,
    clearUndoStack,
    clearPendingAcks,
    removeLiveEventByClientId,
    removeLiveEventById,
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
  const [manualFieldFlip, setManualFieldFlip] = useState(false);
  const [viewMode, setViewMode] = useState<"logger" | "analytics">("logger");
  const [priorityPlayerId, setPriorityPlayerId] = useState<string | null>(null);
  const [pendingCardType, setPendingCardType] = useState<CardSelection | null>(
    null,
  );
  const pendingCardTypeRef = useRef<CardSelection | null>(null);

  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [ineffectiveNoteOpen, setIneffectiveNoteOpen] = useState(false);
  const [ineffectiveNoteText, setIneffectiveNoteText] = useState("");
  const [ineffectiveActionType, setIneffectiveActionType] =
    useState<IneffectiveAction>("Other");
  const [ineffectiveTeamSelection, setIneffectiveTeamSelection] = useState<
    "home" | "away"
  >("home");
  const [ineffectiveActionDropdownOpen, setIneffectiveActionDropdownOpen] =
    useState(false);
  const [ineffectiveTeamDropdownOpen, setIneffectiveTeamDropdownOpen] =
    useState(false);
  const [hasActiveIneffective, setHasActiveIneffective] = useState(false);
  const [isVarActiveLocal, setIsVarActiveLocal] = useState(false);
  const [varStartMs, setVarStartMs] = useState<number | null>(null);
  const [varStartGlobalSeconds, setVarStartGlobalSeconds] = useState<
    number | null
  >(null);
  const [varStartTotalSeconds, setVarStartTotalSeconds] = useState(0);
  const [varPauseStartMs, setVarPauseStartMs] = useState<number | null>(null);
  const [varPausedSeconds, setVarPausedSeconds] = useState(0);
  const [varTick, setVarTick] = useState(0);
  const [pendingIneffectiveContext, setPendingIneffectiveContext] = useState<{
    teamId?: string | null;
    playerId?: string | null;
    actionType?: IneffectiveAction | null;
  } | null>(null);
  const activeIneffectiveContextRef = useRef<{
    teamId?: string | null;
    playerId?: string | null;
    actionType?: IneffectiveAction | null;
    startedAtMs?: number;
  } | null>(null);
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
  const lastStoppageClockRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!match) return;
    const isResetMatch =
      match.status === "Pending" &&
      (match.match_time_seconds || 0) === 0 &&
      (match.ineffective_time_seconds || 0) === 0 &&
      !match.current_period_start_timestamp &&
      (!match.period_timestamps ||
        Object.keys(match.period_timestamps).length === 0);
    if (
      isResetMatch ||
      match.status === "Fulltime" ||
      match.status === "Completed"
    ) {
      setManualFieldFlip(false);
    }
  }, [
    match,
    match?.status,
    match?.match_time_seconds,
    match?.ineffective_time_seconds,
    match?.current_period_start_timestamp,
    match?.period_timestamps,
  ]);

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
    if (!match) return;
    const hasVarActive = Boolean(
      match.ineffective_aggregates?.var_active?.start_timestamp,
    );
    if (!hasVarActive && !isVarActiveLocal) return;
    const interval = setInterval(() => {
      setVarTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [match, isVarActiveLocal]);

  useEffect(() => {
    setPriorityPlayerId(null);
  }, [matchId]);

  const [ineffectiveTick, setIneffectiveTick] = useState(0);

  const hasVarStoppage = useMemo(() => {
    const combinedEvents = [...liveEvents, ...queuedEvents];
    return combinedEvents.some(
      (event) =>
        event.type === "GameStoppage" &&
        (event.data?.stoppage_type === "VARStart" ||
          event.data?.stoppage_type === "VARStop"),
    );
  }, [liveEvents, queuedEvents]);

  const ineffectiveBreakdown = useMemo(() => {
    if (!match) return null;
    const homeTeamIds = [match.home_team.id, match.home_team.team_id].filter(
      Boolean,
    ) as string[];
    const awayTeamIds = [match.away_team.id, match.away_team.team_id].filter(
      Boolean,
    ) as string[];
    if (hasVarStoppage) {
      return computeIneffectiveBreakdown(
        [...liveEvents, ...queuedEvents],
        homeTeamIds,
        awayTeamIds,
        Date.now(),
      );
    }
    if (match.ineffective_aggregates) {
      return buildIneffectiveBreakdownFromAggregates(
        match.ineffective_aggregates,
        Date.now(),
      );
    }
    return computeIneffectiveBreakdown(
      [...liveEvents, ...queuedEvents],
      homeTeamIds,
      awayTeamIds,
      Date.now(),
    );
  }, [match, liveEvents, queuedEvents, ineffectiveTick, hasVarStoppage]);

  const breakdownVarActive = Boolean(ineffectiveBreakdown?.varActive);
  const isVarActive = breakdownVarActive || isVarActiveLocal;

  const {
    globalClock,
    effectiveClock,
    effectiveTime,
    ineffectiveClock,
    clockMode,
    isClockRunning: isGlobalClockRunning,
    handleGlobalClockStart,
    handleGlobalClockStop,
    handleModeSwitch,
  } = useMatchTimer(match, fetchMatch, {
    isVarActive,
    varPauseStartMs,
    varPausedSeconds,
  });

  const globalClockSeconds = useMemo(
    () => parseClockToSeconds(globalClock),
    [globalClock],
  );

  const varTimeSeconds = useMemo(() => {
    const baseVar = ineffectiveBreakdown?.totals.neutral ?? 0;
    if (isVarActiveLocal && varStartGlobalSeconds !== null) {
      const syncedDeltaSeconds = Math.max(
        0,
        globalClockSeconds - varStartGlobalSeconds,
      );
      return Math.max(0, varStartTotalSeconds + syncedDeltaSeconds);
    }
    if (isVarActiveLocal && varStartMs) {
      const pausedWhileActive =
        varPausedSeconds +
        (varPauseStartMs
          ? Math.max(0, (Date.now() - varPauseStartMs) / 1000)
          : 0);
      if (breakdownVarActive) {
        return Math.max(0, baseVar - pausedWhileActive);
      }
      const deltaSeconds = Math.max(
        0,
        (Date.now() - varStartMs) / 1000 - pausedWhileActive,
      );
      return baseVar + deltaSeconds;
    }
    if (breakdownVarActive) return baseVar;
    return baseVar;
  }, [
    ineffectiveBreakdown,
    breakdownVarActive,
    isVarActiveLocal,
    globalClockSeconds,
    varStartGlobalSeconds,
    varStartTotalSeconds,
    varStartMs,
    varPauseStartMs,
    varPausedSeconds,
    varTick,
  ]);

  const varTimeClock = useMemo(
    () => formatSecondsAsClock(varTimeSeconds),
    [varTimeSeconds, varTick],
  );

  useEffect(() => {
    if (
      !match ||
      (!hasActiveIneffective &&
        clockMode !== "INEFFECTIVE" &&
        !isVarActiveLocal)
    ) {
      return undefined;
    }
    const interval = setInterval(() => {
      setIneffectiveTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [clockMode, hasActiveIneffective, isVarActiveLocal, match]);

  useEffect(() => {
    setVarPausedSeconds(0);
    setVarPauseStartMs(isVarActiveLocal ? Date.now() : null);
  }, [clockMode]);

  useEffect(() => {
    if (!isVarActiveLocal) return;
    if (isGlobalClockRunning) {
      if (varPauseStartMs) {
        const paused = Math.max(0, (Date.now() - varPauseStartMs) / 1000);
        setVarPausedSeconds((prev) => prev + paused);
        setVarPauseStartMs(null);
      }
      return;
    }
    if (!varPauseStartMs) {
      setVarPauseStartMs(Date.now());
    }
  }, [isGlobalClockRunning, isVarActiveLocal, varPauseStartMs]);

  const getStoppageTeamId = useCallback(() => {
    if (!match) return null;
    if (selectedTeam === "away") return match.away_team.id;
    return match.home_team.id;
  }, [match, selectedTeam]);

  const resolveManualTeamSelection = useCallback(
    (teamId?: string | null): "home" | "away" => {
      if (teamId && teamId === match?.away_team.id) return "away";
      if (teamId && teamId === match?.home_team.id) return "home";
      return selectedTeam === "away" ? "away" : "home";
    },
    [match, selectedTeam],
  );

  const getManualTeamId = useCallback(
    (teamSelection: "home" | "away") => {
      if (teamSelection === "away") return match?.away_team.id ?? null;
      return match?.home_team.id ?? null;
    },
    [match],
  );

  const logClockStoppage = useCallback(
    (
      stoppageType: "ClockStop" | "ClockStart",
      notes?: string | null,
      context?: {
        teamId?: string | null;
        playerId?: string | null;
        actionType?: IneffectiveAction | null;
      } | null,
    ) => {
      if (!match) return;
      const isVarAction = context?.actionType === "VAR";
      const resolvedTeamId = isVarAction
        ? "NEUTRAL"
        : context?.teamId || getStoppageTeamId();
      if (!resolvedTeamId) return;
      const baseClock = globalClock || "00:00.000";
      const adjustedClock =
        stoppageType === "ClockStart" &&
        lastStoppageClockRef.current === baseClock
          ? formatSecondsAsClockWithMs(parseClockToSeconds(baseClock) + 0.001)
          : baseClock;
      lastStoppageClockRef.current = adjustedClock;
      sendEvent({
        match_clock: adjustedClock,
        period: operatorPeriod,
        team_id: resolvedTeamId,
        type: "GameStoppage",
        data: {
          stoppage_type: stoppageType,
          reason: context?.actionType || "Other",
          trigger_action: context?.actionType || null,
          trigger_team_id: isVarAction ? null : context?.teamId || null,
          trigger_player_id: context?.playerId || null,
        },
        ...(notes ? { notes } : {}),
      });
    },
    [getStoppageTeamId, globalClock, match, operatorPeriod, sendEvent],
  );

  const logVarTimerEvent = useCallback(
    (stoppageType: "VARStart" | "VARStop") => {
      if (!match) return;
      const baseClock = globalClock || "00:00.000";
      const adjustedClock =
        lastStoppageClockRef.current === baseClock
          ? formatSecondsAsClockWithMs(parseClockToSeconds(baseClock) + 0.001)
          : baseClock;
      lastStoppageClockRef.current = adjustedClock;
      sendEvent({
        match_clock: adjustedClock,
        period: operatorPeriod,
        team_id: "NEUTRAL",
        type: "GameStoppage",
        data: {
          stoppage_type: stoppageType,
          reason: "VAR",
          trigger_action: "VAR",
          trigger_team_id: null,
          trigger_player_id: null,
        },
      });
    },
    [globalClock, match, operatorPeriod, sendEvent],
  );

  const optimisticModeChange = useCallback(
    (mode: "EFFECTIVE" | "INEFFECTIVE") => {
      const now = new Date().toISOString();
      setMatch((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          clock_mode: mode,
          last_mode_change_timestamp: now,
          current_period_start_timestamp:
            prev.current_period_start_timestamp ?? now,
        };
      });
    },
    [],
  );

  const beginIneffective = useCallback(
    (
      note?: string | null,
      context?: {
        teamId?: string | null;
        playerId?: string | null;
        actionType?: IneffectiveAction | null;
      } | null,
    ) => {
      if (clockMode === "INEFFECTIVE") return;
      if (activeIneffectiveContextRef.current) return;
      const trimmed = (note || "").trim();
      const fallbackTeamId =
        selectedTeam === "away"
          ? match?.away_team.id ?? null
          : selectedTeam === "home"
            ? match?.home_team.id ?? null
            : null;
      const explicitTeamId = context?.teamId ?? null;
      const resolvedContext = {
        teamId: explicitTeamId ?? fallbackTeamId,
        playerId: context?.playerId ?? null,
        actionType: context?.actionType ?? ineffectiveActionType,
      };
      if (!trimmed) {
        setIneffectiveTeamSelection(
          resolveManualTeamSelection(resolvedContext.teamId),
        );
        if (resolvedContext.actionType) {
          setIneffectiveActionType(resolvedContext.actionType);
        }
        setIneffectiveNoteText("");
        setPendingIneffectiveContext({
          teamId: explicitTeamId,
          playerId: resolvedContext.playerId,
          actionType: context?.actionType ?? null,
        });
        setIneffectiveNoteOpen(true);
        return;
      }
      logClockStoppage("ClockStop", trimmed, resolvedContext);
      activeIneffectiveContextRef.current = {
        ...resolvedContext,
        startedAtMs: Date.now(),
      };
      setHasActiveIneffective(true);
      optimisticModeChange("INEFFECTIVE");
      handleModeSwitch("INEFFECTIVE");
      setIsBallInPlay(false);
    },
    [
      clockMode,
      handleModeSwitch,
      ineffectiveActionType,
      resolveManualTeamSelection,
      logClockStoppage,
      match,
      optimisticModeChange,
      selectedTeam,
      setIsBallInPlay,
    ],
  );

  const endIneffectiveIfNeeded = useCallback(
    (nextMode: "EFFECTIVE") => {
      if (clockMode === "INEFFECTIVE" || activeIneffectiveContextRef.current) {
        logClockStoppage(
          "ClockStart",
          null,
          activeIneffectiveContextRef.current,
        );
        activeIneffectiveContextRef.current = null;
        setHasActiveIneffective(false);
      }
      optimisticModeChange(nextMode);
      handleModeSwitch(nextMode);
    },
    [clockMode, handleModeSwitch, logClockStoppage, optimisticModeChange],
  );

  const confirmIneffectiveNote = useCallback(() => {
    const trimmed = ineffectiveNoteText.trim();
    const fallbackTeamId = getManualTeamId(ineffectiveTeamSelection);
    const resolvedContext = {
      teamId: pendingIneffectiveContext?.teamId ?? fallbackTeamId,
      playerId: pendingIneffectiveContext?.playerId ?? null,
      actionType:
        pendingIneffectiveContext?.actionType ?? ineffectiveActionType,
    };
    logClockStoppage("ClockStop", trimmed || null, resolvedContext);
    activeIneffectiveContextRef.current = {
      ...resolvedContext,
      startedAtMs: Date.now(),
    };
    setHasActiveIneffective(true);
    optimisticModeChange("INEFFECTIVE");
    handleModeSwitch("INEFFECTIVE");
    setIsBallInPlay(false);
    setIneffectiveNoteOpen(false);
    setIneffectiveNoteText("");
    setPendingIneffectiveContext(null);
    setIneffectiveActionDropdownOpen(false);
    setIneffectiveTeamDropdownOpen(false);
  }, [
    handleModeSwitch,
    ineffectiveActionType,
    ineffectiveTeamSelection,
    ineffectiveNoteText,
    getManualTeamId,
    logClockStoppage,
    optimisticModeChange,
    pendingIneffectiveContext,
    setIsBallInPlay,
  ]);

  const cancelIneffectiveNote = useCallback(() => {
    setIneffectiveNoteOpen(false);
    setIneffectiveNoteText("");
    setPendingIneffectiveContext(null);
    setIneffectiveActionDropdownOpen(false);
    setIneffectiveTeamDropdownOpen(false);
  }, []);

  const handleUpdateEventNotes = useCallback(
    async (event: MatchEvent, notes: string | null) => {
      updateEventNotes(event, notes);
      if (!event._id) return;
      try {
        const updated = await updateMatchEvent(event._id, { notes });
        upsertLiveEvent(updated);
      } catch (error) {
        console.error("Failed to update event notes", error);
        setToast({
          message: t("notesUpdateFailed", "Unable to update notes right now."),
        });
        setTimeout(() => setToast(null), 3000);
      }
    },
    [t, updateEventNotes, upsertLiveEvent],
  );

  const cardDisciplinaryStatus = useMemo(() => {
    const byPlayer = new Map<
      string,
      { yellow: number; red: number; suppressNextRed: number }
    >();
    const combinedEvents = [...liveEvents, ...queuedEvents]
      .filter((event) => event.type === "Card" && Boolean(event.player_id))
      .map((event, index) => ({ event, index }))
      .sort(compareCardEventOrder);

    combinedEvents.forEach(({ event }) => {
      const playerId = event.player_id;
      if (!playerId) return;
      const state = byPlayer.get(playerId) ?? {
        yellow: 0,
        red: 0,
        suppressNextRed: 0,
      };
      const cardType = String(event.data?.card_type || "").toLowerCase();

      if (cardType.includes("cancel")) {
        if (state.red > 0 && state.yellow >= 2) {
          state.red -= 1;
          state.yellow -= 1;
        } else if (state.red > 0) {
          state.red -= 1;
        } else if (state.yellow > 0) {
          state.yellow -= 1;
        }
        byPlayer.set(playerId, state);
        return;
      }

      if (cardType.includes("yellow (second)")) {
        state.yellow += 1;
        state.red += 1;
        state.suppressNextRed += 1;
        byPlayer.set(playerId, state);
        return;
      }

      if (cardType.includes("yellow")) {
        state.yellow += 1;
        byPlayer.set(playerId, state);
        return;
      }

      if (cardType.includes("red")) {
        if (state.suppressNextRed > 0) {
          state.suppressNextRed -= 1;
        } else {
          state.red += 1;
        }
        byPlayer.set(playerId, state);
      }
    });

    const status: Record<string, { yellowCount: number; red: boolean }> = {};
    byPlayer.forEach((value, playerId) => {
      status[playerId] = {
        yellowCount: Math.max(0, value.yellow),
        red: value.red > 0,
      };
    });
    return status;
  }, [liveEvents, queuedEvents]);

  const cardYellowCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.entries(cardDisciplinaryStatus).forEach(([playerId, value]) => {
      counts[playerId] = value.yellowCount;
    });
    return counts;
  }, [cardDisciplinaryStatus]);

  const expelledPlayerIds = useMemo(() => {
    const expelled = new Set<string>();
    Object.entries(cardDisciplinaryStatus).forEach(([playerId, status]) => {
      if (status.red || status.yellowCount >= 2) {
        expelled.add(playerId);
      }
    });
    return expelled;
  }, [cardDisciplinaryStatus]);

  useEffect(() => {
    setIsBallInPlay(isGlobalClockRunning);
  }, [isGlobalClockRunning, setIsBallInPlay]);

  const isZeroedMatch = useMemo(() => {
    if (!match) return false;
    return (
      (match.match_time_seconds || 0) === 0 &&
      (match.ineffective_time_seconds || 0) === 0 &&
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
    const isStatusStopped =
      match.status === "Halftime" ||
      match.status === "Extra_Halftime" ||
      match.status === "Fulltime" ||
      match.status === "Completed" ||
      match.status === "Abandoned";
    const base =
      (match.match_time_seconds || 0) + (match.ineffective_time_seconds || 0);
    if (!match.current_period_start_timestamp || isStatusStopped) return base;
    const start = parseTimestampSafe(match.current_period_start_timestamp);
    const elapsed = Math.max(0, (Date.now() - start) / 1000);
    const pauseSeconds = varPauseStartMs
      ? Math.max(0, (Date.now() - varPauseStartMs) / 1000) + varPausedSeconds
      : varPausedSeconds;
    return base + Math.max(0, elapsed - pauseSeconds);
  }, [match, globalClock, varTimeSeconds, varPauseStartMs, varPausedSeconds]);

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

  const globalTimeSeconds = parseClockToSeconds(globalClock);
  const {
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
    globalTimeSeconds,
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
      setIsVarActiveLocal(false);
      setVarStartMs(null);
      setVarStartGlobalSeconds(null);
      setVarStartTotalSeconds(0);
      setVarPauseStartMs(null);
      setVarPausedSeconds(0);

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

  const handleDeleteLoggedEvent = useCallback(
    async (event: MatchEvent) => {
      if (!event._id || !isAdmin) return;
      try {
        await deleteMatchEvent(event._id);
        removeLiveEventById(event._id);
        if (event.client_id) {
          removeQueuedEventByClientId(event.client_id);
        }
        await hydrateEvents();
      } catch (error) {
        console.error("Failed to delete event", error);
        setToast({
          message: t("deleteEventFailed", "Unable to delete event right now."),
        });
        setTimeout(() => setToast(null), 3000);
      }
    },
    [
      deleteMatchEvent,
      hydrateEvents,
      isAdmin,
      removeLiveEventById,
      removeQueuedEventByClientId,
      t,
    ],
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
    cardYellowCounts,
    expelledPlayerIds,
    recentEvents: [...liveEvents, ...queuedEvents],
    onIneffectiveTrigger: (payload) => {
      const note = payload.note
        ? payload.note
        : payload.actionType === "Foul"
          ? t("ineffectiveNoteFoul", "Foul")
          : payload.actionType === "OutOfBounds"
            ? t("ineffectiveNoteOut", "Out of bounds")
            : payload.actionType === "Offside"
              ? t("ineffectiveNoteOffside", "Offside")
              : t("ineffectiveNoteCard", "Card issued");
      beginIneffective(note, {
        teamId: payload.teamId,
        playerId: payload.playerId,
        actionType: payload.actionType,
      });
    },
    sendEvent,
  });

  useEffect(() => {
    if (!selectedPlayer) return;
    if (!expelledPlayerIds.has(selectedPlayer.id)) return;
    resetFlow();
    setToast({
      message: t(
        "playerExpelled",
        "Player is expelled and cannot log actions.",
      ),
    });
    setTimeout(() => setToast(null), 3000);
  }, [expelledPlayerIds, resetFlow, selectedPlayer, t]);

  const normalizeStatus = useCallback(
    (status?: Match["status"]): Match["status"] => {
      if (status === "Live") return "Live_First_Half";
      return status || "Pending";
    },
    [],
  );

  const isTransitionAllowed = useCallback(
    (target: Match["status"], currentOverride?: Match["status"]): boolean => {
      const current = normalizeStatus(currentOverride ?? statusOverride);
      const allowed: Record<Match["status"], Match["status"][]> = {
        Pending: ["Live_First_Half"],
        Live_First_Half: ["Halftime"],
        Halftime: ["Live_Second_Half"],
        Live_Second_Half: ["Fulltime"],
        Live: ["Halftime"],
        Fulltime: ["Live_Extra_First", "Penalties", "Completed"], // Allow branching to Extra Time or final completion
        Abandoned: [],
        Live_Extra_First: ["Extra_Halftime"],
        Extra_Halftime: ["Live_Extra_Second"],
        Live_Extra_Second: ["Penalties", "Completed"], // End match or Penalties
        Penalties: ["Completed"],
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
  const getPeriodStartSeconds = (period: number) => {
    const raw =
      match?.period_timestamps?.[String(period)]?.global_start_seconds;
    if (typeof raw === "number") return raw;
    if (period === 1) return 0;
    if (period === 2) return REGULATION_FIRST_HALF_SECONDS;
    if (period === 3) return REGULATION_SECOND_HALF_SECONDS;
    if (period === 4) return EXTRA_FIRST_HALF_END_SECONDS;
    return globalTimeSeconds;
  };
  const firstHalfElapsed = Math.max(
    0,
    globalTimeSeconds - getPeriodStartSeconds(1),
  );
  const secondHalfElapsed = Math.max(
    0,
    globalTimeSeconds - getPeriodStartSeconds(2),
  );
  const extraFirstElapsed = Math.max(
    0,
    globalTimeSeconds - getPeriodStartSeconds(3),
  );
  const extraSecondElapsed = Math.max(
    0,
    globalTimeSeconds - getPeriodStartSeconds(4),
  );

  const hasFirstHalfMinimum =
    bypassMinimums || firstHalfElapsed >= REGULATION_FIRST_HALF_SECONDS;
  const hasSecondHalfMinimum =
    bypassMinimums || secondHalfElapsed >= REGULATION_FIRST_HALF_SECONDS;
  const hasExtraFirstHalfMinimum =
    bypassMinimums || extraFirstElapsed >= EXTRA_HALF_MINUTES * 60;
  const hasExtraSecondHalfMinimum =
    bypassMinimums || extraSecondElapsed >= EXTRA_HALF_MINUTES * 60;
  const minimumFirstHalfReason = t(
    "transitionMinimumFirstHalf",
    "Need at least 45:00 of global time from 1st half start (current {{clock}}).",
    { clock: formatSecondsAsClock(firstHalfElapsed) },
  );
  const minimumSecondHalfReason = t(
    "transitionMinimumSecondHalf",
    "Need at least 45:00 of global time from 2nd half start (current {{clock}}).",
    { clock: formatSecondsAsClock(secondHalfElapsed) },
  );
  const minimumExtraFirstHalfReason = t(
    "transitionMinimumExtraFirstHalf",
    "Need at least 15:00 of extra time from ET 1st half start (current {{clock}}).",
    { clock: formatSecondsAsClock(extraFirstElapsed) },
  );
  const minimumExtraSecondHalfReason = t(
    "transitionMinimumExtraSecondHalf",
    "Need at least 15:00 of extra time from ET 2nd half start (current {{clock}}).",
    { clock: formatSecondsAsClock(extraSecondElapsed) },
  );

  const guardTransition = useCallback(
    (target: Match["status"], fn?: () => void) => {
      if (!fn) return;
      const current = normalizeStatus(statusOverride);
      const phaseDerivedStatus =
        currentPhase === "NOT_STARTED"
          ? "Pending"
          : currentPhase === "FIRST_HALF"
            ? "Live_First_Half"
            : currentPhase === "HALFTIME"
              ? "Halftime"
              : currentPhase === "SECOND_HALF"
                ? "Live_Second_Half"
                : currentPhase === "FULLTIME"
                  ? "Fulltime"
                  : currentPhase === "FIRST_HALF_EXTRA_TIME"
                    ? "Live_Extra_First"
                    : currentPhase === "EXTRA_HALFTIME"
                      ? "Extra_Halftime"
                      : currentPhase === "SECOND_HALF_EXTRA_TIME"
                        ? "Live_Extra_Second"
                        : currentPhase === "PENALTIES"
                          ? "Penalties"
                          : currentPhase === "COMPLETED"
                            ? "Completed"
                            : undefined;
      const allowedStatus = phaseDerivedStatus ?? current;
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
        (target === "Penalties" ||
          target === "Fulltime" ||
          target === "Completed") &&
        currentPhase === "SECOND_HALF_EXTRA_TIME" &&
        !hasExtraSecondHalfMinimum
      ) {
        setTransitionError(minimumExtraSecondHalfReason);
        return;
      }
      // Allow Fulltime button to auto-walk Halftime -> Live_Second_Half -> Fulltime even if current status is earlier.
      if (!isTransitionAllowed(target, allowedStatus)) {
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
  const cockpitLocked = currentPhase === "COMPLETED";
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

  const handleCardSelection = useCallback(
    (cardType: CardSelection) => {
      if (cockpitLocked) return;
      if (selectedTeam === "both") {
        setSelectedTeam("home");
      }
      setPendingCardType((prev) => {
        const next = prev === cardType ? null : cardType;
        pendingCardTypeRef.current = next;
        return next;
      });
      resetFlow();
    },
    [cockpitLocked, resetFlow, selectedTeam, setSelectedTeam],
  );

  const cancelCardSelection = useCallback(() => {
    pendingCardTypeRef.current = null;
    setPendingCardType(null);
  }, []);

  const logCardForPlayer = useCallback(
    (player: Player, cardType: CardSelection, location?: [number, number]) => {
      if (!match) return;
      const playerTeam = determinePlayerTeam(player);
      if (!playerTeam) return;
      const team = playerTeam === "home" ? match.home_team : match.away_team;
      const latestState = useMatchLogStore.getState();
      const existingCardEventsAtClock = [
        ...latestState.liveEvents,
        ...latestState.queuedEvents,
      ].filter(
        (event) =>
          event.type === "Card" &&
          event.period === operatorPeriod &&
          event.team_id === team.id &&
          event.player_id === player.id &&
          event.match_clock === globalClock,
      ).length;
      const cancelClockOffsetMs = existingCardEventsAtClock + 1;

      let resolvedCard: string = cardType;
      if (cardType === "Yellow") {
        const previousYellows = getActiveYellowCountForPlayer(
          [...latestState.liveEvents, ...latestState.queuedEvents],
          player.id,
        );
        resolvedCard = previousYellows >= 1 ? "Yellow (Second)" : "Yellow";
      }

      const buildCardPayload = (
        cardValue: string,
        matchClock = globalClock,
      ) => ({
        match_clock: matchClock,
        period: operatorPeriod,
        team_id: team.id,
        player_id: player.id,
        type: "Card" as const,
        data: {
          card_type: cardValue,
          reason: cardValue === "Cancelled" ? "VAR" : "Foul",
        },
        ...(location ? { location } : {}),
      });

      if (resolvedCard === "Yellow (Second)") {
        const secondYellowClock = addMillisecondsToClock(globalClock, 1);
        const redClock = addMillisecondsToClock(globalClock, 2);
        sendEvent(buildCardPayload(resolvedCard, secondYellowClock));
        sendEvent(buildCardPayload("Red", redClock));
      } else if (resolvedCard === "Cancelled") {
        const cancelledClock = addMillisecondsToClock(
          globalClock,
          cancelClockOffsetMs,
        );
        sendEvent(buildCardPayload(resolvedCard, cancelledClock));
      } else {
        sendEvent(buildCardPayload(resolvedCard));
      }

      setPendingCardType(null);
      pendingCardTypeRef.current = null;
      resetFlow();
    },
    [
      match,
      determinePlayerTeam,
      liveEvents,
      queuedEvents,
      cardYellowCounts,
      globalClock,
      operatorPeriod,
      sendEvent,
      resetFlow,
    ],
  );

  const handlePlayerSelection = useCallback(
    (player: Player) => {
      if (cockpitLocked) return;
      const activePendingCard = pendingCardTypeRef.current ?? pendingCardType;
      if (activePendingCard) {
        logCardForPlayer(player, activePendingCard);
        return;
      }
      if (expelledPlayerIds.has(player.id)) {
        setToast({
          message: t(
            "playerExpelled",
            "Player is expelled and cannot log actions.",
          ),
        });
        setTimeout(() => setToast(null), 3000);
        return;
      }
      const playerTeam = determinePlayerTeam(player);
      if (!playerTeam) return;
      if (playerTeam !== selectedTeam) {
        setSelectedTeam(playerTeam);
      }
      handlePlayerClick(player);
    },
    [
      cockpitLocked,
      pendingCardType,
      logCardForPlayer,
      determinePlayerTeam,
      expelledPlayerIds,
      handlePlayerClick,
      selectedTeam,
      setSelectedTeam,
      t,
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

      if (isVarActive) {
        setToast({
          message: t(
            "varBlocksFieldActions",
            "Field actions are blocked while VAR is active.",
          ),
        });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      const activePendingCard = pendingCardTypeRef.current ?? pendingCardType;
      if (
        expelledPlayerIds.has(player.id) &&
        activePendingCard !== "Cancelled"
      ) {
        setToast({
          message: t(
            "playerExpelled",
            "Player is expelled and cannot log actions.",
          ),
        });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      if (currentStep === "selectDestination") {
        const result = handleDestinationClick({
          destination: {
            xPercent: anchor.xPercent,
            yPercent: anchor.yPercent,
            statsbomb: location,
            isOutOfBounds: false,
            outOfBoundsEdge: null,
          },
          targetPlayer: player,
        });
        if (result?.triggerContext) {
          beginIneffective(
            result?.isGoal
              ? t("ineffectiveNoteGoal", "Goal")
              : t("ineffectiveNoteOut", "Out of bounds"),
            result?.triggerContext
              ? {
                  teamId: result.triggerContext.teamId,
                  playerId: result.triggerContext.playerId,
                  actionType: result.triggerContext.actionType,
                }
              : null,
          );
        }
        return;
      }

      if (activePendingCard) {
        logCardForPlayer(player, activePendingCard, location);
        return;
      }

      if (side !== selectedTeam) {
        setSelectedTeam(side);
      }
      handlePlayerClick(player, anchor, location);
    },
    [
      cockpitLocked,
      isVarActive,
      currentStep,
      pendingCardType,
      logCardForPlayer,
      expelledPlayerIds,
      handleDestinationClick,
      beginIneffective,
      handleModeSwitch,
      handlePlayerClick,
      selectedTeam,
      setIsBallInPlay,
      setSelectedTeam,
      t,
    ],
  );

  const handleFieldDestination = useCallback(
    (destination: {
      xPercent: number;
      yPercent: number;
      statsbomb: [number, number];
      isOutOfBounds: boolean;
      outOfBoundsEdge?: "left" | "right" | "top" | "bottom" | null;
    }) => {
      if (cockpitLocked || currentStep !== "selectDestination") return;
      if (isVarActive) {
        setToast({
          message: t(
            "varBlocksFieldActions",
            "Field actions are blocked while VAR is active.",
          ),
        });
        setTimeout(() => setToast(null), 3000);
        return;
      }
      const result = handleDestinationClick({ destination });
      if (result?.triggerContext) {
        beginIneffective(
          result?.isGoal
            ? t("ineffectiveNoteGoal", "Goal")
            : t("ineffectiveNoteOut", "Out of bounds"),
          result?.triggerContext
            ? {
                teamId: result.triggerContext.teamId,
                playerId: result.triggerContext.playerId,
                actionType: result.triggerContext.actionType,
              }
            : null,
        );
      }
    },
    [
      cockpitLocked,
      currentStep,
      isVarActive,
      handleDestinationClick,
      beginIneffective,
      t,
    ],
  );

  const handleQuickSubstitution = useCallback(
    (team: "home" | "away") => {
      if (cockpitLocked) return;
      setSubstitutionTeam(team);
      setShowSubstitutionFlow(true);
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
    setManualFieldFlip(false);
  }, [matchId]);

  useEffect(() => {
    if (!match) return;
    const defaultClock = formatMatchClock(match.match_time_seconds);
    const defaultPeriod =
      DEFAULT_PERIOD_MAP[statusOverride || match.status] ?? 1;
    resetOperatorControls({ clock: defaultClock, period: defaultPeriod });
  }, [match, resetOperatorControls]);

  const handleGlobalClockStartGuarded = useCallback(() => {
    if (cockpitLocked) return;
    if (isVarActiveLocal && varPauseStartMs) {
      const paused = Math.max(0, (Date.now() - varPauseStartMs) / 1000);
      setVarPausedSeconds((prev) => prev + paused);
      setVarPauseStartMs(null);
    }
    setIsBallInPlay(true);
    handleGlobalClockStart();
  }, [
    cockpitLocked,
    handleGlobalClockStart,
    isVarActiveLocal,
    setIsBallInPlay,
    varPauseStartMs,
  ]);

  const handleGlobalClockStopGuarded = useCallback(() => {
    if (cockpitLocked) return;
    if (isVarActiveLocal && !varPauseStartMs) {
      setVarPauseStartMs(Date.now());
    }
    setIsBallInPlay(false);
    handleGlobalClockStop();
  }, [
    cockpitLocked,
    handleGlobalClockStop,
    isVarActiveLocal,
    setIsBallInPlay,
    varPauseStartMs,
  ]);

  const handleModeSwitchGuarded = useCallback(
    (mode: "EFFECTIVE" | "INEFFECTIVE") => {
      if (cockpitLocked) return;
      if (mode === "INEFFECTIVE") {
        beginIneffective();
        return;
      }
      endIneffectiveIfNeeded(mode);
    },
    [beginIneffective, cockpitLocked, endIneffectiveIfNeeded],
  );

  const handleVarToggle = useCallback(() => {
    if (cockpitLocked) return;
    const nextActive = !isVarActiveLocal;
    const currentVarSeconds = varTimeSeconds;
    const currentGlobalSeconds = parseClockToSeconds(globalClock);
    logVarTimerEvent(nextActive ? "VARStart" : "VARStop");
    setIsVarActiveLocal(nextActive);
    setVarStartMs(nextActive ? Date.now() : null);
    setVarStartGlobalSeconds(nextActive ? currentGlobalSeconds : null);
    setVarStartTotalSeconds(nextActive ? currentVarSeconds : 0);
    setVarPausedSeconds(0);
    if (nextActive) {
      setVarPauseStartMs(isGlobalClockRunning ? null : Date.now());
    } else if (varPauseStartMs) {
      const deltaSeconds = Math.max(0, (Date.now() - varPauseStartMs) / 1000);
      setVarPausedSeconds((prev) => prev + deltaSeconds);
      setVarPauseStartMs(null);
    }
  }, [
    cockpitLocked,
    isVarActiveLocal,
    isGlobalClockRunning,
    logVarTimerEvent,
    globalClock,
    varTimeSeconds,
    varPauseStartMs,
  ]);

  useEffect(() => {
    if (cockpitLocked) {
      resetFlow();
    }
  }, [cockpitLocked, resetFlow]);

  const showFieldResume = clockMode !== "EFFECTIVE" && !cockpitLocked;

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
    beginIneffective(t("ineffectiveNoteGoal", "Goal"), {
      teamId: latest.team_id,
      playerId: latest.player_id,
      actionType: "Goal",
    });
  }, [beginIneffective, liveEvents, t]);

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

    const previousUndoClientId =
      undoStack.length > 1 ? undoStack[undoStack.length - 2] : null;
    const previousUndoEvent = previousUndoClientId
      ? liveEvents.find((event) => event.client_id === previousUndoClientId) ||
        queuedEvents.find((event) => event.client_id === previousUndoClientId)
      : null;

    const lastCardType = String(
      lastUndoEvent.data?.card_type || "",
    ).toLowerCase();
    const previousCardType = String(
      previousUndoEvent?.data?.card_type || "",
    ).toLowerCase();
    const shouldCascadeUndoSecondYellow =
      Boolean(previousUndoClientId) &&
      Boolean(previousUndoEvent) &&
      lastUndoEvent.type === "Card" &&
      previousUndoEvent?.type === "Card" &&
      lastCardType.includes("red") &&
      previousCardType.includes("yellow (second)") &&
      lastUndoEvent.player_id === previousUndoEvent.player_id &&
      lastUndoEvent.team_id === previousUndoEvent.team_id &&
      lastUndoEvent.period === previousUndoEvent.period;

    const eventsToUndo =
      shouldCascadeUndoSecondYellow && previousUndoEvent
        ? [lastUndoEvent, previousUndoEvent]
        : [lastUndoEvent];

    const removeLocally = (targetEvent: MatchEvent, targetClientId: string) => {
      removeLiveEventByClientId(targetClientId);
      removeQueuedEvent(targetEvent);
      removeUndoCandidate(targetClientId);
    };

    const hasOfflineOnlyTargets = eventsToUndo.every((event) => {
      if (!event.client_id) return false;
      return !pendingAcks[event.client_id] && !event._id;
    });

    if (hasOfflineOnlyTargets || !undoRequiresConnection) {
      eventsToUndo.forEach((event) => {
        if (!event.client_id) return;
        removeLocally(event, event.client_id);
      });
      return;
    }

    try {
      eventsToUndo.forEach((event) => {
        undoEvent(event);
      });
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
    undoStack,
    liveEvents,
    queuedEvents,
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

  const manualHomeTeamLabel = match?.home_team.name || t("homeTeam", "Home");
  const manualAwayTeamLabel = match?.away_team.name || t("awayTeam", "Away");

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div
        className="w-full max-w-[2200px] mx-auto xl:grid xl:grid-cols-[minmax(140px,1fr)_minmax(0,7.5fr)_minmax(140px,1fr)] 2xl:grid-cols-[minmax(180px,1fr)_minmax(0,8fr)_minmax(180px,1fr)]"
        data-testid="logger-page-shell"
      >
        <aside
          className="hidden xl:block border-r border-slate-800/80"
          data-testid="logger-shell-left"
          aria-hidden="true"
        />

        <div className="min-w-0" data-testid="logger-shell-center">
          {/* Header */}
          <header className="bg-slate-900 shadow-sm border-b border-slate-700">
            <div className="w-full max-w-none px-4 sm:px-6 xl:px-8 2xl:px-10 py-4">
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
                            onChange={(e) =>
                              setResetConfirmText(e.target.value)
                            }
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
                            data-testid="reset-confirm-button"
                            className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {t("yesReset", "Yes, Reset")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {ineffectiveNoteOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                      <div
                        className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl"
                        data-testid="ineffective-note-modal"
                      >
                        <h3 className="text-lg font-bold mb-3 text-black">
                          {t("ineffectiveNoteTitle", "Ineffective time note")}
                        </h3>
                        <p className="text-sm text-black mb-3">
                          {t(
                            "ineffectiveNoteHelp",
                            "Add a note for why effective time stopped.",
                          )}
                        </p>
                        <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-1">
                          {t("ineffectiveReasonLabel", "Ineffective reason")}
                        </label>
                        <div className="relative mb-3">
                          <button
                            type="button"
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-left text-black bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                            data-testid="ineffective-note-action"
                            onClick={() => {
                              setIneffectiveActionDropdownOpen((prev) => !prev);
                              setIneffectiveTeamDropdownOpen(false);
                            }}
                          >
                            {ineffectiveActionType === "Substitution"
                              ? t(
                                  "ineffectiveReasonSubstitution",
                                  "Substitution",
                                )
                              : t("ineffectiveReasonOther", "Other")}
                          </button>
                          {ineffectiveActionDropdownOpen && (
                            <div
                              className="absolute z-10 mt-1 w-full bg-white border border-slate-300 rounded-md shadow-lg"
                              data-testid="ineffective-note-action-menu"
                            >
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-black hover:bg-slate-100"
                                data-testid="ineffective-note-action-option-Substitution"
                                onClick={() => {
                                  setIneffectiveActionType("Substitution");
                                  setIneffectiveActionDropdownOpen(false);
                                }}
                              >
                                {t(
                                  "ineffectiveReasonSubstitution",
                                  "Substitution",
                                )}
                              </button>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-black hover:bg-slate-100"
                                data-testid="ineffective-note-action-option-Other"
                                onClick={() => {
                                  setIneffectiveActionType("Other");
                                  setIneffectiveActionDropdownOpen(false);
                                }}
                              >
                                {t("ineffectiveReasonOther", "Other")}
                              </button>
                            </div>
                          )}
                        </div>
                        <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-1">
                          {t("ineffectiveTeamLabel", "Team")}
                        </label>
                        <div className="relative mb-3">
                          <button
                            type="button"
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-left text-black bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                            data-testid="ineffective-note-team"
                            onClick={() => {
                              setIneffectiveTeamDropdownOpen((prev) => !prev);
                              setIneffectiveActionDropdownOpen(false);
                            }}
                          >
                            {ineffectiveTeamSelection === "home"
                              ? manualHomeTeamLabel
                              : manualAwayTeamLabel}
                          </button>
                          {ineffectiveTeamDropdownOpen && (
                            <div
                              className="absolute z-10 mt-1 w-full bg-white border border-slate-300 rounded-md shadow-lg"
                              data-testid="ineffective-note-team-menu"
                            >
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-black hover:bg-slate-100"
                                data-testid="ineffective-note-team-option-home"
                                onClick={() => {
                                  setIneffectiveTeamSelection("home");
                                  setIneffectiveTeamDropdownOpen(false);
                                }}
                              >
                                {manualHomeTeamLabel}
                              </button>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-black hover:bg-slate-100"
                                data-testid="ineffective-note-team-option-away"
                                onClick={() => {
                                  setIneffectiveTeamSelection("away");
                                  setIneffectiveTeamDropdownOpen(false);
                                }}
                              >
                                {manualAwayTeamLabel}
                              </button>
                            </div>
                          )}
                        </div>
                        <textarea
                          value={ineffectiveNoteText}
                          onChange={(e) =>
                            setIneffectiveNoteText(e.target.value)
                          }
                          data-testid="ineffective-note-input"
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-black placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          placeholder={t("notesPlaceholder", "Add a note...")}
                          rows={3}
                          autoFocus
                        />
                        <div className="flex justify-end gap-3 mt-4">
                          <button
                            onClick={cancelIneffectiveNote}
                            data-testid="ineffective-note-cancel"
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
                          >
                            {t("cancel", "Cancel")}
                          </button>
                          <button
                            onClick={confirmIneffectiveNote}
                            data-testid="ineffective-note-save"
                            className="px-4 py-2 bg-amber-600 text-white hover:bg-amber-700 rounded"
                          >
                            {t("save", "Save")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {undoError && (
                  <p
                    className="text-xs text-red-600 mt-1"
                    data-testid="undo-error"
                  >
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
                    {String((match.match_time_seconds || 0) % 60).padStart(
                      2,
                      "0",
                    )}
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
                  <div className="text-2xl sm:text-3xl font-bold text-slate-100 text-center">
                    {t("matchTitle", "{{home}} vs {{away}}", {
                      home: match.home_team.name,
                      away: match.away_team.name,
                    })}
                  </div>
                  {/* Stadium Score Display */}
                  <div className="mt-3 w-full flex justify-center">
                    <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 shadow-lg bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 sm:px-7 py-4 grid grid-cols-[minmax(120px,0.9fr)_minmax(190px,1.5fr)_minmax(120px,0.9fr)] sm:grid-cols-[minmax(150px,0.85fr)_minmax(260px,1.6fr)_minmax(150px,0.85fr)] items-center gap-3 sm:gap-5 min-w-[260px]">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.06),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.04),transparent_30%)]" />
                      <div className="flex flex-col items-center z-10 min-w-0">
                        <span className="text-sm sm:text-base uppercase tracking-wide text-slate-300 truncate max-w-full text-center">
                          {match.home_team.name}
                        </span>
                        <span
                          className="text-5xl sm:text-6xl font-black text-emerald-300 drop-shadow"
                          data-testid="home-score"
                        >
                          {liveScore.home || match.home_team.score || 0}
                        </span>
                      </div>
                      <div className="z-10 flex flex-col items-center px-2 sm:px-4">
                        <span className="text-sm font-semibold text-slate-400">
                          {t("statusLabel", "Status")}
                        </span>
                        <span className="text-xl sm:text-2xl font-black text-slate-200">
                          {t("vs", "VS")}
                        </span>
                      </div>
                      <div className="flex flex-col items-center z-10 min-w-0">
                        <span className="text-sm sm:text-base uppercase tracking-wide text-slate-300 text-center truncate max-w-full">
                          {match.away_team.name}
                        </span>
                        <span
                          className="text-5xl sm:text-6xl font-black text-amber-300 drop-shadow"
                          data-testid="away-score"
                        >
                          {liveScore.away || match.away_team.score || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                  {(goalEvents.home.length > 0 ||
                    goalEvents.away.length > 0) && (
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
                                event.client_id ||
                                event._id ||
                                event.match_clock
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
                                event.client_id ||
                                event._id ||
                                event.match_clock
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
                    guardTransition(
                      "Live_Extra_Second",
                      transitionToExtraSecond,
                    )
                  }
                  onTransitionToPenalties={() =>
                    guardTransition("Penalties", transitionToPenalties)
                  }
                  onFinishMatch={() =>
                    guardTransition("Completed", finishMatch)
                  }
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
              className="w-full max-w-none px-4 sm:px-6 xl:px-8 2xl:px-10 pt-4"
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
          <main
            className="w-full max-w-none px-4 sm:px-6 xl:px-8 2xl:px-10 py-6"
            data-testid="cockpit-main"
          >
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
                    <span className="font-mono font-semibold">
                      {globalClock}
                    </span>
                  </div>
                </div>
                <MatchAnalytics
                  match={match}
                  events={[...liveEvents, ...queuedEvents]}
                  effectiveTime={effectiveTime}
                  varTimeSeconds={varTimeSeconds}
                  ineffectiveSeconds={match?.ineffective_time_seconds || 0}
                  ineffectiveBreakdown={ineffectiveBreakdown}
                  t={t}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-4 pb-20">
                {/* 1. CLOCK (Full Width) */}
                <div className="flex-none space-y-3">
                  <MatchTimerDisplay
                    match={match}
                    operatorPeriod={operatorPeriod}
                    globalClock={globalClock}
                    effectiveClock={effectiveClock}
                    ineffectiveClock={ineffectiveClock}
                    varClock={varTimeClock}
                    clockMode={clockMode}
                    isClockRunning={isGlobalClockRunning}
                    isBallInPlay={isBallInPlay}
                    locked={cockpitLocked}
                    lockReason={lockReason}
                    onGlobalStart={handleGlobalClockStartGuarded}
                    onGlobalStop={handleGlobalClockStopGuarded}
                    onModeSwitch={handleModeSwitchGuarded}
                    onVarToggle={handleVarToggle}
                    isVarActive={isVarActive}
                    hideResumeButton={showFieldResume}
                    t={t}
                  />
                </div>

                {/* 2. TEAM SELECTOR (Full Width) */}
                <div className="flex-none">
                  <TeamSelector
                    isFlipped={manualFieldFlip}
                    onFlip={() => setManualFieldFlip((prev) => !prev)}
                    onUndo={handleUndoLastEvent}
                    undoDisabled={undoDisabled}
                    disabled={cockpitLocked}
                    t={t}
                  />
                </div>

                {/* 2. INSTRUCTION BANNER */}
                <div className="flex-none z-10">
                  <InstructionBanner
                    t={t}
                    currentStep={currentStep}
                    selectedPlayer={selectedPlayer}
                    selectedAction={selectedAction}
                    cardSelection={
                      pendingCardType
                        ? pendingCardType === "Yellow"
                          ? t("cardSelectYellow", "Yellow")
                          : pendingCardType === "Red"
                            ? t("cardSelectRed", "Red")
                            : t("cardSelectCancel", "Cancel")
                        : null
                    }
                  />
                </div>

                {showFieldResume && pendingCardType && (
                  <div className="flex-none flex justify-center">
                    <button
                      type="button"
                      data-testid="btn-resume-effective"
                      onClick={() => handleModeSwitchGuarded("EFFECTIVE")}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-500 rounded-full font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-emerald-900/30"
                    >
                      <Play size={14} />
                      {t("resumeEffective", "Resume Effective Time")}
                    </button>
                  </div>
                )}

                {/* 3. ACTION STAGE (Field Interaction / Panels) */}
                <div className="min-h-[500px] flex-none bg-slate-800/30 rounded-xl p-4 border border-slate-700/50 relative flex flex-col">
                  {match && (
                    <PlayerSelectorPanel
                      match={match}
                      flipSides={manualFieldFlip}
                      selectedPlayer={selectedPlayer}
                      selectedTeam={selectedTeam}
                      disciplinaryStatusByPlayer={cardDisciplinaryStatus}
                      onCardTeamSelect={
                        pendingCardType
                          ? (team) => setSelectedTeam(team)
                          : undefined
                      }
                      onFieldIds={onFieldIds}
                      onPlayerClick={handlePlayerSelection}
                      onFieldPlayerClick={handleFieldPlayerSelection}
                      onFieldDestinationClick={handleFieldDestination}
                      showDestinationControls={
                        currentStep === "selectDestination" && !cockpitLocked
                      }
                      forceListMode={Boolean(pendingCardType)}
                      cardSelectionActive={Boolean(pendingCardType)}
                      fieldOverlay={
                        currentStep === "selectQuickAction" &&
                        selectedPlayer &&
                        fieldAnchor ? (
                          <>
                            <QuickActionMenu
                              anchor={{ xPercent: 50, yPercent: 50 }}
                              actions={[...QUICK_ACTIONS]}
                              onActionSelect={handleQuickActionSelect}
                              onMoreActions={handleOpenMoreActions}
                              onCancel={resetFlow}
                              t={t}
                            />
                            {showFieldResume && (
                              <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
                                <button
                                  type="button"
                                  data-testid="btn-resume-effective"
                                  onClick={() =>
                                    handleModeSwitchGuarded("EFFECTIVE")
                                  }
                                  className="pointer-events-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-500 rounded-full font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-emerald-900/30"
                                >
                                  <Play size={14} />
                                  {t(
                                    "resumeEffective",
                                    "Resume Effective Time",
                                  )}
                                </button>
                              </div>
                            )}
                          </>
                        ) : showFieldResume ? (
                          <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
                            <button
                              type="button"
                              data-testid="btn-resume-effective"
                              onClick={() =>
                                handleModeSwitchGuarded("EFFECTIVE")
                              }
                              className="pointer-events-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-500 rounded-full font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-emerald-900/30"
                            >
                              <Play size={14} />
                              {t("resumeEffective", "Resume Effective Time")}
                            </button>
                          </div>
                        ) : null
                      }
                      forceFieldMode
                      priorityPlayerId={priorityPlayerId}
                      isReadOnly={
                        !IS_E2E_TEST_MODE &&
                        (!isGlobalClockRunning ||
                          clockMode !== "EFFECTIVE" ||
                          isVarActive)
                      }
                      t={t}
                    />
                  )}

                  {match && currentStep === "selectPlayer" && (
                    <div className="space-y-3">
                      <QuickSubstitutionPanel
                        homeTeamName={match.home_team.short_name}
                        awayTeamName={match.away_team.short_name}
                        onHomeSubstitution={() =>
                          handleQuickSubstitution("home")
                        }
                        onAwaySubstitution={() =>
                          handleQuickSubstitution("away")
                        }
                        disabled={cockpitLocked}
                      />
                      <QuickCardPanel
                        activeCard={pendingCardType}
                        onSelectCard={handleCardSelection}
                        onCancelSelection={cancelCardSelection}
                        selectedTeam={selectedTeam}
                        onSelectTeam={(team) => setSelectedTeam(team)}
                        showTeamSelector={false}
                        disabled={cockpitLocked}
                        t={t}
                      />
                    </div>
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
                      onDeleteEvent={
                        isAdmin ? handleDeleteLoggedEvent : undefined
                      }
                      canDeleteEvent={(event) =>
                        isAdmin && event.type === "Card" && Boolean(event._id)
                      }
                      onUpdateEventNotes={handleUpdateEventNotes}
                      t={t}
                    />
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        <aside
          className="hidden xl:block border-l border-slate-800/80"
          data-testid="logger-shell-right"
          aria-hidden="true"
        />
      </div>

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
          expelledPlayerIds={expelledPlayerIds}
          period={operatorPeriod}
          globalClock={globalClock}
          onSubmit={(playerOffId, playerOnId, isConcussion) => {
            if (cockpitLocked) return;
            if (
              expelledPlayerIds.has(playerOffId) ||
              expelledPlayerIds.has(playerOnId)
            ) {
              setToast({
                message: t(
                  "substitutionExpelledBlocked",
                  "Expelled players cannot be substituted.",
                ),
              });
              setTimeout(() => setToast(null), 3000);
              return;
            }
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
