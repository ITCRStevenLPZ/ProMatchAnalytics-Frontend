# LoggerCockpit Modularization Plan

> **Goal:** Decompose the 3,715-line `LoggerCockpit.tsx` into focused, testable modules to reduce error domain without changing any runtime behavior.

## 1. Current State Analysis

### 1.1 File inventory

| File                               |  Lines | Role                                              |
| ---------------------------------- | -----: | ------------------------------------------------- |
| `LoggerCockpit.tsx`                |  3,715 | **Monolith orchestrator** — state, logic, and JSX |
| `hooks/useActionFlow.ts`           |    726 | Event action state machine                        |
| `hooks/useMatchTimer.ts`           |    277 | Global / effective / ineffective clocks           |
| `hooks/usePeriodManager.ts`        |    351 | Period phase FSM & transitions                    |
| `hooks/useAudioFeedback.ts`        |    156 | Audio cues                                        |
| `hooks/useUnifiedClockDisplay.ts`  |    126 | Clock format adapter                              |
| `hooks/useGestureShortcuts.tsx`    |    203 | Touch gesture bindings                            |
| `utils.ts`                         |    530 | Pure helpers (normalize, format, breakdown)       |
| `types.ts`                         |    195 | Shared type definitions                           |
| `constants.ts`                     |    157 | Action & key maps                                 |
| 25 component files (components/\*) | ~5,800 | Presentation components                           |

### 1.2 Problems with the current monolith

| Problem                                                        | Impact                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| **3,715 lines in one component**                               | Any change potentially affects everything; hard to review PRs |
| **~50 `useState` / `useRef` declarations** mixed together      | Unclear which state belongs to which feature                  |
| **~30 `useCallback` / `useMemo` blocks** with overlapping deps | Hidden coupling between unrelated features                    |
| **~20 `useEffect` hooks** interleaved                          | Side-effect ordering is fragile and easy to break             |
| **8 pure utility functions** defined at module scope           | Pollute the module and can't be individually tested           |
| **~1,200 lines of JSX** including modals, banners, overlays    | Difficult to identify rendering boundaries                    |
| **E2E harness setup** embedded inside the component            | Test infrastructure mixed with product code                   |

---

## 2. Proposed Module Decomposition

### 2.1 Architecture overview

```
LoggerCockpit.tsx  (~400-500 lines — thin orchestrator)
│
├── hooks/
│   ├── useMatchData.ts              ← NEW: fetch, normalize, refresh
│   ├── useVarTimer.ts               ← NEW: VAR state machine
│   ├── useTimeoutTimer.ts           ← NEW: Timeout state machine
│   ├── useIneffectiveTime.ts        ← NEW: ineffective clock + modal state
│   ├── useDisciplinary.ts           ← NEW: card tracking + expelled IDs
│   ├── useOnFieldRoster.ts          ← NEW: on-field sets + substitution replay
│   ├── useClockDrift.ts             ← NEW: drift detection + auto-resync
│   ├── useTransitionGuards.ts       ← NEW: period min checks + guardTransition
│   ├── useLiveScore.ts              ← NEW: goal events + score computation
│   ├── useDuplicateTelemetry.ts     ← NEW: duplicate stats formatting
│   ├── useResetMatch.ts             ← NEW: reset flow + modal state
│   ├── useCockpitHarness.ts         ← NEW: E2E test harness (window.__PROMATCH_LOGGER_HARNESS__)
│   ├── useActionFlow.ts             (existing — no changes)
│   ├── useMatchTimer.ts             (existing — no changes)
│   ├── usePeriodManager.ts          (existing — no changes)
│   ├── useAudioFeedback.ts          (existing — no changes)
│   ├── useUnifiedClockDisplay.ts    (existing — no changes)
│   └── useGestureShortcuts.tsx      (existing — no changes)
│
├── components/
│   ├── CockpitHeader.tsx            ← NEW: connection status + reset button + view toggle
│   ├── ScoreBoard.tsx               ← NEW: stadium score display + goal log
│   ├── StatusRibbon.tsx             ← NEW: 4-column status/phase/clock-mode/running
│   ├── DriftBanner.tsx              ← NEW: clock drift nudge bar
│   ├── IneffectiveNoteModal.tsx     ← NEW: ineffective-time note modal
│   ├── ResetConfirmModal.tsx        ← NEW: reset confirmation modal
│   ├── ToastNotification.tsx        ← NEW: toast overlay
│   ├── ActionStage.tsx              ← NEW: field + panels composite
│   ├── LoggerView.tsx               ← NEW: logger mode layout (clock, teams, field, feed)
│   ├── AnalyticsView.tsx            ← NEW: analytics mode layout
│   └── ... (25 existing components — unchanged)
│
├── lib/
│   └── clockHelpers.ts              ← NEW: extracted pure fns from module scope
│
├── utils.ts                          (existing — unchanged)
├── types.ts                          (existing — expanded with hook interfaces)
└── constants.ts                      (existing — unchanged)
```

