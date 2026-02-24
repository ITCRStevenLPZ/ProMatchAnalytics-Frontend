import { useState, useCallback, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TacticalPosition {
  /** x‑percent of the field width (0 = left touchline, 100 = right touchline)
   *  Stored in canonical orientation: home team attacks left→right. */
  x: number;
  /** y‑percent of the field height (0 = top touchline, 100 = bottom touchline) */
  y: number;
}

export type PositionGroup =
  | "goalkeeper"
  | "defense"
  | "midfield"
  | "attack"
  | "other";

interface PositionBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

// ---------------------------------------------------------------------------
// Constants — Default coordinate templates for each specific position
// ---------------------------------------------------------------------------

/** Default x‑coordinate (home side, canonical) for each backend position. */
const DEFAULT_X: Record<string, number> = {
  GK: 5,
  CB: 20,
  LB: 20,
  RB: 20,
  LWB: 28,
  RWB: 28,
  SW: 15,
  CDM: 35,
  CM: 45,
  CAM: 55,
  LM: 45,
  RM: 45,
  LW: 65,
  RW: 65,
  CF: 70,
  ST: 75,
  LF: 70,
  RF: 70,
  SS: 65,
  // Generic abbreviations → map to closest standard position
  MF: 45, // → CM
  DF: 20, // → CB
  FW: 75, // → ST
};

/** Default y‑coordinate for each backend position.
 *  For positions where multiple players may share the same role (e.g. 2× CB),
 *  `resolveDefaultPositions` spreads them evenly. */
const DEFAULT_Y: Record<string, number> = {
  GK: 50,
  CB: 50,
  LB: 15,
  RB: 85,
  LWB: 10,
  RWB: 90,
  SW: 50,
  CDM: 50,
  CM: 50,
  CAM: 50,
  LM: 15,
  RM: 85,
  LW: 15,
  RW: 85,
  CF: 50,
  ST: 50,
  LF: 30,
  RF: 70,
  SS: 50,
  // Generic abbreviations
  MF: 50,
  DF: 50,
  FW: 50,
};

// ---------------------------------------------------------------------------
// Bounds per position group
// ---------------------------------------------------------------------------

const HOME_BOUNDS: Record<PositionGroup, PositionBounds> = {
  goalkeeper: { xMin: 0, xMax: 20, yMin: 15, yMax: 85 },
  defense: { xMin: 5, xMax: 45, yMin: 0, yMax: 100 },
  midfield: { xMin: 15, xMax: 85, yMin: 0, yMax: 100 },
  attack: { xMin: 40, xMax: 95, yMin: 0, yMax: 100 },
  other: { xMin: 0, xMax: 100, yMin: 0, yMax: 100 },
};

/** Mirror bounds for the away team (home bounds reflected). */
const mirrorBounds = (b: PositionBounds): PositionBounds => ({
  xMin: 100 - b.xMax,
  xMax: 100 - b.xMin,
  yMin: b.yMin,
  yMax: b.yMax,
});

// ---------------------------------------------------------------------------
// Utility helpers (exported for testing)
// ---------------------------------------------------------------------------

const normalizePos = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();

export const getPositionGroup = (raw?: string | null): PositionGroup => {
  const n = normalizePos(raw || "");
  if (!n) return "other";
  if (["gk", "goalkeeper", "portero", "keeper"].some((k) => n.includes(k)))
    return "goalkeeper";
  if (
    [
      "def",
      "back",
      "lateral",
      "carrilero",
      "libero",
      "cb",
      "lb",
      "rb",
      "df",
    ].some((k) => n.includes(k))
  )
    return "defense";
  if (
    ["mid", "centro", "medio", "volante", "cm", "dm", "am", "mf"].some((k) =>
      n.includes(k),
    )
  )
    return "midfield";
  if (
    [
      "fwd",
      "forward",
      "att",
      "striker",
      "delantero",
      "extremo",
      "wing",
      "st",
      "cf",
      "fw",
    ].some((k) => n.includes(k))
  )
    return "attack";
  return "other";
};

/** Clamp a position to stay within bounds. */
export const clampToBounds = (
  pos: TacticalPosition,
  bounds: PositionBounds,
): TacticalPosition => ({
  x: Math.min(bounds.xMax, Math.max(bounds.xMin, pos.x)),
  y: Math.min(bounds.yMax, Math.max(bounds.yMin, pos.y)),
});

export const getBoundsForPlayer = (
  positionString: string | undefined,
  side: "home" | "away",
): PositionBounds => {
  const group = getPositionGroup(positionString);
  const base = HOME_BOUNDS[group];
  return side === "away" ? mirrorBounds(base) : base;
};

// ---------------------------------------------------------------------------
// resolveDefaultPositions — compute initial positions for a team's players
// ---------------------------------------------------------------------------

interface PlayerLike {
  id: string;
  position: string;
}

/**
 * Given a list of players for one side, return a map of player‑id → canonical
 * TacticalPosition.  Players that share the same specific position (e.g. two
 * CBs) are spread vertically.
 */
export const resolveDefaultPositions = (
  players: PlayerLike[],
  side: "home" | "away",
): Map<string, TacticalPosition> => {
  const result = new Map<string, TacticalPosition>();
  // Group by normalised position string
  const grouped: Record<string, PlayerLike[]> = {};
  for (const p of players) {
    const key = p.position?.toUpperCase().trim() || "OTHER";
    (grouped[key] ??= []).push(p);
  }

  // Max players per column — keeps minimum ~18 % vertical gap which,
  // at a typical 400 px field height, means ≥72 px between centres while
  // each node is ≈68 px tall.  Prevents visual/pointer overlap.
  const MAX_PER_COL = 5;
  const COL_SPACING_X = 10; // percent between adjacent columns

  for (const [posKey, group] of Object.entries(grouped)) {
    const baseX = DEFAULT_X[posKey] ?? 50;
    const baseY = DEFAULT_Y[posKey] ?? 50;
    const count = group.length;

    const numCols = Math.ceil(count / MAX_PER_COL);
    let playerIdx = 0;

    for (let col = 0; col < numCols; col++) {
      const colSize = Math.min(MAX_PER_COL, count - playerIdx);
      const colX =
        numCols === 1
          ? baseX
          : baseX + (col - (numCols - 1) / 2) * COL_SPACING_X;

      for (let j = 0; j < colSize; j++) {
        let x = colX;
        let y = baseY;
        if (colSize > 1) {
          // 18 % minimum gap keeps 68 px-tall nodes from overlapping
          const spread = Math.max(18, Math.min(30, 60 / colSize));
          const offset = (j - (colSize - 1) / 2) * spread;
          y = Math.min(95, Math.max(5, baseY + offset));
        }
        if (side === "away") {
          x = 100 - x;
        }
        result.set(group[playerIdx].id, { x, y });
        playerIdx++;
      }
    }
  }
  return result;
};

// ---------------------------------------------------------------------------
// Hook — useTacticalPositions
// ---------------------------------------------------------------------------

interface UseTacticalPositionsOptions {
  matchId: string | undefined;
  homePlayers: PlayerLike[];
  awayPlayers: PlayerLike[];
}

export const useTacticalPositions = ({
  matchId,
  homePlayers,
  awayPlayers,
}: UseTacticalPositionsOptions) => {
  // Canonical positions (home = left). Keyed by player id.
  const [positions, setPositions] = useState<Map<string, TacticalPosition>>(
    () => new Map(),
  );
  const prevMatchId = useRef<string | undefined>(undefined);

  // (Re)initialise when match or rosters change
  useEffect(() => {
    if (!matchId) return;
    const isNewMatch = prevMatchId.current !== matchId;
    prevMatchId.current = matchId;
    if (isNewMatch || positions.size === 0) {
      const homeMap = resolveDefaultPositions(homePlayers, "home");
      const awayMap = resolveDefaultPositions(awayPlayers, "away");
      setPositions(new Map([...homeMap, ...awayMap]));
    }
  }, [matchId, homePlayers.length, awayPlayers.length]);

  /** Move a player to a new position, clamped to their bounds. */
  const movePlayer = useCallback(
    (
      playerId: string,
      newPos: TacticalPosition,
      playerPosition: string | undefined,
      side: "home" | "away",
    ) => {
      const bounds = getBoundsForPlayer(playerPosition, side);
      const clamped = clampToBounds(newPos, bounds);
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(playerId, clamped);
        return next;
      });
    },
    [],
  );

  /** When a substitution happens, the incoming player inherits the outgoing
   *  player's position on the tactical field. */
  const applySubstitution = useCallback(
    (playerOffId: string, playerOnId: string) => {
      setPositions((prev) => {
        const pos = prev.get(playerOffId);
        if (!pos) return prev;
        const next = new Map(prev);
        next.delete(playerOffId);
        next.set(playerOnId, { ...pos });
        return next;
      });
    },
    [],
  );

  /** Get the display position, flipped if needed. */
  const getDisplayPosition = useCallback(
    (playerId: string, flipSides: boolean): TacticalPosition => {
      const canonical = positions.get(playerId) ?? { x: 50, y: 50 };
      if (flipSides) return { x: 100 - canonical.x, y: canonical.y };
      return canonical;
    },
    [positions],
  );

  /** Convert a display‑space drag delta back to canonical position. */
  const movePlayerFromDisplay = useCallback(
    (
      playerId: string,
      displayPos: TacticalPosition,
      flipSides: boolean,
      playerPosition: string | undefined,
      side: "home" | "away",
    ) => {
      const canonical = flipSides
        ? { x: 100 - displayPos.x, y: displayPos.y }
        : displayPos;
      movePlayer(playerId, canonical, playerPosition, side);
    },
    [movePlayer],
  );

  /** Ensure a newly-entered player (substitution) gets placed. */
  const ensurePlayer = useCallback(
    (playerId: string, fallbackPos: TacticalPosition) => {
      setPositions((prev) => {
        if (prev.has(playerId)) return prev;
        const next = new Map(prev);
        next.set(playerId, fallbackPos);
        return next;
      });
    },
    [],
  );

  return {
    positions,
    movePlayer,
    movePlayerFromDisplay,
    applySubstitution,
    getDisplayPosition,
    ensurePlayer,
  };
};
