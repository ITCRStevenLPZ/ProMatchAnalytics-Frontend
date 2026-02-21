interface StatusRibbonProps {
  t: any;
  currentStatusNormalized: string;
  currentPhase: string;
  clockMode: string;
  isGlobalClockRunning: boolean;
  cockpitLocked: boolean;
  lockReason?: string;
}

export default function StatusRibbon({
  t,
  currentStatusNormalized,
  currentPhase,
  clockMode,
  isGlobalClockRunning,
  cockpitLocked,
  lockReason,
}: StatusRibbonProps) {
  return (
    <>
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
            t("lockBanner", "Match is closed (Fulltime). Editing is disabled.")}
        </div>
      )}
    </>
  );
}