### 2.2 Module detail

---

#### Module 1: `lib/clockHelpers.ts` (Pure Functions)

**Extracts lines:** 75–169 (module-scope utility functions)

**Moves from `LoggerCockpit.tsx`:**

- `parseTimestampSafe()`
- `parseClockToSeconds()`
- `compareCardEventOrder()`
- `compareSubstitutionEventOrder()`
- `formatSecondsAsClock()`
- `formatSecondsAsClockWithMs()`
- `addMillisecondsToClock()`
- `getActiveYellowCountForPlayer()`

**Why:** These are pure, stateless functions with zero React dependencies. They're currently defined at module scope inside the component file, making them impossible to unit-test in isolation. Moving them out has zero behavioral risk.

**Target size:** ~100 lines

**Dependencies:** None (self-contained)

**Risk:** None — no state, no effects, purely functional

---

#### Module 2: `hooks/useMatchData.ts`

**Extracts lines:** 449–475, 1152–1165, 1166–1212 (fetch + hydrate + reset logic)

**State moved:**

- `match` / `setMatch`
- `loading` / `setLoading`
- `error` / `setError`

**Callbacks moved:**

- `fetchMatch()`
- `hydrateEvents()`
- `normalizeMatchPayload()` integration

**Returns:**

```ts
interface UseMatchData {
  match: Match | null;
  setMatch: (m: Match | null) => void;
  loading: boolean;
  error: string | null;
  fetchMatch: () => Promise<void>;
  hydrateEvents: () => Promise<void>;
}
```

**Target size:** ~120 lines

**Dependencies:** `matchId`, `isLoggerReady`, `setLiveEvents`, `t`

**Risk:** Low — networking is already isolated in `loggerApi`

---

#### Module 3: `hooks/useVarTimer.ts`

**Extracts lines:** 302–310, 584–630, 631–670, 2046–2073

**State moved:**

- `isVarActiveLocal`, `varStartMs`, `varStartGlobalSeconds`, `varStartTotalSeconds`
- `varPauseStartMs`, `varPausedSeconds`, `varTick`

**Callbacks moved:**

- `handleVarToggle()`
- VAR time computation (`varTimeSeconds`, `varTimeClock`)

**Effects moved:**

- VAR tick interval (`setInterval` for `varTick`)
- VAR pause/resume sync with `clockMode` and `isGlobalClockRunning`

**Returns:**

```ts
interface UseVarTimer {
  isVarActive: boolean; // combined: breakdownVarActive || isVarActiveLocal
  varTimeSeconds: number;
  varTimeClock: string;
  varStartMs: number | null;
  varPauseStartMs: number | null;
  varPausedSeconds: number;
  handleVarToggle: () => void;
  resetVarState: () => void; // for global reset
}
```

**Target size:** ~180 lines

**Dependencies:** `globalClock`, `globalClockSeconds`, `isGlobalClockRunning`, `clockMode`, `cockpitLocked`, `logNeutralTimerEvent`, `ineffectiveBreakdown`

**Risk:** Low — the VAR state is self-contained; inputs are clock values and breakdown data

---

#### Module 4: `hooks/useTimeoutTimer.ts`

**Extracts lines:** 505–515, 554–558, 2074–2078

