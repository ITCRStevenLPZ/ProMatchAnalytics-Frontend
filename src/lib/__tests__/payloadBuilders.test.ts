import { describe, expect, it } from 'vitest';
import { buildPlayerPayload } from '../players';
import { buildTeamPayload } from '../teams';
import { buildVenuePayload, VENUE_SURFACES } from '../venues';
import { buildRefereePayload } from '../referees';
import { buildCompetitionPayload } from '../competitions';
import type { PlayerData, Team, Venue, Referee, Competition } from '../../types';

describe('payload builders', () => {
  it('buildPlayerPayload trims values, converts metrics, and sanitizes i18n entries', () => {
    const playerInput = {
      player_id: ' player_custom ',
      name: '  Player Name  ',
      birth_date: '1990-05-14',
      country_name: '  Argentina ',
      position: 'CF',
      i18n_names: { en: '  Player ', es: ' ' },
      height: '180',
      weight: '74',
    } as Partial<PlayerData> & { height: string; weight: string };

    const payload = buildPlayerPayload(playerInput);

    expect(payload).toEqual({
      player_id: 'player_custom',
      name: 'Player Name',
      birth_date: '1990-05-14T00:00:00.000Z',
      player_height: 180,
      player_weight: 74,
      country_name: 'Argentina',
      position: 'CF',
      i18n_names: { en: 'Player' },
    });
  });

  it('buildTeamPayload normalizes managers, staff, and trims optional fields', () => {
    const teamInput: Partial<Team> = {
      team_id: ' team-001 ',
      name: '  Thunder FC ',
      short_name: '  THU ',
      gender: 'female',
      country_name: '  Spain ',
      founded_year: 1999,
      logo_url: '   ',
      manager: { name: '  Primary Manager ', country_name: '  USA ', start_date: '2024-01-01' },
      managers: [
        { name: '  Primary Manager ' },
        { name: '  Assistant Coach ', country_name: '  Canada ' },
      ],
      technical_staff: [
        { name: '  Analyst One ', role: '  Analyst ', country_name: '  USA ' },
        { name: '   ', role: 'Assistant' },
      ],
      i18n_names: { en: 'Thunder', es: 'Trueno' },
    };

    const payload = buildTeamPayload(teamInput);

    expect(payload).toEqual({
      team_id: 'team-001',
      name: 'Thunder FC',
      short_name: 'THU',
      gender: 'female',
      country_name: 'Spain',
      founded_year: 1999,
      managers: [
        { name: 'Primary Manager', country_name: 'USA', start_date: '2024-01-01' },
        { name: 'Assistant Coach', country_name: 'Canada' },
      ],
      technical_staff: [
        { name: 'Analyst One', role: 'Analyst', country_name: 'USA' },
      ],
      i18n_names: { en: 'Thunder', es: 'Trueno' },
    });
  });

  it('buildVenuePayload enforces numeric capacity and valid surfaces', () => {
    const venueInput: Partial<Venue> = {
      venue_id: ' venue-1 ',
      name: '  Grand Arena ',
      city: '  Madrid ',
      country_name: '  Spain ',
      capacity: '60000' as unknown as number,
      surface: 'Ice' as any,
    };

    const payload = buildVenuePayload(venueInput);

    expect(payload).toEqual({
      venue_id: 'venue-1',
      name: 'Grand Arena',
      city: 'Madrid',
      country_name: 'Spain',
      capacity: 60000,
    });
  });

  it('buildVenuePayload preserves valid surfaces', () => {
    const payload = buildVenuePayload({
      venue_id: 'v-2',
      name: 'Pitch',
      city: 'City',
      country_name: 'Country',
      surface: VENUE_SURFACES[0],
    });

    expect(payload.surface).toBe(VENUE_SURFACES[0]);
  });

  it('buildVenuePayload trims localized names and drops empty entries', () => {
    const payload = buildVenuePayload({
      venue_id: 'v-3',
      name: 'Localized Pitch ',
      city: 'City',
      country_name: 'Country',
      i18n_names: { en: '  Stadium ', es: '   ' },
    });

    expect(payload).toMatchObject({
      name: 'Localized Pitch',
      i18n_names: { en: 'Stadium' },
    });
  });

  it('buildRefereePayload trims strings and converts experience to numbers', () => {
    const refereeInput = {
      referee_id: ' ref-7 ',
      name: '  Maria Gomez ',
      country_name: '  Chile ',
      years_of_experience: '12' as unknown as number,
    } as Partial<Referee> & { years_of_experience: string };

    const payload = buildRefereePayload(refereeInput);

    expect(payload).toEqual({
      referee_id: 'ref-7',
      name: 'Maria Gomez',
      country_name: 'Chile',
      years_of_experience: 12,
    });
  });

  it('buildCompetitionPayload trims fields and strips empty localized names', () => {
    const competitionInput: Partial<Competition> = {
      competition_id: ' comp-1 ',
      name: '  National League ',
      short_name: '  NL ',
      gender: 'male',
      country_name: '  Mexico ',
      i18n_names: { en: '  League ', es: ' ' },
    };

    const payload = buildCompetitionPayload(competitionInput);

    expect(payload).toEqual({
      competition_id: 'comp-1',
      name: 'National League',
      short_name: 'NL',
      gender: 'male',
      country_name: 'Mexico',
      i18n_names: { en: 'League' },
    });
  });
});
