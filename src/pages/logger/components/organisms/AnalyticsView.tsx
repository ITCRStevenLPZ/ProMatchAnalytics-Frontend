import { useMemo } from "react";
import { MatchEvent } from "../../../../store/useMatchLogStore";
import { Match } from "../../types";
import { usePlayerStats } from "../../hooks/usePlayerStats";
import { MatchAnalytics } from "../molecules/MatchAnalytics";
import { PlayerStatsTable } from "../molecules/PlayerStatsTable";

interface AnalyticsViewProps {
  match: Match;
  liveEvents: MatchEvent[];
  queuedEvents: MatchEvent[];
  effectiveClock: string;
  globalClock: string;
  effectiveTime: number;
  varTimeSeconds: number;
  timeoutTimeSeconds: number;
  ineffectiveBreakdown: any;
  t: any;
}

export default function AnalyticsView({
  match,
  liveEvents,
  queuedEvents,
  effectiveClock,
  globalClock,
  effectiveTime,
  varTimeSeconds,
  timeoutTimeSeconds,
  ineffectiveBreakdown,
  t,
}: AnalyticsViewProps) {
  const allEvents = useMemo(
    () => [...liveEvents, ...queuedEvents],
    [liveEvents, queuedEvents],
  );
  const playerStats = usePlayerStats(match, allEvents);

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-900/60 border border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2 text-slate-200 text-sm">
          <span className="text-xs uppercase tracking-wide text-slate-400">
            {t("effectiveTime", "Effective Time")}
          </span>
          <span
            className="font-mono font-semibold"
            data-testid="effective-clock-value"
          >
            {effectiveClock}
          </span>
        </div>
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
        ineffectiveSeconds={match?.ineffective_time_seconds || 0}
        ineffectiveBreakdown={ineffectiveBreakdown}
        t={t}
      />
      <PlayerStatsTable
        stats={playerStats}
        homeTeamName={match.home_team.short_name}
        awayTeamName={match.away_team.short_name}
        t={t}
      />
    </div>
  );
}
