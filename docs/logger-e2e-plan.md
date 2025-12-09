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
   - Log goal + card + foul + offside + set piece; card escalation (YC, 2nd YC, RC); own goal + VAR decision + undo/resend edit flow; penalty shootout outcomes (goal/saved/missed) including sudden death; VAR outcomes matrix (allow/disallow + overturn via undo/resend); verify timeline order, analytics visibility, and reload persistence; future: tighten own-goal edge cases.
4) **logger-conflicts.spec.ts** — ADDED
   - Ingest vs live duplicates (ingested event pre-seeded, operator re-logs same payload); duplicate banner + dismissal; timeline deduped after duplicate response; analytics visible and state persists after reload.
5) **logger-resilience-advanced.spec.ts** — ADDED
   - Websocket drop/reconnect with queued flush; inject out-of-order server event plus duplicate arrival; expect duplicate banner handled/dismissed; optimistic queue preserved; final counts correct and timeline deduped after reload.
6) **logger-permissions.spec.ts** — ADDED
   - Viewer vs analyst vs admin: viewer/analyst blocked from admin-only reset/period transitions; analytics view remains accessible; admin sees reset + transitions enabled.
7) **logger-analytics-integrity.spec.ts** — ADDED
   - Mixed events (passes, shots, fouls, interceptions); analytics KPIs populated; undo reduces totals; analytics view persists after reload with updated counts.
8) **logger-l10n-formatting.spec.ts** — ADDED
   - Seeds ES locale via localStorage; analytics panel shows Spanish labels; timeline/effective clock renders mm:ss formatting; locale and analytics access persist after reload.
9) **logger-error-handling.spec.ts**
   - Stub 4xx/5xx on event post and substitution validate; non-destructive UI, banner/toast shown; retry/backoff; no data loss after recovery.

## Wiring/CI
- No config change needed: `playwright.config.ts` already discovers `e2e/*.spec.ts`.

## Notes
- Reuse existing helpers in `e2e/utils/logger.ts` and admin seed helpers where possible.
- Prefer localization-tolerant assertions (regex for EN/ES labels).
- Use harness helpers for socket/offline scenarios and seeding endpoints for deterministic state.
