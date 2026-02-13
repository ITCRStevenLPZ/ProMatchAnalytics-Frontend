// Generic Pagination Response
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// User Types
export type UserRole = "admin" | "analyst" | "guest";

export interface UserData {
  _id?: string;
  firebase_uid: string;
  email: string;
  display_name?: string;
  photo_url?: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// CRUD Types
export interface Competition {
  _id?: string;
  competition_id: string;
  name: string;
  short_name?: string;
  gender: "male" | "female";
  country_name: string;
  i18n_names?: Record<string, string>;
}

export type VenueSurface = "Natural Grass" | "Artificial Turf" | "Hybrid";

export interface Venue {
  _id?: string;
  venue_id: string;
  name: string;
  city: string;
  country_name: string;
  capacity?: number;
  surface?: VenueSurface;
  i18n_names?: Record<string, string>;
}

export interface Referee {
  _id?: string;
  referee_id: string;
  name: string;
  country_name: string;
  years_of_experience?: number;
}

export type PlayerPosition =
  | "GK" // Goalkeeper
  | "CB"
  | "LB"
  | "RB"
  | "LWB"
  | "RWB"
  | "SW" // Defenders
  | "CDM"
  | "CM"
  | "CAM"
  | "LM"
  | "RM"
  | "LW"
  | "RW" // Midfielders
  | "CF"
  | "ST"
  | "LF"
  | "RF"
  | "SS"; // Forwards

export interface PlayerData {
  _id?: string;
  player_id: string;
  name: string;
  nickname?: string;
  birth_date: string;
  country_name: string;
  position: PlayerPosition;
  player_height?: number;
  player_weight?: number;
  age?: number;
  i18n_names?: Record<string, string>;
}

export interface ManagerInfo {
  name: string;
  country_name?: string;
  start_date?: string | null;
}

export interface TechnicalStaffMember {
  name: string;
  role?: string;
  country_name?: string;
  start_date?: string | null;
}

export interface Team {
  _id?: string;
  team_id: string;
  name: string;
  short_name?: string;
  country_name: string;
  gender: "male" | "female";
  manager?: ManagerInfo;
  managers?: ManagerInfo[];
  technical_staff?: TechnicalStaffMember[];
  logo_url?: string;
  league?: string;
  founded_year?: number;
  stadium?: string;
  players: Player[];
  i18n_names?: Record<string, string>;
  created_by?: string;
  created_at?: Date;
  updated_at?: Date;
  is_active?: boolean;
}

export interface TeamPlayer {
  _id?: string;
  team_id: string;
  player_id: string;
  jersey_number: number;
  position: PlayerPosition;
  is_active?: boolean;
  is_starter?: boolean;
  joined_date?: string;
  player_name?: string;
  team_name?: string;
}

export interface Player {
  name: string;
  number: number;
  position: string;
}

export interface Match {
  id: string;
  home_team_id: string;
  away_team_id: string;
  competition: string;
  season: string;
  match_day?: number;
  venue?: string;
  scheduled_start: Date;
  actual_start?: Date;
  actual_end?: Date;
  status: MatchStatus;
  home_score: number;
  away_score: number;
  half_time_home_score?: number;
  half_time_away_score?: number;
  referee?: string;
  home_formation?: string;
  away_formation?: string;
  home_lineup: LineupPlayer[];
  away_lineup: LineupPlayer[];
  stats: Record<string, any>;
  created_by: string;
  analysts: string[];
  created_at: Date;
  updated_at: Date;
  sync_status: string;
  version: number;
}

export enum MatchStatus {
  SCHEDULED = "scheduled",
  LIVE = "live",
  HALF_TIME = "half_time",
  FINISHED = "finished",
  POSTPONED = "postponed",
  CANCELLED = "cancelled",
}

export interface LineupPlayer {
  player_name: string;
  number: number;
  position: string;
  is_starter: boolean;
}

export interface Event {
  _id?: string;
  match_id: string;
  timestamp: string;
  match_clock: string;
  period: number;
  team_id: string;
  player_id?: string;
  location?: [number, number];
  type: string;
  data: Record<string, any>;
  notes?: string;
  client_id?: string;
  recorded_by?: string;
  recorded_at?: string;
  updated_at?: string;
  version?: number;
}

export enum EventType {
  GOAL = "goal",
  SHOT = "shot",
  SHOT_ON_TARGET = "shot_on_target",
  SHOT_OFF_TARGET = "shot_off_target",
  SHOT_BLOCKED = "shot_blocked",
  PASS = "pass",
  KEY_PASS = "key_pass",
  ASSIST = "assist",
  CROSS = "cross",
  CORNER = "corner",
  FREE_KICK = "free_kick",
  THROW_IN = "throw_in",
  PENALTY = "penalty",
  FOUL = "foul",
  OFFSIDE = "offside",
  YELLOW_CARD = "yellow_card",
  RED_CARD = "red_card",
  SUBSTITUTION = "substitution",
  INJURY = "injury",
  SAVE = "save",
  TACKLE = "tackle",
  INTERCEPTION = "interception",
  CLEARANCE = "clearance",
  DRIBBLE = "dribble",
  AERIAL_DUEL = "aerial_duel",
  BALL_RECOVERY = "ball_recovery",
  POSSESSION_LOST = "possession_lost",
  POSSESSION_WON = "possession_won",
  VAR_REVIEW = "var_review",
  HALF_START = "half_start",
  HALF_END = "half_end",
  MATCH_START = "match_start",
  MATCH_END = "match_end",
}

export interface User {
  id: string;
  firebase_uid: string;
  email: string;
  display_name?: string;
  photo_url?: string;
  role: string;
  is_active: boolean;
  created_at: Date;
  last_login?: Date;
}
