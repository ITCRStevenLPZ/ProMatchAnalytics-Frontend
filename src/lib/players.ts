import type { PlayerData } from '../types';

export interface PlayerApiResponse extends Partial<PlayerData> {
  player_id: string;
  name: string;
  birth_date: string;
  player_height?: number | null;
  player_weight?: number | null;
  country_name?: string | null;
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

  const trimmedBirthDate = birth_date ? birth_date.split('T')[0] : '';

  return {
    ...rest,
    player_id: player.player_id,
    name: player.name,
    birth_date: trimmedBirthDate,
    height: height ?? (player_height ?? undefined),
    weight: weight ?? (player_weight ?? undefined),
    nationality: nationality ?? country_name ?? '',
  } as PlayerData;
}

export function normalizePlayers(players: PlayerApiResponse[]): PlayerData[] {
  return players.map(normalizePlayer);
}
