# Logger Cockpit Safety Pack

## Purpose

This safety pack prevents regressions in the logger cockpit when implementing fixes or new features.

## Mandatory Flow

1. Implement the feature/fix.
2. Add or update the E2E test for the changed behavior.
3. Run the cockpit guard suite before pushing.
4. Ensure PR includes validation evidence.

## Guard Commands

- Core deterministic guard:
  - `npm run test:e2e:logger:core`
- High-risk stress guard:
  - `npm run test:e2e:logger:ultimate`
- Mandatory full cockpit guard (core + ultimate):
  - `npm run test:e2e:cockpit-guard`

## Guard Coverage

### `test:e2e:logger:core`

- `e2e/logger-period-transitions.spec.ts`
- `e2e/logger-substitution-rules.spec.ts`
- `e2e/logger-analytics-matrix.spec.ts`

### `test:e2e:logger:ultimate`

- `e2e/logger-ultimate-cockpit.spec.ts`
- `e2e/logger-ultimate-disciplinary-stress.spec.ts`

## Enforcement

- Local: `.pre-commit-config.yaml` runs `test:e2e:cockpit-guard` on both `pre-commit` and `pre-push`.
- CI: `.github/workflows/pr-ci.yml` intentionally does not run cockpit E2E guard to avoid runner hardware limits.
- Review: `.github/pull_request_template.md` requires explicit cockpit guard validation.

## Notes

- Keep suites deterministic and scenario-focused.
- If a logger behavior changes without new E2E coverage, the task is not done.
