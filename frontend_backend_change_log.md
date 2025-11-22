# Frontend & Backend Change Log

 _Last updated: 2025-11-21 (afternoon)_

Purpose: capture major follow-up actions tied to the match-event deduplication guard so the frontend and backend stay in sync.

---

## 2025-11-22 — Conflict Dialog Regression Hardening

### Frontend Tasks
- [x] Added deterministic test hooks (`data-testid`s) across `ConflictReviewDialog` so Playwright can toggle editing, inspect diffs, and submit actions without brittle text selectors.
- [x] Updated every ingestion API call (`ConflictReviewDialog`, `IngestionPage`, `src/lib/ingestion.ts`) to rely on the `apiClient` base URL instead of re-prefixing `/api/v1`, fixing the double-prefix 404s we hit in E2E.
- [x] Migrated the dialog's `useQuery` call to the TanStack Query v5 object signature to stop the runtime "Bad argument type" error when the component mounts.
- [x] Authored `e2e/admin-ingestion-conflict-dialog.spec.ts`, which seeds a conflict, opens the dialog, edits a diff, and verifies acceptance end-to-end.

### Backend Tasks
- [x] Sanitized `IngestionManager`'s `existing_record_snapshot` export via `_stringify_document(...)`, preventing Mongo `ObjectId` serialization crashes whenever a live record includes nested metadata.

### QA
- [x] `cd ProMatchAnalytics-Backend && ./venv/bin/python3.12 -m pytest tests/test_ingestions_router.py`
- [x] `cd ProMatchAnalytics-Frontend && npx playwright test e2e/admin-ingestion-conflict-dialog.spec.ts`

## 2025-11-22 — Ingestion Conflict Stress Reliability

### Frontend Tasks
- [x] **Deterministic conflict seeding** — `e2e/ingestion-management.spec.ts` now purges leftover `Conflict Seed` players ahead of each run, seeds the baseline via the ingestion API (so `duplicate_key` and `content_hash` fields exist), and randomizes the seed names/countries to avoid accidental near-match collisions with unrelated fixtures.
- [x] **Force true conflicts** — the conflict batch toggles player positions (CM→CDM, ST→CF) while keeping names/birth dates/countries aligned, producing genuine `near_conflict` items instead of the previous exact-duplicate discard so pagination + metrics assertions work reliably.
- [x] **Seed verification guard** — the spec confirms all 60 baseline players land before the stress batch runs, making it obvious if future backend tweaks prevent conflict generation.

### QA
- [x] `PROMATCH_PLAYWRIGHT_BACKEND_PORT=18080 npx playwright test e2e/admin-*.spec.ts e2e/ingestion-management.spec.ts`

## 2025-11-22 — Conflict Manager Redesign Kickoff

### Frontend Tasks
- [x] Conflict review dialog now fetches `/api/v1/ingestions/conflicts/{item_id}` via React Query, shows significant diffs, and renders an inline JSON snapshot of the live record. Editing applies per-field overrides with basic JSON coercion before acceptance.
- [x] Reject flow surfaces structured reason options plus a notes validator (≥15 chars when choosing “Other”), and the action buttons disable automatically if another reviewer resolves the conflict mid-session.
- [x] Similar-records viewer can be launched from the dialog (seeded with the live snapshot for now), new localization keys cover every helper/error string, and the ingestion table shows when a conflict has already been cleared.

### Backend Tasks
- [x] Added `existing_record_snapshot` to `ConflictRecord`, enriched `GET /ingestions/{batch}/items` with `has_conflict` + `conflict_id`, and exposed `GET /ingestions/conflicts/{item_id}` for the dialog hook.
- [x] Conflict resolver now normalizes FieldDiff payloads when fetching a single record, ensuring Pydantic validation doesn’t explode when UI requests a refreshed diff.

### QA
- [ ] `cd ProMatchAnalytics-Backend && poetry run pytest tests/test_ingestions_router.py`
- [ ] `cd ProMatchAnalytics-Frontend && npm run lint && npm run lint:i18n`

## 2025-11-21 — Roster Inline Error Regression Fix

### Frontend Tasks
- [x] **Roster payload parity** — `src/pages/TeamsManager.tsx` now includes `team_id` when posting to `/teams/{team_id}/players`, matching `app/schemas_crud.TeamRosterEntry` so backend jersey-number validation returns field-specific errors instead of generic 422s.
- [x] **Inline error surfacing** — the roster modal reuses `applyBackendValidationErrors`, so conflicts (duplicate jersey numbers, etc.) now render the translated field error plus the banner the Playwright spec expects.

### QA
- [x] `PROMATCH_PLAYWRIGHT_BACKEND_PORT=18080 npx playwright test e2e/admin-roster-inline-errors.spec.ts`

## 2025-11-21 — Teams Localization UX & Export Parity

### Frontend Tasks
- [x] **Localized name defaults** — `src/pages/TeamsManager.tsx` now seeds every edit/create form with locale-aware `i18n_names` via `withTeamFormDefaults`, keeping duplicate/change detection, payload builds, and cancel flows consistent with the Player/Competition modals.
- [x] **UI surfacing** — Teams tables and modals render per-locale overrides (EN/ES) with inline validation powered by the new localized input handler so admins can see and edit translations without leaving the page.
- [x] **Schema + export alignment** — `teamSchema` permits `i18n_names.en|es` and `exportTeams` injects `localized_name_*` columns, ensuring CSV/JSON downloads capture the overrides administrators enter.

