---
name: gesture-globe-delivery
description: Orchestrate implementation, continuation, audit, and milestone validation of the Gesture Globe browser project from its v3.0 specification. Use only inside the Gesture Globe repository when asked to build, continue, resume, test, review, or finish this project; do not use for unrelated Three.js or MediaPipe work.
---

# Gesture Globe delivery workflow

Use this skill as the repository's implementation controller. The goal is not to generate the whole application in one undifferentiated edit. The goal is to advance the canonical backlog through small, verified, resumable tasks while preserving module boundaries, evidence, privacy, and manual-test honesty.

## Canonical sources

1. Read the nearest active `AGENTS.md` before editing.
2. Treat `docs/Gesture_Globe_实施级需求规格_v3.0.md` as the product and engineering baseline.
3. Treat `references/task-manifest.json` as the structured task graph.
4. Treat `.gesture-globe/state.json` as the execution ledger.
5. Do not edit the requirements baseline or task manifest unless the user explicitly requests requirement change control.

## Invocation modes

Infer the mode from the user's prompt. When unclear, use `single-task`.

- `inspect`: audit repository state, task ledger, active instructions, scripts, tests, and blockers; do not change product code.
- `single-task`: execute exactly one next runnable task. This is the default.
- `batch N`: execute at most N runnable tasks, where N must be 1–3, all in the same milestone. Complete and record each task before beginning the next.
- `marathon`: continue one task at a time inside the current milestone until the first manual gate, blocker, failed quality gate, scope conflict, or context/time boundary. Persist state after every task. Never silently cross a milestone gate.
- `task TASK-xxx`: execute the named task only after verifying all dependencies.
- `milestone-audit MS-x`: run the milestone gate, fix only defects required for that milestone, and produce a report. Do not begin the next milestone.

A user may start a long run with one prompt, but the run remains resumable rather than atomic. Never claim the entire project is complete because one session ended without checking the ledger and release gates.

## Tool entry point

Prefer the repository-scoped controller when it exists:

```text
python .agents/skills/gesture-globe-delivery/scripts/gg.py <command>
```

For a user-scoped installation, run the controller from the skill directory and pass the repository explicitly. Examples:

```text
# PowerShell
py -3 "$HOME\.agents\skills\gesture-globe-delivery\scripts\gg.py" --repo . <command>

# macOS/Linux shell
python "$HOME/.agents/skills/gesture-globe-delivery/scripts/gg.py" --repo . <command>
```

On Windows, `py -3` is an acceptable replacement for `python`. Before product work run `verify`, `status`, and `next --limit 3`. If the ledger does not exist, run `init`. The repository must be under Git before `begin`, because scope protection compares each task against a durable Git baseline. Do not hand-edit the ledger.

## Task selection rules

1. Select only a task returned as runnable by `gg.py next`, unless the user explicitly names a task.
2. A named task is still blocked until all dependencies are complete.
3. Do not merge tasks across milestones.
4. In a batch, do not begin task 2 until task 1 has code, tests, evidence, and a `complete` ledger transition.
5. Manual-gate tasks may be prepared, scripted, and documented automatically, but may not be marked complete without the stated real-world evidence.
6. If the repository already contains implementation work, inspect it before scaffolding. Preserve correct work and reconcile the ledger; do not recreate the project blindly.

## Per-task execution loop

For each task, follow this exact loop.

### 1. Establish scope

- Run `gg.py prompt TASK-xxx` and read the output.
- Read the relevant requirements and module sections in the canonical document.
- Inspect current code, tests, package scripts, and uncommitted changes.
- Run `gg.py begin TASK-xxx` before editing.
- State the allowed paths, protected paths, expected public interfaces, and quality commands.
- Preserve unrelated user changes. Do not clean or reset them.

### 2. Implement the smallest complete vertical slice

