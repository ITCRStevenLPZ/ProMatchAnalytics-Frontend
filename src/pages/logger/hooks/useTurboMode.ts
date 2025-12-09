/**
 * useTurboMode - Ultra-fast single-input event logging
 * 
 * TURBO MODE FORMAT: [team?][jersey#][action][outcome#][>recipient#]
 * 
 * TEAM PREFIX (optional - use when duplicate jersey numbers exist):
 *   h = Home team
 *   a = Away team
 *   (If omitted, searches both teams - first match wins)
 * 
 * EXAMPLES:
 *   "10p1" = Player #10, Pass, Complete (searches both teams)
 *   "h10p1" = Home team #10, Pass, Complete
 *   "h10p1>7" = Home #10 Pass Complete to #7 (recipient)
 *   "a10p1" = Away team #10, Pass, Complete
 *   "h7s1" = Home #7, Shot, On Target
 *   "a9d2" = Away #9, Duel, Lost
 *   "h4f" = Home #4, Foul committed
 *   "a10y1" = Away #10, Yellow Card
 * 
 * ACTION CODES:
 *   p = Pass          s = Shot           d = Duel
 *   f = Foul          y = Card           i = Interception
 *   c = Clearance     b = Block          r = Recovery
 *   o = Offside       a = Carry          k = Corner
 *   e = Free Kick     t = Throw-in       g = Goal Kick
 *   n = Penalty       v = Save           l = Claim
 *   u = Punch         m = Smother        x = Substitution
 * 
 * OUTCOME CODES (action-specific):
 *   Pass: 1=Complete, 2=Incomplete, 3=Key Pass
 *   Shot: 1=On Target, 2=Off Target, 3=Blocked, 4=Goal, 5=Hit Post
 *   Duel: 1=Won, 2=Lost, 3=Neutral
 *   Card: 1=Yellow, 2=Second Yellow, 3=Red
 *   ... see ACTION_FLOWS for full mapping
 */

import { useCallback, useState, useMemo, useRef } from 'react';
import { ACTION_FLOWS } from '../constants';
import type { Match, Player, Team } from '../types';

// Quick reference for action codes
export const TURBO_ACTION_CODES: Record<string, string> = {
  'p': 'Pass',
  's': 'Shot',
  'd': 'Duel',
  'f': 'Foul',
  'y': 'Card',
  'i': 'Interception',
  'c': 'Clearance',
  'b': 'Block',
  'r': 'Recovery',
  'o': 'Offside',
  'a': 'Carry',
  'k': 'Corner',
  'e': 'Free Kick',
  't': 'Throw-in',
  'g': 'Goal Kick',
  'n': 'Penalty',
  'v': 'Save',
  'l': 'Claim',
  'u': 'Punch',
  'm': 'Smother',
  'x': 'Substitution',
};

// Reverse mapping for display
export const ACTION_TO_TURBO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(TURBO_ACTION_CODES).map(([code, action]) => [action, code])
);

// Outcome code mappings per action
export const TURBO_OUTCOME_CODES: Record<string, Record<number, string>> = {
  'Pass': { 1: 'Complete', 2: 'Incomplete', 3: 'Out', 4: 'Pass Offside' },
  'Shot': { 1: 'Goal', 2: 'OnTarget', 3: 'OffTarget', 4: 'Blocked', 5: 'Post', 6: 'Saved' },
  'Duel': { 1: 'Won', 2: 'Lost', 3: 'Success (Dispossessed)' },
  'Foul': { 1: 'Standard', 2: 'Advantage', 3: 'Penalty' },
  'Card': { 1: 'Yellow', 2: 'Red', 3: 'Yellow (Second)' },
  'Interception': { 1: 'Success', 2: 'Lost' },
  'Clearance': { 1: 'Success', 2: 'Failed' },
  'Block': { 1: 'Success' },
  'Recovery': { 1: 'Interception', 2: 'Tackle', 3: 'Aerial', 4: 'Loose Ball' },
  'Offside': { 1: 'Standard' },
  'Carry': { 1: 'Successful', 2: 'Dispossessed' },
  'Corner': { 1: 'Complete', 2: 'Incomplete' },
  'Free Kick': { 1: 'Complete', 2: 'Incomplete', 3: 'Shot' },
  'Throw-in': { 1: 'Complete', 2: 'Incomplete' },
  'Goal Kick': { 1: 'Complete', 2: 'Incomplete' },
  'Penalty': { 1: 'Goal', 2: 'Saved', 3: 'Missed' },
  'Save': { 1: 'Success', 2: 'Failed' },
  'Claim': { 1: 'Success', 2: 'Failed' },
  'Punch': { 1: 'Success', 2: 'Failed' },
  'Pick Up': { 1: 'Success' },
  'Smother': { 1: 'Success', 2: 'Failed' },
  'Substitution': {}, // No outcomes
};