**State:** Derives from `ineffectiveBreakdown` — stateless hook

**Callbacks moved:**

- `handleTimeoutToggle()`

**Returns:**

```ts
interface UseTimeoutTimer {
  isTimeoutActive: boolean;
  timeoutTimeSeconds: number;
  timeoutTimeClock: string;
  handleTimeoutToggle: () => void;
}
```

**Target size:** ~50 lines

**Dependencies:** `ineffectiveBreakdown`, `cockpitLocked`, `logNeutralTimerEvent`

**Risk:** None — trivially small extraction

---

#### Module 5: `hooks/useIneffectiveTime.ts`

**Extracts lines:** 290–320, 631–644, 673–909, 2034–2045

**State moved:**

- `ineffectiveNoteOpen`, `ineffectiveNoteText`
- `ineffectiveActionType`, `ineffectiveTeamSelection`
- `ineffectiveActionDropdownOpen`, `ineffectiveTeamDropdownOpen`
- `hasActiveIneffective`, `pendingIneffectiveContext`
- `activeIneffectiveContextRef`, `lastStoppageClockRef`
- `ineffectiveTick`

**Callbacks moved:**

- `logClockStoppage()`
- `logNeutralTimerEvent()`
- `optimisticModeChange()`
- `beginIneffective()` / `endIneffectiveIfNeeded()`
- `confirmIneffectiveNote()` / `cancelIneffectiveNote()`
- `handleModeSwitchGuarded()`
- `getStoppageTeamId()` / `resolveManualTeamSelection()` / `getManualTeamId()`

**Returns:**

```ts
interface UseIneffectiveTime {
  // State
  ineffectiveNoteOpen: boolean;
  ineffectiveNoteText: string;
  setIneffectiveNoteText: (text: string) => void;
  ineffectiveActionType: IneffectiveAction;
  ineffectiveTeamSelection: "home" | "away";
  ineffectiveActionDropdownOpen: boolean;
  setIneffectiveActionDropdownOpen: (open: boolean) => void;
  ineffectiveTeamDropdownOpen: boolean;
  setIneffectiveTeamDropdownOpen: (open: boolean) => void;
  hasActiveIneffective: boolean;
  // Computed
  ineffectiveBreakdown: IneffectiveBreakdown | null;
  // Actions
  beginIneffective: (
    note?: string | null,
    context?: IneffectiveContext | null,
  ) => void;
  endIneffectiveIfNeeded: (mode: "EFFECTIVE") => void;
  confirmIneffectiveNote: () => void;
  cancelIneffectiveNote: () => void;
  handleModeSwitchGuarded: (mode: "EFFECTIVE" | "INEFFECTIVE") => void;
  logNeutralTimerEvent: (type: NeutralStoppageType) => void;
  setIneffectiveActionType: (action: IneffectiveAction) => void;
  setIneffectiveTeamSelection: (team: "home" | "away") => void;
  resetIneffectiveState: () => void; // for global reset
}
```

**Target size:** ~350 lines

**Dependencies:** `match`, `selectedTeam`, `globalClock`, `clockMode`, `handleModeSwitch`, `sendEvent`, `operatorPeriod`, `setIsBallInPlay`, `setMatch`

**Risk:** Medium — this is the largest extraction with the most interconnected state. Must be done carefully; recommend extracting as a single batch and running the full E2E suite before proceeding.

---

#### Module 6: `hooks/useDisciplinary.ts`

**Extracts lines:** 927–1013

**Computed values moved:**

- `cardDisciplinaryStatus` (the full card-tracking `useMemo`)
- `cardYellowCounts`
- `expelledPlayerIds`

**Returns:**

```ts
interface UseDisciplinary {
  cardDisciplinaryStatus: Record<string, { yellowCount: number; red: boolean }>;
  cardYellowCounts: Record<string, number>;
  expelledPlayerIds: Set<string>;
}
```

**Target size:** ~120 lines

**Dependencies:** `liveEvents`, `queuedEvents`

**Risk:** None — pure computation from events, no side effects

---

#### Module 7: `hooks/useOnFieldRoster.ts`

**Extracts lines:** 274–280, 334–447

