# Quality gates

Use the repository's actual package scripts. Commands below are expected names, not permission to report a missing script as passing.

## Per-task gate

1. targeted tests for changed behavior;
2. `npm run lint` when present;
3. `npm run typecheck` when present;
4. relevant unit/contract/integration/E2E command;
5. `npm run build` when present;
6. `gg.py check-scope TASK-xxx`;
7. manual check required by the task, or an explicit `not run` with reason.

## Milestone gates

### MS-0

- clean install succeeds using the selected package manager;
- strict TypeScript, lint, typecheck, unit test, E2E smoke, and build commands exist and run;
- dependency rules, config validation, task ledger, asset manifest, and NOTICE skeleton exist.

### MS-1

- globe loads without camera permission;
- mouse drag, wheel zoom, keyboard fallback, reset, resize, quality switching, and dispose are verified;
- texture failure and WebGL context-loss behavior do not white-screen.

### MS-2

- page load does not request camera;
- six browser error classes map to user actions;
- start/stop is idempotent; 10 cycles do not leave duplicate streams;
- real Chrome and Edge camera results are recorded before TASK-208 completes.

### MS-3

- worker protocol versioning, READY gating, single in-flight frame, stale-frame rejection, pause/resume, close, and one-restart policy pass;
- CI can run upper layers with mock/replay data;
- no unbounded frame or ImageBitmap retention.

### MS-4

- deterministic fixture sequences cover all five gestures, priority, hysteresis, cooldown, hand loss, frame gaps, and two-hand stability;
- real-human tuning evidence is required for TASK-412.

### MS-5

- every input source enters one orchestrator;
- mouse/keyboard can preempt transitions and gesture control;
- invalid, stale, duplicate, NaN, and Infinity commands are rejected;
- replay integration reaches view changes without bypass paths.

### MS-6

- screen-to-NDC, raycast, geo conversion, date-line cases, city match, dwell cancellation, marker occlusion, and selectionId consistency pass;
- first-use flow fits 1366×768 and remains keyboard-operable.

### MS-7

- all P0 failure injections avoid a blank page;
- network/storage/privacy and release evidence are reviewed;
- 20-minute stability and slow-inference runs have real measurements;
- Chrome/Edge final real-gesture matrix is attached;
- README, architecture, tuning notes, known limitations, licenses, build, preview smoke, and demo script are complete.

### MS-8

- feature flag defaults off;
- tool input schemas validate;
- context excludes frames, complete landmarks, and device identifiers;
- user input can cancel or preempt every agent action;
- ambiguous geocoding asks rather than guesses;
- external weather/route failures remain explicit and sourced.

## Honest evidence policy

- `PASS`: command or manual step actually executed and met its criterion.
- `FAIL`: executed and did not meet the criterion.
- `NOT_RUN`: unavailable or intentionally deferred; include reason and owner.
- `PARTIAL`: only a subset executed; list the missing portion.

Do not convert `NOT_RUN` or `PARTIAL` into `PASS` in summaries.

## Recording the gate

After all milestone checks are actually complete, set the report's overall `Status` to `PASS` and record it:

```text
python .agents/skills/gesture-globe-delivery/scripts/gg.py milestone MS-x --record --report .gesture-globe/reports/MS-x.md
```

A `FAIL`, `PARTIAL`, placeholder-filled, or missing report does not unlock the next milestone.
