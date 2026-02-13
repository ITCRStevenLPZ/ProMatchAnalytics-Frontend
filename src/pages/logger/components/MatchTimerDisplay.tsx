import React from "react";
import { Play, Pause, Tv } from "lucide-react";
import { Match } from "../types";

interface MatchTimerDisplayProps {
  match: Match | null;
  operatorPeriod: number;
  globalClock: string;
  effectiveClock: string;
  ineffectiveClock: string;
  varClock: string;
  clockMode: "EFFECTIVE" | "INEFFECTIVE";
  isClockRunning: boolean;
  onGlobalStart: () => void;
  onGlobalStop: () => void;
  isBallInPlay?: boolean;
  locked?: boolean;
  lockReason?: string;
  onModeSwitch: (mode: "EFFECTIVE" | "INEFFECTIVE") => void;
  onVarToggle: () => void;
  isVarActive: boolean;
  hideResumeButton?: boolean;
  t: any;
}

const MatchTimerDisplay: React.FC<MatchTimerDisplayProps> = ({
  match,
  operatorPeriod,
  globalClock,
  effectiveClock,
  ineffectiveClock,
  varClock,
  clockMode,
  isClockRunning,
  onGlobalStart,
  onGlobalStop,
  isBallInPlay = false,
  locked = false,
  lockReason,
  onModeSwitch,
  onVarToggle,
  isVarActive,
  hideResumeButton = false,
  t,
}) => {
  const clockLocked =
    locked || match?.status === "Fulltime" || match?.status === "Completed";
  const startDisabled = clockLocked || !!match?.current_period_start_timestamp;
  const stopDisabled =
    clockLocked ||
    (!match?.current_period_start_timestamp &&
      !(
        match?.period_timestamps?.[String(operatorPeriod)]?.start &&
        !match?.period_timestamps?.[String(operatorPeriod)]?.end
      ));
  const modeSwitchDisabled =
    clockLocked || !match?.current_period_start_timestamp;
  const lockNotice =
    lockReason || t("lockNotice", "Cockpit locked. Match is finished.");
  const trimMs = (value: string) => value.split(".")[0] || value;
  const globalClockDisplay = trimMs(globalClock);

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 shadow-sm">
      {locked && (
        <div
          className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2"
          data-testid="clock-locked-banner"
        >
          {lockNotice}
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-400">
            {t("globalClock", "Global Clock")}
          </p>
          {isClockRunning && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          )}
        </div>
        <span
          data-testid="global-clock-value"
          className={`text-3xl font-mono font-bold tracking-wider ${
            isClockRunning ? "text-green-400" : "text-slate-100"
          }`}
        >
          {(() => {
            const [mm, ss] = globalClockDisplay.split(":").map(Number);
            const totalSeconds = mm * 60 + (ss || 0);

            let regulationLimit = 0;
            if (operatorPeriod === 1) regulationLimit = 45 * 60;
            else if (operatorPeriod === 2) regulationLimit = 90 * 60;
            else if (operatorPeriod === 3) regulationLimit = (90 + 15) * 60;
            // Extra Time 1st Half (105 mins)
            else if (operatorPeriod === 4)
              regulationLimit = (90 + 15 + 15) * 60; // Extra Time 2nd Half (120 mins)

            // Only split if we are significantly over (e.g. > 0 seconds over) and in a relevant period
            if (regulationLimit > 0 && totalSeconds > regulationLimit) {
              const stoppageSeconds = totalSeconds - regulationLimit;
              const regM = Math.floor(regulationLimit / 60)
                .toString()
                .padStart(2, "0");
              const stopM = Math.floor(stoppageSeconds / 60)
                .toString()
                .padStart(2, "0");
              const stopS = (stoppageSeconds % 60).toString().padStart(2, "0");

              return (
                <div className="flex items-baseline gap-2">
                  <span>{regM}:00</span>
                  <span className="text-xl text-yellow-500 font-bold animate-pulse">
                    + {stopM}:{stopS}
                  </span>
                </div>
              );
            }
            return globalClockDisplay;
          })()}
        </span>
      </div>

      <div className="flex items-center mb-4 bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3">
        <span
          className="text-sm font-semibold text-slate-300"
          data-testid="ball-state-label"
        >
          {isBallInPlay
            ? t("ballInPlay", "Balón en Juego")
            : t("ballOutOfPlay", "Balón Fuera")}
        </span>
      </div>

      {/* Global Controls */}
      <div className="flex justify-center gap-2 mb-4">
        <button
          data-testid="btn-start-clock"
          onClick={onGlobalStart}
          disabled={startDisabled}
          className="flex-1 px-3 py-2 bg-emerald-900/40 text-emerald-300 border border-emerald-500/30 rounded hover:bg-emerald-900/60 text-xs font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          <Play size={14} />
          {t("start", "Start")}
        </button>
        <button
          data-testid="btn-stop-clock"
          onClick={onGlobalStop}
          disabled={stopDisabled}
          className="flex-1 px-3 py-2 bg-amber-900/40 text-amber-300 border border-amber-500/30 rounded hover:bg-amber-900/60 text-xs font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          <Pause size={14} />
          {t("stop", "Stop")}
        </button>
      </div>

      {/* Sub Clocks */}
      <div className="grid gap-3 mb-4 text-center grid-cols-3">
        <div
          className={`p-3 rounded-lg border transition-colors ${
            clockMode === "EFFECTIVE"
              ? "bg-emerald-900/20 border-emerald-500/50 ring-1 ring-emerald-500/30"
              : "bg-slate-700/30 border-slate-700"
          }`}
          data-testid="effective-time-card"
        >
          <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold mb-1 tracking-wider">
            {t("effectiveTime", "Effective")}
          </p>
          <div
            className="font-mono font-bold text-lg text-emerald-400"
            data-testid="effective-clock-value"
          >
            {effectiveClock}
          </div>
        </div>
        <div
          className={`p-3 rounded-lg border transition-colors ${
            clockMode === "INEFFECTIVE"
              ? "bg-rose-900/20 border-rose-500/50 ring-1 ring-rose-500/30"
              : "bg-slate-700/30 border-slate-700"
          }`}
        >
          <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold mb-1 tracking-wider">
            {t("ineffectiveTime", "Ineffective")}
          </p>
          <div
            className="font-mono font-bold text-lg text-rose-400"
            data-testid="ineffective-clock-value"
          >
            {trimMs(ineffectiveClock)}
          </div>
        </div>
        <div
          className="p-3 rounded-lg border bg-slate-700/30 border-slate-700"
          data-testid="var-time-card"
        >
          <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold mb-1 tracking-wider">
            {t("varTime", "VAR Time")}
          </p>
          <div className="font-mono font-bold text-lg text-amber-300">
            {trimMs(varClock)}
          </div>
        </div>
      </div>

      {/* Mode Controls */}
      <div className="flex flex-col gap-2">
        {clockMode === "EFFECTIVE" ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              data-testid="btn-ineffective-event"
              onClick={() => onModeSwitch("INEFFECTIVE")}
              className="flex items-center justify-center gap-2 py-3 bg-rose-900/30 text-rose-300 border border-rose-500/30 hover:bg-rose-900/50 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
              disabled={modeSwitchDisabled}
            >
              <Pause size={14} />
              {t("ineffectiveEvent", "Ineffective")}
            </button>
            <button
              data-testid="btn-var-toggle"
              onClick={onVarToggle}
              className={`flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors border disabled:opacity-50 ${
                isVarActive
                  ? "bg-amber-900/40 text-amber-200 border-amber-500/40"
                  : "bg-slate-900/40 text-amber-300 border-amber-500/30 hover:bg-slate-900/60"
              }`}
              disabled={locked}
            >
              <Tv size={14} />
              {t("varToggle", "VAR")}
            </button>
          </div>
        ) : (
          <button
            data-testid="btn-var-toggle"
            onClick={onVarToggle}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors border disabled:opacity-50 ${
              isVarActive
                ? "bg-amber-900/40 text-amber-200 border-amber-500/40"
                : "bg-slate-900/40 text-amber-300 border-amber-500/30 hover:bg-slate-900/60"
            }`}
            disabled={locked}
          >
            <Tv size={14} />
            {t("varToggle", "VAR")}
          </button>
        )}
        {!hideResumeButton && clockMode !== "EFFECTIVE" && (
          <button
            data-testid="btn-resume-effective"
            onClick={() => onModeSwitch("EFFECTIVE")}
            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-500 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={locked}
          >
            <Play size={14} />
            {t("resumeEffective", "Resume Effective Time")}
          </button>
        )}
      </div>
    </div>
  );
};

export default MatchTimerDisplay;
