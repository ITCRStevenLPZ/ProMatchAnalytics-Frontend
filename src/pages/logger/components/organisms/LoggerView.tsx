import { Play } from "lucide-react";
import { MatchEvent } from "../../../../store/useMatchLogStore";
import { CardSelection } from "../molecules/QuickCardPanel";
import MatchTimerDisplay from "../molecules/MatchTimerDisplay";
import TeamSelector from "../molecules/TeamSelector";
import InstructionBanner from "../molecules/InstructionBanner";
import LiveEventFeed from "../molecules/LiveEventFeed";
import ActionStage from "./ActionStage";

interface LoggerViewProps {
  match: any;
  operatorPeriod: number;
  globalClock: string;
  effectiveClock: string;
  ineffectiveClock: string;
  varTimeClock: string;
  timeoutTimeClock: string;
  clockMode: "EFFECTIVE" | "INEFFECTIVE";
  isGlobalClockRunning: boolean;
  isBallInPlay: boolean;
  cockpitLocked: boolean;
  lockReason?: string;
  handleGlobalClockStartGuarded: () => void;
  handleGlobalClockStopGuarded: () => void;
  handleModeSwitchGuarded: (mode: "EFFECTIVE" | "INEFFECTIVE") => void;
  handleVarToggle: () => void;
  handleTimeoutToggle: () => void;
  isVarActive: boolean;
  isTimeoutActive: boolean;
  showFieldResume: boolean;
  periodElapsedSeconds: number;
  periodMinimumSeconds: number;
  currentStep: any;
  selectedPlayer: any;
  selectedAction: string | null;
  pendingCardType: CardSelection | null;
  fieldAnchor: any;
  onFieldIds: { home: Set<string>; away: Set<string> };
  selectedTeam: "home" | "away" | "both";
  expelledPlayerIds: Set<string>;
  cardDisciplinaryStatus: Record<string, { yellowCount: number; red: boolean }>;
  setSelectedTeam: (team: "home" | "away" | "both") => void;
  handlePlayerSelection: (...args: any[]) => void;
  handleFieldPlayerSelection: (...args: any[]) => void;
  handleFieldDestination: (location: any) => void;
  handleQuickActionSelect: (action: string) => void;
  handleOpenMoreActions: () => void;
  resetFlow: () => void;
  handleQuickSubstitution: (team: "home" | "away") => void;
  handleCardSelection: (cardType: CardSelection) => void;
  cancelCardSelection: () => void;
  availableActions: string[];
  isSubmitting: boolean;
  handleActionClickOverride: (...args: any[]) => void;
  availableOutcomes: string[];
  handleOutcomeSelect: (...args: any[]) => void;
  currentTeam: any;
  eligibleRecipients: any[];
  handleRecipientSelect: (...args: any[]) => void;
  handleUndoLastEvent: () => void;
  undoDisabled: boolean;
  manualFieldFlip: boolean;
  setManualFieldFlip: (value: boolean | ((prev: boolean) => boolean)) => void;
  priorityPlayerId: string | null;
  liveEvents: MatchEvent[];
  duplicateHighlight: any;
  handleDeletePendingEvent: (...args: any[]) => void;
  handleDeleteLoggedEvent: (...args: any[]) => void;
  isAdmin: boolean;
  handleUpdateEventNotes: (...args: any[]) => Promise<void> | void;
  t: any;
}