### QA
- [x] `npm run lint`
- [x] `npx vitest run`

## 2025-11-21 — Referee Delete Guard Feedback

### Frontend Tasks
- [x] **Patterned delete guard messaging** — `RefereesManager` now parses the backend "Cannot delete referee with N linked match(es)" guard and surfaces a translated call-to-action so admins know to clear the match assignments before retrying.
- [x] **Locale coverage** — Added `deleteGuards.refereeMatches` copy to the EN/ES admin bundles so both locales receive consistent guidance when the guard trips.

### QA
- [x] `npm run lint`

## 2025-11-21 — Competition Delete Guard Feedback

### Frontend Tasks
- [x] **Localized competition guard** — `CompetitionsManager` now detects the backend "Cannot delete competition with N associated matches" detail and swaps in translated recovery guidance so admins know to clear those matches first.
- [x] **Locale coverage** — Added `deleteGuards.competitionMatches` strings to the EN/ES admin bundles so translation parity asserts stay green when the guard trips.

### QA
- [x] `npm run lint`

## 2025-11-21 — Player · Team · Venue Delete Guard Feedback

### Frontend Tasks
- [x] **Player guard messaging** — `PlayersManager` parses the "Cannot delete player with N team assignments" guard and surfaces the localized `deleteGuards.playerAssignments` copy so admins know to detach the player from teams before retrying.
- [x] **Team + venue guards** — Both `TeamsManager` and `VenuesManager` detect their respective "Cannot delete ... with N matches" responses and show the translated `deleteGuards.teamMatches` / `deleteGuards.venueMatches` guidance instead of raw backend text.
- [x] **Locale parity** — Added the new guard strings to the EN/ES admin bundles so `npm run lint:i18n` maintains key coverage.

### QA
- [x] `npm run lint`

## 2025-11-19 — Admin Duplicate ID Error Surfacing

### Frontend Tasks
- [x] Added a shared backend error resolver that pattern-matches duplicate ID detail strings (e.g., "Player 'foo' already exists") and maps them to localized inline errors via `resolveKnownFieldError`.
- [x] Wired the resolver plus new translation keys into the Players, Teams, Competitions, Venues, and Referees managers so duplicate submissions now highlight the corresponding ID inputs instead of showing raw backend text.
- [x] Expanded EN/ES admin locale bundles and `validationMessages.ts` with `validationErrors.<entity>IdExists` entries to keep translation parity checks satisfied.

### QA
- [x] `npm run lint`

## 2025-11-19 — Payload Builder Unit Tests

### Frontend Tasks
- [x] Added `src/lib/__tests__/payloadBuilders.test.ts` to cover the player, team, venue, referee, and competition payload builders, asserting trimming, numeric conversion, and date/i18n normalization logic.
- [x] Verified the team helper maintains manager/staff sanitization (deduping blank or duplicate entries) so regressions trigger fast unit failures instead of surfacing late during manual QA.

### QA
- [x] `npx vitest run`

---

## 2025-11-16 — Match Event Deduplication Guard Alignment

### Frontend Tasks
- [x] **Align WebSocket payload schema** — `LoggerCockpit` now generates backend-compliant payloads (see commit updating `src/pages/LoggerCockpit.tsx` on 2025-11-16). Event objects include `match_clock`, canonical `type`, and omit deprecated `event_type`/`match_time_seconds`, keeping the dedupe tuple in sync.
- [x] **Handle ack statuses** — `useMatchSocket` now tracks pending client IDs, interprets ack results, updates `_id` on success, and removes or requeues optimistic entries (`src/hooks/useMatchSocket.ts`, 2025-11-16).
- [x] **Queue retry integrity** — queued events stay persisted until ack success; duplicates/errors keep their queue slot, and live failures are re-queued (same hook/store update).
- [x] **UI feedback for duplicates** — duplicate acks now trigger a neutral banner and highlight the existing event via `duplicateHighlight` state, with auto-dismiss and visual emphasis in `LoggerCockpit`.
- [x] **Debounce submissions** — action/outcome/recipient buttons disable while any ack is pending (derived from `pendingAcks`), preventing rapid resubmits until the server responds.
- [x] **Telemetry counters** — duplicate acks now emit `match_event_duplicate` telemetry via `trackTelemetry` inside `useMatchSocket`, capturing match, period, clock, and source metadata for analytics dashboards. `LoggerCockpit` surfaces the session duplicate count both in the banner and in a persistent header card with reset controls so operators always see the current duplicate pressure.
- [x] **Conflict metadata surfacing** — ingestion item tables now include resolver + timestamp columns, and the conflict review drawer shows a dedicated resolution card so operators can see who resolved a clash and when (`src/pages/IngestionPage.tsx`, `src/components/ingestion/ConflictReviewDialog.tsx`).
- [x] **State management enhancements** — WebSocket payloads now carry a `client_id`, the backend echoes that exact identifier in ack envelopes (including duplicate/error cases), and the store resolves pending entries via the explicit ID instead of FIFO order. Legacy queued events without IDs are backfilled before resend, keeping optimistic/live state in lockstep.
- [x] **Hydrate live timeline from backend** — `LoggerCockpit` now calls `/matches/{match_id}/events` on mount and seeds the store via `setLiveEvents`, so operators land on the confirmed feed (`src/pages/LoggerCockpit.tsx`, 2025-11-16).
- [x] **Process broadcast payloads** — `_confirmed` socket payloads are merged into `liveEvents` via `upsertLiveEvent`, ensuring both self and peer events stay in sync (`src/hooks/useMatchSocket.ts`).
- [x] **Match-scoped offline queue** — `useMatchLogStore` now persists `queuedEventsByMatch`, only surfaces items for the active match, and `useMatchSocket` syncs solely against the current `matchId`, preventing stale queued payloads from other games from broadcasting when operators switch contexts.
- [x] **Operator clock & period controls** — `LoggerCockpit` now includes manual clock inputs with start/pause/reset plus a period selector; values persist in `useMatchLogStore` and are injected into outbound payloads so the dedupe tuple always reflects the on-field state (`src/pages/LoggerCockpit.tsx`, `src/store/useMatchLogStore.ts`).

