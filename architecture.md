# ProMatchAnalytics - Architecture (Test-Aware)

## System Overview
- Backend: FastAPI + MongoDB
- Frontend: React + TypeScript
- Auth: Firebase (frontend), backend expects bearer token for role checks

## Key Domain Concepts
- Entities: match, match events, workflow definitions, workflow versions, action definitions
- Invariants: workflow runtime matches by action/outcome/context; active workflow versions required; backend enriches match_events with workflow_id/workflow_version on ingest

## Data Model (MongoDB)
- Collections:
  - workflow_definitions: workflow graph + context matcher + active_version
  - workflow_versions: published snapshots
  - action_definitions: reusable action metadata
  - match_events: event payloads with optional workflow metadata
- Indexes:
  - workflow_definitions.workflow_id (unique)
  - workflow_versions.workflow_id + version
  - match_events.match_id + match_clock + period + team_id (+ player_id when present)

## API Contracts (High-Level)
- POST /api/v1/workflows/runtime: evaluate workflow runtime gating
- POST /api/v1/workflows/bootstrap-defaults: seed action/workflow defaults
- POST /api/v1/workflows/{id}/publish: publish workflow version
- CRUD /api/v1/workflows and /api/v1/action-definitions

## Frontend Contracts (High-Level)
- Pages / routes: /admin/workflows, /matches/:matchId/logger
- Critical components: LoggerCockpit, MatchAnalytics, WorkflowDesigner
- State management notes: match log state via Zustand store + websocket

## Test Strategy (Source of Truth)
- What must be unit-tested: workflow graph validation, runtime matcher edge cases
- What must be E2E-tested: cockpit workflow gating, runtime evaluation API, workflow-tagged events
- Determinism rules (time, randomness, external services): seed workflows via API; avoid zone matcher in E2E workflows
- Test data strategy (fixtures/factories/seed): API seeding for workflows, action definitions, matches; workflow tags asserted from backend-enriched events

## ADRs (Architecture Decision Records)
- ADR-0001: UNKNOWN
  - Decision: UNKNOWN
  - Context: UNKNOWN
  - Consequences: UNKNOWN