- Implement only the selected task and the minimum contract work required by its documented dependencies.
- Keep `main.ts` as composition only.
- Respect the pipeline: Camera → Vision DTO → GestureIntent → Interaction → GlobeCommand → Globe/Geo/UI.
- Never let Vision manipulate Three.js, Gesture access DOM, UI read MediaPipe internals, or Agent bypass Interaction.
- Do not use random values, sleeps, timers, hard-coded fake recognition, or static success responses as final behavior.
- Pin third-party versions and local assets; do not use runtime `latest` URLs.
- Add only production dependencies explicitly required by the canonical task or specification. Any additional dependency, paid service, credential, or external account requires user authorization.
- Keep video frames and complete landmarks ephemeral. Do not persist or upload them.

### 3. Test and inspect

- Add the narrowest useful unit, contract, integration, E2E, or fault-injection test.
- Run targeted tests first, then the applicable repository quality gates.
- Use existing package scripts. Do not report a missing script as a passing test.
- Inspect the diff for scope, dead code, accidental secrets, generated binaries, and baseline-document edits.
- Run `gg.py check-scope TASK-xxx` before completion.
- For UI or 3D work, perform the documented browser/manual check when the environment supports it; otherwise record the unexecuted manual step explicitly.

### 4. Write evidence

Create or update `.gesture-globe/evidence/TASK-xxx.md` using the task-report template. Include:

- task and requirement references;
- changed files;
- exact commands and exit results;
- automated tests added;
- manual checks actually performed;
- screenshots or report paths when relevant;
- unresolved items and risks;
- whether real camera/human evidence is still required.

Never write “passed” for a test that was not run.

### 5. Transition the ledger

- If all automated and required manual criteria are met, run:

```text
python .agents/skills/gesture-globe-delivery/scripts/gg.py complete TASK-xxx --evidence .gesture-globe/evidence/TASK-xxx.md
```

- If blocked, run:

```text
python .agents/skills/gesture-globe-delivery/scripts/gg.py block TASK-xxx --reason "specific evidence-backed blocker"
```

- Do not leave a task `in_progress` when ending the session without explaining why.

## Milestone gate

When all tasks in a milestone are complete:

1. Run `gg.py milestone MS-x --create-report`.
2. Execute the commands and manual checks in `references/quality-gates.md`.
3. Fill `.gesture-globe/reports/MS-x.md` with exact PASS/FAIL/NOT_RUN evidence; the overall status may be PASS only when the gate is genuinely satisfied.
4. Audit module boundaries, protected paths, privacy, and unresolved deviations.
5. Record a passing gate with `gg.py milestone MS-x --record --report .gesture-globe/reports/MS-x.md`.
6. Stop. `gg.py next` will not expose the next milestone until this record exists.

## Stop conditions

Stop implementation and report evidence when any of the following occurs:

- a required dependency or interface is absent or contradicts the canonical requirement;
- the task requires modifying a protected path or an unrelated module;
- a new production dependency, credential, paid service, or external account is required without authorization;
- an asset license or provenance is unknown;
- the same quality failure remains after two focused repair attempts;
- baseline tests were failing before the task and the failure is unrelated;
- a real camera, human gesture, browser permission, or long-duration test is required but unavailable;
- completion would require hiding, deleting, or resetting unrelated user work;
- the environment would need a destructive command, push, deployment, or publication not explicitly authorized.

Do not compensate for a blocker by weakening tests, suppressing errors, replacing real behavior with mocks, or marking the task complete.

## Reporting format

At the end of each run, report:

1. mode and selected task(s);
2. completed tasks and ledger state;
3. changed files;
4. commands and exact results;
5. manual evidence performed versus still required;
6. blockers, risks, and the next runnable task.

Use concise factual language. Do not claim real-camera, real-user, performance, or release success without evidence.

## Supporting references

Read these only when needed:

- `references/execution-protocol.md`
- `references/module-boundaries.md`
- `references/quality-gates.md`
- `references/requirement-index.md`
- `references/task-manifest.json`

## Task graph authority and governance changes

