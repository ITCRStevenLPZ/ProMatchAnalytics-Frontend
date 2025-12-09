import { ActionConfig, MatchStatus } from './types';

export const ACTION_FLOWS: Record<string, ActionConfig> = {
  Pass: {
    actions: ['Pass'],
    outcomes: { Pass: ['Complete', 'Incomplete', 'Out', 'Pass Offside'] },
    needsRecipient: true,
  },
  Shot: {
    actions: ['Shot'],
    outcomes: { Shot: ['Goal', 'OnTarget', 'OffTarget', 'Blocked', 'Post', 'Saved'] },
  },
  Duel: {
    actions: ['Duel'],
    outcomes: { Duel: ['Won', 'Lost', 'Success (Dispossessed)'] },
  },
  FoulCommitted: {
    actions: ['Foul'],
    outcomes: { Foul: ['Standard', 'Advantage', 'Penalty'] },
  },
  Card: {
    actions: ['Card'],
    outcomes: { Card: ['Yellow', 'Red', 'Yellow (Second)'] },
  },
  Carry: {
    actions: ['Carry'],
    outcomes: { Carry: ['Successful', 'Dispossessed'] },
  },
  Interception: {
    actions: ['Interception'],
    outcomes: { Interception: ['Success', 'Lost'] },
  },
  Clearance: {
    actions: ['Clearance'],
    outcomes: { Clearance: ['Success', 'Failed'] },
  },
  Block: {
    actions: ['Block'],
    outcomes: { Block: ['Success'] },
  },
  Recovery: {
    actions: ['Recovery'],
    outcomes: { Recovery: ['Interception', 'Tackle', 'Aerial', 'Loose Ball'] },
  },
  Offside: {
    actions: ['Offside'],
    outcomes: { Offside: ['Standard'] },
  },
  SetPiece: {
    actions: ['Corner', 'Free Kick', 'Throw-in', 'Goal Kick', 'Penalty', 'Kick Off'],
    outcomes: {
      Corner: ['Complete', 'Incomplete'],
      'Free Kick': ['Complete', 'Incomplete', 'Shot'],
      'Throw-in': ['Complete', 'Incomplete'],
      'Goal Kick': ['Complete', 'Incomplete'],
      Penalty: ['Goal', 'Saved', 'Missed'],
      'Kick Off': ['Complete'],
    },
  },
  GoalkeeperAction: {
    actions: ['Save', 'Claim', 'Punch', 'Pick Up', 'Smother'],
    outcomes: {
      Save: ['Success', 'Failed'],
      Claim: ['Success', 'Failed'],
      Punch: ['Success', 'Failed'],
      'Pick Up': ['Success'],
      Smother: ['Success', 'Failed'],
    },
  },
  Substitution: {
    actions: ['Substitution'],
    outcomes: {
      Substitution: [],  // No outcomes - handled by modal
    },
    isSpecial: true,  // Special handling - opens substitution flow modal
  },
};

export const DEFAULT_PERIOD_MAP: Record<MatchStatus, number> = {
  Scheduled: 1,
  Live: 1,
  Halftime: 1,
  Completed: 2,
  Live_First_Half: 1,
  Live_Second_Half: 2,
  Fulltime: 2,
  Abandoned: 1,
  Pending: 1,
  Live_Extra_First: 3,
  Extra_Halftime: 3,
  Live_Extra_Second: 4,
  Penalties: 5,
};

export const KEY_ACTION_MAP: Record<string, string> = {
  // Core actions
  p: 'Pass',
  P: 'Pass',
  s: 'Shot',
  S: 'Shot',
  d: 'Duel',
  D: 'Duel',
  f: 'Foul',
  F: 'Foul',
  i: 'Interception',
  I: 'Interception',
  c: 'Clearance',
  C: 'Clearance',
  b: 'Block',
  B: 'Block',
  r: 'Recovery',
  R: 'Recovery',
  o: 'Offside',
  O: 'Offside',
  // Card and Carry
  y: 'Card',
  Y: 'Card',
  a: 'Carry',
  A: 'Carry',
  // Set pieces
  k: 'Corner',
  K: 'Corner',
  e: 'Free Kick',
  E: 'Free Kick',
  t: 'Throw-in',
  T: 'Throw-in',
  g: 'Goal Kick',
  G: 'Goal Kick',
  n: 'Penalty',
  N: 'Penalty',
  // Goalkeeper actions
  v: 'Save',
  V: 'Save',
  l: 'Claim',
  L: 'Claim',
  u: 'Punch',
  U: 'Punch',
  m: 'Smother',
  M: 'Smother',
  // Special
  x: 'Substitution',
  X: 'Substitution',
  // Clock control
  ' ': 'ToggleClock',
};
