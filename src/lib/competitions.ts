import type { Competition } from "../types";

export interface CompetitionApiResponse {
  _id?: string;
  competition_id: string;
  name: string;
  short_name?: string | null;
  gender: "male" | "female";
  country_name: string;
  i18n_names?: Record<string, string> | null;
}

export const normalizeCompetition = (
  competition: CompetitionApiResponse,
): Competition => ({
  _id: competition._id,
  competition_id: competition.competition_id,
  name: competition.name,
  short_name: competition.short_name ?? undefined,
  gender: competition.gender,
  country_name: competition.country_name,
  i18n_names: competition.i18n_names ?? undefined,
});

export const normalizeCompetitions = (
  competitions: CompetitionApiResponse[],
): Competition[] => competitions.map(normalizeCompetition);

const trimOrUndefined = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const sanitizeI18nNames = (
  names?: Record<string, string | undefined | null>,
) => {
  if (!names) return undefined;
  const normalized = Object.entries(names)
    .map(([locale, value]) => [locale, (value ?? "").trim()])
    .filter(([, value]) => Boolean(value));
  return normalized.length > 0 ? Object.fromEntries(normalized) : undefined;
};

export const buildCompetitionPayload = (data: Partial<Competition>) => {
  const payload = {
    name: trimOrUndefined(data.name),
    short_name: trimOrUndefined(data.short_name),
    gender: data.gender,
    country_name: trimOrUndefined(data.country_name),
    i18n_names: sanitizeI18nNames(data.i18n_names),
  } as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
};
