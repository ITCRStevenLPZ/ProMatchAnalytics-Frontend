import { Play, MapPin, Zap } from "../../../../components/icons";
import { IS_E2E_TEST_MODE } from "../../../../lib/loggerApi";
import { KEY_ACTION_MAP, QUICK_ACTIONS } from "../../constants";
import type { PositionMode } from "../../hooks/useActionFlow";
import PlayerSelectorPanel from "../molecules/PlayerSelectorPanel";
import QuickActionMenu from "../molecules/QuickActionMenu";
import QuickSubstitutionPanel from "../molecules/QuickSubstitutionPanel";
import QuickCardPanel, { CardSelection } from "../molecules/QuickCardPanel";
import ActionSelectionPanel from "../molecules/ActionSelectionPanel";
import OutcomeSelectionPanel from "../molecules/OutcomeSelectionPanel";
import RecipientSelectionPanel from "../molecules/RecipientSelectionPanel";
import FieldZoneSelector from "../molecules/FieldZoneSelector";
import type {
  TacticalPosition,
  Formation,
} from "../../hooks/useTacticalPositions";

interface ActionStageProps {
  match: any;
  manualFieldFlip: boolean;
  selectedPlayer: any;
  selectedTeam: "home" | "away" | "both";
  expelledPlayerIds: Set<string>;
  cardDisciplinaryStatus: Record<string, { yellowCount: number; red: boolean }>;
  pendingCardType: CardSelection | null;
  setSelectedTeam: (team: "home" | "away" | "both") => void;
  onFieldIds: { home: Set<string>; away: Set<string> };
  handlePlayerSelection: (...args: any[]) => void;
  handleFieldPlayerSelection: (...args: any[]) => void;
  handleFieldDestination: (location: any) => void;
  handleZoneSelect: (zoneId: number) => void;
  currentStep: any;
  cockpitLocked: boolean;
  fieldAnchor: any;
  handleQuickActionSelect: (action: string) => void;
  handleOpenMoreActions: () => void;
  resetFlow: () => void;
  showFieldResume: boolean;
  handleModeSwitchGuarded: (mode: "EFFECTIVE" | "INEFFECTIVE") => void;
  priorityPlayerId: string | null;
  isGlobalClockRunning: boolean;
  clockMode: "EFFECTIVE" | "INEFFECTIVE";
  isVarActive: boolean;
  handleQuickSubstitution: (team: "home" | "away") => void;
  handleCardSelection: (cardType: CardSelection) => void;
  cancelCardSelection: () => void;
  availableActions: string[];
  isSubmitting: boolean;
  handleActionClickOverride: (...args: any[]) => void;
  selectedAction: string | null;
  availableOutcomes: string[];
  handleOutcomeSelect: (...args: any[]) => void;
  currentTeam: any;
  eligibleRecipients: any[];
  handleRecipientSelect: (...args: any[]) => void;
  getDisplayPosition?: (
    playerId: string,
    flipSides: boolean,
  ) => TacticalPosition;
  onTacticalPlayerDragEnd?: (
    playerId: string,
    displayX: number,
    displayY: number,
    playerPosition: string | undefined,
    side: "home" | "away",
  ) => void;
  draggingPlayerId?: string | null;
  onTacticalDragStart?: (playerId: string) => void;
  onTacticalDragStop?: () => void;
  allTacticalPositions?: Map<string, TacticalPosition>;
  homeFormation?: Formation | null;
  awayFormation?: Formation | null;
  applyFormation?: (side: "home" | "away", formation: Formation | null) => void;
  dragLocked?: boolean;
  /** When true (live match), expand drag bounds to full field. */
  isMatchLive?: boolean;
  positionMode: PositionMode;
  onPositionModeChange: (mode: PositionMode) => void;
  t: any;
}