### Backend Tasks
- [x] **WebSocket ack test coverage** — `tests/test_match_event_deduplication.py` now exercises both success and duplicate paths, asserting ack envelopes echo the originating `client_id`, duplicate metadata is preserved, and broadcasts retain `_confirmed`/`_saved_at`/`_id` fields without double-sending on duplicates.
- [x] **Ingestion acceptance tests** — `tests/test_ingestions_router.py` now seeds a conflict item, hits the accept endpoint, and asserts the response includes `resolved_by`/`resolved_at` while Mongo documents persist the metadata for both the item and its conflict record.
- [x] **Conflict retry safeguards** — `IngestionManager.retry_failed_items` now reprocesses both `error` and `validation_failed` rows, and `tests/test_ingestion_retry.py` asserts the retried docs receive fresh `content_hash`/`duplicate_key`. `tests/test_conflict_resolver.py` also verifies conflict edits update `content_hash`, ensuring every reopen path keeps hashes in sync.
- [x] **Duplicate ack metadata** — `app/websocket.py` now returns a `duplicate` payload with the existing event's ID/clock/period/team for both pre-insert and insert-race paths, and `useMatchSocket` surfaces the ID in the logger UI banner (`tests/test_match_event_deduplication.py` updated to assert the metadata).
- [x] **Paginate match event queries** — `/matches/{match_id}/events` now enforces page/size params with projections, tests, and frontend pagination to keep large matches manageable.
- [x] **Duplicate telemetry export** — backend now exposes `app/telemetry.py` with a Prometheus counter (`match_event_duplicates_total`) and `ConnectionManager.handle_event` increments it for both pre-insert checks and insert-race duplicates, enabling dashboards that correlate operator pain with backend metrics (requires `prometheus-client`).

### Cross-Cutting / QA
- [x] **E2E duplicate scenario** — covered via Playwright (`e2e/duplicate-events.spec.ts`); the spec submits the same event twice, asserts one duplicate banner, and keeps the UI stable.
- [x] **Offline retry regression** — added `src/store/useMatchLogStore.test.ts` to simulate repeat client_id refreshes and ensure `removeQueuedEvent` is the only way items disappear from IndexedDB-backed queues (vitest covers retry + success ack path).
- [x] **Timeline refresh on conflict resolution** — `useMatchSocket` now raises a store-level refresh token whenever it receives a `status="success"` ack without a matching pending event (the ingestion reconcile path). `LoggerCockpit` listens for that token via `useMatchLogStore.lastTimelineRefreshRequest` and rehydrates `/matches/{match_id}/events`, guaranteeing the timeline reflects reconciled items.
- [x] **Contract test for queue scoping** — the same vitest suite now switches between matches A/B and asserts `queuedEvents` only expose the active match while `queuedEventsByMatch` keeps both queues isolated.
- [x] **Load test for match event fetch** — added the k6 harness in `load-tests/match-events-fetch.js` (+ README) so we can hammer `/matches/{match_id}/events` with 25–50 VUs over ~50k-record datasets. Thresholds enforce `p95 < 350ms` and `<1%` errors; configurable env vars let us point at staging or prod-like stacks before large competitions go live.

## 2025-11-17 — Playwright Coverage Expansion & Runbook

### Status Tracker
- **Done**
	- Cataloged current logger-focused Playwright specs (`e2e/logger-basic.spec.ts`, `e2e/duplicate-events.spec.ts`) to establish the baseline coverage footprint.
	- Outlined the next wave of high-value Playwright scenarios so implementation can begin without further discovery.
	- Captured the nohup + virtualenv command runbook for starting/stopping the backend e2e server prior to Playwright runs.
	- Implemented `e2e/logger-multi-event.spec.ts` plus supporting helpers in `e2e/utils/logger.ts`, then executed the spec via the nohup+venv workflow to validate multi-event coverage end-to-end.
	- Extended the logger E2E harness (raw event + context APIs) and landed `e2e/logger-validation-errors.spec.ts` to ensure backend validation failures drive the queued badge state; verified via nohup+venv Playwright run.
	- Added socket-level e2e hooks plus `e2e/logger-offline-resilience.spec.ts`, proving queued events persist during forced disconnects and auto-flush after reconnect.
	- Delivered undo workflow end-to-end: UI/store/socket support, backend `command: undo` handling, harness `undoLastEvent`, and the Playwright coverage in `e2e/logger-undo.spec.ts` to prove the pending badge clears and the reverted event disappears.
	- Landed the match-switch guardrails helpers + spec (`e2e/logger-match-switch-guardrails.spec.ts`), including queue snapshot hooks and connection status test IDs so the cross-match queue isolation scenario is now automated end-to-end.
- **Pending**
	- _None._

