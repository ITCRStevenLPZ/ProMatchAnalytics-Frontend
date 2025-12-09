# E2E Ingestion and CRUD Progress Log

Date: 2025-12-09

## Actions Completed

- Reviewed ingestion and CRUD-focused Playwright suites (admin ingestion conflict
  dialog, ingestion management, admin models/matches CRUD).
- Added ingestion validation coverage: `e2e/ingestion-management.spec.ts` now
  asserts the ingestion endpoint rejects missing or unknown `target_model`
  payloads.
- Added negative validation checks for players and venues:
  `e2e/admin-models-crud.spec.ts` now exercises blank player names and negative
  venue capacity, surfacing backend gaps via test annotations when the API
  accepts invalid data.
- Added happy-path CSV bulk ingestion coverage:
  `e2e/ingestion-management.spec.ts` now ingests a multi-section CSV
  (competitions, venues, referees, players, teams) and verifies all batches
  settle successfully.

## Current Coverage Snapshot

- Ingestion API: batch create/delete, pagination, conflict handling, bulk JSON
  upload, conflict stress pagination, metrics fetch.
- Ingestion UI: conflict dialog accept/reject flows with edits and notes.
- CRUD APIs: competitions, venues, referees, players (including conflicts),
  teams with rosters, matches lifecycle/status transitions and stats.
- CRUD validations: basic negative checks for player name and venue capacity
  (currently warning when backend accepts invalid payloads).
- Bulk ingestion: JSON and CSV happy paths validated; malformed CSV rejected.

## Observed Gaps / Candidates for Next Work

- Ingestion bulk CSV happy-path coverage (only malformed CSV rejection checked).
- Additional validation negatives (length/format constraints) across models.
- End-to-end UI verification for CRUD (current tests are API-level for models;
  UI coverage exists mostly for logger flows).
- Backend currently accepts blank player names and negative venue capacity; needs
  server-side validation if that behavior is unintended.
- Align backend validation for player name/venue capacity so tests can enforce
  failures instead of warnings.

## Next Todo Ideas

- Add a happy-path CSV ingestion test (small sample) to validate parser
  acceptance and resulting batch statuses.
- Broaden validation negatives (e.g., country codes, string lengths, lineup
  integrity) and align with backend rules.
- Expand UI-level CRUD verification for admin consoles if available
  (list/search/update/delete flows).
- Close the backend validation gaps for player name and venue capacity so
  warnings become enforced failures.
