# ProMatchAnalytics - GANet Progress

## Current Objective

- [ ] Implement field-based logger action flow (quick action menu incl. Goal +
      destination selection + out-of-bounds effective time stop) and
      validate with Playwright e2e

## Status

- Phase: Build
- Overall: In progress

## What Was Completed (since last update)

- [x] **Discovery decisions confirmed**

  - Quick actions: Pass, Shot, Goal, Foul, Duel, Card
  - Empty space: context-dependent auto-outcome
  - Out-of-bounds: very detailed coordinates for heatmaps
  - Clock behavior: stop effective time only

- [x] **Build started**

  - SoccerField enhanced with destination clicks + coordinates
  - QuickActionMenu component drafted
  - useActionFlow refactor underway (field-based steps, auto outcome resolution)
  - LoggerCockpit wiring underway
  - Goal quick action added with auto goal outcome
  - Live event feed now displays Goal indicator badge
  - Goal events now switch clock to ineffective time
  - Goal events appear in cockpit matchboard log
  - Matchboard score now derives from logged goal events

- [x] Fixed WebSocket base URL resolution to honor cloud API host and wss.
- [x] Aligned pre-commit hooks with CI (lint, tsc, unit tests) before commit.
- [x] Fixed TypeScript build errors (router future flag, logger period phases,
      test typing, and unused imports).
- [x] Captured Playwright artifacts for lifecycle and match-switch failures
      and added harness reconnect suppression.
- [x] Synced fix/match-status-display branch (progress.md cleanup, socket
      formatting) and pushed to origin.
- [x] Re-ran logger lifecycle and match-switch guardrail specs; all passing
      (3/3).
- [x] Kept poll logging for action-matrix runs to avoid flake.
- [x] Teams Manager now pages through all players (100/page) when populating the
      roster selector so existing players beyond the first page are available.
- [x] Keyboard Space toggle now updates ball-in-play state; logger keyboard e2e
      assertions stabilized on test IDs.

## Decisions Needed From User

- [ ] None (decisions approved by user on 2026-01-19)

## Architecture Notes (Draft)

### New Flow

```text
User clicks player on field
  ↓
QuickActionMenu appears at player position
  ↓
User clicks action (e.g., "Pass")
  ↓
User clicks destination on field
  ↓
Destination type interpreted:
  - Out of bounds → outcome = "Out", stop effective time
  - Same team player → outcome = "Complete", recipient = clicked player
  - Opponent player → outcome = "Incomplete" (interception)
  - Empty space → context-dependent
  ↓
Event submitted with auto-resolved outcome
```

### Components to Modify/Create

- **NEW**: `QuickActionMenu.tsx` - floating action selector
- **Enhanced**: `SoccerField.tsx` - add destination click handler
- **Modified**: `useActionFlow.ts` - field-based mode + auto-outcome logic
- **Modified**: `LoggerCockpit.tsx` - wire new flow
- **Modified**: `PlayerSelectorPanel.tsx` - always-on field mode

### Backend Impact

- None - event schema unchanged

## Tests Run

- Frontend: `npm run test:e2e -- e2e/logger-field-flow.spec.ts` -> PASS
  (includes Goal action + matchboard log)
- Frontend: `npm run test:e2e` -> PASS (85/85)

## Next Steps

- [ ] Validate any additional e2e specs if needed
- [ ] Run Teams roster add flow smoke after paging fix for available players list.
