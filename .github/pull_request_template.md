# PR Summary

## What changed

<!-- Describe the implementation in 3-6 bullets -->

## Cockpit Safety Pack (Mandatory when logger/cockpit is impacted)

- [ ] I ran `npm run test:e2e:cockpit-guard` locally and it passed.
- [ ] I added or updated E2E coverage for this behavior.
- [ ] I updated `docs/logger-e2e-plan.md` when scope/coverage changed.
- [ ] I verified no regressions in transition, substitution, and analytics paths.

## Validation

- [ ] Type check: `npx tsc --noEmit`
- [ ] Lint: `npm run lint`
- [ ] Unit tests: `npm test --if-present`
- [ ] Cockpit guard E2E: `npm run test:e2e:cockpit-guard`

## Evidence

<!-- Paste relevant command outputs or links to CI job logs -->