### Scenario Backlog (Playwright)
- [x] **Multi-event timeline sanity** — covered by `e2e/logger-multi-event.spec.ts`; validates Pass + Shot ordering for both teams plus reload persistence.
- [x] **Undo + pending queue cleanup** — covered by `e2e/logger-undo.spec.ts`, which drives the harness `undoLastEvent`, watches the ack drop the optimistic entry, and verifies both the pending and queued badges stay clear.
- [x] **Offline/reconnect resilience** — covered by `e2e/logger-offline-resilience.spec.ts`, which forces a disconnect via the socket harness, confirms queued badge visibility, and then reconnects to ensure the queue flushes cleanly.
- [x] **Validation error surfacing** — covered by `e2e/logger-validation-errors.spec.ts`; submitting an invalid payload now proves the queued badge appears when the backend rejects an event.
- [x] **Match switch guardrails** — covered by `e2e/logger-match-switch-guardrails.spec.ts`; forces an offline queue on match A, hops to match B to confirm that match’s timeline/queue stay clean, then revisits match A to prove the queued payload persists until reconnection.

### Undo Flow Implementation (2025-11-17)
- Added an `Undo last` action directly in `LoggerCockpit` that leverages the match-log store's undo stack and disables itself when a server round-trip is required but no socket is available.
- WebSocket payloads now persist `client_id` values, enabling the backend `handle_undo` branch to locate and delete the targeted document before broadcasting an `event_undone` notification to every active logger.
- `__PROMATCH_LOGGER_HARNESS__` exposes `undoLastEvent`, allowing Playwright to deterministically rewind the last optimistic entry; `e2e/logger-undo.spec.ts` asserts the ack clears pending/queued badges and the timeline reflects the removal.
 - Queue snapshot + match-switch guardrails are now covered; undo remains available as part of the broader logger hardening set.

### Nohup + Virtualenv Runbook
1. **Start backend e2e server**
	 ```bash
	 cd /Users/stevenlpz/Desktop/ProMatchCode/split-repos/ProMatchAnalytics-Backend
	 nohup ./venv/bin/python scripts/run_e2e_server.py --port 8000 > /tmp/e2e_server.log 2>&1 &
	 ```
	 - Capture the PID emitted by `nohup`; verify readiness via `tail -f /tmp/e2e_server.log` until the server logs `Application startup complete`.
2. **Run Playwright suite**
	 ```bash
	 cd /Users/stevenlpz/Desktop/ProMatchCode/split-repos/ProMatchAnalytics-Frontend
	 npx playwright test e2e/<spec-name>.spec.ts
	 ```
	 - Ensure `PROMATCH_E2E_BACKEND_URL=http://127.0.0.1:8000` is exported if a non-default port is used.
3. **Stop backend**
	 ```bash
	 kill <PID>
	 ```
	 - Confirm shutdown by tailing `/tmp/e2e_server.log` and checking for `Application shutdown complete`.
4. **Log hygiene** — rotate or truncate `/tmp/e2e_server.log` and `e2e_ws.log` between runs to keep noise down when debugging future flakes.

## 2025-11-18 — Admin CRUD + Ingestion Playwright Coverage

### Status Tracker
- **Done**
	- Added `e2e/admin-models-crud.spec.ts` to cover CRUD flows for competitions, venues, referees, players, and teams plus a full ingestion batch lifecycle targeting teams.
	- Landed the `Team roster enforces unique jersey numbers` scenario inside `e2e/admin-models-crud.spec.ts`, proving duplicate jersey submissions return the backend `400` detail and leave the roster intact; verified via the same Playwright workflow.
	- Expanded admin roster coverage with `Team roster enforces max active players limit` and `Team roster blocks duplicate jersey updates`, validating both the new backend guard rails and the existing jersey update constraint via a fresh Playwright run.
	- Added ingestion-focused specs (`supports ingestion items pagination and filtering`, `resolves ingestion conflicts via accept and reject flows`) plus helper polling to exercise pagination, status filters, and manual conflict resolution behaviors end-to-end.
	- Expanded ingestion coverage again with global conflict list filter assertions and the failed-item retry flow, wiring Playwright into Mongo for payload fixes and capturing both scenarios inside `e2e/admin-models-crud.spec.ts`.
- **Pending**
	- None; monitor for backend schema drifts that would require fixture updates.

### Notes
- The ingestion scenario seeds a dedicated team via the ingestion API, polls for the batch to reach `success`, validates item listings, and cleans up the created team via `DELETE /teams/{team_id}` to keep the database tidy.
- All CRUD tests rely on the admin guard; make sure the Playwright auth token still maps to a role with `admin` privileges before running in other environments.

### Backend Tasks
- [x] Enforced `max_active_players_per_team` (configurable) inside `app/routers/teams_crud.py`, ensuring single-player adds, reactivations, and bulk uploads respect the cap and surface a descriptive 400 when exceeded.
- [x] Augmented `tests/test_teams_router.py` with roster limit + jersey update cases so pytest catches regressions locally before the Playwright suite does.

