import { useState, useCallback, useRef, useEffect } from "react";
import { get, set } from "idb-keyval";

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
// Formation types
// ---------------------------------------------------------------------------

/**
 * A formation is an array of numbers representing the count of outfield
 * players in each vertical line from defense → attack.
 * Example: [4, 4, 2] = 4‑4‑2, [4, 3, 3] = 4‑3‑3, [3, 5, 2] = 3‑5‑2.
 * The GK is always implicitly placed and NOT counted in the sum.
 * The sum MUST equal 10 (outfield players).
 */
export type Formation = number[];

export interface FormationPreset {
  label: string;
  formation: Formation;
}

/** Predefined formation library — sorted by popularity. */
export const FORMATION_PRESETS: FormationPreset[] = [
  { label: "4-4-2", formation: [4, 4, 2] },
  { label: "4-3-3", formation: [4, 3, 3] },
  { label: "4-2-3-1", formation: [4, 2, 3, 1] },
  { label: "4-4-1-1", formation: [4, 4, 1, 1] },
  { label: "3-5-2", formation: [3, 5, 2] },
  { label: "3-4-3", formation: [3, 4, 3] },
  { label: "4-1-4-1", formation: [4, 1, 4, 1] },
  { label: "4-3-2-1", formation: [4, 3, 2, 1] },
  { label: "4-5-1", formation: [4, 5, 1] },
  { label: "5-3-2", formation: [5, 3, 2] },
  { label: "5-4-1", formation: [5, 4, 1] },
  { label: "4-1-2-1-2", formation: [4, 1, 2, 1, 2] },
  { label: "3-4-1-2", formation: [3, 4, 1, 2] },
];

/** Validate a formation: must sum to 10 and have 2-6 lines. */
export const isValidFormation = (f: Formation): boolean =>
  f.length >= 2 &&
  f.length <= 6 &&
  f.every((n) => n >= 1 && Number.isInteger(n)) &&
  f.reduce((a, b) => a + b, 0) === 10;

/** Parse a formation string like "4-3-3" into a Formation array. */
export const parseFormationString = (s: string): Formation | null => {
  const parts = s.replace(/\s/g, "").split("-").map(Number);
  if (parts.some(isNaN)) return null;
  return isValidFormation(parts) ? parts : null;
};

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
  // Keep every team on its own half pre-match; away bounds are mirrored.
  defense: { xMin: 5, xMax: 40, yMin: 0, yMax: 100 },
  midfield: { xMin: 18, xMax: 49, yMin: 0, yMax: 100 },
  attack: { xMin: 30, xMax: 49, yMin: 0, yMax: 100 },
  other: { xMin: 0, xMax: 49, yMin: 0, yMax: 100 },
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

const resolveCanonicalPositionKey = (raw?: string | null): string => {
  const n = normalizePos(raw || "");
  if (!n) return "OTHER";

  if (["gk", "goalkeeper", "portero", "keeper"].some((k) => n.includes(k)))
    return "GK";

  if (
    ["defensacentral", "centerback", "cb", "zaguero"].some((k) => n.includes(k))
  )
    return "CB";
  if (["lateralizquierdo", "leftback", "lb"].some((k) => n.includes(k)))
    return "LB";
  if (["lateralderecho", "rightback", "rb"].some((k) => n.includes(k)))
    return "RB";
  if (["carrileroizquierdo", "leftwingback", "lwb"].some((k) => n.includes(k)))
    return "LWB";
  if (["carrileroderecho", "rightwingback", "rwb"].some((k) => n.includes(k)))
    return "RWB";

  if (
    ["mediocentrodefensivo", "contencion", "cdm", "volantedefensivo"].some(
      (k) => n.includes(k),
    )
  )
    return "CDM";
  if (
    ["mediocentroofensivo", "enganche", "cam", "volanteofensivo"].some((k) =>
      n.includes(k),
    )
  )
    return "CAM";
  if (
    ["centrocampista", "mediocentro", "cm", "volante"].some((k) =>
      n.includes(k),
    )
  )
    return "CM";

  if (["extremoizquierdo", "leftwing", "lw"].some((k) => n.includes(k)))
    return "LW";
  if (["extremoderecho", "rightwing", "rw"].some((k) => n.includes(k)))
    return "RW";
  if (["delantero", "striker", "st", "nueve"].some((k) => n.includes(k)))
    return "ST";
  if (["segundodelantero", "secondstriker", "ss"].some((k) => n.includes(k)))
    return "SS";

  return (raw || "OTHER").toUpperCase().trim();
};

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
// Collision avoidance — minimum separation between any two nodes (in %‑units)
// ---------------------------------------------------------------------------

