import { MatchEvent } from '../../store/useMatchLogStore';

export interface Player {
  id: string;
  full_name: string;
  short_name?: string;
  jersey_number: number;
  position: string;
}

export interface Team {
  id: string;
  name: string;
  short_name: string;
  players: Player[];
}

export type MatchStatus =
  | 'Scheduled'
  | 'Live'
  | 'Halftime'
  | 'Completed'
  | 'Live_First_Half'
  | 'Live_Second_Half'
  | 'Fulltime'
  | 'Abandoned'
  | 'Pending'
  | 'Live_Extra_First'
  | 'Extra_Halftime'
  | 'Live_Extra_Second'
  | 'Penalties';

export type ClockMode = 'EFFECTIVE' | 'INEFFECTIVE' | 'TIMEOFF';

export interface Match {
  id: string;
  home_team: Team;
  away_team: Team;
  status: MatchStatus;
  match_time_seconds?: number;
  current_period_start_timestamp?: string;
  clock_seconds_at_period_start?: number;
  period_timestamps?: Record<string, { start?: string; end?: string }>;
  ineffective_time_seconds?: number;
  time_off_seconds?: number;
  clock_mode?: ClockMode;
  last_mode_change_timestamp?: string;
}

export type EventType =
  | 'Pass'
  | 'Shot'
  | 'Duel'
  | 'FoulCommitted'
  | 'Card'
  | 'Substitution'
  | 'GameStoppage'
  | 'VARDecision'
  | 'Interception'
  | 'Clearance'
  | 'Block'
  | 'Recovery'
  | 'Offside'
  | 'SetPiece'
  | 'GoalkeeperAction';

export type ActionStep =
  | 'selectPlayer'
  | 'selectAction'
  | 'selectOutcome'
  | 'selectRecipient';

export interface ActionConfig {
  actions: string[];
  outcomes?: Record<string, string[]>;
  needsRecipient?: boolean;
  isSpecial?: boolean;  // For actions requiring special UI (e.g., substitution flow)
}

export interface LoggerHarness {
  resetFlow: () => void;
  setSelectedTeam: (team: 'home' | 'away') => void;
  getCurrentStep: () => ActionStep;
  sendPassEvent: (options: { team: 'home' | 'away'; passerId: string; recipientId: string }) => void;
  sendRawEvent: (payload: Record<string, any>) => void;
  getMatchContext: () => {
    matchId: string;
    homeTeamId: string;
    awayTeamId: string;
  };
  undoLastEvent: () => Promise<void> | void;
  getQueueSnapshot: () => QueueSnapshot;
}

export interface QueuedEventSummary {
  match_id: string;
  timestamp: string;
  client_id?: string;
  type: string;
}

export interface QueueSnapshot {
  currentMatchId: string | null;
  queuedEvents: QueuedEventSummary[];
  queuedEventsByMatch: Record<string, QueuedEventSummary[]>;
}

export interface DuplicateMetadata {
  match_clock: string;
  period: number;
  team_id: string;
  existing_event_id?: string;
}

export interface DuplicateStats {
  count: number;
  lastTeamId?: string;
  lastEventType?: string;
  lastMatchClock?: string;
  lastSeenAt?: string;
}

export type LiveEvent = MatchEvent;