**State moved:**

- `onFieldIds` / `setOnFieldIds`

**Callbacks moved:**

- `getInitialOnField()`
- `applyOnFieldChange()`
- Substitution replay effect (the large `useEffect` with `resolveTeamSideFromId`)

**Returns:**

```ts
interface UseOnFieldRoster {
  onFieldIds: { home: Set<string>; away: Set<string> };
  applyOnFieldChange: (
    team: "home" | "away",
    offId?: string,
    onId?: string,
  ) => void;
}
```

**Target size:** ~150 lines

**Dependencies:** `match`, `liveEvents`

**Risk:** Low — self-contained roster reconstruction

---

#### Module 8: `hooks/useClockDrift.ts`

**Extracts lines:** 1041–1110

**State moved:**

- `forcedDriftSeconds`
- `lastDriftAutoSyncRef`, `driftExceededAtRef`

**Computed values moved:**

- `serverSeconds`, `localSeconds`, `computedDriftSeconds`
- `driftSeconds`, `showDriftNudge`

**Effects moved:**

- Forced drift poll (`__PROMATCH_FORCE_DRIFT_SECONDS__` interval)
- Auto-resync trigger effect

**Returns:**

```ts
interface UseClockDrift {
  driftSeconds: number;
  showDriftNudge: boolean;
  serverSeconds: number;
  localSeconds: number;
  computedDriftSeconds: number;
  forcedDriftSeconds: number | null;
  // For harness
  getDriftSnapshot: () => DriftSnapshot;
}
```

**Target size:** ~100 lines

**Dependencies:** `match`, `globalClock`, `varPauseStartMs`, `varPausedSeconds`, `varTimeSeconds`, `fetchMatch`

**Risk:** Low — does not mutate external state, only triggers `fetchMatch`

---

#### Module 9: `hooks/useTransitionGuards.ts`

**Extracts lines:** 1311–1520

**Computed/state moved:**

- `normalizeStatus()`
- `isTransitionAllowed()`
- `getPeriodStartSeconds()`
- `firstHalfElapsed`, `secondHalfElapsed`, `extraFirstElapsed`, `extraSecondElapsed`
- `hasFirstHalfMinimum`, `hasSecondHalfMinimum`, etc.
- `minimumFirstHalfReason`, `minimumSecondHalfReason`, etc.
- `guardTransition()`
- `transitionError` / `setTransitionError`
- `bypassMinimums`

**Returns:**

```ts
interface UseTransitionGuards {
  normalizeStatus: (status?: Match["status"]) => Match["status"];
  isTransitionAllowed: (
    target: Match["status"],
    currentOverride?: Match["status"],
  ) => boolean;
  guardTransition: (target: Match["status"], fn?: () => void) => void;
  transitionError: string | null;
  hasFirstHalfMinimum: boolean;
  hasSecondHalfMinimum: boolean;
  hasExtraFirstHalfMinimum: boolean;
  hasExtraSecondHalfMinimum: boolean;
  // For MatchPeriodSelector
  canHalftime: boolean;
  canSecondHalf: boolean;
  canFulltime: boolean;
  transitionGuardMessage: string;
}
```

**Target size:** ~250 lines

**Dependencies:** `statusOverride`, `currentPhase`, `globalTimeSeconds`, `match`, `t`, period manager transitions

**Risk:** Medium — transition guards are critical for match integrity. Must validate with period-transition E2E tests.

---

#### Module 10: `hooks/useLiveScore.ts`

**Extracts lines:** 2110–2160

**Computed values moved:**

- `goalEvents`
- `liveScore`
- `formatGoalLabel()`

**Returns:**

```ts
interface UseLiveScore {
  goalEvents: { home: MatchEvent[]; away: MatchEvent[] };
  liveScore: { home: number; away: number };
  formatGoalLabel: (event: MatchEvent) => string;
}
```

**Target size:** ~70 lines

**Dependencies:** `match`, `liveEvents`

**Risk:** None — pure computation

---

#### Module 11: `hooks/useDuplicateTelemetry.ts`

**Extracts lines:** 2408–2461

**Computed values moved:**

