import React, { useCallback, useMemo, useRef } from "react";
import { FieldAnchor, FieldCoordinate } from "../pages/logger/types";

interface Player {
  id: string;
  full_name: string;
  jersey_number: number;
  position: string;
}

type PositionGroup = "goalkeeper" | "defense" | "midfield" | "attack" | "other";

const POSITION_GROUP_ORDER: PositionGroup[] = [
  "goalkeeper",
  "defense",
  "midfield",
  "attack",
  "other",
];

const normalizePosition = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();

const getPositionGroup = (raw?: string | null): PositionGroup => {
  const normalized = normalizePosition(raw || "");
  if (!normalized) return "other";
  if (
    normalized.includes("gk") ||
    normalized.includes("goalkeeper") ||
    normalized.includes("portero") ||
    normalized.includes("keeper")
  ) {
    return "goalkeeper";
  }
  if (
    normalized.includes("def") ||
    normalized.includes("back") ||
    normalized.includes("lateral") ||
    normalized.includes("carrilero") ||
    normalized.includes("libero") ||
    normalized.includes("cb") ||
    normalized.includes("lb") ||
    normalized.includes("rb")
  ) {
    return "defense";
  }
  if (
    normalized.includes("mid") ||
    normalized.includes("centro") ||
    normalized.includes("medio") ||
    normalized.includes("volante") ||
    normalized.includes("cm") ||
    normalized.includes("dm") ||
    normalized.includes("am")
  ) {
    return "midfield";
  }
  if (
    normalized.includes("fwd") ||
    normalized.includes("forward") ||
    normalized.includes("att") ||
    normalized.includes("striker") ||
    normalized.includes("delantero") ||
    normalized.includes("extremo") ||
    normalized.includes("wing") ||
    normalized.includes("st") ||
    normalized.includes("cf")
  ) {
    return "attack";
  }
  return "other";
};

const getGroupMeta = (group: PositionGroup) => {
  switch (group) {
    case "goalkeeper":
      return {
        dot: "bg-cyan-500",
        border: "border-cyan-500/70",
        badge: "bg-cyan-500/10 text-cyan-800 border-cyan-500/40",
      };
    case "defense":
      return {
        dot: "bg-emerald-500",
        border: "border-emerald-500/70",
        badge: "bg-emerald-500/10 text-emerald-800 border-emerald-500/40",
      };
    case "midfield":
      return {
        dot: "bg-amber-500",
        border: "border-amber-500/70",
        badge: "bg-amber-500/10 text-amber-800 border-amber-500/40",
      };
    case "attack":
      return {
        dot: "bg-rose-500",
        border: "border-rose-500/70",
        badge: "bg-rose-500/10 text-rose-800 border-rose-500/40",
      };
    default:
      return {
        dot: "bg-slate-500",
        border: "border-slate-400/70",
        badge: "bg-slate-500/10 text-slate-800 border-slate-400/40",
      };
  }
};

const sortPlayersByGroup = (players: Player[]) =>
  [...players].sort((a, b) => {
    const groupA = getPositionGroup(a.position);
    const groupB = getPositionGroup(b.position);
    const groupDelta =
      POSITION_GROUP_ORDER.indexOf(groupA) -
      POSITION_GROUP_ORDER.indexOf(groupB);
    if (groupDelta !== 0) return groupDelta;
    return a.jersey_number - b.jersey_number;
  });

interface SoccerFieldProps {
  homeTeamName: string;
  awayTeamName: string;
  homePlayers: Player[];
  awayPlayers: Player[];
  disciplinaryStatusByPlayer?: Record<
    string,
    { yellowCount: number; red: boolean }
  >;
  onPlayerClick: (
    player: Player,
    anchor: FieldAnchor,
    location: [number, number],
    side: "home" | "away",
  ) => void;
  onDestinationClick?: (coordinate: FieldCoordinate) => void;
  showDestinationControls?: boolean;
  overlay?: React.ReactNode;
  flipSides?: boolean;
}