export interface TurboParseResult {
  valid: boolean;
  teamPrefix?: 'home' | 'away';
  jerseyNumber?: number;
  action?: string;
  outcome?: string;
  outcomeIndex?: number;
  recipientNumber?: number;
  recipientTeamPrefix?: 'home' | 'away';
  requiresRecipient?: boolean;
  error?: string;
  partial?: {
    hasTeam: boolean;
    hasJersey: boolean;
    hasAction: boolean;
    hasOutcome: boolean;
    hasRecipient: boolean;
  };
  // Resolved player info (set after player lookup)
  player?: Player;
  team?: Team;
  needsTeamPrefix?: boolean;
}

/**
 * Parse turbo input string into structured data
 * Format: [team?][jersey#][action][outcome#][recipient#]
 * 
 * Team prefix: 'h' = home, 'a' = away (optional)
 */
export function parseTurboInput(input: string): TurboParseResult {
  if (!input || input.trim() === '') {
    return { 
      valid: false, 
      error: 'Empty input',
      partial: { hasTeam: false, hasJersey: false, hasAction: false, hasOutcome: false, hasRecipient: false }
    };
  }

  const trimmed = input.toLowerCase().trim();
  let position = 0;

  // Step 1: Check for team prefix (h or a)
  let teamPrefix: 'home' | 'away' | undefined;
  if (trimmed[0] === 'h' && trimmed.length > 1 && /\d/.test(trimmed[1])) {
    teamPrefix = 'home';
    position = 1;
  } else if (trimmed[0] === 'a' && trimmed.length > 1 && /\d/.test(trimmed[1])) {
    teamPrefix = 'away';
    position = 1;
  }

  // Step 2: Extract jersey number (required)
  let jerseyStr = '';
  while (position < trimmed.length && /\d/.test(trimmed[position])) {
    jerseyStr += trimmed[position];
    position++;
  }

  if (!jerseyStr) {
    return { 
      valid: false, 
      teamPrefix,
      error: teamPrefix ? 'Missing jersey number after team prefix' : 'Type team (h/a) + jersey number',
      partial: { hasTeam: !!teamPrefix, hasJersey: false, hasAction: false, hasOutcome: false, hasRecipient: false }
    };
  }

  const jerseyNumber = parseInt(jerseyStr, 10);
  if (jerseyNumber < 1 || jerseyNumber > 99) {
    return { 
      valid: false, 
      teamPrefix,
      jerseyNumber,
      error: 'Jersey number must be 1-99',
      partial: { hasTeam: !!teamPrefix, hasJersey: true, hasAction: false, hasOutcome: false, hasRecipient: false }
    };
  }

  // Step 3: Extract action code (required)
  if (position >= trimmed.length) {
    return { 
      valid: false, 
      teamPrefix,
      jerseyNumber,
      error: 'Add action code (p=Pass, s=Shot, d=Duel...)',
      partial: { hasTeam: !!teamPrefix, hasJersey: true, hasAction: false, hasOutcome: false, hasRecipient: false }
    };
  }

  const actionCode = trimmed[position];
  const action = TURBO_ACTION_CODES[actionCode];
  
  if (!action) {
    return { 
      valid: false, 
      teamPrefix,
      jerseyNumber,
      error: `Unknown action: "${actionCode}" (use p,s,d,f,y,i,c,b,r,k,g,v...)`,
      partial: { hasTeam: !!teamPrefix, hasJersey: true, hasAction: false, hasOutcome: false, hasRecipient: false }
    };
  }
  position++;

  // Step 4: Extract outcome number (optional but may be required)
  let outcomeStr = '';
  while (position < trimmed.length && /\d/.test(trimmed[position])) {
    outcomeStr += trimmed[position];
    position++;
  }

  let outcome: string | undefined;
  let outcomeIndex: number | undefined;
  
  if (outcomeStr) {
    outcomeIndex = parseInt(outcomeStr, 10);
    const actionOutcomes = TURBO_OUTCOME_CODES[action];
    if (actionOutcomes && actionOutcomes[outcomeIndex]) {
      outcome = actionOutcomes[outcomeIndex];
    } else {
      // Try to get from ACTION_FLOWS
      const flow = ACTION_FLOWS[action];
      if (flow?.outcomes && flow.outcomes[action]) {
        const outcomesList = flow.outcomes[action];
        if (outcomeIndex > 0 && outcomeIndex <= outcomesList.length) {
          outcome = outcomesList[outcomeIndex - 1];
        } else {
          return { 
            valid: false, 
            teamPrefix,
            jerseyNumber,
            action,
            error: `Invalid outcome ${outcomeIndex} for ${action}`,
            partial: { hasTeam: !!teamPrefix, hasJersey: true, hasAction: true, hasOutcome: false, hasRecipient: false }
          };
        }
      } else {
        return { 
          valid: false, 
          teamPrefix,
          jerseyNumber,
          action,
          error: `Invalid outcome ${outcomeIndex} for ${action}`,
          partial: { hasTeam: !!teamPrefix, hasJersey: true, hasAction: true, hasOutcome: false, hasRecipient: false }
        };
      }
    }
  }

  // Step 5: Check for recipient marker (optional): accepts r#, >#, or -# with optional team prefix
  let recipientNumber: number | undefined;
  let recipientTeamPrefix: 'home' | 'away' | undefined;
  if (position < trimmed.length && ['r', '>', '-'].includes(trimmed[position])) {
    position++;

    // Optional team prefix for recipient when jersey numbers are duplicated
    if (trimmed[position] === 'h' && /\d/.test(trimmed[position + 1] || '')) {
      recipientTeamPrefix = 'home';
      position++;
    } else if (trimmed[position] === 'a' && /\d/.test(trimmed[position + 1] || '')) {
      recipientTeamPrefix = 'away';
      position++;
    }

    let recipientStr = '';
    while (position < trimmed.length && /\d/.test(trimmed[position])) {
      recipientStr += trimmed[position];
      position++;
    }

    if (!recipientStr) {
      return {
        valid: false,
        teamPrefix,
        jerseyNumber,
        action,
        outcome,
        outcomeIndex,
        error: 'Add recipient jersey number after >, -, or r',
        partial: { hasTeam: !!teamPrefix, hasJersey: true, hasAction: true, hasOutcome: !!outcome, hasRecipient: false }
      };
    }

    recipientNumber = parseInt(recipientStr, 10);
  }

  // Check if there are extra characters
  if (position < trimmed.length) {
    return { 
      valid: false, 
      teamPrefix,
      jerseyNumber,
      action,
      outcome,
      outcomeIndex,
      error: `Unexpected: "${trimmed.substring(position)}"`,
      partial: { hasTeam: !!teamPrefix, hasJersey: true, hasAction: true, hasOutcome: !!outcome, hasRecipient: false }
    };
  }

  // Determine if this is a valid complete input
  // Some actions require outcomes, others don't
  const flow = ACTION_FLOWS[action];
  const actionOutcomes = flow?.outcomes?.[action];
  const requiresOutcome = actionOutcomes && actionOutcomes.length > 0;
  const requiresRecipient = action === 'Pass';
  
  if (requiresOutcome && !outcome) {
    const outcomeOptions = Object.entries(TURBO_OUTCOME_CODES[action] || {})
      .map(([n, label]) => `${n}=${label}`)
      .join(', ');
    return { 
      valid: false, 
      teamPrefix,
      jerseyNumber,
      action,
      error: `${action} needs outcome: ${outcomeOptions}`,
      partial: { hasTeam: !!teamPrefix, hasJersey: true, hasAction: true, hasOutcome: false, hasRecipient: false }
    };
  }

  if (requiresRecipient && !recipientNumber) {
    return {
      valid: false,
      teamPrefix,
      jerseyNumber,
      action,
      requiresRecipient,
      error: 'Pass needs a recipient (add >#) before logging',
      partial: { hasTeam: !!teamPrefix, hasJersey: true, hasAction: true, hasOutcome: !!outcome, hasRecipient: false },
    };
  }

  return {
    valid: true,
    teamPrefix,
    jerseyNumber,
    action,
    outcome,
    outcomeIndex,
    recipientNumber,
    recipientTeamPrefix,
    requiresRecipient,
    partial: { 
      hasTeam: !!teamPrefix, 
      hasJersey: true, 
      hasAction: true, 
      hasOutcome: !!outcome, 
      hasRecipient: !!recipientNumber 
    }
  };
}