- All `lastDuplicate*` / `duplicateSession*` formatting variables

**Returns:**

```ts
interface UseDuplicateTelemetry {
  lastDuplicateSummaryDefault: string;
  duplicateSessionSummaryDefault: string;
  duplicateDetailsDefault: string;
  duplicateExistingEventDefault: string;
  // pass-through convenience
  lastDuplicateTeamName: string | null;
  lastDuplicateSeenAt: string | null;
}
```

**Target size:** ~80 lines

**Dependencies:** `match`, `duplicateStats`, `duplicateHighlight`

**Risk:** None — pure formatting

---

#### Module 12: `hooks/useResetMatch.ts`

**Extracts lines:** 1166–1212, 2461–2510

**State moved:**

- `showResetModal`, `resetConfirmText`

**Callbacks moved:**

- `handleGlobalClockReset()`
- `openResetModal()`
- `confirmGlobalReset()`

**Computed values moved:**

- `resetBlocked`, `resetBlockReason`, `resetDisabledReason`, `resetTooltip`

**Returns:**

```ts
interface UseResetMatch {
  showResetModal: boolean;
  resetConfirmText: string;
  setResetConfirmText: (text: string) => void;
  resetBlocked: boolean;
  resetBlockReason: string | undefined;
  resetTooltip: string | undefined;
  openResetModal: () => void;
  confirmGlobalReset: () => Promise<void>;
  closeResetModal: () => void;
}
```

**Target size:** ~120 lines

**Dependencies:** `matchId`, `isAdmin`, `match`, `queuedCount`, `pendingAckCount`, `setMatch`, store clearing fns, `hydrateEvents`, VAR reset

**Risk:** Low — isolated side-effect

---

#### Module 13: `hooks/useCockpitHarness.ts`

**Extracts lines:** 2321–2380

**Effect moved:**

- `window.__PROMATCH_LOGGER_HARNESS__` registration

**Returns:** void (side-effect-only hook)

**Target size:** ~80 lines

**Dependencies:** `IS_E2E_TEST_MODE`, various callbacks and state

**Risk:** None — E2E-only code path

---

#### Module 14: `components/CockpitHeader.tsx`

**Extracts lines:** ~2520–2870 (header element + modals)

**JSX moved:**

- Connection status badges (connected / disconnected / queued / pending ack)
- Reset button
- View toggle (Logger / Analytics)
- Match status badge

**Target size:** ~200 lines

**Dependencies:** Props from orchestrator (connection state, counts, viewMode callbacks)

**Risk:** None — pure presentation

---

#### Module 15: `components/ScoreBoard.tsx`

**Extracts lines:** ~2870–2990

**JSX moved:**

- Stadium score display (home score / VS / away score gradient)
- Goal log board

**Target size:** ~150 lines

**Dependencies:** `liveScore`, `goalEvents`, `formatGoalLabel`, `match`

**Risk:** None — pure presentation

---

#### Module 16: `components/StatusRibbon.tsx`

**Extracts lines:** ~3000–3080

**JSX moved:**

- 4-column status / phase / clock mode / running indicators
- Cockpit lock banner

**Target size:** ~100 lines

**Dependencies:** `currentStatusNormalized`, `currentPhase`, `clockMode`, `isGlobalClockRunning`, `cockpitLocked`

**Risk:** None — pure presentation

---

#### Module 17: `components/DriftBanner.tsx`

**Extracts lines:** ~3090–3115

**JSX moved:**

- Clock drift amber nudge bar + resync button

**Target size:** ~40 lines

**Dependencies:** `showDriftNudge`, `driftSeconds`, `fetchMatch`, `t`

**Risk:** None — trivially small

---

#### Module 18: `components/IneffectiveNoteModal.tsx`

**Extracts lines:** ~2680–2860

**JSX moved:**

- Full ineffective-note modal (action dropdown, team dropdown, textarea, save/cancel)

**Target size:** ~180 lines

**Dependencies:** Props from `useIneffectiveTime` hook

**Risk:** None — self-contained modal

---

#### Module 19: `components/ResetConfirmModal.tsx`

**Extracts lines:** ~2570–2680

