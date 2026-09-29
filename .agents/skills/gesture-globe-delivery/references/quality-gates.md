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

## GOV-003 engineering progression with pending joint acceptance

The user's explicit 2026-09-27 joint-acceptance instruction authorizes GG-DEV-GATE-v1 in manifest.development_policy, mirrored exactly in requirements 24.15. This is the sole bounded exception to the earlier milestone-crossing/stop rules. Use only formal adopt-development-policy, defer-manual and engineering-gate commands. Engineering PASS is not overall acceptance PASS. TASK-208 and associated TASK-412 stay blocked with manual NOT_RUN/PARTIAL until actual joint camera/gesture evidence; preserve their original histories. Automated dependencies and all non-deferred tasks must pass first. Only declared consumers may use deferred engineering prerequisites. TASK-508 is the stop boundary for the combined real-camera/gesture check. No other human, performance, privacy or release standard is waived; no premature configVersion tuning claim. Do not manually edit the ledger or convert an engineering report into a full milestone report. Revalidate policy/evidence hashes; missing or changed evidence fails closed.

## GOV-004 full backlog engineering and consolidated acceptance

The user's current explicit instruction supersedes GOV-003's TASK-508 stop and earlier MS-8 exclusion: implement all original 84 cards including MS-8, preserving all original task definitions, dependencies, manual flags and acceptance standards. GG-DEV-GATE-v2 in manifest.development_policy and requirements 24.15 is authoritative. Six manual tasks may be formally deferred only with genuine complete automatic preparation; engineering gates permit the exact declared consumers and never constitute overall PASS. The joint acceptance boundary is TASK-806 after all automatic engineering work, not intermediate milestones. Public release/model licensing remains blocked until actual evidence. No new dependency, runtime, paid service or credentials are authorized. External adapters must distinguish implemented contracts from unrun real service integration.

Routine failures: preserve every failure; diagnose before retrying; use formal unblock/begin recovery and a documented new repair hypothesis. The prior two-repair stop is historical, not a new automatic stop condition. Do not repeat failed attempts without new evidence or weaken tests; consult the fixed coordinating review conversation for no-progress technical blockers. Continue existing authorized work without asking the user to operate PowerShell. User intervention is reserved for actual device evidence, credentials, additional costs or irreversible decisions. All repository, privacy, no-commit/no-publish constraints remain.