export default function LoggerView({
  match,
  operatorPeriod,
  globalClock,
  effectiveClock,
  ineffectiveClock,
  varTimeClock,
  timeoutTimeClock,
  clockMode,
  isGlobalClockRunning,
  isBallInPlay,
  cockpitLocked,
  lockReason,
  handleGlobalClockStartGuarded,
  handleGlobalClockStopGuarded,
  handleModeSwitchGuarded,
  handleVarToggle,
  handleTimeoutToggle,
  isVarActive,
  isTimeoutActive,
  showFieldResume,
  periodElapsedSeconds,
  periodMinimumSeconds,
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
  handleQuickActionSelect,
  handleOpenMoreActions,
  resetFlow,
  handleQuickSubstitution,
  handleCardSelection,
  cancelCardSelection,
  availableActions,
  isSubmitting,
  handleActionClickOverride,
  availableOutcomes,
  handleOutcomeSelect,
  currentTeam,
  eligibleRecipients,
  handleRecipientSelect,
  handleUndoLastEvent,
  undoDisabled,
  manualFieldFlip,
  setManualFieldFlip,
  priorityPlayerId,
  liveEvents,
  duplicateHighlight,
  handleDeletePendingEvent,
  handleDeleteLoggedEvent,
  isAdmin,
  handleUpdateEventNotes,
  t,
}: LoggerViewProps) {
  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex-none space-y-3">
        <MatchTimerDisplay
          match={match}
          operatorPeriod={operatorPeriod}
          globalClock={globalClock}
          effectiveClock={effectiveClock}
          ineffectiveClock={ineffectiveClock}
          varClock={varTimeClock}
          timeoutClock={timeoutTimeClock}
          clockMode={clockMode}
          isClockRunning={isGlobalClockRunning}
          isBallInPlay={isBallInPlay}
          locked={cockpitLocked}
          lockReason={lockReason}
          onGlobalStart={handleGlobalClockStartGuarded}
          onGlobalStop={handleGlobalClockStopGuarded}
          onModeSwitch={handleModeSwitchGuarded}
          onVarToggle={handleVarToggle}
          onTimeoutToggle={handleTimeoutToggle}
          isVarActive={isVarActive}
          isTimeoutActive={isTimeoutActive}
          hideResumeButton={showFieldResume}
          periodElapsedSeconds={periodElapsedSeconds}
          periodMinimumSeconds={periodMinimumSeconds}
          t={t}
        />
      </div>

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

      <ActionStage
        match={match}
        manualFieldFlip={manualFieldFlip}
        selectedPlayer={selectedPlayer}
        selectedTeam={selectedTeam}
        expelledPlayerIds={expelledPlayerIds}
        cardDisciplinaryStatus={cardDisciplinaryStatus}
        pendingCardType={pendingCardType}
        setSelectedTeam={setSelectedTeam}
        onFieldIds={onFieldIds}
        handlePlayerSelection={handlePlayerSelection}
        handleFieldPlayerSelection={handleFieldPlayerSelection}
        handleFieldDestination={handleFieldDestination}
        currentStep={currentStep}
        cockpitLocked={cockpitLocked}
        fieldAnchor={fieldAnchor}
        handleQuickActionSelect={handleQuickActionSelect}
        handleOpenMoreActions={handleOpenMoreActions}
        resetFlow={resetFlow}
        showFieldResume={showFieldResume}
        handleModeSwitchGuarded={handleModeSwitchGuarded}
        priorityPlayerId={priorityPlayerId}
        isGlobalClockRunning={isGlobalClockRunning}
        clockMode={clockMode}
        isVarActive={isVarActive}
        handleQuickSubstitution={handleQuickSubstitution}
        handleCardSelection={handleCardSelection}
        cancelCardSelection={cancelCardSelection}
        availableActions={availableActions}
        isSubmitting={isSubmitting}
        handleActionClickOverride={handleActionClickOverride}
        selectedAction={selectedAction}
        availableOutcomes={availableOutcomes}
        handleOutcomeSelect={handleOutcomeSelect}
        currentTeam={currentTeam}
        eligibleRecipients={eligibleRecipients}
        handleRecipientSelect={handleRecipientSelect}
        t={t}
      />

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
            onDeleteEvent={isAdmin ? handleDeleteLoggedEvent : undefined}
            canDeleteEvent={(event) =>
              isAdmin && event.type === "Card" && Boolean(event._id)
            }
            onUpdateEventNotes={handleUpdateEventNotes}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}