**JSX moved:**

- Reset confirmation modal (warnings, RESET input, confirm/cancel)

**Target size:** ~120 lines

**Dependencies:** Props from `useResetMatch` hook

**Risk:** None — self-contained modal

---

#### Module 20: `components/ToastNotification.tsx`

**Extracts lines:** ~3360–3390

**JSX moved:**

- Fixed-position toast overlay with optional action button

**Target size:** ~40 lines

**Dependencies:** `toast` state (message, actionLabel, action)

**Risk:** None — trivially small

---

#### Module 21: `components/LoggerView.tsx`

**Extracts lines:** ~3420–3700

**JSX moved:**

- Logger mode layout: MatchTimerDisplay + TeamSelector + InstructionBanner + field resume button + ActionStage (PlayerSelectorPanel + quick actions + flow panels) + LiveEventFeed

**Target size:** ~300 lines

**Dependencies:** All timer/action/field/event props (passed down from orchestrator)

**Risk:** Low — presentation composition; no business logic

---

#### Module 22: `components/AnalyticsView.tsx`

**Extracts lines:** ~3395–3425

**JSX moved:**

- Analytics mode layout: effective/global clock bar + MatchAnalytics

**Target size:** ~50 lines

**Dependencies:** Match + events + time values + breakdown

**Risk:** None — trivial extraction

---

## 3. Execution Plan

### 3.1 Phases

Extraction order is determined by **risk level** (low → high) and **independence** (pure functions first, then self-contained hooks, then interconnected hooks, then JSX).

| Phase                                | Modules                                                      | Est. Size | Risk   | E2E Gate          |
| ------------------------------------ | ------------------------------------------------------------ | --------- | ------ | ----------------- |
| **P0 — Pure functions**              | `lib/clockHelpers.ts`                                        | ~100      | None   | Unit tests only   |
| **P1 — Isolated computed hooks**     | `useDisciplinary`, `useLiveScore`, `useDuplicateTelemetry`   | ~270      | None   | Cockpit-guard E2E |
| **P2 — Self-contained state hooks**  | `useOnFieldRoster`, `useClockDrift`, `useMatchData`          | ~370      | Low    | Cockpit-guard E2E |
| **P3 — Timer hooks**                 | `useVarTimer`, `useTimeoutTimer`                             | ~230      | Low    | Logger-core E2E   |
| **P4 — Business-critical hooks**     | `useIneffectiveTime`, `useTransitionGuards`, `useResetMatch` | ~720      | Medium | Full E2E suite    |
| **P5 — Test infra hook**             | `useCockpitHarness`                                          | ~80       | None   | Harness tests     |
| **P6 — JSX extraction (components)** | All 9 new components                                         | ~1,180    | Low    | Full E2E suite    |

### 3.2 Phase execution protocol

For **each phase**:

1. **Create** the new file(s) with extracted code
2. **Import** into `LoggerCockpit.tsx` and replace inline code with hook/component calls
3. **Run** `tsc --noEmit` — zero type errors
4. **Run** cockpit-guard E2E (`npm run test:e2e:cockpit-guard`)
5. **Run** full Playwright suite (`npx playwright test --max-failures=0`)
6. **Commit** phase as a single atomic commit (e.g., `refactor(cockpit): P1 — extract useDisciplinary, useLiveScore, useDuplicateTelemetry`)
7. **Update** `progress.md`

### 3.3 Commit strategy

Each phase = one commit. This makes bisection trivial if a regression appears.

```
refactor(cockpit): P0 — extract clockHelpers pure functions
refactor(cockpit): P1 — extract useDisciplinary, useLiveScore, useDuplicateTelemetry
refactor(cockpit): P2 — extract useOnFieldRoster, useClockDrift, useMatchData
refactor(cockpit): P3 — extract useVarTimer, useTimeoutTimer
refactor(cockpit): P4 — extract useIneffectiveTime, useTransitionGuards, useResetMatch
refactor(cockpit): P5 — extract useCockpitHarness
refactor(cockpit): P6 — extract CockpitHeader, ScoreBoard, StatusRibbon, DriftBanner,
                          IneffectiveNoteModal, ResetConfirmModal, ToastNotification,
                          LoggerView, AnalyticsView
```

