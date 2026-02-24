import React, { useCallback, useRef, useState } from "react";
import TacticalPlayerNode from "./TacticalPlayerNode";
import type { TacticalPosition } from "../../hooks/useTacticalPositions";
import type { FieldAnchor, FieldCoordinate } from "../../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Player {
  id: string;
  full_name: string;
  short_name?: string;
  jersey_number: number;
  position: string;
}

interface TacticalFieldProps {
  homeTeamName: string;
  awayTeamName: string;
  homePlayers: Player[];
  awayPlayers: Player[];
  expelledPlayerIds?: Set<string>;
  disciplinaryStatusByPlayer?: Record<
    string,
    { yellowCount: number; red: boolean }
  >;
  /** Canonical positions keyed by player‑id. */
  getDisplayPosition: (
    playerId: string,
    flipSides: boolean,
  ) => TacticalPosition;
  /** Called after the user finishes dragging a player. */
  onPlayerDragEnd: (
    playerId: string,
    displayX: number,
    displayY: number,
    playerPosition: string | undefined,
    side: "home" | "away",
  ) => void;
  /** Called when a player node is clicked (no drag). */
  onPlayerClick: (
    player: Player,
    anchor: FieldAnchor,
    location: [number, number],
    side: "home" | "away",
  ) => void;
  /** Optional destination click handler (for pass/shot destination). */
  onDestinationClick?: (coordinate: FieldCoordinate) => void;
  showDestinationControls?: boolean;
  overlay?: React.ReactNode;
  flipSides?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const resolveStatsbombLocation = (
  xPercent: number,
  yPercent: number,
): [number, number] => [
  Number(((xPercent / 100) * 120).toFixed(1)),
  Number(((yPercent / 100) * 80).toFixed(1)),
];

const buildCoordinate = (
  xPercent: number,
  yPercent: number,
  flipSides: boolean,
): FieldCoordinate => {
  const flippedX = flipSides ? 100 - xPercent : xPercent;
  const left = 4;
  const right = 96;
  const top = 4;
  const bottom = 96;
  let outOfBoundsEdge: FieldCoordinate["outOfBoundsEdge"] = null;
  const isOutOfBounds =
    flippedX < left || flippedX > right || yPercent < top || yPercent > bottom;
  if (flippedX < left) outOfBoundsEdge = "left";
  else if (flippedX > right) outOfBoundsEdge = "right";
  else if (yPercent < top) outOfBoundsEdge = "top";
  else if (yPercent > bottom) outOfBoundsEdge = "bottom";
  const cx = Math.min(100, Math.max(0, flippedX));
  const cy = Math.min(100, Math.max(0, yPercent));
  return {
    xPercent: cx,
    yPercent: cy,
    statsbomb: resolveStatsbombLocation(cx, cy),
    isOutOfBounds,
    outOfBoundsEdge,
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TacticalField: React.FC<TacticalFieldProps> = ({
  homeTeamName,
  awayTeamName,
  homePlayers,
  awayPlayers,
  expelledPlayerIds,
  disciplinaryStatusByPlayer,
  getDisplayPosition,
  onPlayerDragEnd,
  onPlayerClick,
  onDestinationClick,
  showDestinationControls = false,
  overlay,
  flipSides = false,
}) => {
  const fieldRef = useRef<HTMLDivElement | null>(null);

  const maybeFlipX = useCallback(
    (x: number) => (flipSides ? 100 - x : x),
    [flipSides],
  );

  // Transient drag preview — while a player is mid‑drag we store their
  // temporary position here so the node re‑renders at the new spot without
  // committing to the canonical store yet.
  const [dragPreview, setDragPreview] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const handleFieldClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onDestinationClick || !fieldRef.current) return;
      const rect = fieldRef.current.getBoundingClientRect();
      const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
      const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
      onDestinationClick(buildCoordinate(xPercent, yPercent, flipSides));
    },
    [onDestinationClick, flipSides],
  );

  const makePlayerDragEnd = useCallback(
    (playerId: string, playerPosition: string, side: "home" | "away") =>
      (displayX: number, displayY: number) => {
        setDragPreview(null);
        onPlayerDragEnd(playerId, displayX, displayY, playerPosition, side);
      },
    [onPlayerDragEnd],
  );

  const makePlayerDragMove = useCallback(
    (playerId: string) => (displayX: number, displayY: number) => {
      setDragPreview({ id: playerId, x: displayX, y: displayY });
    },
    [],
  );

