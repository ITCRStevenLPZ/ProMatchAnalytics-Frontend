import CockpitHeader from "../molecules/CockpitHeader";
import ResetConfirmModal from "../molecules/ResetConfirmModal";
import IneffectiveNoteModal from "../molecules/IneffectiveNoteModal";
import ScoreBoard from "../molecules/ScoreBoard";
import StatusRibbon from "../molecules/StatusRibbon";
import ExtraTimeAlert from "../molecules/ExtraTimeAlert";
import DriftBanner from "../molecules/DriftBanner";
import { MatchPeriodSelector } from "../molecules/MatchPeriodSelector";
import DuplicateTelemetryPanel from "../molecules/DuplicateTelemetryPanel";
import DuplicateHighlightBanner from "../molecules/DuplicateHighlightBanner";
import ToastNotification from "../molecules/ToastNotification";
import type { Match } from "../../types";
import type {
  DuplicateHighlight,
  DuplicateStats,
  MatchEvent,
} from "../../../../store/useMatchLogStore";
import type { PeriodPhase } from "../../hooks/usePeriodManager";

interface CockpitTopSectionProps {
  t: (...args: any[]) => any;
  match: Match;
  isConnected: boolean;
  queuedCount: number;
  pendingAckCount: number;
  isSubmitting: boolean;
  isAdmin: boolean;
  openResetModal: () => void;
  resetBlocked: boolean;
  resetTooltip: string | undefined;
  undoError: string | null;
  viewMode: "logger" | "analytics";
  setViewMode: (mode: "logger" | "analytics") => void;
  statusOverride: Match["status"] | undefined;
  showResetModal: boolean;
  setShowResetModal: (show: boolean) => void;
  isFulltime: boolean;
  resetDisabledReason: string | undefined;
  resetConfirmText: string;
  setResetConfirmText: (value: string) => void;
  confirmGlobalReset: () => Promise<void>;
  ineffectiveNoteOpen: boolean;
  ineffectiveActionType: string;
  ineffectiveTeamSelection: "home" | "away";
  ineffectiveActionDropdownOpen: boolean;
  ineffectiveTeamDropdownOpen: boolean;
  ineffectiveNoteText: string;
  manualHomeTeamLabel: string;
  manualAwayTeamLabel: string;
  setIneffectiveActionDropdownOpen: (
    open: boolean | ((prev: boolean) => boolean),
  ) => void;
  setIneffectiveTeamDropdownOpen: (
    open: boolean | ((prev: boolean) => boolean),
  ) => void;
  setIneffectiveActionType: (value: any) => void;
  setIneffectiveTeamSelection: (value: "home" | "away") => void;
  setIneffectiveNoteText: (value: string) => void;
  cancelIneffectiveNote: () => void;
  confirmIneffectiveNote: () => void;
  liveScore: { home: number; away: number };
  goalEvents: { home: MatchEvent[]; away: MatchEvent[] };
  formatGoalLabel: (event: MatchEvent) => string;
  transitionError: string | null;
  toast: { message: string; actionLabel?: string; action?: () => void } | null;
  currentStatusNormalized: Match["status"];
  currentPhase: PeriodPhase;
  clockMode: "EFFECTIVE" | "INEFFECTIVE";
  isGlobalClockRunning: boolean;
  cockpitLocked: boolean;
  lockReason: string | undefined;
  showExtraTimeAlert: boolean;
  extraTimeSeconds: number;
  transitionToHalftime: () => void;
  transitionToFulltime: () => void;
  dismissExtraTimeAlert: () => void;
  showDriftNudge: boolean;
  driftSeconds: number;
  fetchMatch: () => Promise<void>;
  operatorPeriod: number;
  isExtraTime: boolean;
  globalClock: string;
  guardTransition: (target: Match["status"], fn?: () => void) => void;
  transitionToSecondHalf: () => void;
  transitionToExtraFirst: () => void;
  transitionToExtraHalftime: () => void;
  transitionToExtraSecond: () => void;
  transitionToPenalties: () => void;
  finishMatch: () => void;
  transitionDisabled: boolean;
  transitionReason: string | undefined;
  duplicateStats: DuplicateStats;
  lastDuplicateSummaryDetails: string;
  lastDuplicateSummaryDefault: string;
  lastDuplicateTeamName: string | null;
  lastDuplicateSeenAt: string | null;
  resetDuplicateStats: () => void;
  duplicateHighlight: DuplicateHighlight | null;
  duplicateDetailsDefault: string;
  duplicateSessionDetailsSuffix: string;
  duplicateSessionSummaryDefault: string;
  duplicateExistingEventDefault: string;
  clearDuplicateHighlight: () => void;
  dismissToast: () => void;
}