- The current user's explicit governance change authorization takes precedence within its stated scope.
- `task-manifest.json` is the authoritative machine-executable task graph; requirements chapter 24 is its detailed human-readable mirror.
- Requirements section 12.1 and other task-range tables are derived summaries, not additional task definitions.
- If the manifest and chapter 24 disagree on tasks, dependencies, manual gates, or completion criteria, stop and report; do not choose silently.
- If a derived summary disagrees with both, treat it as a governance baseline defect and repair it only under explicit governance authorization.
- Never invent tasks from summary ranges, and never delete existing manifest tasks to make validation pass.
- Keep a stopped execution intent as historical fact. Record governance work separately and begin a new product intent only after its required acceptance passes.
- Explicit authorization to continue across automated milestones applies only after a genuine PASS gate is recorded; it never substitutes for required human evidence.

## GOV-003 engineering progression with pending joint acceptance

The user's explicit 2026-09-27 joint-acceptance instruction authorizes GG-DEV-GATE-v1 in manifest.development_policy, mirrored exactly in requirements 24.15. This is the sole bounded exception to the earlier milestone-crossing/stop rules. Use only formal adopt-development-policy, defer-manual and engineering-gate commands. Engineering PASS is not overall acceptance PASS. TASK-208 and associated TASK-412 stay blocked with manual NOT_RUN/PARTIAL until actual joint camera/gesture evidence; preserve their original histories. Automated dependencies and all non-deferred tasks must pass first. Only declared consumers may use deferred engineering prerequisites. TASK-508 is the stop boundary for the combined real-camera/gesture check. No other human, performance, privacy or release standard is waived; no premature configVersion tuning claim. Do not manually edit the ledger or convert an engineering report into a full milestone report. Revalidate policy/evidence hashes; missing or changed evidence fails closed.

## GOV-004 full backlog engineering and consolidated acceptance

The user's current explicit instruction supersedes GOV-003's TASK-508 stop and earlier MS-8 exclusion: implement all original 84 cards including MS-8, preserving all original task definitions, dependencies, manual flags and acceptance standards. GG-DEV-GATE-v2 in manifest.development_policy and requirements 24.15 is authoritative. Six manual tasks may be formally deferred only with genuine complete automatic preparation; engineering gates permit the exact declared consumers and never constitute overall PASS. The joint acceptance boundary is TASK-806 after all automatic engineering work, not intermediate milestones. Public release/model licensing remains blocked until actual evidence. No new dependency, runtime, paid service or credentials are authorized. External adapters must distinguish implemented contracts from unrun real service integration.

Routine failures: preserve every failure; diagnose before retrying; use formal unblock/begin recovery and a documented new repair hypothesis. The prior two-repair stop is historical, not a new automatic stop condition. Do not repeat failed attempts without new evidence or weaken tests; consult the fixed coordinating review conversation for no-progress technical blockers. Continue existing authorized work without asking the user to operate PowerShell. User intervention is reserved for actual device evidence, credentials, additional costs or irreversible decisions. All repository, privacy, no-commit/no-publish constraints remain.

## GOV-005 explicit engineering and acceptance states

Under the user's latest authorization, the formal progress-model command adds engineeringStatus and acceptanceStatus without changing task definitions, IDs, dependency lists, task status or gate status. Manual tasks with verified defer-manual records remain blocked but ENGINEERING_COMPLETE / ACCEPTANCE_DEFERRED. Non-manual tasks whose entire automatic engineering is complete may declare **Acceptance status:** ACCEPTANCE_DEFERRED and a concrete ## Deferred acceptance section in their PASS engineering evidence (e.g. real stability or external integration). Complete pins that evidence and preserves the debt; no unimplemented code or failed automatic test may use this mechanism. Full milestone acceptance refuses any unresolved debt. Engineering progression still uses original dependencies. Only the acceptance command with explicit actual-user evidence confirmation may resolve non-manual acceptance debt; original deferral evidence stays immutable. Normal automatic completion is AUTOMATED_CHECKS_PASSED, never a claim that all real experience passed. Do not hand-edit ledger fields. The final package must report engineering, automatic tests, human/external integration and public license separately. No further task-manifest edits.