### Playwright Coverage Roadmap _(refreshed 2025-11-19)_
- [x] **Player directory filters & suggestions** — `e2e/admin-directory-filters.spec.ts` now drives paginated `/players` queries with position/country/age filters plus `/players/search/suggestions` partial-match coverage; latest run stays green post-helper refactor (`app/routers/players.py`).
- [x] **Team search + roster lifecycle guards** — activated `e2e/admin-team-roster-guards.spec.ts`, exercising `/teams/search/suggestions`, roster toggle APIs, duplicate-add guardrails, and the admin delete endpoint’s roster blocker to keep `/api/v1/admin/teams` aligned with `app/routers/teams_crud.py`.
- [x] **Match CRUD & status transitions** — activated `e2e/matches-crud-status.spec.ts`, seeding competitions/teams/venue/referee, walking illegal + legal transitions, hitting stats/events endpoints, and verifying the viewer live page stays in sync with logger updates.
- [x] **Logger ↔ Viewer timeline parity** — activated `e2e/logger-viewer-sync.spec.ts`, added viewer timeline test IDs, and taught `LiveMatch` to hydrate via the shared `fetchAllMatchEvents` helper so logger-submitted events surface for spectators without reload hacks (`src/pages/LiveMatch.tsx`, `src/components/match/EventTimeline.tsx`, `src/lib/loggerApi.ts`).
- [x] **Admin deletion guardrails** — activated `e2e/admin-deletion-guards.spec.ts`, proving admin delete endpoints refuse to remove players with active team assignments and teams with roster entries until the dependencies are explicitly cleared (aligns with `app/routers/admin.py`).
- [x] **Ingestion management + reprocess flows** — activated `e2e/ingestion-management.spec.ts`, seeding venue success batches plus player conflicts, asserting `/ingestions` pagination, conflict filters, `/ingestions/{id}/reprocess`, and JSON bulk uploads (with CSV validation errors). Also patched `/ingestions/{id}/reprocess` to unpack tuple results so the endpoint stops returning 500s during replays.
- [x] **Conflict pagination stress & telemetry smoke** — expanded `e2e/ingestion-management.spec.ts` seeds 60-player conflicts, pages through filters, reprocesses a subset, and verifies `/api/v1/debug/metrics` exposes `match_event_duplicates_total`; backed by the new FastAPI route in `app/routers/debug.py`.

## 2025-11-18 — Logger WebSocket Stabilization

### Backend Tasks
- [x] `app/main.py` now treats the WebSocket parameter as a typed `WebSocket`, ensuring FastAPI routes `/ws/{match_id}` correctly instead of treating `websocket` as a dependency injection target; the handler also pulls the token directly from `websocket.query_params` and leaves a concise breadcrumb inside `e2e_ws.log` for future triage.
- [x] Added `reproduce_ws.py`, a self-contained CLI harness that generates backend-compliant logger payloads (client IDs, periods, clocks, timestamps) and prints both ack envelopes and broadcast echoes so we can regression-test the socket without spinning up Playwright.

### QA / Runbook Updates
- [x] Reset the deterministic `E2E-MATCH` dataset via `POST /e2e/reset` using the bypass token (`Authorization: Bearer e2e-playwright`) to guarantee clean logger specs.
- [x] Verified the full logger Playwright suite (`npx playwright test e2e/logger-*.spec.ts`) succeeds end-to-end after the handler fix (7/7 specs green on Chromium with the local backend running in `APP_ENV=e2e`).

```bash
cd /Users/stevenlpz/Desktop/ProMatchCode/split-repos/ProMatchAnalytics-Backend
APP_ENV=e2e PROMATCH_E2E_BYPASS_AUTH=1 ./venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
curl -X POST http://127.0.0.1:8000/e2e/reset -H 'Authorization: Bearer e2e-playwright'

cd /Users/stevenlpz/Desktop/ProMatchCode/split-repos/ProMatchAnalytics-Frontend
npx playwright test e2e/logger-*.spec.ts
```

## 2025-11-19 — E2E Coverage Gap Analysis & Plan

### Coverage Map Check
- Logger specs (`e2e/logger-*.spec.ts`) cover optimistic queueing, duplicates, validation, undo, offline resiliency, and match isolation.
- Admin CRUD + ingestion flows (`e2e/admin-models-crud.spec.ts`) validate base CRUD, roster guardrails, conflict resolution, and failed-item retry loops.
- Admin directory + match suites exist but currently exercise only happy-path CRUD, leaving filter/search/deletion behaviors untested.

### Critical Scenarios Still Missing
1. Player directory filters & typeahead suggestions (`app/routers/players.py`).
2. Team search, roster toggles, and deletion guardflows (`app/routers/teams_crud.py`).
3. Match creation/status transitions plus viewer parity across `/matches/{id}/events|stats`.
4. Logger viewer synchronization to ensure broadcast payloads render in the viewer UI.
5. Admin deletion guardrails spanning competitions/teams/players.
6. Ingestion management edges: pagination stress, `reprocess`, bulk import validation, conflict pagination, and telemetry availability.

### Implementation Plan (kickoff)
1. **Spec skeletons** — land empty-but-skipped Playwright specs (`admin-directory-filters`, `admin-team-roster-guards`, `matches-crud-status`, `logger-viewer-sync`, `admin-deletion-guards`, `ingestion-management`) with harness helpers and TODO blocks so CI tracks ownership.
2. **Shared helpers** — extend `e2e/utils/logger.ts` and add `e2e/utils/admin.ts` for seeding competitions/teams/players/matches plus reusable API helpers (auth headers, cleanup routines).
3. **Backend feature flags** — ensure `/metrics` (or debug fallback) is exposed in e2e mode so telemetry smoke assertions can run without production secrets.
4. **Execution pipeline** — wire the new specs into the nohup runbook (documented above) and gate merges on `npx playwright test e2e/admin-directory-filters.spec.ts` etc., expanding the “Playwright Coverage Expansion” status tracker once each scenario lands.