---

## 4. Post-Modularization State

### 4.1 Expected file sizes

| File                     | Before |    After |
| ------------------------ | -----: | -------: |
| `LoggerCockpit.tsx`      |  3,715 | ~400–500 |
| New hooks (12 files)     |      0 |   ~1,750 |
| New components (9 files) |      0 |   ~1,180 |
| `lib/clockHelpers.ts`    |      0 |     ~100 |

### 4.2 Orchestrator responsibility

After modularization, `LoggerCockpit.tsx` will **only**:

1. Call all extracted hooks to obtain derived state
2. Wire hook outputs into child component props
3. Handle the 3 early-return gates (loading / error / not ready)
4. Render the top-level layout shell (`<div className="min-h-screen ...">`)
5. Compose `<CockpitHeader>`, `<ScoreBoard>`, `<StatusRibbon>`, and conditionally `<LoggerView>` or `<AnalyticsView>`

No business logic. No modals. No pure functions. No E2E harness.

### 4.3 Error domain reduction

| Concern               |       Before (file count) |                       After (file count) |
| --------------------- | ------------------------: | ---------------------------------------: |
| VAR timer bug         | 1 (3,715 lines to search) |         1 (`useVarTimer.ts`, ~180 lines) |
| Card tracking bug     |           1 (3,715 lines) |     1 (`useDisciplinary.ts`, ~120 lines) |
| Period transition bug |           1 (3,715 lines) | 1 (`useTransitionGuards.ts`, ~250 lines) |
| Ineffective time bug  |           1 (3,715 lines) |  1 (`useIneffectiveTime.ts`, ~350 lines) |
| Drift detection bug   |           1 (3,715 lines) |       1 (`useClockDrift.ts`, ~100 lines) |
| Score display bug     |           1 (3,715 lines) |         1 (`useLiveScore.ts`, ~70 lines) |

Average investigation scope reduced from **3,715 lines** to **~180 lines** per concern.

---

## 5. Constraints

1. **Zero behavioral changes** — every extraction must be a strict refactor; no new features, no bug fixes in the same commit.
2. **E2E must stay green** — the 177-test suite is the acceptance gate at every phase.
3. **No prop-drilling explosion** — if a hook output is consumed by >3 components, consider a lightweight context or keep the hook call in the orchestrator.
4. **Preserve `data-testid` contracts** — all existing test IDs must remain on the same DOM elements.
5. **Preserve E2E harness API** — `window.__PROMATCH_LOGGER_HARNESS__` must expose the same interface.
6. **Backend is not affected** — this is a pure frontend refactor; no API changes.

---

## 6. Risks & Mitigations

| Risk                            | Probability | Impact | Mitigation                                                                                          |
| ------------------------------- | :---------: | :----: | --------------------------------------------------------------------------------------------------- |
| Stale closure in extracted hook |   Medium    |  High  | Every hook receives latest state via params or refs; run full E2E after each phase                  |
| `useEffect` ordering change     |     Low     |  High  | Maintain same relative order of effects in orchestrator; wrap multi-effect hooks with explicit deps |
| Prop explosion in orchestrator  |   Medium    |  Low   | Group related props into typed objects (e.g., `TimerProps`, `IneffectiveProps`)                     |
| E2E flake from timing change    |     Low     | Medium | Run 2× full suite per phase; investigate any flake before committing                                |
| Type-inference breakage         |     Low     |  Low   | Export explicit interfaces from every new hook                                                      |

---

## 7. Success Criteria

- [ ] `LoggerCockpit.tsx` is < 600 lines **or** maximal safe thinning is completed with verified behavior parity (no functional regressions)
- [ ] Every new module has an explicit TypeScript interface
- [ ] Full Playwright E2E suite passes (177 tests, `--max-failures=0`)
- [ ] Cockpit-guard E2E passes
- [ ] `tsc --noEmit` exits clean
- [ ] `pre-commit run --all-files` passes
- [ ] No `data-testid` values were changed
- [ ] `progress.md` updated with modularization completion status
