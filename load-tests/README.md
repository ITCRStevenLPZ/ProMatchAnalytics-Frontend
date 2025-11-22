# Match Event Fetch Load Test

This folder carries a lightweight k6 harness that hammers the `/matches/{match_id}/events` endpoint so we can validate pagination, indexes, and payload sizes before shipping larger competitions.

## What the test does
- Issues concurrent GET requests against the match-events feed with realistic pagination parameters (defaults to 500 records per page and cycling through 100 pages, i.e. ~50k events).
- Asserts `200 OK` responses, tracks body sizes, and records per-request latency so we can enforce P95 expectations.
- Emits custom metrics (`match_events_latency`, `match_events_records_total`) that quickly confirm throughput and record coverage while the test is running.

## Prerequisites
1. **Dataset** — seed a match with ≥50k events. The ingestion replay scripts or the bulk-ingestion manager can be pointed at a historical competition; just ensure a single match accumulates the target volume before running the load test.
2. **Auth** — obtain a Firebase ID token (or enable `PROMATCH_E2E_ACTIVE=1` when running against the mocked backend). The harness supports anonymous requests, but authenticated runs give us parity with production caching behavior.
3. **k6** — install from <https://k6.io/docs/get-started/installation/> (Homebrew: `brew install k6`).

## Configuration
The harness is configured via environment variables so we can reuse it against staging, load, or local setups:

| Variable | Default | Description |
| --- | --- | --- |
| `MATCH_EVENTS_BASE_URL` | `http://127.0.0.1:8000/api/v1` | Root URL for the REST API (already suffixed with `/api/v1`). |
| `MATCH_ID` | `LOADTEST-MATCH` | Identifier for the seeded match. |
| `BEARER_TOKEN` | _(unset)_ | If provided, added as `Authorization: Bearer <token>` on every request. |
| `VUS` | `25` | Number of concurrent virtual users. |
| `DURATION` | `3m` | How long to sustain the constant load phase. |
| `PAGE_SIZE` | `500` | Page size per request; should mirror frontend defaults. |
| `MAX_PAGES` | `100` | Upper bound on the page window to randomize across (page numbers are sampled uniformly between 1 and this value). |
| `RAMP_VUS` | `50` | Peak VUs for the ramping stage (see k6 options inside the script). |
| `RAMP_DURATION` | `2m` | Duration of the ramping stage. |

## Running the test
```bash
cd /Users/stevenlpz/Desktop/ProMatchCode/split-repos/ProMatchAnalytics-Frontend
MATCH_EVENTS_BASE_URL="http://127.0.0.1:8000/api/v1" \
MATCH_ID="E2E-MATCH" \
BEARER_TOKEN="$(python scripts/get_token.py)" \
VUS=30 \
DURATION=4m \
PAGE_SIZE=500 \
MAX_PAGES=120 \
k6 run load-tests/match-events-fetch.js
```

The script prints rolling metrics and enforces the following thresholds by default:
- `http_req_failed < 1%`
- `http_req_duration p(95) < 400ms`
- `match_events_latency p(95) < 350ms`

If any threshold is breached, k6 exits with a non-zero code so CI/CD jobs can fail fast.

## Inspecting results
- **CLI summary** — contains VU utilization, request counts, latency distribution, and custom metric values.
- **`--out` exporters** — point k6 at InfluxDB, Prometheus remote write, or JSON output for deeper analysis. Example: `k6 run --out json=./load-tests/match-events-fetch.json load-tests/match-events-fetch.js`.
- **Records counter** — ensure `match_events_records_total` ~= `VUS * iterations * PAGE_SIZE` to verify pagination coverage; material deviations usually mean indexes are starving or responses are capped by server-side limits.

## Next steps
- Wire this harness into the release checklist (e.g., GitHub Action matrix that triggers nightly).
- Combine with the upcoming match-switch guardrails spec so that the same dataset powers both reliability and load validation scenarios.