/**
 * Find a player by jersey number, optionally filtered by team
 */
function findPlayerByJersey(
  jerseyNumber: number, 
  match: Match | null,
  teamFilter?: 'home' | 'away'
): { player: Player; team: Team; teamSide: 'home' | 'away' } | null {
  if (!match) return null;

  // If team filter specified, only search that team
  if (teamFilter === 'home') {
    const player = match.home_team.players.find(p => p.jersey_number === jerseyNumber);
    if (player) return { player, team: match.home_team, teamSide: 'home' };
    return null;
  }
  
  if (teamFilter === 'away') {
    const player = match.away_team.players.find(p => p.jersey_number === jerseyNumber);
    if (player) return { player, team: match.away_team, teamSide: 'away' };
    return null;
  }

  // No filter - search both teams, home first
  const homePlayer = match.home_team.players.find(p => p.jersey_number === jerseyNumber);
  if (homePlayer) return { player: homePlayer, team: match.home_team, teamSide: 'home' };
  
  const awayPlayer = match.away_team.players.find(p => p.jersey_number === jerseyNumber);
  if (awayPlayer) return { player: awayPlayer, team: match.away_team, teamSide: 'away' };

  return null;
}

/**
 * Check if there are duplicate jersey numbers between teams
 */
export function checkDuplicateJerseys(match: Match | null): number[] {
  if (!match) return [];
  
  const homeNumbers = new Set(match.home_team.players.map(p => p.jersey_number));
  const duplicates: number[] = [];
  
  match.away_team.players.forEach(p => {
    if (homeNumbers.has(p.jersey_number)) {
      duplicates.push(p.jersey_number);
    }
  });
  
  return duplicates;
}

