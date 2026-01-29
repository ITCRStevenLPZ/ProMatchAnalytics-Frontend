import {
  Clock,
  CheckCircle2,
  Play,
  Coffee,
  Trophy,
  ChevronRight,
} from "lucide-react";
import { Match } from "../types";
import { PeriodPhase } from "../hooks/usePeriodManager";

interface MatchPeriodSelectorProps {
  match: Match | null;
  operatorPeriod: number;
  currentPhase: PeriodPhase;
  isExtraTime: boolean;
  extraTimeSeconds: number;
  globalClock: string;
  isClockRunning: boolean;
  onTransitionToHalftime?: () => void;
  onTransitionToSecondHalf?: () => void;
  onTransitionToFulltime?: () => void;
  onTransitionToExtraFirst?: () => void;
  onTransitionToExtraHalftime?: () => void;
  onTransitionToExtraSecond?: () => void;
  onTransitionToPenalties?: () => void;
  onFinishMatch?: () => void;
  transitionDisabled?: boolean;
  transitionReason?: string;
  t: any;
}

export function MatchPeriodSelector({
  match,
  currentPhase,
  isExtraTime,
  extraTimeSeconds,
  globalClock,
  onTransitionToHalftime,
  onTransitionToSecondHalf,
  onTransitionToFulltime,
  onTransitionToExtraFirst,
  onTransitionToExtraHalftime,
  onTransitionToExtraSecond,
  onTransitionToPenalties,
  onFinishMatch,
  transitionDisabled = false,
  transitionReason,
  t,
}: MatchPeriodSelectorProps) {
  if (!match) return null;

  // Determine current match status and what action is available
  const getMatchStatus = () => {
    switch (currentPhase) {
      case "NOT_STARTED":
      case "FIRST_HALF":
        return {
          stage: "first-half",
          label: t("logger.period.firstHalfInProgress", "1st Half"),
          statusText: t("logger.period.inProgress", "In Progress"),
          icon: Play,
          iconColor: "text-green-600",
          bgColor: "bg-green-50",
          borderColor: "border-green-200",
          canTransition: true,
          transitionLabel: t("logger.period.endFirstHalf", "End 1st Half"),
          transitionAction: onTransitionToHalftime,
          progress: "first",
        };
      case "HALFTIME":
        return {
          stage: "halftime",
          label: t("logger.period.halftime", "Halftime"),
          statusText: t("logger.period.break", "Break"),
          icon: Coffee,
          iconColor: "text-yellow-600",
          bgColor: "bg-yellow-50",
          borderColor: "border-yellow-200",
          canTransition: true,
          transitionLabel: t("logger.period.startSecondHalf", "Start 2nd Half"),
          transitionAction: onTransitionToSecondHalf,
          progress: "halftime",
        };
      case "SECOND_HALF":
        return {
          stage: "second-half",
          label: t("logger.period.secondHalfInProgress", "2nd Half"),
          statusText: t("logger.period.inProgress", "In Progress"),
          icon: Play,
          iconColor: "text-blue-600",
          bgColor: "bg-blue-50",
          borderColor: "border-blue-200",
          canTransition: true,
          transitionLabel: t("logger.period.endRegularTime", "End Regulation"),
          transitionAction: onTransitionToFulltime,
          progress: "second",
        };
      case "FULLTIME":
        // This is "End of Regulation" state now
        return {
          stage: "fulltime-options",
          label: t("logger.period.regulationEnded", "Regulation Ended"),
          statusText: t("logger.period.finished", "Finished"),
          icon: Trophy,
          iconColor: "text-purple-600",
          bgColor: "bg-purple-50",
          borderColor: "border-purple-200",
          canTransition: true,
          // Special case: multiple options
          progress: "full",
          isOptions: true,
        };
      case "FIRST_HALF_EXTRA_TIME":
        return {
          stage: "extra-first",
          label: t("logger.period.extraFirst", "Extra Time 1st Half"),
          statusText: t("logger.period.inProgress", "In Progress"),
          icon: Play,
          iconColor: "text-orange-600",
          bgColor: "bg-orange-50",
          borderColor: "border-orange-200",
          canTransition: true,
          transitionLabel: t("logger.period.endExtraFirst", "End ET 1st Half"),
          transitionAction: onTransitionToExtraHalftime,
          progress: "extra-first",
        };
      case "EXTRA_HALFTIME":
        return {
          stage: "extra-halftime",
          label: t("logger.period.extraHalftime", "Extra Time HT"),
          statusText: t("logger.period.break", "Break"),
          icon: Coffee,
          iconColor: "text-yellow-600",
          bgColor: "bg-yellow-50",
          borderColor: "border-yellow-200",
          canTransition: true,
          transitionLabel: t(
            "logger.period.startExtraSecond",
            "Start ET 2nd Half",
          ),
          transitionAction: onTransitionToExtraSecond,
          progress: "extra-halftime",
        };
      case "SECOND_HALF_EXTRA_TIME":
        return {
          stage: "extra-second",
          label: t("logger.period.extraSecond", "Extra Time 2nd Half"),
          statusText: t("logger.period.inProgress", "In Progress"),
          icon: Play,
          iconColor: "text-orange-600",
          bgColor: "bg-orange-50",
          borderColor: "border-orange-200",
          canTransition: true,
          // Special case: multiple options (Penalties or End)
          progress: "extra-second",
          isOptions: true,
          optionsType: "extra-end",
        };
      case "PENALTIES":
        return {
          stage: "penalties",
          label: t("logger.period.penalties", "Penalties"),
          statusText: t("logger.period.inProgress", "In Progress"),
          icon: Trophy,
          iconColor: "text-rose-600",
          bgColor: "bg-rose-50",
          borderColor: "border-rose-200",
          canTransition: true,
          transitionLabel: t("logger.period.endMatch", "End Match"),
          transitionAction: onFinishMatch,
          progress: "penalties",
        };
      case "COMPLETED": // Assuming this visual state for final
        return {
          stage: "completed",
          label: t("logger.period.matchCompleted", "Match Completed"),
          statusText: t("logger.period.finished", "Finished"),
          icon: CheckCircle2,
          iconColor: "text-slate-600",
          bgColor: "bg-slate-100",
          borderColor: "border-slate-300",
          canTransition: false,
          progress: "show-all",
        };
      default:
        return {
          stage: "unknown",
          label: t("logger.period.unknown", "Unknown"),
          statusText: "",
          icon: Clock,
          iconColor: "text-gray-600",
          bgColor: "bg-gray-50",
          borderColor: "border-gray-200",
          canTransition: false,
          progress: "first",
        };
    }
  };

  const status = getMatchStatus();
  const StatusIcon = status.icon;
  const periodStatusTestId =
    status.stage === "fulltime-options" || status.stage === "completed"
      ? "fulltime"
      : status.stage;
  const extraClock =
    extraTimeSeconds > 0
      ? ` +${Math.floor(extraTimeSeconds / 60)}:${String(
          extraTimeSeconds % 60,
        ).padStart(2, "0")}`
      : "";
  const transitionTestId =
    status.stage === "first-half"
      ? "btn-end-first-half"
      : status.stage === "halftime"
        ? "btn-start-second-half"
        : status.stage === "second-half"
          ? "btn-end-match"
          : status.stage === "extra-first"
            ? "btn-end-extra-first"
            : status.stage === "extra-halftime"
              ? "btn-start-extra-second"
              : status.stage === "extra-second"
                ? "btn-end-extra"
                : status.stage === "penalties"
                  ? "btn-end-penalties"
                  : undefined;

  const trimMs = (value: string) => value.split(".")[0] || value;

  return (
    <div className="space-y-4">
      {/* Current Period Status Card */}
      <div
        className={`rounded-lg border-2 ${status.borderColor} ${status.bgColor} p-4 transition-all duration-300`}
        data-testid={`period-status-${periodStatusTestId}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`${status.iconColor} animate-pulse`}>
              <StatusIcon size={24} />
            </div>
            <div>
              <div className="text-sm text-gray-500 uppercase tracking-wide">
                {status.statusText}
              </div>
              <div className="text-xl font-bold text-gray-900">
                {status.label}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-gray-900">
              {`${trimMs(globalClock)}${extraClock}`}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {status.isOptions && status.stage === "fulltime-options" ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onFinishMatch || (() => {})} // Fallback if not provided, usually strictly required
            className="py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 text-white shadow-sm"
            disabled={transitionDisabled}
            data-testid="btn-end-match-final"
          >
            <CheckCircle2 size={20} />
            <span>{t("logger.period.endMatch", "End Match")}</span>
          </button>
          <button
            onClick={onTransitionToExtraFirst}
            className="py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white shadow-sm"
            disabled={transitionDisabled}
            data-testid="btn-start-extra-time"
          >
            <Play size={20} />
            <span>{t("logger.period.startExtraTime", "Start Extra Time")}</span>
          </button>
        </div>
      ) : status.isOptions && status.optionsType === "extra-end" ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onFinishMatch}
            className="py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 text-white shadow-sm"
            disabled={transitionDisabled}
            data-testid="btn-end-match-extra"
          >
            <CheckCircle2 size={20} />
            <span>{t("logger.period.endMatch", "End Match")}</span>
          </button>
          <button
            onClick={onTransitionToPenalties}
            className="py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
            disabled={transitionDisabled}
            data-testid="btn-start-penalties"
          >
            <Trophy size={20} />
            <span>{t("logger.period.startPenalties", "Penalties")}</span>
          </button>
        </div>
      ) : (
        status.transitionAction && (
          <button
            onClick={status.transitionAction}
            className={`w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2
            transition-all duration-200 shadow-sm hover:shadow-md
            ${
              status.stage === "first-half"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : status.stage === "halftime" ||
                    status.stage === "extra-halftime"
                  ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                  : status.stage === "second-half" ||
                      status.stage === "extra-first" ||
                      status.stage === "extra-second"
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-gray-400 text-white"
            }`}
            data-testid={transitionTestId}
            disabled={transitionDisabled}
          >
            <span>{status.transitionLabel}</span>
            <ChevronRight size={20} />
          </button>
        )
      )}

      {transitionReason && (
        <div
          className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2"
          data-testid="transition-reason"
        >
          {transitionReason}
        </div>
      )}

      {/* Match Progress Timeline */}
      <div className="flex items-center justify-between px-2 pt-2">
        <TimelineStep
          label={t("logger.progress.1h", "1H")}
          active={status.progress === "first" || status.progress === "halftime"}
          completed={
            [
              "second",
              "full",
              "extra-first",
              "extra-halftime",
              "extra-second",
              "penalties",
              "show-all",
            ].includes(status.progress) || status.progress === "halftime"
          }
        />
        <TimelineConnector
          active={[
            "second",
            "full",
            "extra-first",
            "extra-halftime",
            "extra-second",
            "penalties",
            "show-all",
          ].includes(status.progress)}
        />

        <TimelineStep
          label={t("logger.progress.2h", "2H")}
          active={status.progress === "second" || status.progress === "full"}
          completed={
            [
              "extra-first",
              "extra-halftime",
              "extra-second",
              "penalties",
              "show-all",
            ].includes(status.progress) || status.progress === "full"
          }
        />

        {(isExtraTime ||
          [
            "extra-first",
            "extra-halftime",
            "extra-second",
            "penalties",
            "show-all",
          ].includes(status.progress)) && (
          <>
            <TimelineConnector
              active={[
                "extra-first",
                "extra-halftime",
                "extra-second",
                "penalties",
                "show-all",
              ].includes(status.progress)}
            />
            <TimelineStep
              label={t("logger.progress.et", "ET")}
              active={[
                "extra-first",
                "extra-halftime",
                "extra-second",
              ].includes(status.progress)}
              completed={
                ["penalties", "show-all"].includes(status.progress) ||
                status.progress === "extra-second"
              }
            />
          </>
        )}

        {(status.progress === "penalties" ||
          status.progress === "show-all" ||
          (isExtraTime && status.progress === "extra-second")) && (
          <>
            <TimelineConnector
              active={["penalties", "show-all"].includes(status.progress)}
            />
            <TimelineStep
              label={t("logger.progress.pen", "PEN")}
              active={status.progress === "penalties"}
              completed={status.progress === "show-all"}
            />
          </>
        )}
      </div>

      {/* Match Info */}
      <div className="text-xs text-gray-500 text-center">
        {status.stage === "completed"
          ? t(
              "logger.period.matchCompletedInfo",
              "Match has ended. Review events or close session.",
            )
          : t("logger.period.matchProgressInfo", "Control match flow above.")}
      </div>
    </div>
  );
}

function TimelineStep({
  label,
  active,
  completed,
}: {
  label: string;
  active: boolean;
  completed: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1 transition-colors duration-300 ${
        active
          ? "text-blue-600"
          : completed
            ? "text-slate-600"
            : "text-slate-300"
      }`}
    >
      <div
        className={`w-3 h-3 rounded-full border-2 ${
          active
            ? "bg-blue-600 border-blue-600"
            : completed
              ? "bg-slate-600 border-slate-600"
              : "bg-transparent border-slate-300"
        }`}
      />
      <span className="text-[10px] font-bold">{label}</span>
    </div>
  );
}

function TimelineConnector({ active }: { active: boolean }) {
  return (
    <div
      className={`h-0.5 flex-1 mx-2 rounded ${
        active ? "bg-slate-600" : "bg-slate-200"
      }`}
    />
  );
}
