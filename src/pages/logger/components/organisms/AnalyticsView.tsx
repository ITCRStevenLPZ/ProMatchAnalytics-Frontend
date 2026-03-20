import { useMemo } from "react";
import { MatchEvent } from "../../../../store/useMatchLogStore";
import { Match } from "../../types";
import { usePlayerStats } from "../../hooks/usePlayerStats";
import { MatchAnalytics } from "../molecules/MatchAnalytics";
import { PlayerStatsTable } from "../molecules/PlayerStatsTable";
import HeatMapSection from "../molecules/HeatMapSection";
import LiveMatchContextBanner from "../molecules/LiveMatchContextBanner";

interface AnalyticsViewProps {
  match: Match;
  liveEvents: MatchEvent[];
  queuedEvents: MatchEvent[];
  onFieldIds: { home: Set<string>; away: Set<string> };
  effectiveClock: string;
  globalClock: string;
  ineffectiveClock: string;
  varClock: string;
  timeoutClock: string;
  effectiveTime: number;
  varTimeSeconds: number;
  timeoutTimeSeconds: number;
  ineffectiveBreakdown: any;
  clockMode: "EFFECTIVE" | "INEFFECTIVE";
  isVarActive: boolean;
  isTimeoutActive: boolean;
  t: any;
}

export default function AnalyticsView({
  match,
  liveEvents,
  queuedEvents,
  onFieldIds,
  effectiveClock,
  globalClock,
  ineffectiveClock,
  varClock,
  timeoutClock,
  effectiveTime,
  varTimeSeconds,
  timeoutTimeSeconds,
  ineffectiveBreakdown,
  clockMode,
  isVarActive,
  isTimeoutActive,
  t,
}: AnalyticsViewProps) {
  const allEvents = useMemo(
    () => [...liveEvents, ...queuedEvents],
    [liveEvents, queuedEvents],
  );
  const playerStats = usePlayerStats(match, allEvents);

  // Derive live ineffective seconds from the global clock formula:
  // globalSeconds = effectiveTime + ineffectiveSeconds + timeoutSeconds
  // This avoids using stale match.ineffective_time_seconds from the server.
  const parseGlobalSeconds = (clock: string) => {
    const [mm, rest] = clock.split(":");
    return Number(mm) * 60 + parseFloat(rest || "0");
  };
  const liveIneffectiveSeconds = Math.max(
    0,
    parseGlobalSeconds(globalClock) - effectiveTime - timeoutTimeSeconds,
  );

  const onFieldHomePlayers = useMemo(
    () =>
      (match.home_team.players ?? []).filter((p) => onFieldIds.home.has(p.id)),
    [match, onFieldIds.home],
  );
  const onFieldAwayPlayers = useMemo(
    () =>
      (match.away_team.players ?? []).filter((p) => onFieldIds.away.has(p.id)),
    [match, onFieldIds.away],
  );

  return (
    <div className="mb-6 flex flex-col gap-3">
      <LiveMatchContextBanner
        match={match}
        onFieldHomePlayers={onFieldHomePlayers}
        onFieldAwayPlayers={onFieldAwayPlayers}
        effectiveTime={effectiveTime}
        ineffectiveSeconds={liveIneffectiveSeconds}
        t={t}
      />
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-900/60 border border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2 text-slate-200 text-sm">
          <span className="text-xs uppercase tracking-wide text-slate-400">
            {t("effectiveTime", "Effective Time")}
          </span>
          <span
            className="font-mono font-semibold text-emerald-400"
            data-testid="effective-clock-value"
          >
            {effectiveClock}
          </span>
        </div>
        <div
          className={`flex items-center gap-2 text-sm ${
            clockMode === "INEFFECTIVE" ? "text-rose-300" : "text-slate-200"
          }`}
        >
          <span className="text-xs uppercase tracking-wide text-slate-400">
            {t("ineffectiveTime", "Ineffective")}
          </span>
          <span
            className={`font-mono font-semibold ${
              clockMode === "INEFFECTIVE" ? "text-rose-400 animate-pulse" : ""
            }`}
            data-testid="analytics-ineffective-clock"
          >
            {ineffectiveClock}
          </span>
        </div>
        {isVarActive && (
          <div className="flex items-center gap-2 text-amber-300 text-sm">
            <span className="text-xs uppercase tracking-wide text-amber-400">
              {t("varTime", "VAR")}
            </span>
            <span className="font-mono font-semibold animate-pulse">
              {varClock}
            </span>
          </div>
        )}
        {isTimeoutActive && (
          <div className="flex items-center gap-2 text-sky-300 text-sm">
            <span className="text-xs uppercase tracking-wide text-sky-400">
              {t("timeout", "Timeout")}
            </span>
            <span className="font-mono font-semibold animate-pulse">
              {timeoutClock}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 text-slate-200 text-sm">
          <span className="text-xs uppercase tracking-wide text-slate-400">
            {t("globalClock", "Global Clock")}
          </span>
          <span className="font-mono font-semibold">{globalClock}</span>
        </div>
      </div>
      <MatchAnalytics
        match={match}
        events={allEvents}
        effectiveTime={effectiveTime}
        varTimeSeconds={varTimeSeconds}
        timeoutSeconds={timeoutTimeSeconds}
        ineffectiveSeconds={liveIneffectiveSeconds}
        ineffectiveBreakdown={ineffectiveBreakdown}
        t={t}
      />
      <PlayerStatsTable
        stats={playerStats}
        homeTeamName={match.home_team.short_name}
        awayTeamName={match.away_team.short_name}
        t={t}
      />
      <HeatMapSection match={match} events={allEvents} t={t} />
    </div>
  );
}
