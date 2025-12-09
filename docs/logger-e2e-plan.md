# Logger E2E Coverage Plan

_This file tracks planned and in-flight Playwright specs for the logger cockpit. Update as specs are added/modified._

## Existing coverage (reference)
- `logger-basic`, `logger-advanced`, `logger-comprehensive`, `logger-multi-event`, `logger-undo`, `logger-keyboard`, `logger-validation-errors`, `logger-viewer-sync`, `logger-match-switch-guardrails`, `logger-offline-resilience`.
- New: `logger-substitution-windows` (substitution validation, windows/sub counts, concussion flag).
- New: `logger-substitution-rules` (extra-time allowances and re-entry block).
- New: `logger-lifecycle` (clock start/stop, halftime/second half, fulltime lock, effective clock toggle, reload persistence).
- New: `logger-event-taxonomy` (goal + pass coverage with analytics persistence).

## Planned additions
1) **logger-lifecycle.spec.ts** — IN PROGRESS/ADDED (baseline clocks + halves/fulltime)
   - Start/pause/resume/end across 1H/2H and extra time; effective vs running clock mode; persistence after reload (period, clock state, events).
2) **logger-substitution-rules.spec.ts** — ADDED (extra-time allowance + re-entry block)
   - Max subs/windows enforcement; halftime/extra-time windows allowed; prevent re-entry of substituted-out players; bench/active lists persist after reload; opponent concussion compensation reflected.
3) **logger-event-taxonomy.spec.ts**
   - Create/edit/delete for goals (incl. own goal, penalty), cards (YC/RC/second YC), offsides, fouls, set pieces, VAR states; required-field validation; timeline order; analytics aggregation updates after edits/deletes.
4) **logger-conflicts.spec.ts**
   - Ingest vs live duplicates; conflict banner; manual resolution flow; deduped timeline; synced analytics/state after resolve.
5) **logger-resilience-advanced.spec.ts**
   - Websocket drop/reconnect (out-of-order + duplicate server events); optimistic updates; reconciliation without duplicate badges; final counts correct after flush.
6) **logger-permissions.spec.ts**
   - Viewer vs analyst vs admin: forbidden actions for viewer, admin-only paths (undo, turbo, substitutions), analytics/read-only allowed.
7) **logger-analytics-integrity.spec.ts**
   - Log mixed events; verify KPIs/charts; re-check after delete/edit; edge cases: own goals, penalty shootout, red card reducing player count.
8) **logger-l10n-formatting.spec.ts**
   - Alternate locale/timezone; time/number/date formatting in timeline and exports; translated labels present in forms.
9) **logger-error-handling.spec.ts**
   - Stub 4xx/5xx on event post and substitution validate; non-destructive UI, banner/toast shown; retry/backoff; no data loss after recovery.

## Wiring/CI
- No config change needed: `playwright.config.ts` already discovers `e2e/*.spec.ts`.

## Notes
- Reuse existing helpers in `e2e/utils/logger.ts` and admin seed helpers where possible.
- Prefer localization-tolerant assertions (regex for EN/ES labels).
- Use harness helpers for socket/offline scenarios and seeding endpoints for deterministic state.
