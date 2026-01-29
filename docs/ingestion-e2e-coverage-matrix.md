# Ingestion E2E Coverage Matrix

Last updated: 2026-01-28

## Ingestable Models (source: backend ingestion config)

<!-- markdownlint-disable MD013 -->

| Model key         | Ingestion E2E coverage | Specs                                                                                                                                      | Notes                                                |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| competitions      | ✅ Covered             | [e2e/ingestion-management.spec.ts](../e2e/ingestion-management.spec.ts)                                                                    | Covered via bulk JSON/CSV batch ingestion.           |
| venues            | ✅ Covered             | [e2e/ingestion-management.spec.ts](../e2e/ingestion-management.spec.ts)                                                                    | Batch creation, pagination, and deletion paths.      |
| referees          | ✅ Covered             | [e2e/ingestion-management.spec.ts](../e2e/ingestion-management.spec.ts)                                                                    | Batch creation + delete guardrails.                  |
| players           | ✅ Covered             | [e2e/ingestion-management.spec.ts](../e2e/ingestion-management.spec.ts)                                                                    | Conflict creation, reprocess, and stress pagination. |
| teams             | ✅ Covered             | [e2e/admin-models-crud.spec.ts](../e2e/admin-models-crud.spec.ts), [e2e/ingestion-management.spec.ts](../e2e/ingestion-management.spec.ts) | Team ingestion batch + items pagination.             |
| players_with_team | ✅ Covered             | [e2e/ingestion-management.spec.ts](../e2e/ingestion-management.spec.ts)                                                                    | Verifies roster linkage and player creation.         |

<!-- markdownlint-enable MD013 -->

## UI Coverage Notes

- Conflict dialog accept/reject flows are covered in
  [e2e/admin-ingestion-conflict-dialog.spec.ts](../e2e/admin-ingestion-conflict-dialog.spec.ts).
- Full ingestion UI flows (uploading CSV/JSON through the UI) are not covered
  per model; existing tests are API-first with UI conflict resolution
  validation.

## Gaps (if any)

- None for the ingestable models listed above.
- Optional follow-ups: add UI upload flows per model and negative UI validations.
