/**
 * HeatMapSection — renders three soccer-field heat maps:
 *   1. Home team activity
 *   2. Away team activity
 *   3. Combined / match-wide activity
 *
 * Uses the event-location data already present on logged events to
 * compute zone density without any additional user interaction.
 */
import React, { useMemo } from "react";
import SoccerFieldHeatMap from "./SoccerFieldHeatMap";
import {
  computeHeatMapData,
  extractHeatPoints,
} from "../../utils/heatMapZones";
import type { MatchEvent } from "../../../../store/useMatchLogStore";
import type { Match } from "../../types";
import { Activity } from "../../../../components/icons";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface HeatMapSectionProps {
  match: Match;
  events: MatchEvent[];
  t: (key: string, fallback?: string) => string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const HeatMapSection: React.FC<HeatMapSectionProps> = ({
  match,
  events,
  t,
}) => {
  const homeTeamId = match.home_team.id;
  const awayTeamId = match.away_team.id;

  const homeData = useMemo(
    () => computeHeatMapData(events, homeTeamId),
    [events, homeTeamId],
  );
  const homePoints = useMemo(
    () => extractHeatPoints(events, homeTeamId),
    [events, homeTeamId],
  );

  const awayData = useMemo(
    () => computeHeatMapData(events, awayTeamId),
    [events, awayTeamId],
  );
  const awayPoints = useMemo(
    () => extractHeatPoints(events, awayTeamId),
    [events, awayTeamId],
  );

  const matchData = useMemo(() => computeHeatMapData(events), [events]);
  const matchPoints = useMemo(() => extractHeatPoints(events), [events]);

  return (
    <div
      className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 space-y-6"
      data-testid="heatmap-section"
    >
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-orange-400" />
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          {t("analytics.heatMaps", "Field Heat Maps")}
        </h3>
      </div>

      {/* Three heat maps in responsive grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SoccerFieldHeatMap
          data={homeData}
          points={homePoints}
          title={match.home_team.short_name || match.home_team.name}
          accentColor="#10b981"
          data-testid="heatmap-home"
        />
        <SoccerFieldHeatMap
          data={awayData}
          points={awayPoints}
          title={match.away_team.short_name || match.away_team.name}
          accentColor="#6366f1"
          data-testid="heatmap-away"
        />
        <SoccerFieldHeatMap
          data={matchData}
          points={matchPoints}
          title={t("analytics.combined", "Combined")}
          accentColor="#f59e0b"
          data-testid="heatmap-match"
        />
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
        <span>{t("analytics.low", "Low")}</span>
        <div className="flex h-3 w-32 rounded overflow-hidden border border-slate-600">
          <div className="flex-1" style={{ background: "rgba(0,0,255,0.4)" }} />
          <div
            className="flex-1"
            style={{ background: "rgba(0,200,255,0.55)" }}
          />
          <div
            className="flex-1"
            style={{ background: "rgba(0,255,0,0.65)" }}
          />
          <div
            className="flex-1"
            style={{ background: "rgba(255,255,0,0.75)" }}
          />
          <div className="flex-1" style={{ background: "rgba(255,0,0,0.9)" }} />
        </div>
        <span>{t("analytics.high", "High")}</span>
      </div>
    </div>
  );
};

export default HeatMapSection;
