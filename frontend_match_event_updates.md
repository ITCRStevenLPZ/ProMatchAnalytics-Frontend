# Frontend Guidance: Match Event Deduplication Guard

<!-- markdownlint-disable MD013 MD024 MD036 MD040 MD029 -->

_Last updated: 2025-11-16_

This note summarizes the backend changes to the real-time match-event ingest API so frontend agents can validate whether UI or client logic needs adjustments. The backend now enforces a strict uniqueness constraint on `(match_id, match_clock, period, team_id)` combinations and returns richer status responses when a duplicate is detected.

## Affected Endpoints & Workflows

| Flow                          | Endpoint                                              | Change                                                                                                                                   |
| ----------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Live match logging            | WebSocket `ConnectionManager.handle_event` (same URI) | Events are validated via shared `MatchEvent` schema and rejected if the `(match_id, match_clock, period, team_id)` tuple already exists. |
| Admin dashboards / match logs | Any view that relies on `match_events` collection     | Data reads are unchanged, but newly inserted documents are guaranteed unique by the above tuple.                                         |

_No REST routes changed shape or URL. Only WebSocket payload validation/response semantics have evolved._

## Request Requirements (No UI change expected)

Frontends should continue to send the existing `MatchEvent` payload. All keys already required remain unchanged:

```json
{
  "match_id": "MATCH_123",
  "timestamp": "2025-11-16T18:00:00Z",
  "match_clock": "45:12.450",
  "period": 1,
  "team_id": "TEAM_A",
  "player_id": "PLAYER_007",
  "location": [60.0, 40.0],
  "type": "Pass",
  "data": { "recipient_id": "PLAYER_011" }
}
```

### Client-side hints

- Keep the local notion of `match_clock` precise (string `MM:SS.mmm`) because duplicate detection hinges on it.
- Period should follow existing numeric mapping (1=First half, 2=Second half, etc.).
- Team IDs must align with backend canonical values (already required today).

## Response Contract

| Status                                                                                        | When returned                                                         | Client impact                                                                          |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `{"status": "success", "event_id": "<mongo_id>"}`                                             | New event persisted                                                   | Same as before; show confirmation, append to timeline.                                 |
| `{"status": "duplicate", "message": "Event already recorded at this match clock and period"}` | Backend detected `(match_id, match_clock, period, team_id)` collision | UI should treat this as a no-op, optionally notify user that the event already exists. |
| `{"status": "error", "message": "..."}`                                                       | Validation failures or unexpected exceptions                          | Existing error handling logic applies.                                                 |

> **Note:** The `_confirmed` and `_saved_at` fields still appear on broadcasted payloads, so consumer code does not need changes there.

## Ingestion Conflict Resolution Impact

- Conflict Accept/Reject flows now reuse the same CRUD schemas as realtime logging, so edits applied through `/ingestions/:id/items/:itemId/accept` arrive already normalized (IDs, enums, numeric coercion). Frontends that surface accepted events can assume schema parity with live WebSocket events.
- Every ingestion item now exposes `resolved_by` and `resolved_at`. UI lists should display these fields (or tooltips) so analysts know who finalized an edit and when.
- Items stuck in `validation_failed`, `error`, or `conflict` are safe to re-open: retrying or editing them will recompute both `content_hash` and `duplicate_key`, preventing accidental duplication once the fix is applied.
- When an ingestion conflict is resolved, the WebSocket stream will broadcast the updated event (because the underlying document changes). Frontend clients should expect one more `status="success"` response reflecting the reconciled payload and refresh any cached timelines accordingly.
- CI now runs the same `mypy` + `pytest` gates as local pre-commit hooks, so any schema drift that would change these payloads fails before deployment—treat duplicate/resolve responses as authoritative signals.

## Recommended UI/UX Adjustments

1. **Graceful duplicate handling**
   - If the WebSocket response returns `status="duplicate"`, avoid surfacing a failure toast; prefer a neutral message like “Already logged”.
   - Consider highlighting the existing event (same clock/period/team) so analysts can spot it.
2. **Optional debounce**
   - For quick consecutive submissions at the same clock value, debounce the submit button until the server responds.
3. **Telemetry**
   - Track how often duplicates occur to monitor operator pain points.

## QA Checklist for Frontend Updates

- [ ] Verify that submitting the same event twice results in one success + one duplicate message, without UI crashes.
- [ ] Confirm unique events (different clock, period, team, or match) still render instantly.
- [ ] Regression-test match timelines and admin dashboards using the new deduped data feed.
- [ ] Ensure offline/queued states retry correctly; repeated retries of the same payload should resolve cleanly once one succeeds.

## Rollout Notes

- Backend changes are already merged on `feature/test-deployment` (see `app/websocket.py`, `app/services/cleanup_service.py`).
- No feature flag is available; the constraint is always on.
- If a frontend regression is found, the backend can temporarily disable the WebSocket duplicate short-circuit but the MongoDB unique index will keep rejecting duplicates. Frontend accommodations are preferable.

## Contacts & References

- **Primary owner:** Backend ingestion team (`#promatch-backend`)
- **Schema reference:** `app/models/event.py`
- **Tests demonstrating behavior:** `tests/test_match_event_deduplication.py`
- **High-level design note:** `docs/match_event_deduplication.md`

Please share any UI edge cases or gaps so the backend team can consider additional metadata or response codes.
