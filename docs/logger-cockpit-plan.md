# Logger Cockpit Enhancement Plan

## Scope
Improve reliability, speed, and safety of the logger cockpit (clock, status transitions, turbo, action flow, event feed). This document will track baseline issues, planned work, and completed changes.

## Baseline (current observed)
- Status transitions can hit backend 400s if the frontend allows invalid steps (e.g., Pending → Halftime without Live_First_Half).
- Clock controls do not surface backend status/clock_mode coherently; operators may click actions the backend rejects.
- Errors from `updateMatch`/`updateMatchStatus`/event sends surface only in console; no operator-facing retry.
- Turbo mode: recipient ambiguity warnings are limited; execution can proceed even when pass recipient is missing.
- Live feed shows events but lacks pending/confirmation state and duplicate guard.
- Reset is guarded by modal, but no check for unsent queue.

## Objectives
1) Prevent bad transitions and surface clear guidance (status/period/mode ribbon, local validation).
2) Make errors visible and recoverable (toasts + retry, queued sends badge).
3) Speed up logging (turbo safety, recent players, macros/hotkeys visibility) without sacrificing integrity.
4) Reduce data risk (duplicate guard, unsent-queue awareness, drift detection, lock after Fulltime).

## Planned Work (ordered)
- [x] Status/clock ribbon: always show status, period, clock_mode, running/paused; gate buttons when backend would reject.
- [x] Local transition guard: validate allowed status transitions before calling API; show inline error.
- [x] Error surfacing + retry: toast + retry for status transitions; header pills for queued/pending/error visibility.
- [x] Turbo safety: block pass execution without recipient when required; warn on missing/ambiguous jerseys; preview payload snippet.
- [x] Recent players strip + hotkey overlay: quick chips of last 5 players and visible key hints near turbo input.
- [x] Duplicate/pending indicators in feed: badge for pending vs confirmed; pending count chip; duplicate highlight by match_clock/team/type.
- [x] Clock drift nudge: compare local clocks vs backend accumulators; prompt “resync” if drift >2s.
- [x] Reset safety: disable reset if unsent queue exists; keep confirm modal.
- [x] Role/lock: hide destructive controls for non-admin; lock cockpit if status is Fulltime.

## Progress Log
- [x] 2025-12-05: Created plan file and captured baseline/state.
- [x] 2025-12-05: Added status/clock ribbon and local transition guard (blocks invalid transitions and shows operator error).
- [x] 2025-12-06: Added transition error toast with retry hook; guard returns booleans for safer status changes.
- [x] 2025-12-06: Added turbo safety (pass requires recipient, duplicate jersey warning, payload preview), pending badges in live event feed, and header pills for queued/pending/error state.
- [x] 2025-12-06: Added recent player chips and hotkey overlay near turbo input.
- [x] 2025-12-06: Added clock drift nudge with resync prompt when local vs backend clocks diverge >2s.
- [x] 2025-12-06: Added reset guard that blocks reset while queued/pending events exist, with inline warning.

## Notes
- Frontend dirs of interest: `src/pages/logger/hooks` (useMatchTimer, usePeriodManager, useTurboMode, useActionFlow), `components/*` (MatchTimerDisplay, TurboModeInput, LiveEventFeed, QuickActionsBar, RecipientSelectionPanel).
- Backend expectations: status transitions must follow Pending → Live_First_Half → Halftime → Live_Second_Half → Fulltime; clock-mode endpoint rejects status-only payloads.