## 2025-11-19 — Admin CRUD Alignment Plan (Referees · Venues · Players · Teams · Competitions)

### Why
- Matches CRUD just went through a deep contract/validation/i18n overhaul; the other admin panels still rely on legacy payload shapes, ad-hoc helpers, and inconsistent translations.
- Backend schemas in `app/schemas_crud.py` (player_height/player_weight, country_name, managers lists, etc.) don’t always match what the frontend currently submits, so we risk silent validation failures the moment we tighten API guards.
- UX-wise, each panel implements duplicate/change detection slightly differently. A unified plan keeps behavior predictable for admins and simplifies Playwright coverage.

### Cross-Cutting Backlog
- [x] **Payload transformers** — landed for venues, referees, players, teams, and competitions; only the legacy ingestion helpers still need the new pattern before we can flip the old payload glue.
- [x] **Form schemas vs. backend contracts** — players + venues + teams now mirror `schemas_crud`, leaving referees/ingestion edge-cases to port along with the new optional ID fields for venues/referees.
- [x] **Translation parity guard** — implemented via `scripts/validate-admin-locales.mjs` + `validationMessages.ts` updates; guard runs as part of `npm run lint`.
- [x] **Error surfacing** — duplicate ID 4xx responses now translate into inline field errors across every CRUD modal via the shared backend error helper; future additions can reuse the same resolver when new guards land.
- [ ] **Playwright re-use** — still need shared admin helpers + new specs that assert the localized-name + optional-ID flows end-to-end.

### Entity-Specific Plans

#### Referees (`app/routers/referees.py`, `src/pages/RefereesManager.tsx`, `src/lib/referees.ts`)
- [x] Defensive payload trimming + `referee_id` normalization shipped with the new helper / schema wiring.
- [x] Delete guard messaging now surfaces translated recovery guidance when matches still reference the referee.
- [ ] Optional metadata inputs (badge number, confederation) remain TODO pending backend fields.
- [ ] Playwright CRUD spec needs an edit-without-change assertion once the modal polish lands.

#### Venues (`app/routers/venues.py`, `src/pages/VenuesManager.tsx`, `src/types/index.ts`)
- [x] Helper + type rewrites completed; form + tables now operate on `country_name` and canonical surfaces.
- [x] Exposed the optional `venue_id` input (mirroring the player/competition approach) with validation + translations.
- [x] Delete guard messaging now surfaces localized guidance when matches still reference the venue.
- [x] Localized-name overrides now render in the Venues table/export + form inputs, staying in sync with backend `i18n_names` payloads.
- [ ] Playwright assertions for the surface enum guardrails are still pending.

#### Players (`app/routers/players.py`, `src/pages/PlayersManager.tsx`, `src/lib/players.ts`)
- [x] Payload builder + schema alignment complete (`player_height/weight`, ISO birth dates, localized names, optional `player_id`).
- [x] Form defaults and translations updated; optional IDs + localized overrides now validate inline in both locales.
- [x] Delete guard messaging now surfaces translated guidance when the player is still tied to team assignments.
- [ ] Duplicate/change-detection UI still needs to surface field-level diffs so analysts know why a save is blocked.
- [ ] Table + export columns should show the localized names once backend sends them.

#### Teams (`app/routers/teams.py`, `app/routers/teams_crud.py`, `src/pages/TeamsManager.tsx`)
- [x] Payload builder + `manager` mapping merged; change detection now compares backend-ready data.
- [x] Delete guard messaging now surfaces localized guidance when matches still reference the team.
- [ ] Still need to reuse the lineup helper inside roster modals for position validation and add missing staff-role translations before Playwright coverage can lock it down.

#### Competitions (`app/routers/competitions.py`, `src/pages/CompetitionsManager.tsx`)
- [x] Forms now capture `competition_id` + localized overrides, with payload builder reuse everywhere (create/edit/detect).
- [x] Delete-guard messaging now surfaces localized guidance; still need localized-name columns/exports and Playwright coverage for duplicate warnings.

### Translation & Validation Follow-Up
- [x] Scripted key diff now runs via `npm run lint:i18n`; continue expanding coverage as new locales land.
- [ ] Add unit/contract tests for the new payload builders so schema drift gets caught before manual QA.
- [x] Add unit/contract tests for the new payload builders — the shared Vitest suite now covers trimming, numeric conversions, manager/staff sanitization, and i18n cleaning so schema drift is caught immediately.

_Status (2025-11-20): payload builders + schemas + translation guard are in place for every CRUD screen; remaining focus areas are error-surfacing polish, optional ID helpers for venues/referees, localized-name visibility in tables/exports, and the Playwright assertions that prove the refreshed flows._

### 2025-11-20 — Venues CRUD Alignment Progress
- Added `src/lib/venues.ts` with `normalizeVenue(s)` and `buildVenuePayload`, plus the canonical `VENUE_SURFACES` list to keep frontend payloads in lockstep with `schemas_crud.VenueBase` (handles `country_name`, numeric `capacity`, and enum sanitization).
- Updated `src/types/index.ts` and `src/lib/validationSchemas.ts` so the shared `Venue` type and Joi schema both expose `country_name` + typed `surface`, preventing stale `country` references from slipping through new validations.
- Rewired `src/pages/VenuesManager.tsx` to use the helper + normalized API responses, swapped the free-text surface field for a select bound to `VENUE_SURFACES`, and updated duplicate/change detection plus tables/autocomplete to show the correct `country_name` label.
- Lint now passes with the refreshed helpers (`npm run lint`), leaving translation copy + Playwright coverage as the remaining Venues tasks before moving on to referees.

