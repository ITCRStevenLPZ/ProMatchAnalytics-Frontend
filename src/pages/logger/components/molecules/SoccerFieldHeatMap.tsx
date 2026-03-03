/**
 * SoccerFieldHeatMap — SVG soccer pitch with a colored zone overlay.
 *
 * Renders a realistic mini soccer field (aspect 120:80 = 3:2) and paints each
 * of the 24 zones (6 cols × 4 rows) according to the provided heat-map data
 * using a yellow → orange → red colour scale.
 */
import React, { useMemo } from "react";
import {
  ZONES,
  PITCH_WIDTH,
  PITCH_HEIGHT,
  ZONE_COLS,
  ZONE_ROWS,
  ZONE_W,
  ZONE_H,
  intensityToColor,
  type HeatMapData,
} from "../../utils/heatMapZones";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface SoccerFieldHeatMapProps {
  /** Heat-map data containing counts per zone */
  data: HeatMapData;
  /** Optional title displayed above the field */
  title?: string;
  /** Team colour for the title badge (hex) */
  accentColor?: string;
  /** data-testid for E2E */
  "data-testid"?: string;
}

/* ------------------------------------------------------------------ */
/*  Pitch markup constants (all in StatsBomb coordinate units)         */
/* ------------------------------------------------------------------ */

// Penalty area dimensions (per FIFA Law 1)
const PA_WIDTH = 16.5; // depth from goal-line
const PA_HEIGHT = 40.32; // total width (centred)
const PA_Y = (PITCH_HEIGHT - PA_HEIGHT) / 2;

// Goal area
const GA_WIDTH = 5.5;
const GA_HEIGHT = 18.32;
const GA_Y = (PITCH_HEIGHT - GA_HEIGHT) / 2;

// Centre circle radius
const CC_R = 9.15;

// Penalty spot distance
const PEN_X = 11;
const PEN_R = 0.5;

