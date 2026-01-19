import React, { useMemo } from "react";
import { Match, MatchEvent } from "../types";

interface PossessionBarProps {
  match: Match;
  events: MatchEvent[];
  t: any;
}

const PossessionBar: React.FC<PossessionBarProps> = ({ match, events, t }) => {
  const stats = useMemo(() => {
    let homeCount = 0;
    let awayCount = 0;

    events.forEach((event) => {
      // Simple proxy: count all events by team
      if (event.team_id === match.home_team.id) homeCount++;
      if (event.team_id === match.away_team.id) awayCount++;
    });

    const total = homeCount + awayCount;
    if (total === 0) return { homePct: 50, awayPct: 50 };

    return {
      homePct: Math.round((homeCount / total) * 100),
      awayPct: Math.round((awayCount / total) * 100),
    };
  }, [events, match]);

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        {t("activityBalance", "Activity Balance")}
      </h3>
      <div className="flex items-center justify-between text-sm font-bold mb-1">
        <span className="text-yellow-400">{stats.homePct}%</span>
        <span className="text-blue-400">{stats.awayPct}%</span>
      </div>
      <div className="h-2 flex rounded-full overflow-hidden bg-slate-700">
        <div
          className="bg-yellow-400 transition-all duration-500"
          style={{ width: `${stats.homePct}%` }}
        />
        <div
          className="bg-blue-400 transition-all duration-500"
          style={{ width: `${stats.awayPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        <span>{match.home_team.short_name}</span>
        <span>{match.away_team.short_name}</span>
      </div>
    </div>
  );
};

export default PossessionBar;
