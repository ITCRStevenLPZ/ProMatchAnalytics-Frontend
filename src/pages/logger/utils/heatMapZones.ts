/**
 * Heat-map zone utilities.
 *
 * The soccer field uses StatsBomb coordinates: x ∈ [0, 120], y ∈ [0, 80].
 * We divide the pitch into a 6×4 grid (24 zones):
 *   - 6 columns of 20 units each (0-20, 20-40, … 100-120)
 *   - 4 rows    of 20 units each (0-20, 20-40, 40-60, 60-80)
 *
 * Zone IDs are numbered left-to-right, top-to-bottom:
 *   0  1  2  3  4  5
 *   6  7  8  9 10 11
 *  12 13 14 15 16 17
 *  18 19 20 21 22 23
 */

import type { MatchEvent } from "../../../store/useMatchLogStore";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** StatsBomb pitch dimensions */
export const PITCH_WIDTH = 120;
export const PITCH_HEIGHT = 80;

/** Grid layout */
export const ZONE_COLS = 6;
export const ZONE_ROWS = 4;
export const ZONE_W = PITCH_WIDTH / ZONE_COLS; // 20
export const ZONE_H = PITCH_HEIGHT / ZONE_ROWS; // 20
export const TOTAL_ZONES = ZONE_COLS * ZONE_ROWS; // 24

/* ------------------------------------------------------------------ */
/*  Zone descriptor                                                    */
/* ------------------------------------------------------------------ */

export interface ZoneDescriptor {
  /** 0-based zone id (row-major) */
  id: number;
  /** Column index (0 = left goal-line) */
  col: number;
  /** Row index (0 = top touchline) */
  row: number;
  /** StatsBomb x range  */
  x0: number;
  x1: number;
  /** StatsBomb y range  */
  y0: number;
  y1: number;
  /** Label for display   */
  label: string;
}

/* ------------------------------------------------------------------ */
/*  Zone label helpers                                                 */
/* ------------------------------------------------------------------ */

const COL_LABELS = [
  "Defensive Third (L)",
  "Defensive Third (R)",
  "Middle Third (L)",
  "Middle Third (R)",
  "Attacking Third (L)",
  "Attacking Third (R)",
];

const ROW_LABELS = ["Top", "Center-Top", "Center-Bottom", "Bottom"];

/* ------------------------------------------------------------------ */
/*  Build the static zone grid                                         */
/* ------------------------------------------------------------------ */

export const ZONES: ZoneDescriptor[] = Array.from(
  { length: TOTAL_ZONES },
  (_, id) => {
    const col = id % ZONE_COLS;
    const row = Math.floor(id / ZONE_COLS);
    return {
      id,
      col,
      row,
      x0: col * ZONE_W,
      x1: (col + 1) * ZONE_W,
      y0: row * ZONE_H,
      y1: (row + 1) * ZONE_H,
      label: `${ROW_LABELS[row]} – ${COL_LABELS[col]}`,
    };
  },
);

/* ------------------------------------------------------------------ */
/*  Resolve a StatsBomb location to a zone id                          */
/* ------------------------------------------------------------------ */

export function locationToZoneId(x: number, y: number): number {
  const col = Math.min(ZONE_COLS - 1, Math.max(0, Math.floor(x / ZONE_W)));
  const row = Math.min(ZONE_ROWS - 1, Math.max(0, Math.floor(y / ZONE_H)));
  return row * ZONE_COLS + col;
}

/* ------------------------------------------------------------------ */
/*  Heat-map data (zone → count)                                       */
/* ------------------------------------------------------------------ */

export interface HeatMapData {
  /** Absolute event count per zone (index = zone id) */
  counts: number[];
  /** Max event count across all zones (0 when empty) */
  max: number;
  /** Total number of events that contributed */
  total: number;
}

/**
 * Compute heat-map data from a list of events.
 *
 * @param events  - MatchEvent[]
 * @param teamId  - If provided, only count events for this team.
 *                  Pass `undefined` for the combined / match heat map.
 */
export function computeHeatMapData(
  events: MatchEvent[],
  teamId?: string,
): HeatMapData {
  const counts = new Array<number>(TOTAL_ZONES).fill(0);
  let total = 0;

  for (const ev of events) {
    if (teamId && ev.team_id !== teamId) continue;
    if (!ev.location || ev.location.length < 2) continue;

    const [x, y] = ev.location;
    const zoneId = locationToZoneId(x, y);
    counts[zoneId]++;
    total++;
  }

  const max = Math.max(0, ...counts);
  return { counts, max, total };
}

/* ------------------------------------------------------------------ */
/*  Color interpolation (yellow → orange → red)                        */
/* ------------------------------------------------------------------ */

/**
 * Returns an rgba() color string for a given intensity ∈ [0, 1].
 *
 * 0.0 → transparent
 * 0.01-0.5 → yellow to orange (warm-up)
 * 0.5-1.0  → orange to red   (hot)
 */
export function intensityToColor(intensity: number): string {
  if (intensity <= 0) return "rgba(0,0,0,0)";

  // Clamp
  const t = Math.min(1, Math.max(0, intensity));

  // Base opacity: zones with activity always show, scaling from 0.25 to 0.85
  const alpha = 0.25 + t * 0.6;

  let r: number, g: number, b: number;

  if (t <= 0.5) {
    // Yellow (255, 255, 0) → Orange (255, 165, 0)
    const s = t / 0.5;
    r = 255;
    g = Math.round(255 - (255 - 165) * s);
    b = 0;
  } else {
    // Orange (255, 165, 0) → Red (220, 40, 0)
    const s = (t - 0.5) / 0.5;
    r = Math.round(255 - (255 - 220) * s);
    g = Math.round(165 - (165 - 40) * s);
    b = 0;
  }

  return `rgba(${r},${g},${b},${alpha})`;
}
