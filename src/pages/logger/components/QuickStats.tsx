import React, { useMemo } from "react";
import { Match, MatchEvent } from "../types";

interface QuickStatsProps {
  match: Match;
  events: MatchEvent[];
  t: any;
}

const QuickStats: React.FC<QuickStatsProps> = ({ match, events, t }) => {
  const stats = useMemo(() => {
    const data = {
      home: { shots: 0, fouls: 0, cards: 0 },
      away: { shots: 0, fouls: 0, cards: 0 },
    };

    events.forEach((event) => {
      const isHome = event.team_id === match.home_team.id;
      const target = isHome ? data.home : data.away;

      if (event.type === "Shot") target.shots++;
      if (event.type === "FoulCommitted") target.fouls++;
      if (event.type === "Card") target.cards++;
    });

    return data;
  }, [events, match]);

  return (
    <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {/* Header Row */}
        <div className="col-span-1"></div>
        <div className="text-yellow-400 font-bold truncate">
          {match.home_team.short_name}
        </div>
        <div className="text-blue-400 font-bold truncate">
          {match.away_team.short_name}
        </div>

        {/* Shots */}
        <div className="text-slate-400 text-left pl-1">
          {t("stat.shots", "Shots")}
        </div>
        <div className="text-slate-200 font-mono">{stats.home.shots}</div>
        <div className="text-slate-200 font-mono">{stats.away.shots}</div>

        {/* Fouls */}
        <div className="text-slate-400 text-left pl-1">
          {t("stat.fouls", "Fouls")}
        </div>
        <div className="text-slate-200 font-mono">{stats.home.fouls}</div>
        <div className="text-slate-200 font-mono">{stats.away.fouls}</div>

        {/* Cards */}
        <div className="text-slate-400 text-left pl-1">
          {t("stat.cards", "Cards")}
        </div>
        <div className="text-slate-200 font-mono">{stats.home.cards}</div>
        <div className="text-slate-200 font-mono">{stats.away.cards}</div>
      </div>
    </div>
  );
};

export default QuickStats;