  const renderPlayerNode = useCallback(
    (player: Player, side: "home" | "away") => {
      const display =
        dragPreview?.id === player.id
          ? { x: dragPreview.x, y: dragPreview.y }
          : getDisplayPosition(player.id, flipSides);
      const cardStatus = disciplinaryStatusByPlayer?.[player.id];
      const isExpelled = expelledPlayerIds?.has(player.id) ?? false;

      return (
        <TacticalPlayerNode
          key={player.id}
          playerId={player.id}
          jerseyNumber={player.jersey_number}
          fullName={player.full_name}
          shortName={player.short_name}
          position={player.position}
          side={side}
          xPercent={display.x}
          yPercent={display.y}
          isExpelled={isExpelled}
          hasYellow={(cardStatus?.yellowCount ?? 0) > 0}
          hasRed={Boolean(cardStatus?.red)}
          yellowCount={cardStatus?.yellowCount ?? 0}
          onClick={() => {
            if (isExpelled) return;
            const anchor: FieldAnchor = {
              xPercent: display.x,
              yPercent: display.y,
            };
            const location = resolveStatsbombLocation(display.x, display.y);
            onPlayerClick(player, anchor, location, side);
          }}
          onDragMove={makePlayerDragMove(player.id)}
          onDragEnd={makePlayerDragEnd(player.id, player.position, side)}
        />
      );
    },
    [
      dragPreview,
      getDisplayPosition,
      flipSides,
      disciplinaryStatusByPlayer,
      expelledPlayerIds,
      onPlayerClick,
      makePlayerDragMove,
      makePlayerDragEnd,
    ],
  );

