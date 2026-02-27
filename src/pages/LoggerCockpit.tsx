import { useState, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { List, BarChart3 } from "../components/icons";
import { useMatchLogStore } from "../store/useMatchLogStore";
import { useMatchSocket } from "../hooks/useMatchSocket";
import { IS_E2E_TEST_MODE } from "../lib/loggerApi";
import { useActionFlow } from "./logger/hooks/useActionFlow";
import { useMatchTimer } from "./logger/hooks/useMatchTimer";
import { usePeriodManager } from "./logger/hooks/usePeriodManager";
import HalftimePanel from "./logger/components/molecules/HalftimePanel";
import SubstitutionFlow from "./logger/components/molecules/SubstitutionFlow";
import type { CardSelection } from "./logger/components/molecules/QuickCardPanel";
import AnalyticsView from "./logger/components/organisms/AnalyticsView";
import LoggerView from "./logger/components/organisms/LoggerView";
import CockpitTopSection from "./logger/components/organisms/CockpitTopSection";
import { useDisciplinary } from "./logger/hooks/useDisciplinary";
import { useLiveScore } from "./logger/hooks/useLiveScore";
import { useDuplicateTelemetry } from "./logger/hooks/useDuplicateTelemetry";
import { useOnFieldRoster } from "./logger/hooks/useOnFieldRoster";
import { useClockDrift } from "./logger/hooks/useClockDrift";
import { useMatchData } from "./logger/hooks/useMatchData";
import { useVarTimer } from "./logger/hooks/useVarTimer";
import { useTimeoutTimer } from "./logger/hooks/useTimeoutTimer";
import { useIneffectiveTime } from "./logger/hooks/useIneffectiveTime";
import { useResetMatch } from "./logger/hooks/useResetMatch";
import { useCockpitHarness } from "./logger/hooks/useCockpitHarness";
import { useCockpitEventHandlers } from "./logger/hooks/useCockpitEventHandlers";
import { useCockpitClockHandlers } from "./logger/hooks/useCockpitClockHandlers";
import { useCockpitInteractionHandlers } from "./logger/hooks/useCockpitInteractionHandlers";
import { useCockpitKeyboardHandlers } from "./logger/hooks/useCockpitKeyboardHandlers";
import { useCockpitLifecycleEffects } from "./logger/hooks/useCockpitLifecycleEffects";
import { useCockpitHarnessEvents } from "./logger/hooks/useCockpitHarnessEvents";
import { useCockpitAutoEffects } from "./logger/hooks/useCockpitAutoEffects";
import { useCockpitE2EPlayersSeed } from "./logger/hooks/useCockpitE2EPlayersSeed";
import { useCockpitIneffectiveBreakdown } from "./logger/hooks/useCockpitIneffectiveBreakdown";
import { useCockpitLocalEffects } from "./logger/hooks/useCockpitLocalEffects";
import { useCockpitStatusProjection } from "./logger/hooks/useCockpitStatusProjection";
import { useCockpitVarDerivedState } from "./logger/hooks/useCockpitVarDerivedState";
import { useCockpitIneffectiveTickEffect } from "./logger/hooks/useCockpitIneffectiveTickEffect";
import { useCockpitExpelledPlayerEffect } from "./logger/hooks/useCockpitExpelledPlayerEffect";
import { useCockpitTransitionState } from "./logger/hooks/useCockpitTransitionState";
import { useCockpitToast } from "./logger/hooks/useCockpitToast";
import { useCockpitSubstitutionFlow } from "./logger/hooks/useCockpitSubstitutionFlow";
import { useTacticalPositions } from "./logger/hooks/useTacticalPositions";
import type { LoggerHarness } from "./logger/types";
import { parseClockToSeconds } from "./logger/lib/clockHelpers";

import { useAuthStore } from "../store/authStore";

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

  const { match, setMatch, loading, error, fetchMatch, hydrateEvents } =
    useMatchData({
      matchId,
      isLoggerReady,
      t,
      setLiveEvents,
    });

  const [selectedTeam, setSelectedTeam] = useState<"home" | "away" | "both">(
    "home",
  );
  const [showSubstitutionFlow, setShowSubstitutionFlow] = useState(false);
  const [substitutionTeam, setSubstitutionTeam] = useState<"home" | "away">(
    "home",
  );
  const { onFieldIds, applyOnFieldChange } = useOnFieldRoster(
    match,
    liveEvents,
    queuedEvents,
  );
  const [manualFieldFlip, setManualFieldFlip] = useState(false);

  // Tactical field — compute on-field player lists for position management
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
  const [viewMode, setViewMode] = useState<"logger" | "analytics">("logger");
  const [dragLocked, setDragLocked] = useState(true);
  const [priorityPlayerId, setPriorityPlayerId] = useState<string | null>(null);
  const [pendingCardType, setPendingCardType] = useState<CardSelection | null>(
    null,
  );
  const pendingCardTypeRef = useRef<CardSelection | null>(null);

  const { toast, setToast, showTimedToast, dismissToast } = useCockpitToast();

  const [ineffectiveTick, setIneffectiveTick] = useState(0);
  const ineffectiveBreakdown = useCockpitIneffectiveBreakdown({
    match,
    liveEvents,
    queuedEvents,
    ineffectiveTick,
  });

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
  } = useVarTimer({
    match,
  });

  const breakdownVarActive = Boolean(ineffectiveBreakdown?.varActive);
  const isVarActive = breakdownVarActive || isVarActiveLocal;

  const { isTimeoutActive, timeoutTimeSeconds, timeoutTimeClock } =
    useTimeoutTimer({
      ineffectiveBreakdown,
    });

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

  useCockpitIneffectiveTickEffect({
    match,
    hasActiveIneffective,
    clockMode,
    isVarActiveLocal,
    isTimeoutActive,
    setIneffectiveTick,
  });

  const { cardDisciplinaryStatus, cardYellowCounts, expelledPlayerIds } =
    useDisciplinary(liveEvents, queuedEvents);

  useCockpitLocalEffects({
    match,
    matchId,
    setManualFieldFlip,
    setPriorityPlayerId,
    isGlobalClockRunning,
    setIsBallInPlay,
  });

  const { statusOverride, matchForPhase } = useCockpitStatusProjection({
    match,
  });

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

  const {
    currentStep,
    currentTeam,
    selectedPlayer,
    selectedAction,
    fieldAnchor,
    availableActions,
    availableOutcomes,
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

  useCockpitExpelledPlayerEffect({
    selectedPlayer,
    expelledPlayerIds,
    resetFlow,
    setToast,
    t,
  });

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
    showToast: (message) => {
      showTimedToast(message);
    },
  });

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

  // Wrap substitution submit to also update tactical field positions
  const handleSubstitutionSubmit = useCallback(
    (playerOffId: string, playerOnId: string, isConcussion: boolean) => {
      handleSubstitutionSubmitBase(playerOffId, playerOnId, isConcussion);
      applyTacticalSubstitution(playerOffId, playerOnId);
    },
    [handleSubstitutionSubmitBase, applyTacticalSubstitution],
  );

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

  useCockpitE2EPlayersSeed({
    enabled: IS_E2E_TEST_MODE,
    match,
  });

  const { goalEvents, liveScore, formatGoalLabel } = useLiveScore(
    match,
    liveEvents,
  );

  useCockpitAutoEffects({
    t,
    liveEvents,
    duplicateHighlight,
    clearDuplicateHighlight,
    beginIneffective,
  });

  const { sendHarnessPassEvent, sendHarnessRawEvent } = useCockpitHarnessEvents(
    {
      match,
      operatorClock,
      operatorPeriod,
      sendEvent,
    },
  );

  const {
    undoError,
    undoDisabled,
    handleUndoLastEvent,
    handleDeletePendingEvent,
    handleDeleteLoggedEvent,
    handleUpdateEventNotes,
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
    showToast: (message) => {
      showTimedToast(message);
    },
  });

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
          <CockpitTopSection
            t={t}
            match={match}
            isConnected={isConnected}
            queuedCount={queuedCount}
            pendingAckCount={pendingAckCount}
            isSubmitting={isSubmitting}
            isAdmin={isAdmin}
            openResetModal={openResetModal}
            resetBlocked={resetBlocked}
            resetTooltip={resetTooltip}
            undoError={undoError}
            viewMode={viewMode}
            setViewMode={setViewMode}
            statusOverride={statusOverride}
            showResetModal={showResetModal}
            setShowResetModal={setShowResetModal}
            isFulltime={isFulltime}
            resetDisabledReason={resetDisabledReason}
            resetConfirmText={resetConfirmText}
            setResetConfirmText={setResetConfirmText}
            confirmGlobalReset={confirmGlobalReset}
            ineffectiveNoteOpen={ineffectiveNoteOpen}
            ineffectiveActionType={ineffectiveActionType}
            ineffectiveTeamSelection={ineffectiveTeamSelection}
            ineffectiveActionDropdownOpen={ineffectiveActionDropdownOpen}
            ineffectiveTeamDropdownOpen={ineffectiveTeamDropdownOpen}
            ineffectiveNoteText={ineffectiveNoteText}
            manualHomeTeamLabel={manualHomeTeamLabel}
            manualAwayTeamLabel={manualAwayTeamLabel}
            setIneffectiveActionDropdownOpen={setIneffectiveActionDropdownOpen}
            setIneffectiveTeamDropdownOpen={setIneffectiveTeamDropdownOpen}
            setIneffectiveActionType={setIneffectiveActionType}
            setIneffectiveTeamSelection={setIneffectiveTeamSelection}
            setIneffectiveNoteText={setIneffectiveNoteText}
            cancelIneffectiveNote={cancelIneffectiveNote}
            confirmIneffectiveNote={confirmIneffectiveNote}
            liveScore={liveScore}
            goalEvents={goalEvents}
            formatGoalLabel={formatGoalLabel}
            transitionError={transitionError}
            toast={toast}
            currentStatusNormalized={currentStatusNormalized}
            currentPhase={currentPhase}
            clockMode={clockMode}
            isGlobalClockRunning={isGlobalClockRunning}
            cockpitLocked={cockpitLocked}
            lockReason={lockReason}
            showExtraTimeAlert={showExtraTimeAlert}
            extraTimeSeconds={periodInfo.extraTimeSeconds}
            transitionToHalftime={transitionToHalftime}
            transitionToFulltime={transitionToFulltime}
            dismissExtraTimeAlert={dismissExtraTimeAlert}
            showDriftNudge={showDriftNudge}
            driftSeconds={driftSeconds}
            fetchMatch={fetchMatch}
            operatorPeriod={operatorPeriod}
            isExtraTime={periodInfo.isExtraTime}
            globalClock={globalClock}
            guardTransition={guardTransition}
            transitionToSecondHalf={transitionToSecondHalf}
            transitionToExtraFirst={transitionToExtraFirst}
            transitionToExtraHalftime={transitionToExtraHalftime}
            transitionToExtraSecond={transitionToExtraSecond}
            transitionToPenalties={transitionToPenalties}
            finishMatch={finishMatch}
            transitionDisabled={transitionDisabled}
            transitionReason={transitionReason}
            duplicateStats={duplicateStats}
            lastDuplicateSummaryDetails={lastDuplicateSummaryDetails}
            lastDuplicateSummaryDefault={lastDuplicateSummaryDefault}
            lastDuplicateTeamName={lastDuplicateTeamName}
            lastDuplicateSeenAt={lastDuplicateSeenAt}
            resetDuplicateStats={resetDuplicateStats}
            duplicateHighlight={duplicateHighlight}
            duplicateDetailsDefault={duplicateDetailsDefault}
            duplicateSessionDetailsSuffix={duplicateSessionDetailsSuffix}
            duplicateSessionSummaryDefault={duplicateSessionSummaryDefault}
            duplicateExistingEventDefault={duplicateExistingEventDefault}
            clearDuplicateHighlight={clearDuplicateHighlight}
            dismissToast={dismissToast}
          />

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
              <>
                {/* Segmented toggle to return to logger — mirrors TeamSelector control */}
                <div className="flex justify-end mb-2">
                  <div className="flex rounded-lg border border-slate-600 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setViewMode("logger")}
                      className="inline-flex items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    >
                      <List size={16} />
                      {t("logger:logger.view", "Logger")}
                    </button>
                    <button
                      type="button"
                      data-testid="toggle-analytics"
                      onClick={() => setViewMode("analytics")}
                      className="inline-flex items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors bg-purple-600 text-white"
                    >
                      <BarChart3 size={16} />
                      {t("logger:logger.analytics", "Analytics")}
                    </button>
                  </div>
                </div>
                <AnalyticsView
                  match={match}
                  liveEvents={liveEvents}
                  queuedEvents={queuedEvents}
                  effectiveClock={effectiveClock}
                  globalClock={globalClock}
                  effectiveTime={effectiveTime}
                  varTimeSeconds={varTimeSeconds}
                  timeoutTimeSeconds={timeoutTimeSeconds}
                  ineffectiveBreakdown={ineffectiveBreakdown}
                  t={t}
                />
              </>
            ) : (
              <LoggerView
                match={match}
                operatorPeriod={operatorPeriod}
                globalClock={globalClock}
                effectiveClock={effectiveClock}
                ineffectiveClock={ineffectiveClock}
                varTimeClock={varTimeClock}
                timeoutTimeClock={timeoutTimeClock}
                clockMode={clockMode}
                isGlobalClockRunning={isGlobalClockRunning}
                isBallInPlay={isBallInPlay}
                cockpitLocked={cockpitLocked}
                lockReason={lockReason}
                handleGlobalClockStartGuarded={handleGlobalClockStartGuarded}
                handleGlobalClockStopGuarded={handleGlobalClockStopGuarded}
                handleModeSwitchGuarded={handleModeSwitchGuarded}
                handleVarToggle={handleVarToggle}
                handleTimeoutToggle={handleTimeoutToggle}
                isVarActive={isVarActive}
                isTimeoutActive={isTimeoutActive}
                showFieldResume={showFieldResume}
                periodElapsedSeconds={periodInfo.periodElapsedSeconds}
                periodMinimumSeconds={periodInfo.periodMinimumSeconds}
                currentStep={currentStep}
                selectedPlayer={selectedPlayer}
                selectedAction={selectedAction}
                pendingCardType={pendingCardType}
                fieldAnchor={fieldAnchor}
                onFieldIds={onFieldIds}
                selectedTeam={selectedTeam}
                expelledPlayerIds={expelledPlayerIds}
                cardDisciplinaryStatus={cardDisciplinaryStatus}
                setSelectedTeam={setSelectedTeam}
                handlePlayerSelection={handlePlayerSelection}
                handleFieldPlayerSelection={handleFieldPlayerSelection}
                handleFieldDestination={handleFieldDestination}
                handleZoneSelect={handleZoneSelect}
                handleQuickActionSelect={handleQuickActionSelect}
                handleOpenMoreActions={handleOpenMoreActions}
                resetFlow={resetFlow}
                handleQuickSubstitution={handleQuickSubstitution}
                handleCardSelection={handleCardSelection}
                cancelCardSelection={cancelCardSelection}
                availableActions={availableActions}
                isSubmitting={isSubmitting}
                handleActionClickOverride={handleActionClickOverride}
                availableOutcomes={availableOutcomes}
                handleOutcomeSelect={handleOutcomeSelect}
                currentTeam={currentTeam}
                eligibleRecipients={eligibleRecipients}
                handleRecipientSelect={handleRecipientSelect}
                handleUndoLastEvent={handleUndoLastEvent}
                undoDisabled={undoDisabled}
                manualFieldFlip={manualFieldFlip}
                setManualFieldFlip={setManualFieldFlip}
                priorityPlayerId={priorityPlayerId}
                liveEvents={liveEvents}
                duplicateHighlight={duplicateHighlight}
                handleDeletePendingEvent={handleDeletePendingEvent}
                handleDeleteLoggedEvent={handleDeleteLoggedEvent}
                isAdmin={isAdmin}
                handleUpdateEventNotes={handleUpdateEventNotes}
                getDisplayPosition={getDisplayPosition}
                onTacticalPlayerDragEnd={handleTacticalPlayerDragEnd}
                draggingPlayerId={draggingPlayerId}
                onTacticalDragStart={setDraggingPlayerId}
                onTacticalDragStop={() => setDraggingPlayerId(null)}
                allTacticalPositions={tacticalPositions}
                homeFormation={homeFormation}
                awayFormation={awayFormation}
                applyFormation={applyFormation}
                viewMode={viewMode}
                setViewMode={setViewMode}
                dragLocked={dragLocked}
                onToggleDragLock={() => setDragLocked((prev) => !prev)}
                t={t}
              />
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
          team={substitutionModalTeam ?? match.home_team}
          availablePlayers={substitutionAvailablePlayers}
          onField={substitutionOnField}
          expelledPlayerIds={expelledPlayerIds}
          period={operatorPeriod}
          globalClock={globalClock}
          onSubmit={handleSubstitutionSubmit}
          onCancel={handleSubstitutionCancel}
        />
      )}
    </div>
  );
}