### 2025-11-20 — Referees CRUD Alignment Progress
- Converted the shared `Referee` type + `normalizeReferee` helper to `country_name`, added payload trimming/number coercion, and updated `buildRefereePayload` to only send backend-ready fields.
- Reworked `src/pages/RefereesManager.tsx` so all validation, duplicate/change detection, autocomplete suggestions, and tables/forms operate on `country_name` and reuse the sanitized payload (detect-changes now runs against backend data, and the selector finally talks to the Joi schema correctly).
- Fixed `useDuplicateCheck` to consume the Axios response data that `apiClient` already returns, restoring duplicate banners for every CRUD screen.
- Brought the export helpers/templates (`src/lib/export.ts`) and `SimilarRecordsViewer` field map up to date with the new schema so CSV/JSON downloads and duplicate modals stay in sync with backend field names.

### 2025-11-20 — Teams CRUD Alignment Progress
- Introduced `buildTeamPayload` in `src/lib/teams.ts` to normalize strings, convert the single-manager form into the backend `managers[]` array, and sanitize technical staff entries before every change/duplicate/save call.
- Updated the shared `ManagerInfo` type, normalization helper, and `Team` exports to use `country_name` instead of the legacy `nationality` field so contracts mirror `schemas_crud.TeamCreate`.
- Refactored `src/pages/TeamsManager.tsx` to rely on the new payload builder, ensuring change detection, duplicate checks, and actual POST/PUT requests all use identical backend-ready payloads, and hardened the manager form inputs against undefined state.
- Adjusted the team validation schema/messages + change-confirmation labels to the new `manager.country_name` path, keeping inline validation and translation surfaces consistent with backend field names.

### 2025-11-20 — Competitions CRUD Alignment Progress
- Added `src/lib/competitions.ts` with normalizers plus `buildCompetitionPayload`, so every CRUD flow posts trimmed `name`/`short_name`, preserves `competition_id` when editing, and sends `i18n_names` only when present.
- Updated `CompetitionsManager` to normalize list + suggestion responses, run change/duplicate detection against the sanitized payload, and reuse the same payload for POST/PUT (including the duplicate-override path).
- Form defaults now track `competition_id`, guard against undefined values in inputs, and keep `originalFormData` synced so change confirmation + revert flows behave like the other aligned CRUD screens.

### 2025-11-21 — Venues Localized Name Support
- `src/types/index.ts`, `src/lib/validationSchemas.ts`, and `src/lib/venues.ts` now expose/sanitize `i18n_names`, ensuring duplicate/change detection plus POST/PUT payloads only send trimmed locale overrides when present.
- `src/pages/VenuesManager.tsx` mirrors the player/team forms with localized-name inputs, table columns, and Autocomplete defaults so admins can review overrides inline before saving.
- `src/lib/export.ts` and `src/lib/__tests__/payloadBuilders.test.ts` cover the new localized columns, keeping CSV downloads and helper unit tests aligned with backend schema changes.

### 2025-11-21 — Duplicate Review Improvements
- Added an optional “Review similar records” action to `DuplicateWarning`, letting admins open the detailed `SimilarRecordsViewer` from initial duplicate alerts instead of blindly overriding.
- Players/Teams/Venues/Referees/Competitions managers now track duplicate payloads locally so both create-time warnings and edit-time change detection share the same field-level diff modal.
- EN/ES admin locales gained `duplicateWarning.reviewSimilar`, and the shared viewer closes/clears cached data after admins open an existing record, keeping duplicate/change detection flows consistent across entities.

## 2025-11-20 — Logger Match Timer Reliability

### Frontend Tasks
- [x] **Stabilize MatchTimer clock** — `src/components/match/MatchTimer.tsx` now runs on a `setInterval` tick with a persistent `runStartRef`, producing deterministic elapsed times even when fake timers drive the component.
- [x] **Ensure reliable backups** — backups now use absolute elapsed time, trigger immediately on pause/reset, and keep the existing backup cadence so server retries never see `00:00.000` payloads.
- [x] **Harden unit tests** — `src/components/match/MatchTimer.test.tsx` now uses modern fake timers plus synchronous events, covering periodic backups and pause-triggered backups without brittle `requestAnimationFrame` mocks.
- [x] **Vitest config hygiene** — `vite.config.ts` excludes all `e2e/**/*.spec.ts` files from Vitest so UI unit tests ignore Playwright suites and runs go green locally/CI.

### QA
- [x] `npx vitest run` (frontend repo root) — full suite now passes with the revised timer + config.

## 2025-11-20 — Admin CRUD Alignment (Validation & Locales)

### Cross-Cutting
- [x] **Admin locale parity guard** — added `scripts/validate-admin-locales.mjs` plus `npm run lint:i18n` to diff `public/locales/en|es/admin.json`, ensuring CRUD keys stay in sync and every `validationMessageMap` entry actually resolves to translated strings.
- [x] **CI-friendly lint target** — `npm run lint` now chains `lint:code` (ESLint) and `lint:i18n`, so a single command proves both code style and locale parity before merging.
- [x] **Required numeric player fields** — `playerSchema` now aligns with `app/schemas_crud.PlayerBase` by requiring `player_height`/`player_weight`, surfacing explicit `Height is required`/`Weight is required` messages and translations (see `src/lib/validationSchemas.ts`, `src/lib/validationMessages.ts`, and locale updates).