export default function CockpitTopSection({
  t,
  match,
  isConnected,
  queuedCount,
  pendingAckCount,
  isSubmitting,
  isAdmin,
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
  extraTimeSeconds,
  transitionToHalftime,
  transitionToFulltime,
  dismissExtraTimeAlert,
  showDriftNudge,
  driftSeconds,
  fetchMatch,
  operatorPeriod,
  isExtraTime,
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
}: CockpitTopSectionProps) {
  return (
    <>
      <header className="bg-slate-900 shadow-sm border-b border-slate-700">
        <div className="w-full max-w-none px-4 sm:px-6 xl:px-8 2xl:px-10 py-4">
          <CockpitHeader
            t={t}
            isConnected={isConnected}
            queuedCount={queuedCount}
            isSubmitting={isSubmitting}
            isAdmin={isAdmin}
            openResetModal={openResetModal}
            resetBlocked={resetBlocked}
            resetTooltip={resetTooltip}
            undoError={undoError}
            viewMode={viewMode}
            setViewMode={setViewMode}
            matchTimeSeconds={match.match_time_seconds || 0}
            statusOverride={statusOverride}
            matchStatus={match.status}
          />

          <ResetConfirmModal
            show={showResetModal}
            isFulltime={isFulltime}
            resetBlocked={resetBlocked}
            resetDisabledReason={resetDisabledReason}
            resetConfirmText={resetConfirmText}
            setResetConfirmText={setResetConfirmText}
            onCancel={() => {
              setShowResetModal(false);
              setResetConfirmText("");
            }}
            onConfirm={confirmGlobalReset}
            t={t}
          />
          <IneffectiveNoteModal
            open={ineffectiveNoteOpen}
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
            onCancel={cancelIneffectiveNote}
            onConfirm={confirmIneffectiveNote}
            t={t}
          />

          <ScoreBoard
            t={t}
            match={match}
            liveScore={liveScore}
            goalEvents={goalEvents}
            formatGoalLabel={formatGoalLabel}
            queuedCount={queuedCount}
            pendingAckCount={pendingAckCount}
            transitionError={transitionError}
            toastMessage={toast?.message}
          />

          <StatusRibbon
            t={t}
            currentStatusNormalized={currentStatusNormalized}
            currentPhase={currentPhase}
            clockMode={clockMode}
            isGlobalClockRunning={isGlobalClockRunning}
            cockpitLocked={cockpitLocked}
            lockReason={lockReason}
          />

          {showExtraTimeAlert &&
            (currentPhase === "FIRST_HALF_EXTRA_TIME" ||
              currentPhase === "SECOND_HALF_EXTRA_TIME") && (
              <div className="mt-4">
                <ExtraTimeAlert
                  phase={currentPhase}
                  extraTimeSeconds={extraTimeSeconds}
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
            <DriftBanner
              show={showDriftNudge}
              driftSeconds={driftSeconds}
              onResync={fetchMatch}
              t={t}
            />

            <MatchPeriodSelector
              match={match}
              operatorPeriod={operatorPeriod}
              currentPhase={currentPhase}
              isExtraTime={isExtraTime}
              extraTimeSeconds={extraTimeSeconds}
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
              onFinishMatch={() => guardTransition("Completed", finishMatch)}
              transitionDisabled={transitionDisabled}
              transitionReason={transitionReason}
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

            <DuplicateTelemetryPanel
              t={t}
              duplicateStats={duplicateStats}
              lastDuplicateSummaryDetails={lastDuplicateSummaryDetails}
              lastDuplicateSummaryDefault={lastDuplicateSummaryDefault}
              lastDuplicateTeamName={lastDuplicateTeamName}
              lastDuplicateSeenAt={lastDuplicateSeenAt}
              onResetDuplicateStats={resetDuplicateStats}
            />
          </div>
        </div>
      </header>

      {duplicateHighlight && (
        <DuplicateHighlightBanner
          t={t}
          duplicateHighlight={duplicateHighlight}
          duplicateStats={duplicateStats}
          duplicateDetailsDefault={duplicateDetailsDefault}
          duplicateSessionDetailsSuffix={duplicateSessionDetailsSuffix}
          duplicateSessionSummaryDefault={duplicateSessionSummaryDefault}
          duplicateExistingEventDefault={duplicateExistingEventDefault}
          lastDuplicateTeamName={lastDuplicateTeamName}
          lastDuplicateSeenAt={lastDuplicateSeenAt}
          onDismiss={clearDuplicateHighlight}
          onResetDuplicateStats={resetDuplicateStats}
        />
      )}

      <ToastNotification toast={toast} onDismiss={dismissToast} />
    </>
  );
}