  return (
    <div className="relative w-full px-2 py-2">
      <div className="relative overflow-visible">
        <div
          ref={fieldRef}
          data-testid="soccer-field"
          onClick={handleFieldClick}
          className="w-full aspect-[1.6] bg-green-600 rounded-xl relative overflow-hidden border-4 border-white shadow-inner"
        >
          {/* ─── Field Markings ─── */}
          <div className="absolute inset-0 border-2 border-white opacity-50 m-4" />
          {/* Centre line */}
          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white opacity-50 -translate-x-1/2" />
          {/* Centre circle */}
          <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 opacity-50" />
          {/* Penalty areas */}
          <div className="absolute top-1/2 left-0 w-32 h-64 border-2 border-white -translate-y-1/2 translate-x-4 opacity-50" />
          <div className="absolute top-1/2 right-0 w-32 h-64 border-2 border-white -translate-y-1/2 -translate-x-4 opacity-50" />
          {/* Goal areas */}
          <div className="absolute top-1/2 left-0 w-16 h-32 border-2 border-white -translate-y-1/2 translate-x-4 opacity-30" />
          <div className="absolute top-1/2 right-0 w-16 h-32 border-2 border-white -translate-y-1/2 -translate-x-4 opacity-30" />

          {/* ─── Team labels ─── */}
          <div className="absolute top-2 left-2 text-white font-bold text-xs bg-black/50 px-2 py-1 rounded-md z-20">
            {flipSides ? `${awayTeamName} (Away)` : `${homeTeamName} (Home)`}
          </div>
          <div className="absolute top-2 right-2 text-white font-bold text-xs bg-black/50 px-2 py-1 rounded-md z-20">
            {flipSides ? `${homeTeamName} (Home)` : `${awayTeamName} (Away)`}
          </div>

          {/* ─── Player Nodes ─── */}
          <div className="absolute inset-0 pointer-events-none">
            {homePlayers.map((p) => renderPlayerNode(p, "home"))}
            {awayPlayers.map((p) => renderPlayerNode(p, "away"))}
          </div>

          {/* ─── Overlay (e.g. QuickActionMenu) ─── */}
          {overlay && (
            <div className="absolute inset-0 z-30 pointer-events-none">
              <div className="relative h-full w-full pointer-events-none">
                {overlay}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Edge-bar destination buttons (mirrors SoccerField behaviour) ─── */}
      {onDestinationClick && showDestinationControls && (
        <div className="absolute inset-0 pointer-events-none overflow-visible">
          {/* Top row */}
          {[
            { id: "bar-top-left", label: "OUT L", x: 20, y: 0 },
            { id: "bar-top-center", label: "OUT C", x: 50, y: 0 },
            { id: "bar-top-right", label: "OUT R", x: 80, y: 0 },
          ].map((d) => (
            <button
              key={d.id}
              type="button"
              className="pointer-events-auto absolute z-30 h-8 w-32 rounded-full bg-gradient-to-r from-slate-900/95 via-slate-800/95 to-slate-900/95 text-slate-100 text-[10px] font-semibold border border-slate-400/60 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_8px_20px_rgba(0,0,0,0.35)] hover:from-indigo-900/90 hover:via-indigo-800/90 hover:to-indigo-900/90 hover:border-indigo-300/60 tracking-[0.2em] uppercase transition-colors"
              style={{
                left: `${maybeFlipX(d.x)}%`,
                top: `${d.y}%`,
                transform: "translate(-50%, 0)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onDestinationClick(buildCoordinate(d.x, d.y, flipSides));
              }}
              title="Destination"
            >
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-300/80" />
                {d.label}
              </span>
            </button>
          ))}
          {/* Bottom row */}
          {[
            { id: "bar-bottom-left", label: "OUT L", x: 20, y: 100 },
            { id: "bar-bottom-center", label: "OUT C", x: 50, y: 100 },
            { id: "bar-bottom-right", label: "OUT R", x: 80, y: 100 },
          ].map((d) => (
            <button
              key={d.id}
              type="button"
              className="pointer-events-auto absolute z-30 h-8 w-32 rounded-full bg-gradient-to-r from-slate-900/95 via-slate-800/95 to-slate-900/95 text-slate-100 text-[10px] font-semibold border border-slate-400/60 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_8px_20px_rgba(0,0,0,0.35)] hover:from-indigo-900/90 hover:via-indigo-800/90 hover:to-indigo-900/90 hover:border-indigo-300/60 tracking-[0.2em] uppercase transition-colors"
              style={{
                left: `${maybeFlipX(d.x)}%`,
                top: `${d.y}%`,
                transform: "translate(-50%, -100%)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onDestinationClick(buildCoordinate(d.x, d.y, flipSides));
              }}
              title="Destination"
            >
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-300/80" />
                {d.label}
              </span>
            </button>
          ))}
          {/* Left column */}
          {[
            { id: "bar-left-top", label: "OUT T", x: 0, y: 20 },
            { id: "bar-left-center", label: "OUT C", x: 0, y: 50 },
            { id: "bar-left-bottom", label: "OUT B", x: 0, y: 80 },
          ].map((d) => (
            <button
              key={d.id}
              type="button"
              className="pointer-events-auto absolute z-30 h-24 w-10 rounded-full bg-gradient-to-b from-slate-900/95 via-slate-800/95 to-slate-900/95 text-slate-100 text-[10px] font-semibold border border-slate-400/60 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_8px_20px_rgba(0,0,0,0.35)] hover:from-indigo-900/90 hover:via-indigo-800/90 hover:to-indigo-900/90 hover:border-indigo-300/60 tracking-[0.2em] uppercase transition-colors"
              style={{
                left: `${maybeFlipX(d.x)}%`,
                top: `${d.y}%`,
                transform: "translate(0, -50%)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onDestinationClick(buildCoordinate(d.x, d.y, flipSides));
              }}
              title="Destination"
            >
              <span className="inline-flex items-center gap-2 -rotate-90">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-300/80" />
                {d.label}
              </span>
            </button>
          ))}
          {/* Right column */}
          {[
            { id: "bar-right-top", label: "OUT T", x: 100, y: 20 },
            { id: "bar-right-center", label: "OUT C", x: 100, y: 50 },
            { id: "bar-right-bottom", label: "OUT B", x: 100, y: 80 },
          ].map((d) => (
            <button
              key={d.id}
              type="button"
              className="pointer-events-auto absolute z-30 h-24 w-10 rounded-full bg-gradient-to-b from-slate-900/95 via-slate-800/95 to-slate-900/95 text-slate-100 text-[10px] font-semibold border border-slate-400/60 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_8px_20px_rgba(0,0,0,0.35)] hover:from-indigo-900/90 hover:via-indigo-800/90 hover:to-indigo-900/90 hover:border-indigo-300/60 tracking-[0.2em] uppercase transition-colors"
              style={{
                left: `${maybeFlipX(d.x)}%`,
                top: `${d.y}%`,
                transform: "translate(-100%, -50%)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onDestinationClick(buildCoordinate(d.x, d.y, flipSides));
              }}
              title="Destination"
            >
              <span className="inline-flex items-center gap-2 -rotate-90">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-300/80" />
                {d.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TacticalField;
