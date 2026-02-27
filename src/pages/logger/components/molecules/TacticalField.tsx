import React, { useCallback, useRef, useState } from "react";
import TacticalPlayerNode from "./TacticalPlayerNode";
import type { TacticalPosition } from "../../hooks/useTacticalPositions";
import {
  getBoundsForPlayer,
  getPositionGroup,
  MIN_PLAYER_SEPARATION,
} from "../../hooks/useTacticalPositions";
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
  /** Currently-dragged player id — used for bounds overlay + collision ghosts. */
  draggingPlayerId?: string | null;
  /** Setter so inner TacticalPlayerNode can propagate drag‑start/end. */
  onDragStart?: (playerId: string) => void;
  onDragStop?: () => void;
  /** All canonical positions — used for collision‑avoidance proximity rings. */
  allPositions?: Map<string, TacticalPosition>;
  /** When true, prevent player node dragging. */
  dragLocked?: boolean;
  /** When set, only render player nodes whose id is in this set. */
  visiblePlayerIds?: Set<string>;
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
  visiblePlayerIds,
  draggingPlayerId = null,
  onDragStart,
  onDragStop,
  allPositions,
  dragLocked = false,
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
        onDragStop?.();
        onPlayerDragEnd(playerId, displayX, displayY, playerPosition, side);
      },
    [onPlayerDragEnd, onDragStop],
  );

  const makePlayerDragMove = useCallback(
    (playerId: string) => (displayX: number, displayY: number) => {
      setDragPreview({ id: playerId, x: displayX, y: displayY });
      onDragStart?.(playerId);
    },
    [onDragStart],
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
          dragLocked={dragLocked}
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
      dragLocked,
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

          {/* ─── Drag bounds overlay ─── */}
          {draggingPlayerId &&
            (() => {
              // Find the dragged player's position and side
              const allPlayers = [
                ...homePlayers.map((p) => ({ ...p, side: "home" as const })),
                ...awayPlayers.map((p) => ({ ...p, side: "away" as const })),
              ];
              const draggedPlayer = allPlayers.find(
                (p) => p.id === draggingPlayerId,
              );
              if (!draggedPlayer) return null;
              const bounds = getBoundsForPlayer(
                draggedPlayer.position,
                draggedPlayer.side,
              );
              // Convert bounds to display space (may need flip)
              const displayBounds = flipSides
                ? {
                    xMin: 100 - bounds.xMax,
                    xMax: 100 - bounds.xMin,
                    yMin: bounds.yMin,
                    yMax: bounds.yMax,
                  }
                : bounds;
              const group = getPositionGroup(draggedPlayer.position);
              const colorMap: Record<string, string> = {
                goalkeeper: "rgba(255, 220, 0, 0.15)",
                defense: "rgba(59, 130, 246, 0.12)",
                midfield: "rgba(34, 197, 94, 0.12)",
                attack: "rgba(239, 68, 68, 0.12)",
                other: "rgba(255, 255, 255, 0.08)",
              };
              const borderColorMap: Record<string, string> = {
                goalkeeper: "rgba(255, 220, 0, 0.6)",
                defense: "rgba(59, 130, 246, 0.5)",
                midfield: "rgba(34, 197, 94, 0.5)",
                attack: "rgba(239, 68, 68, 0.5)",
                other: "rgba(255, 255, 255, 0.3)",
              };
              return (
                <div
                  data-testid="drag-bounds-overlay"
                  className="absolute pointer-events-none z-[5] transition-opacity duration-150"
                  style={{
                    left: `${displayBounds.xMin}%`,
                    top: `${displayBounds.yMin}%`,
                    width: `${displayBounds.xMax - displayBounds.xMin}%`,
                    height: `${displayBounds.yMax - displayBounds.yMin}%`,
                    backgroundColor: colorMap[group] ?? colorMap.other,
                    border: `2px dashed ${
                      borderColorMap[group] ?? borderColorMap.other
                    }`,
                    borderRadius: "8px",
                  }}
                />
              );
            })()}

          {/* ─── Collision proximity rings (shown during drag) ─── */}
          {draggingPlayerId &&
            allPositions &&
            (() => {
              const rings: React.ReactNode[] = [];
              for (const [pid, pos] of allPositions) {
                if (pid === draggingPlayerId) continue;
                const display = flipSides ? { x: 100 - pos.x, y: pos.y } : pos;
                rings.push(
                  <div
                    key={`ring-${pid}`}
                    className="absolute pointer-events-none z-[4] rounded-full border border-white/20"
                    style={{
                      left: `${display.x}%`,
                      top: `${display.y}%`,
                      width: `${MIN_PLAYER_SEPARATION * 2}%`,
                      height: `${MIN_PLAYER_SEPARATION * 2}%`,
                      transform: "translate(-50%, -50%)",
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                    }}
                  />,
                );
              }
              return rings;
            })()}

          {/* ─── Player Nodes ─── */}
          <div className="absolute inset-0 pointer-events-none">
            {homePlayers
              .filter((p) => !visiblePlayerIds || visiblePlayerIds.has(p.id))
              .map((p) => renderPlayerNode(p, "home"))}
            {awayPlayers
              .filter((p) => !visiblePlayerIds || visiblePlayerIds.has(p.id))
              .map((p) => renderPlayerNode(p, "away"))}
          </div>

          {/* ─── Overlay (e.g. QuickActionMenu) ─── */}
          {overlay && (
            <div
              className="absolute inset-0 z-30 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="relative h-full w-full">{overlay}</div>
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
