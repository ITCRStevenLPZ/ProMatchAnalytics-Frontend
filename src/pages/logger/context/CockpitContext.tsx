import {
  createContext,
  useContext,
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router-dom";
import { useMatchLogStore } from "../../../store/useMatchLogStore";
import { useMatchSocket } from "../../../hooks/useMatchSocket";
import { IS_E2E_TEST_MODE } from "../../../lib/loggerApi";
import { useActionFlow } from "../hooks/useActionFlow";
import { useMatchTimer } from "../hooks/useMatchTimer";
import { usePeriodManager } from "../hooks/usePeriodManager";
import type { CardSelection } from "../components/molecules/QuickCardPanel";
import { useDisciplinary } from "../hooks/useDisciplinary";
import { useLiveScore } from "../hooks/useLiveScore";
import { useDuplicateTelemetry } from "../hooks/useDuplicateTelemetry";
import { useOnFieldRoster } from "../hooks/useOnFieldRoster";
import { useClockDrift } from "../hooks/useClockDrift";
import { useMatchData } from "../hooks/useMatchData";
import { useVarTimer } from "../hooks/useVarTimer";
import { useTimeoutTimer } from "../hooks/useTimeoutTimer";
import { useIneffectiveTime } from "../hooks/useIneffectiveTime";
import { useResetMatch } from "../hooks/useResetMatch";
import { useCockpitHarness } from "../hooks/useCockpitHarness";
import { useCockpitEventHandlers } from "../hooks/useCockpitEventHandlers";
import { useCockpitClockHandlers } from "../hooks/useCockpitClockHandlers";
import { useCockpitInteractionHandlers } from "../hooks/useCockpitInteractionHandlers";
import { useCockpitKeyboardHandlers } from "../hooks/useCockpitKeyboardHandlers";
import { useCockpitLifecycleEffects } from "../hooks/useCockpitLifecycleEffects";
import { useCockpitHarnessEvents } from "../hooks/useCockpitHarnessEvents";
import { useCockpitAutoEffects } from "../hooks/useCockpitAutoEffects";
import { useCockpitE2EPlayersSeed } from "../hooks/useCockpitE2EPlayersSeed";
import { useCockpitIneffectiveBreakdown } from "../hooks/useCockpitIneffectiveBreakdown";
import { useCockpitLocalEffects } from "../hooks/useCockpitLocalEffects";
import { useCockpitStatusProjection } from "../hooks/useCockpitStatusProjection";
import { useCockpitVarDerivedState } from "../hooks/useCockpitVarDerivedState";
import { useCockpitIneffectiveTickEffect } from "../hooks/useCockpitIneffectiveTickEffect";
import { useCockpitExpelledPlayerEffect } from "../hooks/useCockpitExpelledPlayerEffect";
import { useCockpitTransitionState } from "../hooks/useCockpitTransitionState";
import { useCockpitToast } from "../hooks/useCockpitToast";
import { useCockpitSubstitutionFlow } from "../hooks/useCockpitSubstitutionFlow";
import { useTacticalPositions } from "../hooks/useTacticalPositions";
import type { LoggerHarness } from "../types";
import type { CockpitViewMode } from "../components/molecules/TeamSelector";
import { parseClockToSeconds } from "../lib/clockHelpers";
import { useAuthStore } from "../../../store/authStore";

declare global {
  interface Window {
    __PROMATCH_LOGGER_HARNESS__?: LoggerHarness;
  }
}

// ---------------------------------------------------------------------------
// Context — value type is inferred from the provider's useMemo return.
// Props are ultimately type-checked at child component boundaries.
// ---------------------------------------------------------------------------
const CockpitContext = createContext<any>(null);

export function useCockpit() {
  const ctx = useContext(CockpitContext);
  if (!ctx) throw new Error("useCockpit must be used inside <CockpitProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider — calls every cockpit hook, wires them together, and exposes
// the complete value tree via React context.
// ---------------------------------------------------------------------------
export function CockpitProvider({ children }: { children: ReactNode }) {
  const { t, ready: isLoggerReady } = useTranslation("logger");
  const { matchId } = useParams();
  const [searchParams] = useSearchParams();
  const initialView: CockpitViewMode =
    searchParams.get("view") === "analytics"
      ? "analytics"
      : searchParams.get("view") === "review"
        ? "review"
        : "logger";

  // ── Store ──────────────────────────────────────────────────────────────
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
    lastMatchRefreshRequest,
  } = useMatchLogStore();

  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === "admin";
  const pendingAckCount = Object.keys(pendingAcks).length;
  const isSubmitting = pendingAckCount > 0;
  const queuedCount = queuedEvents.length;

  // ── Socket ─────────────────────────────────────────────────────────────
  const { sendEvent, undoEvent } = useMatchSocket({
    matchId: matchId!,
    enabled: !!matchId,
  });

  // ── Match data ─────────────────────────────────────────────────────────
  const { match, setMatch, loading, error, fetchMatch, hydrateEvents } =
    useMatchData({ matchId, isLoggerReady, t, setLiveEvents });

  // ── UI state ───────────────────────────────────────────────────────────
  const [selectedTeam, setSelectedTeam] = useState<"home" | "away" | "both">(
    "home",
  );
  const [showSubstitutionFlow, setShowSubstitutionFlow] = useState(false);
  const [substitutionTeam, setSubstitutionTeam] = useState<"home" | "away">(
    "home",
  );
  const [manualFieldFlip, setManualFieldFlip] = useState(false);
  const [viewMode, setViewMode] = useState<CockpitViewMode>(initialView);
  const [dragLocked, setDragLocked] = useState(true);
  const [priorityPlayerId, setPriorityPlayerId] = useState<string | null>(null);
  const [pendingCardType, setPendingCardType] = useState<CardSelection | null>(
    null,
  );
  const pendingCardTypeRef = useRef<CardSelection | null>(null);
  const [ineffectiveTick, setIneffectiveTick] = useState(0);

  // ── Roster ─────────────────────────────────────────────────────────────
  const { onFieldIds, applyOnFieldChange } = useOnFieldRoster(
    match,
    liveEvents,
    queuedEvents,
  );

  const homeOnFieldPlayers = useMemo(
    () =>
      (match?.home_team.players ?? []).filter((p) => onFieldIds.home.has(p.id)),
    [match, onFieldIds.home],
  );
  const awayOnFieldPlayers = useMemo(
    () =>
      (match?.away_team.players ?? []).filter((p) => onFieldIds.away.has(p.id)),
    [match, onFieldIds.away],
  );

  // ── Tactical positions ─────────────────────────────────────────────────
  const isMatchLive =
    !!match?.status && !["Pending", "Scheduled"].includes(match.status);

  const {
    positions: tacticalPositions,
    getDisplayPosition,
    movePlayerFromDisplay,
    applySubstitution: applyTacticalSubstitution,
    draggingPlayerId,
    setDraggingPlayerId,
    homeFormation,
    awayFormation,
    applyFormation,
  } = useTacticalPositions({
    matchId,
    homePlayers: homeOnFieldPlayers,
    awayPlayers: awayOnFieldPlayers,
    isMatchLive,
  });

  const handleTacticalPlayerDragEnd = useCallback(
    (
      playerId: string,
      displayX: number,
      displayY: number,
      playerPosition: string | undefined,
      side: "home" | "away",
    ) => {
      movePlayerFromDisplay(
        playerId,
        { x: displayX, y: displayY },
        manualFieldFlip,
        playerPosition,
        side,
      );
    },
    [movePlayerFromDisplay, manualFieldFlip],
  );

  // ── Toast ──────────────────────────────────────────────────────────────
  const { toast, setToast, showTimedToast, dismissToast } = useCockpitToast();

  // ── Ineffective breakdown ──────────────────────────────────────────────
  const ineffectiveBreakdown = useCockpitIneffectiveBreakdown({
    match,
    liveEvents,
    queuedEvents,
    ineffectiveTick,
  });

  // ── VAR timer ──────────────────────────────────────────────────────────
  const {
    isVarActiveLocal,
    varStartMs,
    varStartGlobalSeconds,
    varStartTotalSeconds,
    varPauseStartMs,
    varPausedSeconds,
    varTick,
    syncVarPauseWithClockMode,
    syncVarWithGlobalClockRunning,
    handleVarToggle: handleVarToggleBase,
    handleGlobalClockStartVarSync,
    handleGlobalClockStopVarSync,
    resetVarState,
  } = useVarTimer({ match });

  const breakdownVarActive = Boolean(ineffectiveBreakdown?.varActive);
  const isVarActive = breakdownVarActive || isVarActiveLocal;

  // ── Timeout timer ──────────────────────────────────────────────────────
  const { isTimeoutActive, timeoutTimeSeconds, timeoutTimeClock } =
    useTimeoutTimer({ ineffectiveBreakdown });

  // ── Match clock ────────────────────────────────────────────────────────
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
    timeoutSeconds: timeoutTimeSeconds,
    isTimeoutActive,
  });

  // ── VAR derived state ──────────────────────────────────────────────────
  const { varTimeSeconds, varTimeClock } = useCockpitVarDerivedState({
    ineffectiveBreakdown,
    isVarActiveLocal,
    varStartGlobalSeconds,
    varStartTotalSeconds,
    varStartMs,
    varPauseStartMs,
    varPausedSeconds,
    varTick,
    isGlobalClockRunning,
    clockMode,
    syncVarWithGlobalClockRunning,
    syncVarPauseWithClockMode,
    globalClock,
  });

  // ── Ineffective time ──────────────────────────────────────────────────
  const {
    ineffectiveNoteOpen,
    ineffectiveNoteText,
    setIneffectiveNoteText,
    ineffectiveActionType,
    setIneffectiveActionType,
    ineffectiveTeamSelection,
    setIneffectiveTeamSelection,
    ineffectiveActionDropdownOpen,
    setIneffectiveActionDropdownOpen,
    ineffectiveTeamDropdownOpen,
    setIneffectiveTeamDropdownOpen,
    hasActiveIneffective,
    beginIneffective,
    endIneffectiveIfNeeded,
    confirmIneffectiveNote,
    cancelIneffectiveNote,
    switchIneffectiveTeam,
    logNeutralTimerEvent,
  } = useIneffectiveTime({
    match,
    selectedTeam,
    globalClock,
    operatorPeriod,
    clockMode,
    handleModeSwitch,
    sendEvent,
    setIsBallInPlay,
    setMatch,
  });

  useEffect(() => {
    if (clockMode === "INEFFECTIVE" || hasActiveIneffective) {
      setDragLocked(false);
    }
  }, [clockMode, hasActiveIneffective]);

  useCockpitIneffectiveTickEffect({
    match,
    hasActiveIneffective,
    clockMode,
    isVarActiveLocal,
    isTimeoutActive,
    setIneffectiveTick,
  });

  // ── Disciplinary ──────────────────────────────────────────────────────
  const { cardDisciplinaryStatus, cardYellowCounts, expelledPlayerIds } =
    useDisciplinary(liveEvents, queuedEvents);

  // ── Local effects ──────────────────────────────────────────────────────
  useCockpitLocalEffects({
    match,
    matchId,
    setManualFieldFlip,
    setPriorityPlayerId,
    isGlobalClockRunning,
    setIsBallInPlay,
  });

  // ── Status projection ─────────────────────────────────────────────────
  const { statusOverride, matchForPhase } = useCockpitStatusProjection({
    match,
  });

  // ── Drift ──────────────────────────────────────────────────────────────
  const {
    computedDriftSeconds,
    forcedDriftSeconds,
    driftSeconds,
    showDriftNudge,
  } = useClockDrift({
    match,
    globalClock,
    varPauseStartMs,
    varPausedSeconds,
    varTimeSeconds,
    fetchMatch,
  });

  // ── Period manager ─────────────────────────────────────────────────────
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
    ({ target, error: transErr }) => {
      const message = `Failed to update status to ${target}. ${
        transErr instanceof Error ? transErr.message : ""
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

  // ── Action flow ────────────────────────────────────────────────────────
  const {
    currentStep,
    currentTeam,
    selectedPlayer,
    selectedAction,
    fieldAnchor,
    availableActions,
    availableOutcomes,
    positionMode,
    setPositionMode,
    handlePlayerClick,
    handleZoneSelect,
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

  // ── Expelled player effect ─────────────────────────────────────────────
  useCockpitExpelledPlayerEffect({
    selectedPlayer,
    expelledPlayerIds,
    resetFlow,
    setToast,
    t,
  });

  // ── Transition state ──────────────────────────────────────────────────
  const {
    currentStatusNormalized,
    transitionError,
    guardTransition,
    cockpitLocked,
    lockReason,
    transitionDisabled,
    transitionReason,
  } = useCockpitTransitionState({
    statusOverride,
    currentPhase,
    globalTimeSeconds,
    match,
    isAdmin,
    t,
  });

  // ── Interaction handlers ──────────────────────────────────────────────
  const {
    handleCardSelection,
    cancelCardSelection,
    handlePlayerSelection,
    handleFieldPlayerSelection,
    handleFieldDestination,
    handleQuickSubstitution,
    handleActionClickOverride,
    handleOutcomeSelect,
    handleRecipientSelect,
    eligibleRecipients,
  } = useCockpitInteractionHandlers({
    t,
    match,
    cockpitLocked,
    selectedTeam,
    setSelectedTeam,
    pendingCardType,
    pendingCardTypeRef,
    setPendingCardType,
    resetFlow,
    operatorPeriod,
    globalClock,
    sendEvent,
    expelledPlayerIds,
    isVarActive,
    currentStep,
    selectedPlayer,
    currentTeam,
    onFieldIds,
    setSubstitutionTeam,
    setShowSubstitutionFlow,
    setPriorityPlayerId,
    handlePlayerClick,
    handleDestinationClick,
    handleActionClick,
    handleOutcomeClick,
    handleRecipientClick,
    beginIneffective,
    showToast: (message) => showTimedToast(message),
  });

  // ── Substitution flow ─────────────────────────────────────────────────
  const {
    modalTeam: substitutionModalTeam,
    availablePlayers: substitutionAvailablePlayers,
    onField: substitutionOnField,
    onSubmit: handleSubstitutionSubmitBase,
    onCancel: handleSubstitutionCancel,
  } = useCockpitSubstitutionFlow({
    match,
    substitutionTeam,
    onFieldIds,
    cockpitLocked,
    expelledPlayerIds,
    globalClock,
    operatorPeriod,
    applyOnFieldChange,
    sendEvent,
    setShowSubstitutionFlow,
    showTimedToast,
    t,
  });

  const handleSubstitutionSubmit = useCallback(
    (playerOffId: string, playerOnId: string, isConcussion: boolean) => {
      handleSubstitutionSubmitBase(playerOffId, playerOnId, isConcussion);
      applyTacticalSubstitution(playerOffId, playerOnId);
    },
    [handleSubstitutionSubmitBase, applyTacticalSubstitution],
  );

  // ── Keyboard handlers ─────────────────────────────────────────────────
  const { buffer } = useCockpitKeyboardHandlers({
    isSubmitting,
    cockpitLocked,
    currentStep,
    match,
    currentTeam,
    selectedTeam,
    eligibleRecipients,
    availableOutcomes,
    isBallInPlay,
    setIsBallInPlay,
    setSelectedTeam,
    setPriorityPlayerId,
    handlePlayerClick,
    handleRecipientClick,
    handleOutcomeClick,
    handleQuickActionSelect,
    handleActionClick,
    resetFlow,
    handleGlobalClockStart,
    handleGlobalClockStop,
  });

  // ── Lifecycle effects ──────────────────────────────────────────────────
  useCockpitLifecycleEffects({
    matchId,
    lastTimelineRefreshRequest,
    setCurrentMatch,
    hydrateEvents,
    resetDuplicateStats,
    setManualFieldFlip,
    match,
    statusOverride,
    resetOperatorControls,
    cockpitLocked,
    resetFlow,
  });

  // Re-fetch match document when another tab changes match state
  useEffect(() => {
    if (!lastMatchRefreshRequest) return;
    fetchMatch();
  }, [lastMatchRefreshRequest, fetchMatch]);

  // ── Clock handlers (guarded) ──────────────────────────────────────────
  const {
    handleGlobalClockStartGuarded,
    handleGlobalClockStopGuarded,
    handleModeSwitchGuarded,
    handleVarToggle,
    handleTimeoutToggle,
    showFieldResume,
  } = useCockpitClockHandlers({
    cockpitLocked,
    clockMode,
    currentPhase,
    isVarActiveLocal,
    isTimeoutActive,
    varTimeSeconds,
    globalClock,
    isGlobalClockRunning,
    beginIneffective,
    endIneffectiveIfNeeded,
    setIsBallInPlay,
    handleGlobalClockStart,
    handleGlobalClockStop,
    handleGlobalClockStartVarSync,
    handleGlobalClockStopVarSync,
    handleVarToggleBase,
    logNeutralTimerEvent,
  });

  // ── Referee actions ───────────────────────────────────────────────────
  const handleRefereeAction = useCallback(
    (actionId: string) => {
      const actionLabels: Record<string, string> = {
        interference: t(
          "refereeActionInterference",
          "Ball hits referee / interference",
        ),
        discussion: t(
          "refereeActionDiscussion",
          "Referee discussion / explanation",
        ),
        injury: t("refereeActionInjury", "Referee injury"),
        equipment: t(
          "refereeActionEquipment",
          "Equipment / communication issue",
        ),
      };
      const note =
        actionLabels[actionId] || t("ineffectiveReasonOther", "Other");
      beginIneffective(note, {
        teamId: "NEUTRAL",
        playerId: null,
        actionType: "Other",
        isNeutral: true,
      });
    },
    [beginIneffective, t],
  );

  // ── E2E seed ──────────────────────────────────────────────────────────
  useCockpitE2EPlayersSeed({ enabled: IS_E2E_TEST_MODE, match });

  // ── Live score ─────────────────────────────────────────────────────────
  const { goalEvents, liveScore, formatGoalLabel } = useLiveScore(
    match,
    liveEvents,
  );

  // ── Auto effects ──────────────────────────────────────────────────────
  useCockpitAutoEffects({
    t,
    liveEvents,
    duplicateHighlight,
    clearDuplicateHighlight,
    beginIneffective,
  });

  // ── Harness events ────────────────────────────────────────────────────
  const { sendHarnessPassEvent, sendHarnessRawEvent } = useCockpitHarnessEvents(
    {
      match,
      operatorClock,
      operatorPeriod,
      sendEvent,
    },
  );

  // ── Event handlers ────────────────────────────────────────────────────
  const {
    undoError,
    undoDisabled,
    handleUndoLastEvent,
    handleDeletePendingEvent,
    handleDeleteLoggedEvent,
    handleUpdateEventNotes,
    handleUpdateEventData,
  } = useCockpitEventHandlers({
    t,
    isAdmin,
    isConnected,
    cockpitLocked,
    lockReason,
    pendingAcks,
    undoStack,
    liveEvents,
    queuedEvents,
    removeLiveEventByClientId,
    removeQueuedEvent,
    removeUndoCandidate,
    undoEvent,
    removeQueuedEventByClientId,
    rejectPendingAck,
    removeLiveEventById,
    hydrateEvents,
    updateEventNotes,
    upsertLiveEvent,
    showToast: (message) => showTimedToast(message),
  });

  // ── E2E harness ───────────────────────────────────────────────────────
  useCockpitHarness({
    enabled: IS_E2E_TEST_MODE,
    match,
    resetFlow,
    setSelectedTeam,
    currentStepRef,
    sendPassEvent: sendHarnessPassEvent,
    sendRawEvent: sendHarnessRawEvent,
    undoLastEvent: handleUndoLastEvent,
    computedDriftSeconds,
    forcedDriftSeconds,
    driftSeconds,
    showDriftNudge,
  });

  // ── Duplicate telemetry ───────────────────────────────────────────────
  const {
    lastDuplicateTeamName,
    lastDuplicateSeenAt,
    lastDuplicateSummaryDetails,
    lastDuplicateSummaryDefault,
    duplicateSessionDetailsSuffix,
    duplicateSessionSummaryDefault,
    duplicateDetailsDefault,
    duplicateExistingEventDefault,
  } = useDuplicateTelemetry(match, duplicateStats, duplicateHighlight);

  // ── Reset match ───────────────────────────────────────────────────────
  const {
    showResetModal,
    setShowResetModal,
    resetConfirmText,
    setResetConfirmText,
    isFulltime,
    resetBlocked,
    resetDisabledReason,
    resetTooltip,
    openResetModal,
    confirmGlobalReset,
  } = useResetMatch({
    matchId,
    isAdmin,
    match,
    queuedCount,
    pendingAckCount,
    t,
    setMatch,
    hydrateEvents,
    resetVarState,
    resetOperatorControls,
    setLiveEvents,
    clearQueuedEvents,
    clearPendingAcks,
    clearUndoStack,
    resetDuplicateStats,
    clearDuplicateHighlight,
  });

  // ── Manual labels ─────────────────────────────────────────────────────
  const manualHomeTeamLabel =
    match?.home_team.short_name ||
    match?.home_team.name ||
    t("homeTeam", "Home");
  const manualAwayTeamLabel =
    match?.away_team.short_name ||
    match?.away_team.name ||
    t("awayTeam", "Away");

  // ── Context value ─────────────────────────────────────────────────────
  const value = useMemo(
    () => ({
      t,
      isLoggerReady,
      matchId,
      isAdmin,
      match,
      setMatch,
      loading,
      error,
      fetchMatch,
      hydrateEvents,
      isConnected,
      liveEvents,
      queuedEvents,
      pendingAcks,
      undoStack,
      duplicateHighlight,
      duplicateStats,
      operatorPeriod,
      sendEvent,
      isSubmitting,
      queuedCount,
      pendingAckCount,
      selectedTeam,
      setSelectedTeam,
      onFieldIds,
      globalClock,
      effectiveClock,
      effectiveTime,
      ineffectiveClock,
      clockMode,
      isGlobalClockRunning,
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
      currentStatusNormalized,
      transitionError,
      guardTransition,
      cockpitLocked,
      lockReason,
      transitionDisabled,
      transitionReason,
      statusOverride,
      ineffectiveNoteOpen,
      ineffectiveNoteText,
      setIneffectiveNoteText,
      ineffectiveActionType,
      setIneffectiveActionType,
      ineffectiveTeamSelection,
      setIneffectiveTeamSelection,
      ineffectiveActionDropdownOpen,
      setIneffectiveActionDropdownOpen,
      ineffectiveTeamDropdownOpen,
      setIneffectiveTeamDropdownOpen,
      hasActiveIneffective,
      cancelIneffectiveNote,
      confirmIneffectiveNote,
      switchIneffectiveTeam,
      beginIneffective,
      isVarActive,
      varTimeClock,
      isTimeoutActive,
      timeoutTimeClock,
      varTimeSeconds,
      timeoutTimeSeconds,
      handleGlobalClockStartGuarded,
      handleGlobalClockStopGuarded,
      handleModeSwitchGuarded,
      handleVarToggle,
      handleTimeoutToggle,
      showFieldResume,
      handleRefereeAction,
      ineffectiveBreakdown,
      isBallInPlay,
      showDriftNudge,
      driftSeconds,
      cardDisciplinaryStatus,
      expelledPlayerIds,
      currentStep,
      currentTeam,
      selectedPlayer,
      selectedAction,
      fieldAnchor,
      availableActions,
      availableOutcomes,
      positionMode,
      setPositionMode,
      handleZoneSelect,
      handleQuickActionSelect,
      handleOpenMoreActions,
      resetFlow,
      handleCardSelection,
      cancelCardSelection,
      handlePlayerSelection,
      handleFieldPlayerSelection,
      handleFieldDestination,
      handleQuickSubstitution,
      handleActionClickOverride,
      handleOutcomeSelect,
      handleRecipientSelect,
      eligibleRecipients,
      undoError,
      undoDisabled,
      handleUndoLastEvent,
      handleDeletePendingEvent,
      handleDeleteLoggedEvent,
      handleUpdateEventNotes,
      handleUpdateEventData,
      buffer,
      getDisplayPosition,
      handleTacticalPlayerDragEnd,
      draggingPlayerId,
      setDraggingPlayerId,
      allTacticalPositions: tacticalPositions,
      homeFormation,
      awayFormation,
      applyFormation,
      viewMode,
      setViewMode,
      dragLocked,
      onToggleDragLock: () => setDragLocked((prev) => !prev),
      showSubstitutionFlow,
      substitutionModalTeam,
      substitutionAvailablePlayers,
      substitutionOnField,
      handleSubstitutionSubmit,
      handleSubstitutionCancel,
      manualFieldFlip,
      setManualFieldFlip,
      pendingCardType,
      priorityPlayerId,
      goalEvents,
      liveScore,
      formatGoalLabel,
      toast,
      dismissToast,
      lastDuplicateTeamName,
      lastDuplicateSeenAt,
      lastDuplicateSummaryDetails,
      lastDuplicateSummaryDefault,
      duplicateSessionDetailsSuffix,
      duplicateSessionSummaryDefault,
      duplicateDetailsDefault,
      duplicateExistingEventDefault,
      resetDuplicateStats,
      clearDuplicateHighlight,
      showResetModal,
      setShowResetModal,
      resetConfirmText,
      setResetConfirmText,
      isFulltime,
      resetBlocked,
      resetDisabledReason,
      resetTooltip,
      openResetModal,
      confirmGlobalReset,
      undoCount: undoStack.length,
      manualHomeTeamLabel,
      manualAwayTeamLabel,
      isMatchLive,
    }),
    [
      match,
      loading,
      error,
      isConnected,
      liveEvents,
      queuedEvents,
      pendingAcks,
      undoStack,
      duplicateHighlight,
      duplicateStats,
      operatorPeriod,
      isSubmitting,
      queuedCount,
      pendingAckCount,
      selectedTeam,
      onFieldIds,
      globalClock,
      effectiveClock,
      effectiveTime,
      ineffectiveClock,
      clockMode,
      isGlobalClockRunning,
      currentPhase,
      periodInfo,
      showExtraTimeAlert,
      currentStatusNormalized,
      transitionError,
      cockpitLocked,
      lockReason,
      transitionDisabled,
      transitionReason,
      statusOverride,
      ineffectiveNoteOpen,
      ineffectiveNoteText,
      ineffectiveActionType,
      ineffectiveTeamSelection,
      ineffectiveActionDropdownOpen,
      ineffectiveTeamDropdownOpen,
      hasActiveIneffective,
      isVarActive,
      varTimeClock,
      isTimeoutActive,
      timeoutTimeClock,
      varTimeSeconds,
      timeoutTimeSeconds,
      showFieldResume,
      ineffectiveBreakdown,
      isBallInPlay,
      showDriftNudge,
      driftSeconds,
      cardDisciplinaryStatus,
      expelledPlayerIds,
      currentStep,
      currentTeam,
      selectedPlayer,
      selectedAction,
      fieldAnchor,
      availableActions,
      availableOutcomes,
      positionMode,
      eligibleRecipients,
      undoError,
      undoDisabled,
      buffer,
      draggingPlayerId,
      tacticalPositions,
      homeFormation,
      awayFormation,
      viewMode,
      dragLocked,
      showSubstitutionFlow,
      substitutionModalTeam,
      substitutionAvailablePlayers,
      substitutionOnField,
      manualFieldFlip,
      pendingCardType,
      priorityPlayerId,
      goalEvents,
      liveScore,
      toast,
      showResetModal,
      resetConfirmText,
      isFulltime,
      resetBlocked,
      resetDisabledReason,
      resetTooltip,
      manualHomeTeamLabel,
      manualAwayTeamLabel,
      lastDuplicateTeamName,
      lastDuplicateSeenAt,
      lastDuplicateSummaryDetails,
      lastDuplicateSummaryDefault,
      duplicateSessionDetailsSuffix,
      duplicateSessionSummaryDefault,
      duplicateDetailsDefault,
      duplicateExistingEventDefault,
    ],
  );

  return (
    <CockpitContext.Provider value={value}>{children}</CockpitContext.Provider>
  );
}