/** Minimum distance (in field‑% units) between the centres of any two players.
 *  At a typical 600 px field width this ≈ 36 px — comfortably larger than the
 *  40 px node circle so labels don't overlap either. */
export const MIN_PLAYER_SEPARATION = 6;

/** Given a candidate position and a map of all current positions, nudge the
 *  candidate away from any node that is too close, staying within bounds.
 *  Returns the adjusted position. */
export const resolveCollision = (
  playerId: string,
  candidate: TacticalPosition,
  allPositions: Map<string, TacticalPosition>,
  bounds: PositionBounds,
  maxIterations = 4,
): TacticalPosition => {
  let pos = { ...candidate };
  for (let iter = 0; iter < maxIterations; iter++) {
    let pushed = false;
    for (const [otherId, otherPos] of allPositions) {
      if (otherId === playerId) continue;
      const dx = pos.x - otherPos.x;
      const dy = pos.y - otherPos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < MIN_PLAYER_SEPARATION && dist > 0.01) {
        // Push candidate away from the other node
        const push = (MIN_PLAYER_SEPARATION - dist) / 2 + 0.5;
        const angle = Math.atan2(dy, dx);
        pos = {
          x: pos.x + Math.cos(angle) * push,
          y: pos.y + Math.sin(angle) * push,
        };
        pushed = true;
      } else if (dist <= 0.01) {
        // Exactly overlapping — push in a deterministic direction
        pos = { x: pos.x + MIN_PLAYER_SEPARATION * 0.6, y: pos.y + 0.5 };
        pushed = true;
      }
    }
    // Reclamp after each iteration
    pos = clampToBounds(pos, bounds);
    if (!pushed) break;
  }
  return pos;
};

// ---------------------------------------------------------------------------
// IndexedDB Persistence — save/load per‑match tactical positions
// ---------------------------------------------------------------------------

const IDB_KEY_PREFIX = "tactical-positions-";

const serializePositions = (
  positions: Map<string, TacticalPosition>,
): string => {
  const obj: Record<string, TacticalPosition> = {};
  positions.forEach((v, k) => {
    obj[k] = v;
  });
  return JSON.stringify(obj);
};

const deserializePositions = (
  raw: string,
): Map<string, TacticalPosition> | null => {
  try {
    const obj = JSON.parse(raw) as Record<string, TacticalPosition>;
    const map = new Map<string, TacticalPosition>();
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v.x === "number" && typeof v.y === "number") {
        map.set(k, v);
      }
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  }
};

const savePositionsToIDB = async (
  matchId: string,
  positions: Map<string, TacticalPosition>,
) => {
  try {
    await set(IDB_KEY_PREFIX + matchId, serializePositions(positions));
  } catch {
    // Silently fail — persistence is best-effort
  }
};

