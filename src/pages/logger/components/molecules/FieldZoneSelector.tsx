/**
 * FieldZoneSelector — Lightweight zone-grid overlay for the tactical field.
 *
 * Renders 24 tappable zones (6 cols × 4 rows) positioned using CSS
 * percentages that map directly to the TacticalField coordinate system.
 * Designed to be passed as the `fieldOverlay` (→ `overlay`) prop of
 * TacticalField / PlayerSelectorPanel — it is NOT a modal.
 *
 * Reuses the same zone grid from heatMapZones.ts.
 */
import React, { useRef, useState } from "react";
import {
  ZONES,
  PITCH_WIDTH,
  PITCH_HEIGHT,
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
  /** Whether the field display is horizontally flipped */
  flipSides?: boolean;
  /** Translation function */
  t: (key: string, defaultValue?: string) => string;
}

/* ------------------------------------------------------------------ */
/*  Coordinate helpers                                                 */
/* ------------------------------------------------------------------ */

/** StatsBomb x → CSS % of field width */
const sbXToPct = (x: number) => (x / PITCH_WIDTH) * 100;
/** StatsBomb y → CSS % of field height */
const sbYToPct = (y: number) => (y / PITCH_HEIGHT) * 100;

const ZONE_W_PCT = sbXToPct(ZONE_W); // ≈ 16.667%
const ZONE_H_PCT = sbYToPct(ZONE_H); // 25%

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const FieldZoneSelector: React.FC<FieldZoneSelectorProps> = ({
  onZoneSelect,
  onCancel,
  flipSides = false,
  t,
}) => {
  const [hoveredZone, setHoveredZone] = useState<number | null>(null);
  // Touch devices: first tap highlights, second tap on same zone confirms
  const [touchedZone, setTouchedZone] = useState<number | null>(null);
  const lastTouchAt = useRef(0);

  return (
    <div className="absolute inset-0" data-testid="field-zone-selector">
      {/* ─── Zone grid ─── */}
      {ZONES.map((zone) => {
        const isHighlighted =
          hoveredZone === zone.id || touchedZone === zone.id;
        const leftPct = flipSides
          ? 100 - sbXToPct(zone.x0) - ZONE_W_PCT
          : sbXToPct(zone.x0);
        const topPct = sbYToPct(zone.y0);

        return (
          <button
            key={zone.id}
            type="button"
            data-testid={`zone-select-${zone.id}`}
            data-zone-id={zone.id}
            data-zone-touched={touchedZone === zone.id ? "true" : undefined}
            title={zone.label}
            onMouseEnter={() => setHoveredZone(zone.id)}
            onMouseLeave={() => setHoveredZone(null)}
            onTouchEnd={(e) => {
              e.preventDefault();
              lastTouchAt.current = Date.now();
              if (touchedZone === zone.id) {
                onZoneSelect(zone.id);
              } else {
                setTouchedZone(zone.id);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              // Suppress click synthesised from a recent touch
              if (Date.now() - lastTouchAt.current < 700) return;
              onZoneSelect(zone.id);
            }}
            className="absolute transition-colors duration-100"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${ZONE_W_PCT}%`,
              height: `${ZONE_H_PCT}%`,
              backgroundColor: isHighlighted
                ? "rgba(59, 130, 246, 0.35)"
                : "rgba(255, 255, 255, 0.06)",
              border: `1px solid ${
                isHighlighted
                  ? "rgba(59, 130, 246, 0.7)"
                  : "rgba(255, 255, 255, 0.15)"
              }`,
              cursor: "pointer",
            }}
          >
            {touchedZone === zone.id && (
              <span className="flex items-center justify-center h-full text-[10px] text-white font-semibold select-none">
                {t("tapToConfirm", "Tap to confirm")}
              </span>
            )}
          </button>
        );
      })}

      {/* ─── Cancel + hint bar ─── */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10">
        <span className="text-[10px] text-white/70 bg-black/50 px-2 py-1 rounded select-none">
          {t("zoneSelectHint", "Tap the area where the action took place")}
        </span>
        <button
          type="button"
          data-testid="zone-selector-cancel"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="text-[10px] text-slate-300 bg-black/60 hover:bg-black/80 px-2 py-1 rounded border border-slate-500/50 hover:border-slate-400 transition-colors"
        >
          {t("cancel", "Cancel")}
        </button>
      </div>
    </div>
  );
};

export default FieldZoneSelector;