/**
 * Get player display name
 */
function getPlayerDisplayName(player: Player): string {
  return player.short_name || player.full_name || `#${player.jersey_number}`;
}

/**
 * Generate preview string for display
 */
export function getTurboPreview(parseResult: TurboParseResult | null, match: Match | null): string {
  if (!parseResult) {
    return '⌨️ Type [team][jersey][action][outcome]';
  }

  if (!parseResult.jerseyNumber) {
    return parseResult.error || '⌨️ Type [team][jersey][action][outcome]';
  }

  let preview = '';

  // Team indicator
  if (parseResult.teamPrefix) {
    preview += parseResult.teamPrefix === 'home' ? '🏠 ' : '✈️ ';
  }

  // Find player
  const found = findPlayerByJersey(parseResult.jerseyNumber, match, parseResult.teamPrefix);
  
  if (found) {
    preview += `#${found.player.jersey_number} ${getPlayerDisplayName(found.player)}`;
    preview += ` (${found.team.short_name || found.team.name})`;
  } else {
    preview += `#${parseResult.jerseyNumber} (not found)`;
  }

  if (parseResult.action) {
    preview += ` → ${parseResult.action}`;
  }

  if (parseResult.outcome) {
    preview += `: ${parseResult.outcome}`;
  }

  if (parseResult.recipientNumber) {
    const recipient = findPlayerByJersey(parseResult.recipientNumber, match, parseResult.recipientTeamPrefix);
    if (recipient) {
      preview += ` → #${recipient.player.jersey_number}`;
    } else {
      preview += ` → #${parseResult.recipientNumber} (not found)`;
    }
  }

  if (parseResult.error && !parseResult.valid) {
    preview += ` ⚠️ ${parseResult.error}`;
  }

  // Check for duplicate jersey warning
  if (match && parseResult.jerseyNumber && !parseResult.teamPrefix) {
    const duplicates = checkDuplicateJerseys(match);
    if (duplicates.includes(parseResult.jerseyNumber)) {
      preview += ' ⚠️ Add h/a prefix';
    }
  }

  return preview;
}

