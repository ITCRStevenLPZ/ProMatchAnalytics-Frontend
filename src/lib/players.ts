import type { PlayerData } from "../types";

type PlayerDataLoose = Omit<
  Partial<PlayerData>,
  | "country_name"
  | "player_height"
  | "player_weight"
  | "height"
  | "weight"
  | "nationality"
>;

export interface PlayerApiResponse extends PlayerDataLoose {
  player_id: string;
  name: string;
  birth_date: string;
  player_height?: number | null;
  player_weight?: number | null;
  country_name?: string | null;
  height?: number | null;
  weight?: number | null;
  nationality?: string | null;
}

// Normalize backend player payload to the shape expected by PlayerData consumers.
export function normalizePlayer(player: PlayerApiResponse): PlayerData {
  const {
    player_height,
    player_weight,
    country_name,
    birth_date,
    height,
    weight,
    nationality,
    ...rest
  } = player;

  const trimmedBirthDate = birth_date ? birth_date.split("T")[0] : "";

  return {
    ...rest,
    player_id: player.player_id,
    name: player.name,
    birth_date: trimmedBirthDate,
    player_height: player_height ?? height ?? undefined,
    player_weight: player_weight ?? weight ?? undefined,
    country_name: country_name ?? nationality ?? "",
  } as PlayerData;
}

export function normalizePlayers(players: PlayerApiResponse[]): PlayerData[] {
  return players.map(normalizePlayer);
}

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toIsoDate = (value?: string) =>
  value && value.trim().length > 0
    ? new Date(`${value}T00:00:00Z`).toISOString()
    : undefined;

const sanitizeI18nNames = (
  names?: Record<string, string | undefined | null>,
) => {
  if (!names) return undefined;
  const normalized = Object.entries(names)
    .map(([locale, value]) => [locale, (value ?? "").trim()])
    .filter(([, value]) => Boolean(value));
  return normalized.length > 0 ? Object.fromEntries(normalized) : undefined;
};

/**
 * Build backend-compliant payload for player create/update/change-detection flows.
 */
export const buildPlayerPayload = (data: Partial<PlayerData>) => {
  const payload = {
    player_id: data.player_id?.trim() || undefined,
    name: data.name?.trim(),
    nickname: data.nickname?.trim() || undefined,
    birth_date: toIsoDate(data.birth_date),
    player_height: toNumberOrUndefined(
      (data as any).height ?? data.player_height,
    ),
    player_weight: toNumberOrUndefined(
      (data as any).weight ?? data.player_weight,
    ),
    country_name:
      (data as any).nationality?.trim() ?? data.country_name?.trim(),
    position: data.position,
    i18n_names: sanitizeI18nNames(data.i18n_names),
  } as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
};