const SoccerField: React.FC<SoccerFieldProps> = ({
  homeTeamName,
  awayTeamName,
  homePlayers,
  awayPlayers,
  disciplinaryStatusByPlayer,
  onPlayerClick,
  onDestinationClick,
  overlay,
  showDestinationControls = false,
  flipSides = false,
}) => {
  const fieldRef = useRef<HTMLDivElement | null>(null);

  const fieldBounds = useMemo(
    () => ({ left: 4, right: 96, top: 4, bottom: 96 }),
    [],
  );

  const maybeFlipX = useCallback(
    (xPercent: number) => (flipSides ? 100 - xPercent : xPercent),
    [flipSides],
  );
  // Simple formation mapping for demo purposes
  // In a real app, this would be dynamic based on formation data
  const getPositionCoordinates = (index: number, side: "home" | "away") => {
    const displaySide = flipSides ? (side === "home" ? "away" : "home") : side;
    // GK is always first/last
    if (index === 0)
      return displaySide === "home" ? { x: 5, y: 50 } : { x: 95, y: 50 };

    // Distribute rest
    const outfieldIndex = index - 1;

    // Simple 4-4-2 distribution logic
    let x = 0;
    let y = 0;

    if (displaySide === "home") {
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
    const flippedX = maybeFlipX(xPercent);
    let outOfBoundsEdge: FieldCoordinate["outOfBoundsEdge"] = null;
    const isOutOfBounds =
      flippedX < fieldBounds.left ||
      flippedX > fieldBounds.right ||
      yPercent < fieldBounds.top ||
      yPercent > fieldBounds.bottom;
    if (flippedX < fieldBounds.left) {
      outOfBoundsEdge = "left";
    } else if (flippedX > fieldBounds.right) {
      outOfBoundsEdge = "right";
    } else if (yPercent < fieldBounds.top) {
      outOfBoundsEdge = "top";
    } else if (yPercent > fieldBounds.bottom) {
      outOfBoundsEdge = "bottom";
    }
    const clampedX = Math.min(100, Math.max(0, flippedX));
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

  const renderPlayerListItem = (
    player: Player,
    index: number,
    side: "home" | "away",
  ) => {
    const { x, y } = getPositionCoordinates(index, side);
    const anchor = { xPercent: x, yPercent: y } satisfies FieldAnchor;
    const location = resolveStatsbombLocation(x, y);
    const isHome = side === "home";
    const group = getPositionGroup(player.position);
    const meta = getGroupMeta(group);
    const cardStatus = disciplinaryStatusByPlayer?.[player.id];
    const hasYellow = (cardStatus?.yellowCount || 0) > 0;
    const hasRed = Boolean(cardStatus?.red);

    return (
      <button
        key={player.id}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onPlayerClick(player, anchor, location, side);
        }}
        data-testid={`field-player-${player.id}`}
        data-player-row="true"
        data-position-group={group}
        className={`pointer-events-auto w-full max-w-[clamp(340px,32vw,520px)] rounded-md border-l-4 px-[clamp(0.72rem,0.58rem+0.42vw,1.35rem)] py-[clamp(0.44rem,0.32rem+0.28vw,1rem)] text-left text-[clamp(0.84rem,0.7rem+0.34vw,1.2rem)] font-semibold shadow-sm transition-colors ${
          isHome
            ? "border-red-300 bg-white/95 text-slate-900"
            : "border-blue-300 bg-white/95 text-slate-900"
        } ${meta.border}`}
        title={`${player.full_name} (${player.position})`}
      >
        <div className="flex items-center gap-[clamp(0.5rem,0.38rem+0.24vw,1rem)]">
          <span
            className={`h-[clamp(0.5rem,0.38rem+0.2vw,0.85rem)] w-[clamp(0.5rem,0.38rem+0.2vw,0.85rem)] rounded-full ${meta.dot}`}
          />
          <span
            data-testid={`field-player-number-${player.id}`}
            className="inline-flex min-w-[clamp(1.7rem,1.35rem+0.5vw,2.7rem)] items-center justify-center rounded-full bg-slate-900 text-white text-[clamp(0.72rem,0.6rem+0.24vw,1.08rem)] px-[clamp(0.42rem,0.32rem+0.18vw,0.78rem)] py-[clamp(0.2rem,0.16rem+0.1vw,0.4rem)]"
          >
            {player.jersey_number}
          </span>
          <span
            data-testid={`field-player-name-${player.id}`}
            className="flex-1 truncate text-[clamp(0.82rem,0.68rem+0.34vw,1.2rem)]"
          >
            {player.full_name}
          </span>
          <span
            data-testid={`field-player-position-${player.id}`}
            className={`text-[clamp(0.66rem,0.54rem+0.2vw,0.96rem)] uppercase tracking-wider border px-[clamp(0.4rem,0.3rem+0.16vw,0.72rem)] py-[clamp(0.18rem,0.14rem+0.1vw,0.38rem)] rounded-full ${meta.badge}`}
          >
            {player.position}
          </span>
          {hasYellow && (
            <span
              data-testid={`field-player-status-yellow-${player.id}`}
              className="inline-flex items-center gap-[clamp(0.18rem,0.12rem+0.08vw,0.32rem)] rounded-md border border-yellow-500/60 bg-yellow-500/20 px-[clamp(0.25rem,0.2rem+0.12vw,0.45rem)] py-[clamp(0.2rem,0.16rem+0.1vw,0.38rem)]"
            >
              {Array.from({
                length: Math.max(1, cardStatus?.yellowCount || 0),
              }).map((_, index) => (
                <span
                  key={`${player.id}-field-yellow-${index}`}
                  className="h-[clamp(0.64rem,0.54rem+0.24vw,0.92rem)] w-[clamp(0.24rem,0.2rem+0.1vw,0.38rem)] rounded-sm bg-yellow-500"
                />
              ))}
            </span>
          )}
          {hasRed && (
            <span
              data-testid={`field-player-status-red-${player.id}`}
              className="inline-flex items-center rounded-md border border-red-500/70 bg-red-500/20 px-[clamp(0.25rem,0.2rem+0.12vw,0.45rem)] py-[clamp(0.2rem,0.16rem+0.1vw,0.38rem)]"
            >
              <span className="h-[clamp(0.64rem,0.54rem+0.24vw,0.92rem)] w-[clamp(0.24rem,0.2rem+0.1vw,0.38rem)] rounded-sm bg-red-600" />
            </span>
          )}
        </div>
      </button>
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

  const resolveEdgeBar = useCallback(
    (dest: { id: string; label: string; x: number; y: number }) => ({
      ...dest,
      x: maybeFlipX(dest.x),
    }),
    [maybeFlipX],
  );

  return (
    <div className="relative w-full px-6 py-6">
      <div className="relative overflow-visible">
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
          <div className="absolute top-2 left-2 text-white font-bold text-sm sm:text-base bg-black/45 px-2.5 py-1.5 rounded-md">
            {flipSides ? `${awayTeamName} (Away)` : `${homeTeamName} (Home)`}
          </div>
          <div className="absolute top-2 right-2 text-white font-bold text-sm sm:text-base bg-black/45 px-2.5 py-1.5 rounded-md">
            {flipSides ? `${homeTeamName} (Home)` : `${awayTeamName} (Away)`}
          </div>

          {/* Players (list layout) */}
          <div className="absolute inset-0 flex items-center justify-between px-6 py-10 pointer-events-none">
            <div
              className="w-[40%] 2xl:w-[30%] 2xl:max-w-[360px] space-y-2"
              data-testid="field-side-left"
            >
              {sortPlayersByGroup(flipSides ? awayPlayers : homePlayers).map(
                (p, i) =>
                  renderPlayerListItem(p, i, flipSides ? "away" : "home"),
              )}
            </div>
            <div
              className="w-[40%] 2xl:w-[30%] 2xl:max-w-[360px] space-y-2 flex flex-col items-end"
              data-testid="field-side-right"
            >
              {sortPlayersByGroup(flipSides ? homePlayers : awayPlayers).map(
                (p, i) =>
                  renderPlayerListItem(p, i, flipSides ? "home" : "away"),
              )}
            </div>
          </div>
          {overlay ? (
            <div className="absolute inset-0 z-20 pointer-events-none">
              <div className="relative h-full w-full pointer-events-none">
                {overlay}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {onDestinationClick && showDestinationControls && (
        <div className="absolute inset-0 pointer-events-none overflow-visible">
          {edgeBars.top.map((dest) => {
            const resolved = resolveEdgeBar(dest);
            return (
              <button
                key={dest.id}
                type="button"
                className="pointer-events-auto absolute z-30 h-8 w-32 rounded-full bg-gradient-to-r from-slate-900/95 via-slate-800/95 to-slate-900/95 text-slate-100 text-[10px] font-semibold border border-slate-400/60 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_8px_20px_rgba(0,0,0,0.35)] hover:from-indigo-900/90 hover:via-indigo-800/90 hover:to-indigo-900/90 hover:border-indigo-300/60 tracking-[0.2em] uppercase transition-colors"
                style={{
                  left: `${resolved.x}%`,
                  top: `${resolved.y}%`,
                  transform: "translate(-50%, 0)",
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onDestinationClick(buildCoordinate(resolved.x, resolved.y));
                }}
                title="Destination"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-300/80" />
                  {resolved.label}
                </span>
              </button>
            );
          })}
          {edgeBars.bottom.map((dest) => {
            const resolved = resolveEdgeBar(dest);
            return (
              <button
                key={dest.id}
                type="button"
                className="pointer-events-auto absolute z-30 h-8 w-32 rounded-full bg-gradient-to-r from-slate-900/95 via-slate-800/95 to-slate-900/95 text-slate-100 text-[10px] font-semibold border border-slate-400/60 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_8px_20px_rgba(0,0,0,0.35)] hover:from-indigo-900/90 hover:via-indigo-800/90 hover:to-indigo-900/90 hover:border-indigo-300/60 tracking-[0.2em] uppercase transition-colors"
                style={{
                  left: `${resolved.x}%`,
                  top: `${resolved.y}%`,
                  transform: "translate(-50%, -100%)",
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onDestinationClick(buildCoordinate(resolved.x, resolved.y));
                }}
                title="Destination"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-300/80" />
                  {resolved.label}
                </span>
              </button>
            );
          })}
          {edgeBars.left.map((dest) => {
            const resolved = resolveEdgeBar(dest);
            return (
              <button
                key={dest.id}
                type="button"
                className="pointer-events-auto absolute z-30 h-24 w-10 rounded-full bg-gradient-to-b from-slate-900/95 via-slate-800/95 to-slate-900/95 text-slate-100 text-[10px] font-semibold border border-slate-400/60 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_8px_20px_rgba(0,0,0,0.35)] hover:from-indigo-900/90 hover:via-indigo-800/90 hover:to-indigo-900/90 hover:border-indigo-300/60 tracking-[0.2em] uppercase transition-colors"
                style={{
                  left: `${resolved.x}%`,
                  top: `${resolved.y}%`,
                  transform: "translate(0, -50%)",
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onDestinationClick(buildCoordinate(resolved.x, resolved.y));
                }}
                title="Destination"
              >
                <span className="inline-flex items-center gap-2 -rotate-90">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-300/80" />
                  {resolved.label}
                </span>
              </button>
            );
          })}
          {edgeBars.right.map((dest) => {
            const resolved = resolveEdgeBar(dest);
            return (
              <button
                key={dest.id}
                type="button"
                className="pointer-events-auto absolute z-30 h-24 w-10 rounded-full bg-gradient-to-b from-slate-900/95 via-slate-800/95 to-slate-900/95 text-slate-100 text-[10px] font-semibold border border-slate-400/60 shadow-[0_0_0_1px_rgba(15,23,42,0.6),0_8px_20px_rgba(0,0,0,0.35)] hover:from-indigo-900/90 hover:via-indigo-800/90 hover:to-indigo-900/90 hover:border-indigo-300/60 tracking-[0.2em] uppercase transition-colors"
                style={{
                  left: `${resolved.x}%`,
                  top: `${resolved.y}%`,
                  transform: "translate(-100%, -50%)",
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onDestinationClick(buildCoordinate(resolved.x, resolved.y));
                }}
                title="Destination"
              >
                <span className="inline-flex items-center gap-2 -rotate-90">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-300/80" />
                  {resolved.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SoccerField;
