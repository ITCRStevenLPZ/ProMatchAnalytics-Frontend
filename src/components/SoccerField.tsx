import React, { useCallback, useMemo, useRef } from "react";
import { FieldAnchor, FieldCoordinate } from "../pages/logger/types";

interface Player {
  id: string;
  full_name: string;
  jersey_number: number;
  position: string;
}

interface SoccerFieldProps {
  homeTeamName: string;
  awayTeamName: string;
  homePlayers: Player[];
  awayPlayers: Player[];
  onPlayerClick: (
    player: Player,
    anchor: FieldAnchor,
    location: [number, number],
    side: "home" | "away",
  ) => void;
  onDestinationClick?: (coordinate: FieldCoordinate) => void;
  showDestinationControls?: boolean;
  overlay?: React.ReactNode;
}

const SoccerField: React.FC<SoccerFieldProps> = ({
  homeTeamName,
  awayTeamName,
  homePlayers,
  awayPlayers,
  onPlayerClick,
  onDestinationClick,
  overlay,
  showDestinationControls = false,
}) => {
  const fieldRef = useRef<HTMLDivElement | null>(null);

  const fieldBounds = useMemo(
    () => ({ left: 4, right: 96, top: 4, bottom: 96 }),
    [],
  );
  // Simple formation mapping for demo purposes
  // In a real app, this would be dynamic based on formation data
  const getPositionCoordinates = (index: number, side: "home" | "away") => {
    // GK is always first/last
    if (index === 0)
      return side === "home" ? { x: 5, y: 50 } : { x: 95, y: 50 };

    // Distribute rest
    const outfieldIndex = index - 1;

    // Simple 4-4-2 distribution logic
    let x = 0;
    let y = 0;

    if (side === "home") {
      if (outfieldIndex < 4) {
        // Defenders
        x = 20;
        y = 10 + outfieldIndex * (80 / 3);
      } else if (outfieldIndex < 8) {
        // Midfielders
        x = 45;
        y = 10 + (outfieldIndex - 4) * (80 / 3);
      } else {
        // Forwards
        x = 70;
        y = 35 + (outfieldIndex - 8) * 30;
      }
    } else {
      if (outfieldIndex < 4) {
        // Defenders
        x = 80;
        y = 10 + outfieldIndex * (80 / 3);
      } else if (outfieldIndex < 8) {
        // Midfielders
        x = 55;
        y = 10 + (outfieldIndex - 4) * (80 / 3);
      } else {
        // Forwards
        x = 30;
        y = 35 + (outfieldIndex - 8) * 30;
      }
    }

    return { x, y };
  };

  const resolveStatsbombLocation = (xPercent: number, yPercent: number) =>
    [Number((xPercent / 100) * 120), Number((yPercent / 100) * 80)] as [
      number,
      number,
    ];

  const buildCoordinate = (
    xPercent: number,
    yPercent: number,
  ): FieldCoordinate => {
    let outOfBoundsEdge: FieldCoordinate["outOfBoundsEdge"] = null;
    const isOutOfBounds =
      xPercent < fieldBounds.left ||
      xPercent > fieldBounds.right ||
      yPercent < fieldBounds.top ||
      yPercent > fieldBounds.bottom;
    if (xPercent < fieldBounds.left) {
      outOfBoundsEdge = "left";
    } else if (xPercent > fieldBounds.right) {
      outOfBoundsEdge = "right";
    } else if (yPercent < fieldBounds.top) {
      outOfBoundsEdge = "top";
    } else if (yPercent > fieldBounds.bottom) {
      outOfBoundsEdge = "bottom";
    }
    const clampedX = Math.min(100, Math.max(0, xPercent));
    const clampedY = Math.min(100, Math.max(0, yPercent));
    return {
      xPercent: clampedX,
      yPercent: clampedY,
      statsbomb: resolveStatsbombLocation(clampedX, clampedY),
      isOutOfBounds,
      outOfBoundsEdge,
    };
  };

  const handleFieldClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onDestinationClick || !fieldRef.current) return;
      const rect = fieldRef.current.getBoundingClientRect();
      const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
      const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
      onDestinationClick(buildCoordinate(xPercent, yPercent));
    },
    [onDestinationClick],
  );

  const renderPlayer = (
    player: Player,
    index: number,
    side: "home" | "away",
  ) => {
    const { x, y } = getPositionCoordinates(index, side);
    const isHome = side === "home";
    const anchor = { xPercent: x, yPercent: y } satisfies FieldAnchor;
    const location = resolveStatsbombLocation(x, y);

    return (
      <div
        key={player.id}
        onClick={(event) => {
          event.stopPropagation();
          onPlayerClick(player, anchor, location, side);
        }}
        data-testid={`field-player-${player.id}`}
        className={`absolute w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer transform -translate-x-1/2 -translate-y-1/2 border-2 shadow-md transition-transform hover:scale-110 ${
          isHome
            ? "bg-red-600 text-white border-white"
            : "bg-blue-600 text-white border-white"
        }`}
        style={{ left: `${x}%`, top: `${y}%` }}
        title={`${player.full_name} (${player.position})`}
      >
        {player.jersey_number}
      </div>
    );
  };

  const edgeBars = {
    top: [
      { id: "bar-top-left", label: "OUT L", x: 20, y: 0 },
      { id: "bar-top-center", label: "OUT C", x: 50, y: 0 },
      { id: "bar-top-right", label: "OUT R", x: 80, y: 0 },
    ],
    bottom: [
      { id: "bar-bottom-left", label: "OUT L", x: 20, y: 100 },
      { id: "bar-bottom-center", label: "OUT C", x: 50, y: 100 },
      { id: "bar-bottom-right", label: "OUT R", x: 80, y: 100 },
    ],
    left: [
      { id: "bar-left-top", label: "OUT T", x: 0, y: 20 },
      { id: "bar-left-center", label: "OUT C", x: 0, y: 50 },
      { id: "bar-left-bottom", label: "OUT B", x: 0, y: 80 },
    ],
    right: [
      { id: "bar-right-top", label: "OUT T", x: 100, y: 20 },
      { id: "bar-right-center", label: "OUT C", x: 100, y: 50 },
      { id: "bar-right-bottom", label: "OUT B", x: 100, y: 80 },
    ],
  };

  return (
    <div className="relative w-full px-6 py-6">
      <div
        ref={fieldRef}
        data-testid="soccer-field"
        onClick={handleFieldClick}
        className="w-full aspect-[1.6] bg-green-600 rounded-xl relative overflow-hidden border-4 border-white shadow-inner"
      >
        {/* Field Markings */}
        <div className="absolute inset-0 border-2 border-white opacity-50 m-4"></div>
        <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white opacity-50 transform -translate-x-1/2"></div>
        <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white rounded-full transform -translate-x-1/2 -translate-y-1/2 opacity-50"></div>

        {/* Penalty Areas */}
        <div className="absolute top-1/2 left-0 w-32 h-64 border-2 border-white transform -translate-y-1/2 translate-x-4 opacity-50"></div>
        <div className="absolute top-1/2 right-0 w-32 h-64 border-2 border-white transform -translate-y-1/2 -translate-x-4 opacity-50"></div>

        {/* Team Labels */}
        <div className="absolute top-2 left-2 text-white font-bold text-sm bg-black bg-opacity-30 px-2 py-1 rounded">
          {homeTeamName} (Home)
        </div>
        <div className="absolute top-2 right-2 text-white font-bold text-sm bg-black bg-opacity-30 px-2 py-1 rounded">
          {awayTeamName} (Away)
        </div>

        {overlay}

        {/* Players */}
        {homePlayers.map((p, i) => renderPlayer(p, i, "home"))}
        {awayPlayers.map((p, i) => renderPlayer(p, i, "away"))}
      </div>

      {onDestinationClick && showDestinationControls && (
        <div className="absolute inset-0 pointer-events-none overflow-visible">
          {edgeBars.top.map((dest) => (
            <button
              key={dest.id}
              type="button"
              className="pointer-events-auto absolute z-30 h-8 w-32 rounded-full bg-gradient-to-r from-slate-900/95 via-slate-800/95 to-slate-900/95 text-slate-100 text-[10px] font-semibold border border-slate-400/60 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_8px_20px_rgba(0,0,0,0.35)] hover:from-indigo-900/90 hover:via-indigo-800/90 hover:to-indigo-900/90 hover:border-indigo-300/60 tracking-[0.2em] uppercase transition-colors"
              style={{
                left: `${dest.x}%`,
                top: `${dest.y}%`,
                transform: "translate(-50%, 0)",
              }}
              onClick={(event) => {
                event.stopPropagation();
                onDestinationClick(buildCoordinate(dest.x, dest.y));
              }}
              title="Destination"
            >
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-300/80" />
                {dest.label}
              </span>
            </button>
          ))}
          {edgeBars.bottom.map((dest) => (
            <button
              key={dest.id}
              type="button"
              className="pointer-events-auto absolute z-30 h-8 w-32 rounded-full bg-gradient-to-r from-slate-900/95 via-slate-800/95 to-slate-900/95 text-slate-100 text-[10px] font-semibold border border-slate-400/60 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_8px_20px_rgba(0,0,0,0.35)] hover:from-indigo-900/90 hover:via-indigo-800/90 hover:to-indigo-900/90 hover:border-indigo-300/60 tracking-[0.2em] uppercase transition-colors"
              style={{
                left: `${dest.x}%`,
                top: `${dest.y}%`,
                transform: "translate(-50%, -100%)",
              }}
              onClick={(event) => {
                event.stopPropagation();
                onDestinationClick(buildCoordinate(dest.x, dest.y));
              }}
              title="Destination"
            >
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-300/80" />
                {dest.label}
              </span>
            </button>
          ))}
          {edgeBars.left.map((dest) => (
            <button
              key={dest.id}
              type="button"
              className="pointer-events-auto absolute z-30 h-24 w-10 rounded-full bg-gradient-to-b from-slate-900/95 via-slate-800/95 to-slate-900/95 text-slate-100 text-[10px] font-semibold border border-slate-400/60 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_8px_20px_rgba(0,0,0,0.35)] hover:from-indigo-900/90 hover:via-indigo-800/90 hover:to-indigo-900/90 hover:border-indigo-300/60 tracking-[0.2em] uppercase transition-colors"
              style={{
                left: `${dest.x}%`,
                top: `${dest.y}%`,
                transform: "translate(0, -50%)",
              }}
              onClick={(event) => {
                event.stopPropagation();
                onDestinationClick(buildCoordinate(dest.x, dest.y));
              }}
              title="Destination"
            >
              <span className="inline-flex items-center gap-2 -rotate-90">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-300/80" />
                {dest.label}
              </span>
            </button>
          ))}
          {edgeBars.right.map((dest) => (
            <button
              key={dest.id}
              type="button"
              className="pointer-events-auto absolute z-30 h-24 w-10 rounded-full bg-gradient-to-b from-slate-900/95 via-slate-800/95 to-slate-900/95 text-slate-100 text-[10px] font-semibold border border-slate-400/60 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_8px_20px_rgba(0,0,0,0.35)] hover:from-indigo-900/90 hover:via-indigo-800/90 hover:to-indigo-900/90 hover:border-indigo-300/60 tracking-[0.2em] uppercase transition-colors"
              style={{
                left: `${dest.x}%`,
                top: `${dest.y}%`,
                transform: "translate(-100%, -50%)",
              }}
              onClick={(event) => {
                event.stopPropagation();
                onDestinationClick(buildCoordinate(dest.x, dest.y));
              }}
              title="Destination"
            >
              <span className="inline-flex items-center gap-2 -rotate-90">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-300/80" />
                {dest.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SoccerField;
