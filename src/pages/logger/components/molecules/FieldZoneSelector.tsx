/**
 * FieldZoneSelector — Interactive zone picker overlay.
 *
 * Renders the soccer pitch with 24 tappable zones (6 cols × 4 rows).
 * When the operator selects a zone, the zone center (StatsBomb coordinates)
 * becomes the event's location.
 *
 * Reuses the same zone grid from heatMapZones.ts.
 */
import React, { useState } from "react";
import {
  ZONES,
  PITCH_WIDTH,
  PITCH_HEIGHT,
  ZONE_COLS,
  ZONE_W,
  ZONE_H,
} from "../../utils/heatMapZones";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface FieldZoneSelectorProps {
  /** Called when the user taps a zone */
  onZoneSelect: (zoneId: number) => void;
  /** Cancel and go back to player selection */
  onCancel: () => void;
  /** Name of the selected player for display */
  playerName?: string;
  /** Translation function */
  t: (key: string, defaultValue?: string) => string;
}

/* ------------------------------------------------------------------ */
/*  Pitch markup constants (same as SoccerFieldHeatMap)                */
/* ------------------------------------------------------------------ */

const PA_WIDTH = 16.5;
const PA_HEIGHT = 40.32;
const PA_Y = (PITCH_HEIGHT - PA_HEIGHT) / 2;

const GA_WIDTH = 5.5;
const GA_HEIGHT = 18.32;
const GA_Y = (PITCH_HEIGHT - GA_HEIGHT) / 2;

const CC_R = 9.15;
const PEN_X = 11;
const PEN_R = 0.5;
const CORNER_R = 1.5;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const FieldZoneSelector: React.FC<FieldZoneSelectorProps> = ({
  onZoneSelect,
  onCancel,
  playerName,
  t,
}) => {
  const [hoveredZone, setHoveredZone] = useState<number | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      data-testid="field-zone-selector"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex flex-col items-center gap-3 bg-slate-900/95 border border-slate-700 rounded-xl p-[clamp(0.8rem,0.6rem+0.5vw,1.5rem)] shadow-2xl w-[clamp(340px,50vw,520px)]">
        {/* Header */}
        <div className="flex items-center justify-between w-full px-1">
          <span className="text-[clamp(0.75rem,0.65rem+0.25vw,1rem)] font-semibold text-slate-300">
            {playerName
              ? t(
                  "zoneSelectTitle",
                  `Select where ${playerName}'s action occurred`,
                )
              : t("zoneSelectTitleGeneric", "Select the action zone")}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-600 hover:border-slate-400 transition-colors"
            data-testid="zone-selector-cancel"
          >
            {t("cancel", "Cancel")}
          </button>
        </div>

        {/* SVG Pitch with selectable zones */}
        <svg
          viewBox={`-2 -2 ${PITCH_WIDTH + 4} ${PITCH_HEIGHT + 4}`}
          className="w-full rounded-lg border border-slate-700 bg-green-800 cursor-pointer"
          preserveAspectRatio="xMidYMid meet"
          data-testid="zone-selector-field"
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

          {/* ─── Mowing stripes ─── */}
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
            <rect
              x={0}
              y={0}
              width={PITCH_WIDTH}
              height={PITCH_HEIGHT}
              rx={0.5}
            />
            <line
              x1={PITCH_WIDTH / 2}
              y1={0}
              x2={PITCH_WIDTH / 2}
              y2={PITCH_HEIGHT}
            />
            <circle cx={PITCH_WIDTH / 2} cy={PITCH_HEIGHT / 2} r={CC_R} />
            <circle
              cx={PITCH_WIDTH / 2}
              cy={PITCH_HEIGHT / 2}
              r={PEN_R}
              fill="rgba(255,255,255,0.55)"
            />
            <rect x={0} y={PA_Y} width={PA_WIDTH} height={PA_HEIGHT} />
            <rect
              x={PITCH_WIDTH - PA_WIDTH}
              y={PA_Y}
              width={PA_WIDTH}
              height={PA_HEIGHT}
            />
            <rect x={0} y={GA_Y} width={GA_WIDTH} height={GA_HEIGHT} />
            <rect
              x={PITCH_WIDTH - GA_WIDTH}
              y={GA_Y}
              width={GA_WIDTH}
              height={GA_HEIGHT}
            />
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

          {/* ─── Grid lines (zone borders) ─── */}
          <g stroke="rgba(255,255,255,0.2)" strokeWidth={0.3} fill="none">
            {/* Vertical grid lines */}
            {Array.from({ length: ZONE_COLS - 1 }, (_, i) => (
              <line
                key={`vgrid-${i}`}
                x1={(i + 1) * ZONE_W}
                y1={0}
                x2={(i + 1) * ZONE_W}
                y2={PITCH_HEIGHT}
              />
            ))}
            {/* Horizontal grid lines */}
            {Array.from({ length: 3 }, (_, i) => (
              <line
                key={`hgrid-${i}`}
                x1={0}
                y1={(i + 1) * ZONE_H}
                x2={PITCH_WIDTH}
                y2={(i + 1) * ZONE_H}
              />
            ))}
          </g>

          {/* ─── Interactive zone rectangles ─── */}
          <g data-testid="zone-selector-zones">
            {ZONES.map((zone) => {
              const isHovered = hoveredZone === zone.id;
              return (
                <rect
                  key={zone.id}
                  x={zone.x0}
                  y={zone.y0}
                  width={ZONE_W}
                  height={ZONE_H}
                  fill={
                    isHovered
                      ? "rgba(59, 130, 246, 0.35)"
                      : "rgba(255,255,255,0.05)"
                  }
                  stroke={
                    isHovered
                      ? "rgba(59, 130, 246, 0.8)"
                      : "rgba(255,255,255,0.08)"
                  }
                  strokeWidth={isHovered ? 0.6 : 0.2}
                  style={{ cursor: "pointer", transition: "fill 0.1s" }}
                  data-testid={`zone-select-${zone.id}`}
                  data-zone-id={zone.id}
                  onMouseEnter={() => setHoveredZone(zone.id)}
                  onMouseLeave={() => setHoveredZone(null)}
                  onClick={() => onZoneSelect(zone.id)}
                >
                  <title>{zone.label}</title>
                </rect>
              );
            })}
          </g>
        </svg>

        {/* Helper text */}
        <p className="text-[clamp(0.65rem,0.55rem+0.2vw,0.85rem)] text-slate-500 text-center">
          {t(
            "zoneSelectHint",
            "Tap the area of the field where the action took place",
          )}
        </p>
      </div>
    </div>
  );
};

export default FieldZoneSelector;
