import { List, BarChart3, Eye } from "../components/icons";
import HalftimePanel from "./logger/components/molecules/HalftimePanel";
import SubstitutionFlow from "./logger/components/molecules/SubstitutionFlow";
import AnalyticsView from "./logger/components/organisms/AnalyticsView";
import LoggerView from "./logger/components/organisms/LoggerView";
import ReviewView from "./logger/components/organisms/ReviewView";
import CockpitTopSection from "./logger/components/organisms/CockpitTopSection";
import { CockpitProvider, useCockpit } from "./logger/context/CockpitContext";

export default function LoggerCockpit() {
  return (
    <CockpitProvider>
      <CockpitContent />
    </CockpitProvider>
  );
}

// ---------------------------------------------------------------------------
// Inner component – consumes the cockpit context and renders views.
// ---------------------------------------------------------------------------
function CockpitContent() {
  const {
    t,
    isLoggerReady,
    matchId,
    match,
    loading,
    error,
    isAdmin,
    isConnected,
    queuedCount,
    pendingAckCount,
    isSubmitting,
    openResetModal,
    resetBlocked,
    resetTooltip,
    undoError,
    viewMode,
    setViewMode,
    statusOverride,
    showResetModal,
    setShowResetModal,
    isFulltime,
    resetDisabledReason,
    resetConfirmText,
    setResetConfirmText,
    confirmGlobalReset,
    ineffectiveNoteOpen,
    ineffectiveActionType,
    ineffectiveTeamSelection,
    ineffectiveActionDropdownOpen,
    ineffectiveTeamDropdownOpen,
    ineffectiveNoteText,
    manualHomeTeamLabel,
    manualAwayTeamLabel,
    setIneffectiveActionDropdownOpen,
    setIneffectiveTeamDropdownOpen,
    setIneffectiveActionType,
    setIneffectiveTeamSelection,
    setIneffectiveNoteText,
    cancelIneffectiveNote,
    confirmIneffectiveNote,
    liveScore,
    goalEvents,
    formatGoalLabel,
    transitionError,
    toast,
    currentStatusNormalized,
    currentPhase,
    clockMode,
    isGlobalClockRunning,
    cockpitLocked,
    lockReason,
    showExtraTimeAlert,
    periodInfo,
    transitionToHalftime,
    transitionToFulltime,
    dismissExtraTimeAlert,
    showDriftNudge,
    driftSeconds,
    fetchMatch,
    operatorPeriod,
    globalClock,
    guardTransition,
    transitionToSecondHalf,
    transitionToExtraFirst,
    transitionToExtraHalftime,
    transitionToExtraSecond,
    transitionToPenalties,
    finishMatch,
    transitionDisabled,
    transitionReason,
    duplicateStats,
    lastDuplicateSummaryDetails,
    lastDuplicateSummaryDefault,
    lastDuplicateTeamName,
    lastDuplicateSeenAt,
    resetDuplicateStats,
    duplicateHighlight,
    duplicateDetailsDefault,
    duplicateSessionDetailsSuffix,
    duplicateSessionSummaryDefault,
    duplicateExistingEventDefault,
    clearDuplicateHighlight,
    dismissToast,
    effectiveClock,
    ineffectiveClock,
    varTimeClock,
    timeoutTimeClock,
    effectiveTime,
    varTimeSeconds,
    timeoutTimeSeconds,
    ineffectiveBreakdown,
    isVarActive,
    isTimeoutActive,
    liveEvents,
    queuedEvents,
    buffer,
    handleGlobalClockStartGuarded,
    handleGlobalClockStopGuarded,
    handleModeSwitchGuarded,
    handleVarToggle,
    handleTimeoutToggle,
    handleRefereeAction,
    showFieldResume,
    isBallInPlay,
    hasActiveIneffective,
    switchIneffectiveTeam,
    currentStep,
    selectedPlayer,
    selectedAction,
    pendingCardType,
    fieldAnchor,
    onFieldIds,
    selectedTeam,
    expelledPlayerIds,
    cardDisciplinaryStatus,
    setSelectedTeam,
    handlePlayerSelection,
    handleFieldPlayerSelection,
    handleFieldDestination,
    handleZoneSelect,
    handleQuickActionSelect,
    handleOpenMoreActions,
    resetFlow,
    handleQuickSubstitution,
    handleCardSelection,
    cancelCardSelection,
    availableActions,
    handleActionClickOverride,
    availableOutcomes,
    handleOutcomeSelect,
    currentTeam,
    eligibleRecipients,
    handleRecipientSelect,
    handleUndoLastEvent,
    undoDisabled,
    undoCount,
    manualFieldFlip,
    setManualFieldFlip,
    priorityPlayerId,
    handleDeletePendingEvent,
    handleDeleteLoggedEvent,
    handleUpdateEventNotes,
    handleUpdateEventData,
    getDisplayPosition,
    handleTacticalPlayerDragEnd,
    draggingPlayerId,
    setDraggingPlayerId,
    allTacticalPositions,
    homeFormation,
    awayFormation,
    applyFormation,
    dragLocked,
    onToggleDragLock,
    positionMode,
    setPositionMode,
    showSubstitutionFlow,
    substitutionModalTeam,
    substitutionAvailablePlayers,
    substitutionOnField,
    handleSubstitutionSubmit,
    handleSubstitutionCancel,
  } = useCockpit();

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
                      data-testid="toggle-logger"
                      onClick={() => setViewMode("logger")}
                      className="inline-flex items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    >
                      <List size={16} />
                      {t("logger:logger.view", "Logger")}
                    </button>
                    <button
                      type="button"
                      data-testid="toggle-review-from-alt"
                      onClick={() => setViewMode("review")}
                      className="inline-flex items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    >
                      <Eye size={16} />
                      {t("logger:logger.review", "Review")}
                    </button>
                    <button
                      type="button"
                      data-testid="toggle-analytics"
                      onClick={() => setViewMode("logger")}
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
                  ineffectiveClock={ineffectiveClock}
                  varClock={varTimeClock}
                  timeoutClock={timeoutTimeClock}
                  effectiveTime={effectiveTime}
                  varTimeSeconds={varTimeSeconds}
                  timeoutTimeSeconds={timeoutTimeSeconds}
                  ineffectiveBreakdown={ineffectiveBreakdown}
                  clockMode={clockMode}
                  isVarActive={isVarActive}
                  isTimeoutActive={isTimeoutActive}
                  t={t}
                />
              </>
            ) : viewMode === "review" ? (
              <>
                {/* Segmented toggle for review view */}
                <div className="flex justify-end mb-2">
                  <div className="flex rounded-lg border border-slate-600 overflow-hidden">
                    <button
                      type="button"
                      data-testid="toggle-logger"
                      onClick={() => setViewMode("logger")}
                      className="inline-flex items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    >
                      <List size={16} />
                      {t("logger:logger.view", "Logger")}
                    </button>
                    <button
                      type="button"
                      data-testid="toggle-review"
                      onClick={() => setViewMode("review")}
                      className="inline-flex items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors bg-teal-600 text-white"
                    >
                      <Eye size={16} />
                      {t("logger:logger.review", "Review")}
                    </button>
                    <button
                      type="button"
                      data-testid="toggle-analytics-from-review"
                      onClick={() => setViewMode("analytics")}
                      className="inline-flex items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    >
                      <BarChart3 size={16} />
                      {t("logger:logger.analytics", "Analytics")}
                    </button>
                  </div>
                </div>
                <ReviewView
                  match={match}
                  liveEvents={liveEvents}
                  isAdmin={isAdmin}
                  onUpdateEventData={handleUpdateEventData}
                  onUpdateEventNotes={handleUpdateEventNotes}
                  onDeleteEvent={isAdmin ? handleDeleteLoggedEvent : undefined}
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
                handleRefereeAction={handleRefereeAction}
                isVarActive={isVarActive}
                isTimeoutActive={isTimeoutActive}
                showFieldResume={showFieldResume}
                isHalftimePhase={
                  currentPhase === "HALFTIME" ||
                  currentPhase === "EXTRA_HALFTIME"
                }
                hasActiveIneffective={hasActiveIneffective}
                ineffectiveTeamLabel={
                  ineffectiveTeamSelection === "home"
                    ? match?.away_team?.short_name ?? "Away"
                    : match?.home_team?.short_name ?? "Home"
                }
                onSwitchIneffectiveTeam={() =>
                  switchIneffectiveTeam(
                    ineffectiveTeamSelection === "home" ? "away" : "home",
                  )
                }
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
                undoCount={undoCount}
                manualFieldFlip={manualFieldFlip}
                setManualFieldFlip={setManualFieldFlip}
                priorityPlayerId={priorityPlayerId}
                liveEvents={liveEvents}
                duplicateHighlight={duplicateHighlight}
                handleDeletePendingEvent={handleDeletePendingEvent}
                handleDeleteLoggedEvent={handleDeleteLoggedEvent}
                isAdmin={isAdmin}
                handleUpdateEventNotes={handleUpdateEventNotes}
                handleUpdateEventData={handleUpdateEventData}
                getDisplayPosition={getDisplayPosition}
                onTacticalPlayerDragEnd={handleTacticalPlayerDragEnd}
                draggingPlayerId={draggingPlayerId}
                onTacticalDragStart={setDraggingPlayerId}
                onTacticalDragStop={() => setDraggingPlayerId(null)}
                allTacticalPositions={allTacticalPositions}
                homeFormation={homeFormation}
                awayFormation={awayFormation}
                applyFormation={applyFormation}
                viewMode={viewMode}
                setViewMode={setViewMode}
                dragLocked={dragLocked}
                onToggleDragLock={onToggleDragLock}
                positionMode={positionMode}
                onPositionModeChange={setPositionMode}
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