### Teams CRUD
- [x] **Manager contract cleanup** — removed the unused `manager.years_of_experience` inputs/state so the Teams form reflects the backend’s `ManagerInfo` schema; `manager.country_name` is now optional but still validated when provided (`src/pages/TeamsManager.tsx`, `src/types/index.ts`).
- [x] **Change review labels** — `ChangeConfirmation` no longer expects the legacy manager years field, keeping diff labels accurate when editors validate large updates.

### QA
- [x] `npm run lint`
- [x] `npm run lint:i18n`

### Players + Competitions IDs & i18n (2025-11-20)
- Player admin modals now expose the optional `player_id` input with Joi-backed validation plus helper copy so admins can either supply a backend-compliant ID or leave it blank for auto-generation. The React form state keeps the new field in sync across duplicate/change-detection flows.
- Both player and competition forms now surface localized name overrides for English/Spanish, including inline validation + translations. The UI only sends locales with actual overrides, keeping default names untouched when the overrides stay blank.
- `buildPlayerPayload` and `buildCompetitionPayload` trim IDs and sanitize `i18n_names`, stripping empty entries before POST/PUT/detect-changes calls so backend schemas only see meaningful overrides while the locale parity validator stays green.
- **Next up** (tracked here so backend stays aware): wire the new localized name data into table columns + exports, surface the optional `referee_id`/`venue_id` helpers using the same validation patterns, and extend Playwright CRUD specs to assert the new ID + localization plumbing end-to-end once the UI polish lands.


## Frontend Conflicts Manager Redesign Plan (2025-11-19)

### Conflict Gaps

ConflictReviewDialog.tsx posts { edited_data } to /accept instead of { edits }, never passes notes, and therefore backend validation paths in AcceptItemRequest/ConflictResolver.accept_item (ingestions.py, conflict_resolver.py) never run with user edits.
The dialog shows normalized_payload vs raw_payload, but those are both ingestion snapshots; none of the Mongo ConflictRecord.fields_diff data (existing record values, is_significant, metadata) is surfaced, so analysts cannot actually compare against the live record identified by existing_record_id.
Opening the dialog does not fetch or cache conflict entities (GET /api/v1/ingestions/{ingestion_id}/conflicts or a per-item endpoint), so there is no loading/error UI, no pagination for multi-conflict items, and no guard when conflicts are already resolved elsewhere.
Reject flow only captures a free-form string (no min length, canned reasons, or localization beyond hard-coded fallbacks), while accept flow allows arbitrary string editing without type hints or validation tied to the model schema.
Translation coverage relies on default English strings (t(..., 'Resolved by')), which leaves Spanish (and future locales) partially untranslated and makes validation/error copy inconsistent with admin.json.
Redesign Plan

### Data contract alignment:

Expose a lightweight “conflict details” endpoint (e.g., GET /api/v1/ingestions/conflicts/{ingestion_item_id}) that returns ConflictRecord (fields_diff, metadata, existing_record_snapshot).
Update GET /{batchId}/items to include has_conflict and the current conflict id so the UI can prefetch per item.
Fix the accept/reject payloads to { edits?: Record<string, unknown>; notes?: string } and { reason: string; notes?: string }, matching AcceptItemRequest/RejectItemRequest. Include resolved_by/timestamps in responses so the client can optimistically update tables.
UI/UX architecture:

Introduce a dedicated useConflictDetails(itemId) hook with suspense/loading states and error recovery (retry, stale indicator).
Split the dialog into composable sections: summary header (score, matched record link, ingestion metadata), FieldDiffList (one row per FieldDiff, highlighting is_significant and supporting collapse for unchanged fields), optional ExistingRecordPreview (read-only JSON inspector), and DecisionPanel.
Integrate SimilarRecordsViewer via a side drawer toggle so reviewers can inspect other matches before deciding.
Track resolution status in the dialog so it auto-disables actions if another admin resolves the conflict mid-session.
Form logic & validation:

Build per-model form schemas (Zod/Yup) that mirror backend normalization rules (types, required fields, enums like position, country_code). Show inline validation errors before hitting the API.
Provide structured edit controls (selects, date pickers, numeric inputs) instead of a free-form text box, falling back to JSON editors for nested objects.
For reject flow, require either a canned reason (duplicate, bad_source, outdated) or a custom note ≥ 15 chars; surface helper text and disable submit until valid.
Request confirmation when edits touch ≥ X% of the fields (reusing changeConfirmation copy) and show a diff summary before finalizing.
Localization & messaging:

Add explicit keys under ingestion.conflict.* for every new label, helper, validation, and toast message, and mirror them in admin.json. Remove hard-coded fallback strings so all copy flows through i18n.
Include accessibility affordances (ARIA labels for tables/buttons) and descriptive tooltips translated via i18n.
QA & automation:

Extend Playwright spec (e2e/admin-duplicate-review.spec.ts) with a scenario that opens the redesigned conflict dialog, edits a field, confirms validation, and verifies the accept endpoint receives { edits }.
Add unit tests around FieldDiffList (React Testing Library) covering significant/insignificant toggles and validation error messaging.
Backfill FastAPI tests asserting the new conflict-details endpoint serializes _id, fields_diff, and metadata correctly, plus regression coverage for accept/reject payloads.