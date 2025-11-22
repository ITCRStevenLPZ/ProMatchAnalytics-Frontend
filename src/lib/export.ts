import { apiClient } from './api';

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

export type ExportFormat = 'csv' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  filename?: string;
}

const ADMIN_LOCALES = ['en', 'es'] as const;

const buildLocalizedNameColumns = (names?: Record<string, string> | null) =>
  ADMIN_LOCALES.reduce<Record<string, string>>((acc, locale) => {
    acc[`localized_name_${locale}`] = names?.[locale] ?? '';
    return acc;
  }, {});

/**
 * Convert array of objects to CSV string
 */
function arrayToCSV(data: any[], headers?: string[]): string {
  if (data.length === 0) return '';
  
  // Get headers from first object if not provided
  const cols = headers || Object.keys(data[0]);
  
  // Create header row
  const headerRow = cols.map(col => `"${col}"`).join(',');
  
  // Create data rows
  const dataRows = data.map(row => {
    return cols.map(col => {
      const value = row[col];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',');
  });
  
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Download data as file
 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// COMPETITION EXPORT
// ============================================================================

export async function exportCompetitions(options: ExportOptions = { format: 'csv' }) {
  const competitions = await apiClient.get<any[]>('/competitions/');
  
  const exportData = competitions.map(comp => ({
    competition_id: comp.competition_id,
    name: comp.name,
    ...buildLocalizedNameColumns(comp.i18n_names),
    short_name: comp.short_name,
    gender: comp.gender,
    country_name: comp.country_name
  }));
  
  const filename = options.filename || `competitions_${new Date().toISOString().split('T')[0]}.${options.format}`;
  
  if (options.format === 'csv') {
    const csv = arrayToCSV(exportData);
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  } else {
    const json = JSON.stringify(exportData, null, 2);
    downloadFile(json, filename, 'application/json');
  }
  
  return { count: exportData.length, filename };
}

/**
 * Get competition export template
 */
export function downloadCompetitionTemplate(format: ExportFormat = 'csv') {
  const template = [
    {
      name: 'Example Competition',
      short_name: 'EXCOMP',
      gender: 'male',
      country_name: 'Spain'
    }
  ];
  
  const filename = `competition_template.${format}`;
  
  if (format === 'csv') {
    const csv = arrayToCSV(template);
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  } else {
    const json = JSON.stringify(template, null, 2);
    downloadFile(json, filename, 'application/json');
  }
}

// ============================================================================
// VENUE EXPORT
// ============================================================================

export async function exportVenues(options: ExportOptions = { format: 'csv' }) {
  const venues = await apiClient.get<any[]>('/venues/');
  
  const exportData = venues.map(venue => ({
    venue_id: venue.venue_id,
    name: venue.name,
    ...buildLocalizedNameColumns(venue.i18n_names),
    city: venue.city,
    country_name: venue.country_name,
    capacity: venue.capacity || '',
    surface: venue.surface || ''
  }));
  
  const filename = options.filename || `venues_${new Date().toISOString().split('T')[0]}.${options.format}`;
  
  if (options.format === 'csv') {
    const csv = arrayToCSV(exportData);
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  } else {
    const json = JSON.stringify(exportData, null, 2);
    downloadFile(json, filename, 'application/json');
  }
  
  return { count: exportData.length, filename };
}

export function downloadVenueTemplate(format: ExportFormat = 'csv') {
  const template = [
    {
      name: 'Example Stadium',
      city: 'Madrid',
      country_name: 'Spain',
      capacity: 80000,
      surface: 'Natural Grass'
    }
  ];
  
  const filename = `venue_template.${format}`;
  
  if (format === 'csv') {
    const csv = arrayToCSV(template);
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  } else {
    const json = JSON.stringify(template, null, 2);
    downloadFile(json, filename, 'application/json');
  }
}

// ============================================================================
// REFEREE EXPORT
// ============================================================================

export async function exportReferees(options: ExportOptions = { format: 'csv' }) {
  const referees = await apiClient.get<any[]>('/referees/');
  
  const exportData = referees.map(ref => ({
    referee_id: ref.referee_id,
    name: ref.name,
    country_name: ref.country_name,
    years_of_experience: ref.years_of_experience || ''
  }));
  
  const filename = options.filename || `referees_${new Date().toISOString().split('T')[0]}.${options.format}`;
  
  if (options.format === 'csv') {
    const csv = arrayToCSV(exportData);
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  } else {
    const json = JSON.stringify(exportData, null, 2);
    downloadFile(json, filename, 'application/json');
  }
  
  return { count: exportData.length, filename };
}

export function downloadRefereeTemplate(format: ExportFormat = 'csv') {
  const template = [
    {
      name: 'Example Referee',
      country_name: 'Spain',
      years_of_experience: 10
    }
  ];
  
  const filename = `referee_template.${format}`;
  
  if (format === 'csv') {
    const csv = arrayToCSV(template);
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  } else {
    const json = JSON.stringify(template, null, 2);
    downloadFile(json, filename, 'application/json');
  }
}

// ============================================================================
// PLAYER EXPORT
// ============================================================================

export async function exportPlayers(options: ExportOptions = { format: 'csv' }) {
  const players = await apiClient.get<any[]>('/players/');
  
  const exportData = players.map(player => ({
    player_id: player.player_id,
    name: player.name,
    ...buildLocalizedNameColumns(player.i18n_names),
    position: player.position,
    country_name: player.country_name ?? player.nationality,
    birth_date: player.birth_date,
    age: player.age || '',
    player_height: player.player_height || player.height || '',
    player_weight: player.player_weight || player.weight || '',
    jersey_number: player.jersey_number || ''
  }));
  
  const filename = options.filename || `players_${new Date().toISOString().split('T')[0]}.${options.format}`;
  
  if (options.format === 'csv') {
    const csv = arrayToCSV(exportData);
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  } else {
    const json = JSON.stringify(exportData, null, 2);
    downloadFile(json, filename, 'application/json');
  }
  
  return { count: exportData.length, filename };
}

export function downloadPlayerTemplate(format: ExportFormat = 'csv') {
  const template = [
    {
      name: 'Example Player',
      position: 'Forward',
      country_name: 'Spain',
      birth_date: '1995-05-15',
      player_height: 180,
      player_weight: 75,
      jersey_number: 10
    }
  ];
  
  const filename = `player_template.${format}`;
  
  if (format === 'csv') {
    const csv = arrayToCSV(template);
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  } else {
    const json = JSON.stringify(template, null, 2);
    downloadFile(json, filename, 'application/json');
  }
}

// ============================================================================
// TEAM EXPORT
// ============================================================================

export async function exportTeams(options: ExportOptions = { format: 'csv' }) {
  const teams = await apiClient.get<any[]>('/teams/');
  
  const exportData = teams.map(team => ({
    team_id: team.team_id,
    name: team.name,
    ...buildLocalizedNameColumns(team.i18n_names),
    short_name: team.short_name,
    country_name: team.country_name,
    gender: team.gender,
    founded_year: team.founded_year || '',
    stadium: team.stadium || '',
    manager_name: team.manager?.name || ''
  }));
  
  const filename = options.filename || `teams_${new Date().toISOString().split('T')[0]}.${options.format}`;
  
  if (options.format === 'csv') {
    const csv = arrayToCSV(exportData);
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  } else {
    const json = JSON.stringify(exportData, null, 2);
    downloadFile(json, filename, 'application/json');
  }
  
  return { count: exportData.length, filename };
}

export function downloadTeamTemplate(format: ExportFormat = 'csv') {
  const template = [
    {
      name: 'Example FC',
      short_name: 'EFC',
      country_name: 'Spain',
      gender: 'male',
      founded_year: 1900,
      stadium: 'Example Stadium',
      manager_name: 'John Doe'
    }
  ];
  
  const filename = `team_template.${format}`;
  
  if (format === 'csv') {
    const csv = arrayToCSV(template);
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  } else {
    const json = JSON.stringify(template, null, 2);
    downloadFile(json, filename, 'application/json');
  }
}

// ============================================================================
// MATCH EXPORT
// ============================================================================

export async function exportMatches(options: ExportOptions = { format: 'csv' }) {
  const matches = await apiClient.get<any[]>('/matches/');
  
  const exportData = matches.map(match => ({
    match_id: match.match_id,
    competition_name: match.competition?.name || '',
    home_team_name: match.home_team?.name || '',
    away_team_name: match.away_team?.name || '',
    match_date: match.match_date,
    venue_name: match.venue?.name || '',
    referee_name: match.referee?.name || '',
    competition_stage: match.competition_stage || '',
    status: match.status,
    home_score: match.home_score || '',
    away_score: match.away_score || ''
  }));
  
  const filename = options.filename || `matches_${new Date().toISOString().split('T')[0]}.${options.format}`;
  
  if (options.format === 'csv') {
    const csv = arrayToCSV(exportData);
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  } else {
    const json = JSON.stringify(exportData, null, 2);
    downloadFile(json, filename, 'application/json');
  }
  
  return { count: exportData.length, filename };
}

export function downloadMatchTemplate(format: ExportFormat = 'csv') {
  const template = [
    {
      competition_name: 'Example Competition',
      home_team_name: 'Example FC',
      away_team_name: 'Another FC',
      match_date: '2025-01-15',
      venue_name: 'Example Stadium',
      referee_name: 'Example Referee',
      competition_stage: 'Regular Season'
    }
  ];
  
  const filename = `match_template.${format}`;
  
  if (format === 'csv') {
    const csv = arrayToCSV(template);
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  } else {
    const json = JSON.stringify(template, null, 2);
    downloadFile(json, filename, 'application/json');
  }
}

/**
 * Download bulk template with all models
 */
export function downloadBulkTemplate(format: ExportFormat = 'csv') {
  if (format === 'csv') {
    // CSV format with section markers
    const csvContent = `# COMPETITIONS
name,country_name,gender
Premier League,England,male
La Liga,Spain,female

# VENUES
name,city,country_name
Old Trafford,Manchester,England
Camp Nou,Barcelona,Spain

# REFEREES
name,country_name
Michael Oliver,England
Stéphanie Frappart,France

# PLAYERS
name,birth_date,player_height,player_weight,country_name,position
Erling Haaland,2000-07-21,194,88,Norway,ST
Alexia Putellas,1994-02-04,170,58,Spain,CM

# TEAMS
name,short_name,country_name,gender,founded_year,stadium,manager
Manchester City,MCI,England,male,1880,Etihad Stadium,Pep Guardiola
FC Barcelona,FCB,Spain,female,1970,Camp Nou,Jonatan Giráldez
`;
    
    downloadFile(csvContent, 'bulk_import_template.csv', 'text/csv;charset=utf-8;');
  } else {
    // JSON format with nested structure
    const jsonData = {
      competitions: [
        {
          name: 'Premier League',
          country_name: 'England',
          gender: 'male'
        },
        {
          name: 'La Liga',
          country_name: 'Spain',
          gender: 'female'
        }
      ],
      venues: [
        {
          name: 'Old Trafford',
          city: 'Manchester',
          country_name: 'England'
        },
        {
          name: 'Camp Nou',
          city: 'Barcelona',
          country_name: 'Spain'
        }
      ],
      referees: [
        {
          name: 'Michael Oliver',
          country_name: 'England'
        },
        {
          name: 'Stéphanie Frappart',
          country_name: 'France'
        }
      ],
      players: [
        {
          name: 'Erling Haaland',
          birth_date: '2000-07-21',
          player_height: 194,
          player_weight: 88,
          country_name: 'Norway',
          position: 'ST'
        },
        {
          name: 'Alexia Putellas',
          birth_date: '1994-02-04',
          player_height: 170,
          player_weight: 58,
          country_name: 'Spain',
          position: 'CM'
        }
      ],
      teams: [
        {
          name: 'Manchester City',
          short_name: 'MCI',
          country_name: 'England',
          gender: 'male',
          founded_year: 1880,
          stadium: 'Etihad Stadium',
          manager: 'Pep Guardiola'
        },
        {
          name: 'FC Barcelona',
          short_name: 'FCB',
          country_name: 'Spain',
          gender: 'female',
          founded_year: 1970,
          stadium: 'Camp Nou',
          manager: 'Jonatan Giráldez'
        }
      ]
    };
    
    const json = JSON.stringify(jsonData, null, 2);
    downloadFile(json, 'bulk_import_template.json', 'application/json');
  }
}