const loadPositionsFromIDB = async (
  matchId: string,
): Promise<Map<string, TacticalPosition> | null> => {
  try {
    const raw = await get(IDB_KEY_PREFIX + matchId);
    if (typeof raw !== "string") return null;
    return deserializePositions(raw);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Formation IDB persistence — per‑match, per‑side
// ---------------------------------------------------------------------------

const IDB_FORMATION_PREFIX = "tactical-formation-";

interface FormationState {
  home: Formation | null;
  away: Formation | null;
}

const saveFormationsToIDB = async (matchId: string, state: FormationState) => {
  try {
    await set(IDB_FORMATION_PREFIX + matchId, JSON.stringify(state));
  } catch {
    // best-effort
  }
};

const loadFormationsFromIDB = async (
  matchId: string,
): Promise<FormationState | null> => {
  try {
    const raw = await get(IDB_FORMATION_PREFIX + matchId);
    if (typeof raw !== "string") return null;
    const parsed = JSON.parse(raw) as FormationState;
    if (
      (parsed.home === null ||
        (Array.isArray(parsed.home) && isValidFormation(parsed.home))) &&
      (parsed.away === null ||
        (Array.isArray(parsed.away) && isValidFormation(parsed.away)))
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
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
    const key = resolveCanonicalPositionKey(p.position);
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
        const bounds = getBoundsForPlayer(posKey, side);
        result.set(group[playerIdx].id, clampToBounds({ x, y }, bounds));
        playerIdx++;
      }
    }
  }
  return result;
};

// ---------------------------------------------------------------------------
// resolveFormationPositions — place players using a formation template
// ---------------------------------------------------------------------------

/**
 * Given a team's on‑field players and a formation array, distribute them on
 * vertical lines across the field half.  The GK is placed at x=5 (home) and
 * every other player is spread evenly across `formation.length` lines from
 * defense to attack.
 *
 * Players are sorted by their backend position to produce a deterministic
 * mapping (GK → GK slot, defenders sorted to defense line, etc.).  When the
 * formation has more lines than can be cleanly mapped from position groups we
 * just fill back-to-front.
 */
export const resolveFormationPositions = (
  players: PlayerLike[],
  side: "home" | "away",
  formation: Formation,
): Map<string, TacticalPosition> => {
  const result = new Map<string, TacticalPosition>();
  if (!isValidFormation(formation) || players.length === 0) return result;

  // Separate GK
  const gk = players.find((p) => getPositionGroup(p.position) === "goalkeeper");
  const outfield = players.filter((p) => p !== gk);

  // Place GK
  if (gk) {
    const gkX = side === "away" ? 95 : 5;
    result.set(gk.id, { x: gkX, y: 50 });
  }

  // Sort outfield players by positional depth (defense → attack) so they
  // fill the formation lines logically.
  const groupOrder: PositionGroup[] = [
    "defense",
    "midfield",
    "attack",
    "other",
  ];
  const sortedOutfield = [...outfield].sort((a, b) => {
    const ga = groupOrder.indexOf(getPositionGroup(a.position));
    const gb = groupOrder.indexOf(getPositionGroup(b.position));
    return ga - gb;
  });

  // X positions for each formation line — evenly across the half (15–80%)
  const lineCount = formation.length;
  const xPositions = formation.map((_, idx) => {
    // lineCount lines spread from 15% to 80% for home
    return 15 + (idx / Math.max(1, lineCount - 1)) * 65;
  });

  // Assign players to lines
  let playerIdx = 0;
  for (let lineIdx = 0; lineIdx < lineCount; lineIdx++) {
    const count = formation[lineIdx];
    const lineX = xPositions[lineIdx];

    for (let j = 0; j < count && playerIdx < sortedOutfield.length; j++) {
      const player = sortedOutfield[playerIdx];
      let x = lineX;
      let y = 50;

      if (count > 1) {
        // Spread players vertically within the line
        const spread = Math.max(16, Math.min(30, 70 / count));
        const offset = (j - (count - 1) / 2) * spread;
        y = Math.min(92, Math.max(8, 50 + offset));
      }

      if (side === "away") {
        x = 100 - x;
      }
      const bounds = getBoundsForPlayer(player.position, side);
      result.set(player.id, clampToBounds({ x, y }, bounds));
      playerIdx++;
    }
  }

  // Fallback: place any remaining players (if more than 10 outfield)
  while (playerIdx < sortedOutfield.length) {
    const player = sortedOutfield[playerIdx];
    const x = side === "away" ? 60 : 40;
    result.set(player.id, { x, y: 50 });
    playerIdx++;
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
  /** Debounce handle for persist writes. */
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Track whether we've loaded from IDB for the current match. */
  const idbLoadedFor = useRef<string | undefined>(undefined);

  // Formation state
  const [homeFormation, setHomeFormation] = useState<Formation | null>(null);
  const [awayFormation, setAwayFormation] = useState<Formation | null>(null);
  /** Track formation IDB loading. */
  const idbFormationLoadedFor = useRef<string | undefined>(undefined);
  /** Keep latest rosters in refs so applyFormation can read them synchronously. */
  const homePlayersRef = useRef(homePlayers);
  homePlayersRef.current = homePlayers;
  const awayPlayersRef = useRef(awayPlayers);
  awayPlayersRef.current = awayPlayers;

  // Persist positions to IndexedDB (debounced 500 ms)
  const persistPositions = useCallback(
    (nextPositions: Map<string, TacticalPosition>) => {
      if (!matchId) return;
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        savePositionsToIDB(matchId, nextPositions);
      }, 500);
    },
    [matchId],
  );

  // (Re)initialise when match or rosters change — load from IDB first
  useEffect(() => {
    if (!matchId) return;
    // Don't initialise until we actually have players (match data has loaded)
    if (homePlayers.length === 0 && awayPlayers.length === 0) return;

    const isNewMatch = prevMatchId.current !== matchId;
    prevMatchId.current = matchId;

    let cancelled = false;

    const init = async () => {
      // Try IDB load on new match or first init
      let restored: Map<string, TacticalPosition> | null = null;
      if (isNewMatch || idbLoadedFor.current !== matchId) {
        idbLoadedFor.current = matchId;
        restored = await loadPositionsFromIDB(matchId);
      }

      // Load saved formations
      let savedFormations: FormationState | null = null;
      if (isNewMatch || idbFormationLoadedFor.current !== matchId) {
        idbFormationLoadedFor.current = matchId;
        savedFormations = await loadFormationsFromIDB(matchId);
      }

      if (cancelled) return;

      // Restore formation state
      if (savedFormations) {
        setHomeFormation(savedFormations.home);
        setAwayFormation(savedFormations.away);
      } else if (isNewMatch) {
        setHomeFormation(null);
        setAwayFormation(null);
      }

      // Build fresh defaults — use formation-based positioning when a
      // formation has been persisted for the side.
      const hf = savedFormations?.home ?? null;
      const af = savedFormations?.away ?? null;

      const homeMap =
        hf && isValidFormation(hf)
          ? resolveFormationPositions(homePlayers, "home", hf)
          : resolveDefaultPositions(homePlayers, "home");
      const awayMap =
        af && isValidFormation(af)
          ? resolveFormationPositions(awayPlayers, "away", af)
          : resolveDefaultPositions(awayPlayers, "away");
      const defaults = new Map([...homeMap, ...awayMap]);

      if (restored && restored.size > 0) {
        // Merge: use restored positions for players still on field,
        // use defaults for new players (substitutions since last save)
        const merged = new Map<string, TacticalPosition>();
        for (const [pid, defPos] of defaults) {
          const saved = restored.get(pid);
          merged.set(pid, saved ?? defPos);
        }
        setPositions(merged);
      } else {
        // Only apply defaults if we don't have positions yet
        setPositions((prev) =>
          prev.size > 0 && !isNewMatch ? prev : defaults,
        );
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [matchId, homePlayers.length, awayPlayers.length]);

  /** Move a player to a new position, clamped to bounds and collision-resolved. */
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
        const resolved = resolveCollision(playerId, clamped, prev, bounds);
        const next = new Map(prev);
        next.set(playerId, resolved);
        persistPositions(next);
        return next;
      });
    },
    [persistPositions],
  );

  /** Apply a formation to one side — recalculates all positions for that side
   *  and persists both the formation and the new positions to IDB. Pass `null`
   *  to clear the formation and revert to default positions. */
  const applyFormation = useCallback(
    (side: "home" | "away", formation: Formation | null) => {
      if (!matchId) return;

      const players =
        side === "home" ? homePlayersRef.current : awayPlayersRef.current;

      // Compute new positions for this side
      const sidePositions =
        formation && isValidFormation(formation)
          ? resolveFormationPositions(players, side, formation)
          : resolveDefaultPositions(players, side);

      // Update formation state
      if (side === "home") {
        setHomeFormation(formation);
      } else {
        setAwayFormation(formation);
      }

      // Merge into current positions — only replace the affected side
      setPositions((prev) => {
        const next = new Map(prev);
        // Remove all players from this side first
        for (const p of players) {
          next.delete(p.id);
        }
        // Add new positions
        for (const [pid, pos] of sidePositions) {
          next.set(pid, pos);
        }
        persistPositions(next);
        return next;
      });

      // Persist formation state
      const newFormationState: FormationState = {
        home: side === "home" ? formation : homeFormation,
        away: side === "away" ? formation : awayFormation,
      };
      saveFormationsToIDB(matchId, newFormationState);
    },
    [matchId, persistPositions, homeFormation, awayFormation],
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
        persistPositions(next);
        return next;
      });
    },
    [persistPositions],
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
        persistPositions(next);
        return next;
      });
    },
    [persistPositions],
  );

  /** Currently-dragged player id (exposed so TacticalField can show bounds). */
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);

  return {
    positions,
    movePlayer,
    movePlayerFromDisplay,
    applySubstitution,
    getDisplayPosition,
    ensurePlayer,
    draggingPlayerId,
    setDraggingPlayerId,
    homeFormation,
    awayFormation,
    applyFormation,
  };
};
