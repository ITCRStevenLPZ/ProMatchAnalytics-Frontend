# ProMatchAnalytics - GANet Progress

## Current Objective

- [ ] Fix ineffective breakdown table layout in MatchAnalytics.

## Status

- Phase: Build
- Overall: On track

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
- [x] Added roster UI test IDs and e2e coverage for roster search, bulk edits,
      removal, and available-player filters in TeamsManager.
- [x] Added logger period transition e2e coverage (regulation, extra time,
      penalties, and invalid transition guardrails) plus stable test IDs for
      option buttons.
- [x] Debugged dev Atlas roster add error: fixed player with null player_id
      (Rene Miranda) causing roster POST 404s.
- [x] Added players_with_team ingestion e2e coverage and documented ingestion
      coverage matrix.
- [x] Stabilized logger extra-time transition e2e by waiting for backend status.
- [x] Instrumented logger analytics panel with test IDs and added e2e coverage
      to verify logged actions surface in analytics graphs and persist after
      reload.
- [x] Added cockpit e2e coverage for time-gated period transitions (minimum
      effective time checks in correct order).
- [x] Starting the clock now transitions Pending/Scheduled matches to
      Live_First_Half in the cockpit.
- [x] Quick action menu now repositions away from right/bottom edges to avoid
      clipping in the cockpit field view.
- [x] Added bar-style destination buttons along field edges (top/bottom/left/right)
      and increased field padding to keep them visible.
- [x] Expanded field padding and cockpit panel overflow to surface edge destination
      buttons; refreshed button styling for better visibility.
- [x] Destination bars now render closer to the field edge and only during
      destination selection.
- [x] Refined destination bar styling and aligned them flush to the field
      boundaries.
- [x] Upgraded destination bar styling with gradients, glow, and label accents.
- [x] Adjusted edge bar offsets and field padding to prevent overlaps with
      cockpit headers.
- [x] Widened cockpit containers to give the field more horizontal space.
- [x] Fixed phase transition validation to use global time instead of effective
      time, preventing false "minimum time not reached" errors when effective
      time is low but global time has elapsed.
- [x] Updated card flow to support white (fair play) cards, auto-upgrade
      second yellow to "Yellow (Second)", and show card icons by type in the
      live feed.
- [x] Blocked logging actions for expelled players (second yellow or red) and
      auto-unblocked when the card is undone.
- [x] Card logging now auto-creates foul+card combos (and second-yellow → red)
      when no foul exists at the same clock, and stops effective time for
      disciplinary cards.
- [x] Ineffective time now logs start/end events with required notes and event
      list note CRUD (add/edit/remove).
- [x] Added analytics comparative table (possession, passes, corners, shots,
      offsides, fouls, cards, effective/VAR time) above charts.
- [x] Added per-team/action ineffective time tracking (GameStoppage context),
      neutral ineffective timer, and analytics breakdown table.
- [x] Fixed match reset to restore period phase/halves in cockpit UI.
- [x] Guarded ineffective stoppage logging to prevent duplicate GameStoppage
      bursts.
- [x] Added Playwright coverage for ineffective breakdown, neutral timer,
      stoppage spam guard, and reset period status.
- [x] Added neutral ineffective fallback timing + active flag so timers tick
      immediately.
- [x] Ensured GameStoppage ClockStart uses a distinct match clock to avoid
      dedupe.
- [x] Added reset confirm button test id and stabilized ineffective breakdown
      spec with serial execution.
- [x] Full Playwright suite passing after logger ineffective breakdown
      stabilization (95/95).
- [x] UI now reads persisted ineffective aggregates and E2E validates per-period
      totals (96/96).
- [x] Adjusted ineffective breakdown table column widths/alignment for more
      consistent spacing.

## Decisions Needed From User

- [x] Per-team/action ineffective time requirements confirmed.
- [x] Scope: Goal, Out, Card, Foul, Substitution, Injury, VAR, Other.
- [x] Storage: persisted aggregates on match document (computed from
      GameStoppage writes).
- [x] UI: analytics breakdown reads persisted aggregates.

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
- Frontend: `npm run test:e2e` -> PASS (90/90) on 2026-01-28 (includes new
  analytics assertions in logger-advanced)
- Frontend: `npm run test:e2e -- e2e/admin-team-roster-ui.spec.ts` -> PASS
- Frontend: `npm run test:e2e -- e2e/logger-field-flow.spec.ts` -> PASS
- Frontend: `npm run test:e2e -- e2e/logger-period-transitions.spec.ts` -> PASS
- Frontend: `npm run test:e2e -- e2e/ingestion-management.spec.ts` -> PASS
- Frontend: `npm run test:e2e -- e2e/logger-period-transitions.spec.ts` -> PASS
  (4/4 on 2026-01-29)
- Frontend: `npm run test:e2e -- e2e/logger-period-transitions.spec.ts` -> PASS
  (4/4 on 2026-02-02 after global time validation fix)
- Frontend: `npm run test:e2e -- e2e/logger-field-flow.spec.ts` -> FAIL
  (port 8000 already in use; stop existing server or enable reuseExistingServer)
- Frontend: `npm run test:e2e -- e2e/logger-field-flow.spec.ts` -> PASS
  (2/2 on 2026-02-03 after ineffective note/CRUD coverage)
- Frontend: `npx playwright test e2e/logger-ineffective-breakdown.spec.ts` ->
  PASS (3/3)
- Frontend: `npm run test:e2e` -> PASS (95/95)
- Frontend: `npm run test:e2e` -> PASS (96/96)
- Frontend: Not run (layout-only change).

## Next Steps

- [ ] Validate any additional e2e specs if needed
- [ ] Confirm the ineffective breakdown layout matches the desired arrangement.
- [x] Run logger period transitions e2e spec.
- [x] Fix phase transition validation to use global time.
- [x] Run Teams roster add flow smoke after paging fix for available players list.
- [x] Run ingestion management e2e spec with players_with_team coverage.
