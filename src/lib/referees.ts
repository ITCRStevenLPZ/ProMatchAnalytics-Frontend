import type { Referee } from '../types';

export interface RefereeApiResponse {
  _id?: string;
  referee_id: string;
  name: string;
  country_name?: string | null;
  years_of_experience?: number | string | null;
}

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const normalizeReferee = (referee: RefereeApiResponse): Referee => ({
  _id: referee._id,
  referee_id: referee.referee_id,
  name: referee.name,
  country_name: referee.country_name ?? '',
  years_of_experience: toNumberOrUndefined(referee.years_of_experience),
});

export const normalizeReferees = (referees: RefereeApiResponse[]): Referee[] =>
  referees.map(normalizeReferee);

const trimOrUndefined = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const buildRefereePayload = (data: Partial<Referee>) => {
  const payload = {
    referee_id: trimOrUndefined(data.referee_id),
    name: trimOrUndefined(data.name),
    country_name: trimOrUndefined(data.country_name),
    years_of_experience: toNumberOrUndefined(data.years_of_experience),
  } as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
};
