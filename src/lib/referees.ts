import type { Referee } from '../types';

export interface RefereeApiResponse {
  _id?: string;
  referee_id: string;
  name: string;
  country_name?: string | null;
  years_of_experience?: number | null;
}

export const normalizeReferee = (referee: RefereeApiResponse): Referee => ({
  _id: referee._id,
  referee_id: referee.referee_id,
  name: referee.name,
  country: referee.country_name ?? '',
  years_of_experience: referee.years_of_experience ?? undefined,
});

export const normalizeReferees = (referees: RefereeApiResponse[]): Referee[] =>
  referees.map(normalizeReferee);

export const buildRefereePayload = (data: Partial<Referee>) => ({
  name: data.name,
  country_name: data.country ?? null,
  years_of_experience: data.years_of_experience ?? null,
});
