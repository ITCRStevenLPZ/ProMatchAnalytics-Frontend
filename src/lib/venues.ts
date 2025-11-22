import type { Venue, VenueSurface } from '../types';

export interface VenueApiResponse {
  _id?: string;
  venue_id: string;
  name: string;
  city: string;
  country_name?: string | null;
  country?: string | null;
  capacity?: number | string | null;
  surface?: string | null;
  i18n_names?: Record<string, string> | null;
}

export const VENUE_SURFACES: VenueSurface[] = [
  'Natural Grass',
  'Artificial Turf',
  'Hybrid',
];

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const sanitizeSurface = (surface?: string | null): VenueSurface | undefined => {
  if (!surface) return undefined;
  return VENUE_SURFACES.includes(surface as VenueSurface)
    ? (surface as VenueSurface)
    : undefined;
};

const trimOrUndefined = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const sanitizeI18nNames = (names?: Record<string, string | undefined | null>) => {
  if (!names) return undefined;
  const normalized = Object.entries(names)
    .map(([locale, value]) => [locale, (value ?? '').trim()])
    .filter(([, value]) => Boolean(value));
  return normalized.length > 0 ? Object.fromEntries(normalized) : undefined;
};

export const normalizeVenue = (venue: VenueApiResponse): Venue => ({
  _id: venue._id,
  venue_id: venue.venue_id,
  name: venue.name,
  city: venue.city,
  country_name: venue.country_name ?? venue.country ?? '',
  capacity: toNumberOrUndefined(venue.capacity),
  surface: sanitizeSurface(venue.surface),
  i18n_names: venue.i18n_names ?? undefined,
});

export const normalizeVenues = (venues: VenueApiResponse[]): Venue[] =>
  venues.map(normalizeVenue);

export const buildVenuePayload = (data: Partial<Venue>) => {
  const payload = {
    venue_id: trimOrUndefined(data.venue_id),
    name: trimOrUndefined(data.name),
    city: trimOrUndefined(data.city),
    country_name: trimOrUndefined(data.country_name),
    capacity: toNumberOrUndefined(data.capacity),
    surface: sanitizeSurface(data.surface),
    i18n_names: sanitizeI18nNames(data.i18n_names),
  } as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
};
