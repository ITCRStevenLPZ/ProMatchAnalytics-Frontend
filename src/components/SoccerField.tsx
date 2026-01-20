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
    const isOutOfBounds =
      xPercent < fieldBounds.left ||
      xPercent > fieldBounds.right ||
      yPercent < fieldBounds.top ||
      yPercent > fieldBounds.bottom;
    const clampedX = Math.min(100, Math.max(0, xPercent));
    const clampedY = Math.min(100, Math.max(0, yPercent));
    return {
      xPercent: clampedX,
      yPercent: clampedY,
      statsbomb: resolveStatsbombLocation(clampedX, clampedY),
      isOutOfBounds,
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
        className={`absolute w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer transform -translate-x-1/2 -translate-y-1/2 border-2 shadow-md transition-transform hover:scale-110 ${
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

  return (
    <div
      ref={fieldRef}
      data-testid="soccer-field"
      onClick={handleFieldClick}
      className="w-full aspect-[1.6] bg-green-600 rounded-lg relative overflow-hidden border-4 border-white shadow-inner"
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
  );
};

export default SoccerField;
