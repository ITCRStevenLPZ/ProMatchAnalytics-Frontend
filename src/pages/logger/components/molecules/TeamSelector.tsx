import { TFunction } from "i18next";
import {
  ArrowLeftRight,
  BarChart3,
  CornerUpLeft,
  Eye,
  List,
  Lock,
  Unlock,
} from "../../../../components/icons";
import type { Formation } from "../../hooks/useTacticalPositions";
import FormationPicker from "./FormationPicker";

export type CockpitViewMode = "logger" | "analytics" | "review";

interface TeamSelectorProps {
  isFlipped: boolean;
  onFlip: () => void;
  onUndo: () => void;
  undoDisabled: boolean;
  undoCount?: number;
  disabled?: boolean;
  viewMode?: CockpitViewMode;
  setViewMode?: (mode: CockpitViewMode) => void;
  dragLocked?: boolean;
  onToggleDragLock?: () => void;
  /** Formation props */
  homeFormation?: Formation | null;
  awayFormation?: Formation | null;
  applyFormation?: (side: "home" | "away", formation: Formation | null) => void;
  homeTeamName?: string;
  awayTeamName?: string;
  t: TFunction<"logger">;
}

const TeamSelector = ({
  isFlipped,
  onFlip,
  onUndo,
  undoDisabled,
  undoCount = 0,
  disabled = false,
  viewMode,
  setViewMode,
  dragLocked,
  onToggleDragLock,
  homeFormation,
  awayFormation,
  applyFormation,
  homeTeamName,
  awayTeamName,
  t,
}: TeamSelectorProps) => {
  // When the field is flipped, swap the formation picker positions
  const leftSide = isFlipped ? "away" : "home";
  const rightSide = isFlipped ? "home" : "away";
  const leftFormation = isFlipped ? awayFormation : homeFormation;
  const rightFormation = isFlipped ? homeFormation : awayFormation;
  const leftTeamName = isFlipped ? awayTeamName : homeTeamName;
  const rightTeamName = isFlipped ? homeTeamName : awayTeamName;

  return (
    <div className="bg-slate-800 rounded-lg shadow p-5 border border-slate-700">
      <div className="flex items-center gap-3">
        {/* Left formation picker */}
        {applyFormation && (
          <div
            className="flex items-center gap-1.5 shrink-0"
            data-testid={`formation-slot-left`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {leftTeamName}
            </span>
            <FormationPicker
              currentFormation={leftFormation ?? null}
              onFormationChange={(f) => applyFormation(leftSide, f)}
              side={leftSide}
              t={t}
            />
          </div>
        )}

        {/* Center controls: Flip + Undo */}
        <div className="flex gap-3 flex-1 justify-center">
          <button
            type="button"
            onClick={onFlip}
            disabled={disabled}
            data-testid="toggle-field-flip"
            className={`flex-1 max-w-[200px] inline-flex items-center justify-center gap-2.5 py-3.5 rounded-lg text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              disabled
                ? "text-slate-600 border border-slate-700"
                : isFlipped
                  ? "text-amber-200 border border-amber-400/60 bg-amber-500/10 hover:bg-amber-500/20"
                  : "text-slate-300 border border-slate-600 bg-slate-700 hover:bg-slate-600"
            }`}
          >
            <ArrowLeftRight size={20} />
            {t("flipField", "Flip field")}
          </button>
          <button
            type="button"
            onClick={onUndo}
            disabled={undoDisabled}
            data-testid="undo-button"
            className={`relative flex-1 max-w-[200px] inline-flex items-center justify-center gap-2.5 py-3.5 rounded-lg text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              undoDisabled
                ? "text-slate-600 border border-slate-700"
                : "text-rose-300 border border-rose-500/40 bg-rose-900/20 hover:bg-rose-900/40"
            }`}
          >
            <CornerUpLeft size={20} />
            {t("undoLast", "Undo last")}
            {undoCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                {undoCount}
              </span>
            )}
          </button>
        </div>

        {/* Right formation picker */}
        {applyFormation && (
          <div
            className="flex items-center gap-1.5 shrink-0"
            data-testid={`formation-slot-right`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {rightTeamName}
            </span>
            <FormationPicker
              currentFormation={rightFormation ?? null}
              onFormationChange={(f) => applyFormation(rightSide, f)}
              side={rightSide}
              t={t}
            />
          </div>
        )}

        {/* View mode toggle: Logger / Review / Analytics */}
        {setViewMode && (
          <div className="flex rounded-lg border border-slate-600 overflow-hidden shrink-0">
            <button
              type="button"
              data-testid="toggle-logger-view"
              onClick={() => setViewMode("logger")}
              className={`inline-flex items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors ${
                viewMode === "logger"
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <List size={16} />
              {t("logger.view", "Logger")}
            </button>
            <button
              type="button"
              data-testid="toggle-review"
              onClick={() => setViewMode("review")}
              className={`inline-flex items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors ${
                viewMode === "review"
                  ? "bg-teal-600 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Eye size={16} />
              {t("logger.review", "Review")}
            </button>
            <button
              type="button"
              data-testid="toggle-analytics"
              onClick={() => setViewMode("analytics")}
              className={`inline-flex items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors ${
                viewMode === "analytics"
                  ? "bg-purple-600 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <BarChart3 size={16} />
              {t("logger.analytics", "Analytics")}
            </button>
          </div>
        )}

        {/* Drag lock toggle */}
        {onToggleDragLock && (
          <button
            type="button"
            data-testid="toggle-drag-lock"
            onClick={onToggleDragLock}
            className={`inline-flex items-center justify-center gap-2 px-3 py-3.5 rounded-lg text-base font-semibold transition-colors shrink-0 ${
              dragLocked
                ? "text-slate-400 border border-slate-600 bg-slate-700 hover:bg-slate-600"
                : "text-emerald-200 border border-emerald-400/60 bg-emerald-500/15 hover:bg-emerald-500/25"
            }`}
            title={
              dragLocked
                ? t("unlockDrag", "Unlock node dragging")
                : t("lockDrag", "Lock node dragging")
            }
          >
            {dragLocked ? <Lock size={20} /> : <Unlock size={20} />}
          </button>
        )}
      </div>
    </div>
  );
};

export default TeamSelector;