// Props for the hook
interface UseTurboModeProps {
  enabled: boolean;
  match: Match | null;
  selectedTeam: 'home' | 'away' | 'both';
  globalClock: string; // Formatted as "MM:SS"
  operatorPeriod: number;
  sendEvent: (event: Omit<import('../../../store/useMatchLogStore').MatchEvent, 'match_id' | 'timestamp'>) => void;
  onEventDispatched?: (result: { action: string; outcome?: string }) => void;
  onError?: (error: string) => void;
}

interface UseTurboModeReturn {
  turboBuffer: string;
  lastResult: TurboParseResult | null;
  isProcessing: boolean;
  duplicateJerseys: number[];
  payloadPreview: string;
  safetyWarning: string | null;
  missingRecipient: boolean;
  handleInputChange: (value: string) => void;
  executeTurbo: () => boolean;
  clearTurbo: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  getSuggestions: () => string[];
}

/**
 * Main turbo mode hook
 */
export function useTurboMode({
  enabled,
  match,
  selectedTeam: _selectedTeam,
  globalClock,
  operatorPeriod,
  sendEvent,
  onEventDispatched,
  onError,
}: UseTurboModeProps): UseTurboModeReturn {
  const [turboBuffer, setTurboBuffer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Check for duplicate jersey numbers
  const duplicateJerseys = useMemo(() => 
    checkDuplicateJerseys(match), 
    [match]
  );

  // Parse the current buffer
  const lastResult = useMemo((): TurboParseResult | null => {
    if (!turboBuffer) return null;
    
    const parsed = parseTurboInput(turboBuffer);
    
    // Enrich with player info if we have a jersey number
    if (parsed.jerseyNumber !== undefined && match) {
      const found = findPlayerByJersey(parsed.jerseyNumber, match, parsed.teamPrefix);
      if (found) {
        parsed.player = found.player;
        parsed.team = found.team;
      }
      
      // Check if this jersey needs a team prefix
      if (duplicateJerseys.includes(parsed.jerseyNumber) && !parsed.teamPrefix) {
        parsed.needsTeamPrefix = true;
      }
    }
    
    return parsed;
  }, [turboBuffer, match, duplicateJerseys]);

  const missingRecipient = useMemo(() => {
    return !!(lastResult?.requiresRecipient && !lastResult.recipientNumber);
  }, [lastResult]);

  const safetyWarning = useMemo(() => {
    if (!lastResult) return null;
    if (missingRecipient) return 'Pass needs a recipient before logging.';
    if (lastResult.needsTeamPrefix) return 'Duplicate jersey on both teams — add h/a prefix.';
    return null;
  }, [lastResult, missingRecipient]);

  const payloadPreview = useMemo(() => {
    if (!lastResult || !lastResult.valid || !match) return '';

    const parts: string[] = [];
    parts.push(`P${operatorPeriod}`);
    parts.push(globalClock || '00:00');

    if (lastResult.team) {
      parts.push(lastResult.team.short_name || lastResult.team.name || 'Team');
    }

    if (lastResult.player) {
      parts.push(`#${lastResult.player.jersey_number} ${getPlayerDisplayName(lastResult.player)}`);
    }

    if (lastResult.action) {
      parts.push(lastResult.action);
    }

    if (lastResult.outcome) {
      parts.push(lastResult.outcome);
    }

    if (lastResult.recipientNumber) {
      const recipient = findPlayerByJersey(lastResult.recipientNumber, match, lastResult.recipientTeamPrefix);
      if (recipient) {
        parts.push(`→ #${recipient.player.jersey_number} ${getPlayerDisplayName(recipient.player)}`);
      } else {
        parts.push(`→ #${lastResult.recipientNumber}`);
      }
    }

    return parts.join(' • ');
  }, [globalClock, lastResult, match, operatorPeriod]);

  const handleInputChange = useCallback((value: string) => {
    setTurboBuffer(value);
  }, []);

  const clearTurbo = useCallback(() => {
    setTurboBuffer('');
  }, []);

  const executeTurbo = useCallback((): boolean => {
    if (!lastResult || !lastResult.valid || !match) {
      onError?.('Invalid input');
      return false;
    }

    // Find the player
    const found = findPlayerByJersey(lastResult.jerseyNumber!, match, lastResult.teamPrefix);
    if (!found) {
      onError?.(`Player #${lastResult.jerseyNumber} not found`);
      return false;
    }

    // Enforce recipient for passes
    if (lastResult.requiresRecipient && !lastResult.recipientNumber) {
      onError?.('Pass needs a recipient before logging');
      return false;
    }

    // Warning for duplicate jersey without team prefix
    if (lastResult.needsTeamPrefix) {
      console.warn(`Jersey #${lastResult.jerseyNumber} exists on both teams. Using ${found.teamSide} team. Add 'h' or 'a' prefix to specify.`);
    }

    setIsProcessing(true);

    try {
      // globalClock is already formatted as "MM:SS"
      const matchClock = globalClock;

      // Build event data
      const eventData: Record<string, unknown> = {
        action: lastResult.action,
      };
      
      if (lastResult.outcome) {
        eventData.outcome = lastResult.outcome;
      }

      // Add recipient if specified
      if (lastResult.recipientNumber) {
        const recipient = findPlayerByJersey(lastResult.recipientNumber, match, lastResult.recipientTeamPrefix);
        if (recipient) {
          eventData.recipient_id = recipient.player.id;
          eventData.recipient_name = getPlayerDisplayName(recipient.player);
        }
      }

      // Send the event (match_id and timestamp are added by sendEvent)
      sendEvent({
        match_clock: matchClock,
        period: operatorPeriod,
        team_id: found.team.id,
        player_id: found.player.id,
        type: lastResult.action!,
        data: eventData,
      });

      // Clear buffer after successful execution
      clearTurbo();
      
      // Callback
      onEventDispatched?.({ 
        action: lastResult.action!, 
        outcome: lastResult.outcome 
      });

      return true;
    } catch (error) {
      console.error('Turbo mode execution error:', error);
      onError?.('Failed to send event');
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [lastResult, match, globalClock, operatorPeriod, sendEvent, clearTurbo, onEventDispatched, onError]);

  const getSuggestions = useCallback((): string[] => {
    if (!lastResult) return [];
    
    const suggestions: string[] = [];

    // If needs team prefix, suggest that first
    if (lastResult.needsTeamPrefix && !lastResult.teamPrefix && lastResult.jerseyNumber) {
      suggestions.push(`h${lastResult.jerseyNumber}... (home team)`);
      suggestions.push(`a${lastResult.jerseyNumber}... (away team)`);
      return suggestions;
    }

    // If no action yet, suggest actions
    if (lastResult.jerseyNumber && !lastResult.action) {
      const prefix = lastResult.teamPrefix 
        ? (lastResult.teamPrefix === 'home' ? 'h' : 'a') + lastResult.jerseyNumber
        : String(lastResult.jerseyNumber);
      
      suggestions.push(`${prefix}p (Pass)`, `${prefix}s (Shot)`, `${prefix}d (Duel)`, `${prefix}f (Foul)`);
    }

    // If has action but no outcome, suggest outcomes
    if (lastResult.action && !lastResult.outcome) {
      const outcomes = TURBO_OUTCOME_CODES[lastResult.action];
      if (outcomes) {
        const base = turboBuffer.toLowerCase();
        Object.entries(outcomes).forEach(([num, label]) => {
          suggestions.push(`${base}${num} (${label})`);
        });
      }
    }

    return suggestions.slice(0, 4);
  }, [lastResult, turboBuffer]);

  // Focus input when enabled
  useMemo(() => {
    if (enabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [enabled]);

  return {
    turboBuffer,
    lastResult,
    isProcessing,
    duplicateJerseys,
    payloadPreview,
    safetyWarning,
    missingRecipient,
    handleInputChange,
    executeTurbo,
    clearTurbo,
    inputRef,
    getSuggestions,
  };
}

export default useTurboMode;