export default function ActionStage({
  match,
  manualFieldFlip,
  selectedPlayer,
  selectedTeam,
  expelledPlayerIds,
  cardDisciplinaryStatus,
  pendingCardType,
  setSelectedTeam,
  onFieldIds,
  handlePlayerSelection,
  handleFieldPlayerSelection,
  handleFieldDestination,
  handleZoneSelect,
  currentStep,
  cockpitLocked,
  fieldAnchor,
  handleQuickActionSelect,
  handleOpenMoreActions,
  resetFlow,
  showFieldResume,
  handleModeSwitchGuarded,
  priorityPlayerId,
  isGlobalClockRunning,
  clockMode,
  isVarActive,
  handleQuickSubstitution,
  handleCardSelection,
  cancelCardSelection,
  availableActions,
  isSubmitting,
  handleActionClickOverride,
  selectedAction,
  availableOutcomes,
  handleOutcomeSelect,
  currentTeam,
  eligibleRecipients,
  handleRecipientSelect,
  getDisplayPosition,
  onTacticalPlayerDragEnd,
  draggingPlayerId,
  onTacticalDragStart,
  onTacticalDragStop,
  allTacticalPositions,
  homeFormation,
  awayFormation,
  applyFormation,
  dragLocked = true,
  isMatchLive = false,
  positionMode,
  onPositionModeChange,
  t,
}: ActionStageProps) {
  return (
    <div className="min-h-[500px] flex-none bg-slate-800/30 rounded-xl p-4 border border-slate-700/50 relative flex flex-col">
      {/* Position-mode toggle — sits above the soccer field */}
      <div
        className="flex items-center justify-center gap-2 mb-3"
        data-testid="position-mode-toggle"
      >
        <button
          type="button"
          data-testid="position-mode-manual"
          onClick={() => onPositionModeChange("manual")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${
            positionMode === "manual"
              ? "bg-blue-600 text-white border-blue-500"
              : "bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700 hover:text-slate-200"
          }`}
        >
          <MapPin size={14} />
          {t("positionManual", "Manual")}
        </button>
        <button
          type="button"
          data-testid="position-mode-auto"
          onClick={() => onPositionModeChange("auto")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-r-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${
            positionMode === "auto"
              ? "bg-amber-600 text-white border-amber-500"
              : "bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700 hover:text-slate-200"
          }`}
        >
          <Zap size={14} />
          {t("positionAuto", "Auto")}
        </button>
      </div>

      {match && (
        <PlayerSelectorPanel
          match={match}
          flipSides={manualFieldFlip}
          selectedPlayer={selectedPlayer}
          selectedTeam={selectedTeam}
          expelledPlayerIds={expelledPlayerIds}
          disciplinaryStatusByPlayer={cardDisciplinaryStatus}
          onCardTeamSelect={
            pendingCardType ? (team) => setSelectedTeam(team) : undefined
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
          pendingCardType={pendingCardType}
          fieldOverlay={
            currentStep === "selectZone" && selectedPlayer ? (
              <FieldZoneSelector
                onZoneSelect={handleZoneSelect}
                onCancel={resetFlow}
                flipSides={manualFieldFlip}
                t={t}
              />
            ) : currentStep === "selectQuickAction" &&
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
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <button
                      type="button"
                      data-testid="btn-resume-effective"
                      onClick={() => handleModeSwitchGuarded("EFFECTIVE")}
                      className="pointer-events-auto flex items-center gap-3 px-8 py-4 bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-500 rounded-full font-black text-sm md:text-base uppercase tracking-wider transition-colors shadow-xl shadow-emerald-900/40"
                    >
                      <Play size={20} />
                      {t("resumeEffective", "Resume Effective Time")}
                    </button>
                  </div>
                )}
              </>
            ) : currentStep === "selectDestination" &&
              selectedPlayer &&
              (selectedAction === "Shot" || selectedAction === "Pass") ? (
              <div className="absolute inset-x-0 bottom-2 pointer-events-none z-30 flex flex-col items-center gap-1.5">
                <span className="pointer-events-none text-xs text-slate-400/80 font-medium uppercase tracking-wider bg-slate-900/70 px-3 py-1 rounded-full">
                  {selectedAction === "Shot"
                    ? t("shotFieldHint", "Click player or field area")
                    : t(
                        "passFieldHint",
                        "Click teammate/opponent or out of bounds",
                      )}
                </span>
                <div className="pointer-events-auto flex items-center gap-2">
                  {selectedAction === "Shot" && (
                    <button
                      type="button"
                      data-testid="field-goal-btn"
                      onClick={() => handleOutcomeSelect("Goal")}
                      className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold uppercase tracking-wider shadow-lg shadow-emerald-900/40 border border-emerald-400/50 transition-colors"
                    >
                      {t("actionGoal", "Goal")}
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="field-cancel-btn"
                    onClick={resetFlow}
                    className="px-4 py-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-sm font-semibold shadow-lg border border-slate-600/50 transition-colors"
                  >
                    {t("quickActionCancel", "Cancel")}
                  </button>
                </div>
              </div>
            ) : showFieldResume ? (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <button
                  type="button"
                  data-testid="btn-resume-effective"
                  onClick={() => handleModeSwitchGuarded("EFFECTIVE")}
                  className="pointer-events-auto flex items-center gap-3 px-8 py-4 bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-500 rounded-full font-black text-sm md:text-base uppercase tracking-wider transition-colors shadow-xl shadow-emerald-900/40"
                >
                  <Play size={20} />
                  {t("resumeEffective", "Resume Effective Time")}
                </button>
              </div>
            ) : null
          }
          forceFieldMode={!getDisplayPosition}
          forceTacticalMode={Boolean(getDisplayPosition)}
          getDisplayPosition={getDisplayPosition}
          onPlayerDragEnd={onTacticalPlayerDragEnd}
          draggingPlayerId={draggingPlayerId}
          onTacticalDragStart={onTacticalDragStart}
          onTacticalDragStop={onTacticalDragStop}
          allTacticalPositions={allTacticalPositions}
          homeFormation={homeFormation}
          awayFormation={awayFormation}
          applyFormation={applyFormation}
          priorityPlayerId={priorityPlayerId}
          isReadOnly={
            !IS_E2E_TEST_MODE &&
            (!isGlobalClockRunning || clockMode !== "EFFECTIVE" || isVarActive)
          }
          dragLocked={dragLocked}
          isMatchLive={isMatchLive}
          visiblePlayerIds={
            currentStep === "selectZone" && selectedPlayer
              ? new Set([selectedPlayer.id])
              : undefined
          }
          t={t}
        />
      )}

      {match && currentStep === "selectPlayer" && (
        <div className="space-y-3">
          <QuickSubstitutionPanel
            homeTeamName={match.home_team.short_name}
            awayTeamName={match.away_team.short_name}
            onHomeSubstitution={() => handleQuickSubstitution("home")}
            onAwaySubstitution={() => handleQuickSubstitution("away")}
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
  );
}