// Corner arc radius (in SVG units)
const CORNER_R = 1.5;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const SoccerFieldHeatMap: React.FC<SoccerFieldHeatMapProps> = ({
  data,
  title,
  accentColor = "#6366f1",
  "data-testid": testId,
}) => {
  /* Compute zone colours from data */
  const zoneColors = useMemo(() => {
    if (data.max === 0) {
      return ZONES.map(() => "rgba(0,0,0,0)");
    }
    return ZONES.map((zone) => {
      const count = data.counts[zone.id];
      const intensity = count / data.max;
      return intensityToColor(intensity);
    });
  }, [data]);

  return (
    <div className="flex flex-col items-center gap-1" data-testid={testId}>
      {/* Title badge */}
      {title && (
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            {title}
          </span>
          <span className="text-xs text-slate-500">
            ({data.total} {data.total === 1 ? "event" : "events"})
          </span>
        </div>
      )}

      {/* SVG Pitch */}
      <svg
        viewBox={`-2 -2 ${PITCH_WIDTH + 4} ${PITCH_HEIGHT + 4}`}
        className="w-full max-w-md rounded-lg border border-slate-700 bg-green-800"
        preserveAspectRatio="xMidYMid meet"
        data-testid={testId ? `${testId}-svg` : undefined}
      >
        {/* ─── Field background ─── */}
        <rect
          x={0}
          y={0}
          width={PITCH_WIDTH}
          height={PITCH_HEIGHT}
          fill="#2d6a2e"
          rx={1}
        />

        {/* ─── Mowing stripes (alternating vertical bands) ─── */}
        {Array.from({ length: ZONE_COLS }, (_, i) =>
          i % 2 === 0 ? (
            <rect
              key={`stripe-${i}`}
              x={i * ZONE_W}
              y={0}
              width={ZONE_W}
              height={PITCH_HEIGHT}
              fill="rgba(255,255,255,0.03)"
            />
          ) : null,
        )}

        {/* ─── Pitch markings ─── */}
        <g stroke="rgba(255,255,255,0.55)" strokeWidth={0.4} fill="none">
          {/* Touchlines & goal lines */}
          <rect
            x={0}
            y={0}
            width={PITCH_WIDTH}
            height={PITCH_HEIGHT}
            rx={0.5}
          />

          {/* Centre line */}
          <line
            x1={PITCH_WIDTH / 2}
            y1={0}
            x2={PITCH_WIDTH / 2}
            y2={PITCH_HEIGHT}
          />

          {/* Centre circle */}
          <circle cx={PITCH_WIDTH / 2} cy={PITCH_HEIGHT / 2} r={CC_R} />

          {/* Centre spot */}
          <circle
            cx={PITCH_WIDTH / 2}
            cy={PITCH_HEIGHT / 2}
            r={PEN_R}
            fill="rgba(255,255,255,0.55)"
          />

          {/* Left penalty area */}
          <rect x={0} y={PA_Y} width={PA_WIDTH} height={PA_HEIGHT} />
          {/* Right penalty area */}
          <rect
            x={PITCH_WIDTH - PA_WIDTH}
            y={PA_Y}
            width={PA_WIDTH}
            height={PA_HEIGHT}
          />

          {/* Left goal area */}
          <rect x={0} y={GA_Y} width={GA_WIDTH} height={GA_HEIGHT} />
          {/* Right goal area */}
          <rect
            x={PITCH_WIDTH - GA_WIDTH}
            y={GA_Y}
            width={GA_WIDTH}
            height={GA_HEIGHT}
          />

          {/* Penalty spots */}
          <circle
            cx={PEN_X}
            cy={PITCH_HEIGHT / 2}
            r={PEN_R}
            fill="rgba(255,255,255,0.55)"
          />
          <circle
            cx={PITCH_WIDTH - PEN_X}
            cy={PITCH_HEIGHT / 2}
            r={PEN_R}
            fill="rgba(255,255,255,0.55)"
          />

          {/* Penalty arcs */}
          <path
            d={`M ${PA_WIDTH} ${
              PITCH_HEIGHT / 2 - CC_R * 0.65
            } A ${CC_R} ${CC_R} 0 0 1 ${PA_WIDTH} ${
              PITCH_HEIGHT / 2 + CC_R * 0.65
            }`}
          />
          <path
            d={`M ${PITCH_WIDTH - PA_WIDTH} ${
              PITCH_HEIGHT / 2 - CC_R * 0.65
            } A ${CC_R} ${CC_R} 0 0 0 ${PITCH_WIDTH - PA_WIDTH} ${
              PITCH_HEIGHT / 2 + CC_R * 0.65
            }`}
          />

          {/* Corner arcs */}
          <path
            d={`M 0 ${CORNER_R} A ${CORNER_R} ${CORNER_R} 0 0 1 ${CORNER_R} 0`}
          />
          <path
            d={`M ${
              PITCH_WIDTH - CORNER_R
            } 0 A ${CORNER_R} ${CORNER_R} 0 0 1 ${PITCH_WIDTH} ${CORNER_R}`}
          />
          <path
            d={`M 0 ${
              PITCH_HEIGHT - CORNER_R
            } A ${CORNER_R} ${CORNER_R} 0 0 0 ${CORNER_R} ${PITCH_HEIGHT}`}
          />
          <path
            d={`M ${
              PITCH_WIDTH - CORNER_R
            } ${PITCH_HEIGHT} A ${CORNER_R} ${CORNER_R} 0 0 0 ${PITCH_WIDTH} ${
              PITCH_HEIGHT - CORNER_R
            }`}
          />
        </g>

        {/* ─── Heat-map zone overlay ─── */}
        <g data-testid={testId ? `${testId}-zones` : undefined}>
          {ZONES.map((zone) => (
            <rect
              key={zone.id}
              x={zone.x0}
              y={zone.y0}
              width={ZONE_W}
              height={ZONE_H}
              fill={zoneColors[zone.id]}
              data-testid={testId ? `${testId}-zone-${zone.id}` : undefined}
              data-zone-id={zone.id}
              data-zone-count={data.counts[zone.id]}
            >
              <title>
                {zone.label}: {data.counts[zone.id]} event
                {data.counts[zone.id] !== 1 ? "s" : ""}
              </title>
            </rect>
          ))}
        </g>

        {/* ─── Zone grid lines (subtle) ─── */}
        <g stroke="rgba(255,255,255,0.12)" strokeWidth={0.2} fill="none">
          {Array.from({ length: ZONE_COLS - 1 }, (_, i) => (
            <line
              key={`vcol-${i}`}
              x1={(i + 1) * ZONE_W}
              y1={0}
              x2={(i + 1) * ZONE_W}
              y2={PITCH_HEIGHT}
            />
          ))}
          {Array.from({ length: ZONE_ROWS - 1 }, (_, i) => (
            <line
              key={`hrow-${i}`}
              x1={0}
              y1={(i + 1) * ZONE_H}
              x2={PITCH_WIDTH}
              y2={(i + 1) * ZONE_H}
            />
          ))}
        </g>

        {/* ─── Zone counts (only when > 0) ─── */}
        <g
          fontSize={4}
          fontWeight="bold"
          fill="white"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {ZONES.map((zone) =>
            data.counts[zone.id] > 0 ? (
              <text
                key={`label-${zone.id}`}
                x={zone.x0 + ZONE_W / 2}
                y={zone.y0 + ZONE_H / 2}
                style={{
                  textShadow: "0 0 3px rgba(0,0,0,0.8)",
                  pointerEvents: "none",
                }}
              >
                {data.counts[zone.id]}
              </text>
            ) : null,
          )}
        </g>
      </svg>
    </div>
  );
};

export default SoccerFieldHeatMap;
