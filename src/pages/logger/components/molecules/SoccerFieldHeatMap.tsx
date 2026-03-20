/**
 * SoccerFieldHeatMap — SVG soccer pitch with a continuous density heat-map
 * overlay rendered on an HTML5 Canvas.
 *
 * Uses radial-gradient accumulation + colorization for smooth, topographical
 * density visualization instead of a discrete 24-zone grid.
 */
import React, { useEffect, useRef } from "react";
import {
  ZONES,
  PITCH_WIDTH,
  PITCH_HEIGHT,
  ZONE_COLS,
  ZONE_W,
  buildDensityColorMap,
  type HeatMapData,
} from "../../utils/heatMapZones";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface SoccerFieldHeatMapProps {
  /** Heat-map data containing counts per zone (for stats & E2E) */
  data: HeatMapData;
  /** Raw event coordinates for canvas density rendering */
  points: [number, number][];
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
/*  Canvas rendering constants                                         */
/* ------------------------------------------------------------------ */

const CANVAS_W = 600;
const CANVAS_H = 400;
const DENSITY_COLORMAP = buildDensityColorMap();

/* Canvas-pitch alignment percentages (SVG viewBox = -2 -2 124 84) */
const PITCH_LEFT_PCT = (2 / (PITCH_WIDTH + 4)) * 100;
const PITCH_TOP_PCT = (2 / (PITCH_HEIGHT + 4)) * 100;
const PITCH_W_PCT = (PITCH_WIDTH / (PITCH_WIDTH + 4)) * 100;
const PITCH_H_PCT = (PITCH_HEIGHT / (PITCH_HEIGHT + 4)) * 100;

/* ------------------------------------------------------------------ */
/*  Canvas density renderer                                            */
/* ------------------------------------------------------------------ */

function renderDensityHeatMap(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
) {
  const w = CANVAS_W;
  const h = CANVAS_H;
  ctx.clearRect(0, 0, w, h);
  if (points.length === 0) return;

  const radius = w * 0.1;
  const pointAlpha = Math.max(0.05, Math.min(0.15, 3 / points.length));

  // Step 1: Accumulate density via radial gradients (additive blending)
  for (const [px, py] of points) {
    const cx = (px / PITCH_WIDTH) * w;
    const cy = (py / PITCH_HEIGHT) * h;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(0,0,0,${pointAlpha})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Step 2: Read pixels, normalize density, apply colour map
  const imgData = ctx.getImageData(0, 0, w, h);
  const px = imgData.data;

  let maxA = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] > maxA) maxA = px[i];
  }
  if (maxA === 0) {
    ctx.putImageData(imgData, 0, 0);
    return;
  }

  const cmap = DENSITY_COLORMAP;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a > 0) {
      const idx = Math.min(255, Math.round((a / maxA) * 255));
      px[i] = cmap[idx * 4];
      px[i + 1] = cmap[idx * 4 + 1];
      px[i + 2] = cmap[idx * 4 + 2];
      px[i + 3] = cmap[idx * 4 + 3];
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const SoccerFieldHeatMap: React.FC<SoccerFieldHeatMapProps> = ({
  data,
  points,
  title,
  accentColor = "#6366f1",
  "data-testid": testId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderDensityHeatMap(ctx, points);
  }, [points]);

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

      {/* SVG Pitch + Canvas heat-map overlay */}
      <div
        className="relative w-full max-w-md rounded-lg border border-slate-700 bg-green-800 overflow-hidden"
        style={{
          aspectRatio: `${PITCH_WIDTH + 4} / ${PITCH_HEIGHT + 4}`,
        }}
      >
        <svg
          viewBox={`-2 -2 ${PITCH_WIDTH + 4} ${PITCH_HEIGHT + 4}`}
          className="absolute inset-0 w-full h-full"
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
        </svg>

        {/* ─── Canvas heat-map overlay ─── */}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="absolute pointer-events-none"
          style={{
            left: `${PITCH_LEFT_PCT}%`,
            top: `${PITCH_TOP_PCT}%`,
            width: `${PITCH_W_PCT}%`,
            height: `${PITCH_H_PCT}%`,
          }}
          data-testid={testId ? `${testId}-canvas` : undefined}
        />
      </div>

      {/* ─── Hidden zone data for E2E testing ─── */}
      <div
        aria-hidden="true"
        data-testid={testId ? `${testId}-zones` : undefined}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          opacity: 0,
        }}
      >
        {ZONES.map((zone) => (
          <span
            key={zone.id}
            data-testid={testId ? `${testId}-zone-${zone.id}` : undefined}
            data-zone-id={zone.id}
            data-zone-count={data.counts[zone.id]}
          />
        ))}
      </div>
    </div>
  );
};

export default SoccerFieldHeatMap;
