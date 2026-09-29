# Execution protocol

## Why this workflow exists

Gesture Globe contains 84 tasks, multiple runtime boundaries, real-camera behavior, manual gates, and privacy constraints. A single giant prompt creates five predictable failure modes: scope drift, hidden regressions, false manual-test claims, context compaction, and inability to resume. The controller therefore makes progress durable in the repository.

## Modes

| Mode | Maximum product tasks | Crossing milestone | Intended use |
|---|---:|---|---|
| inspect | 0 | No | Understand an existing repository and ledger. |
| single-task | 1 | No | Normal development and safest default. |
| batch N | 1–3 | No | Closely related tasks in one module. |
| marathon | Sequential until stop condition | No | One long prompt with durable checkpoints. |
| milestone-audit | No new feature tasks | No | Review, repair, and evidence only. |

## Durable checkpoint

A checkpoint is complete only when all of these exist:

1. implementation diff;
2. tests and command results;
3. evidence Markdown;
4. state transition to `completed` or `blocked`;
5. no unexplained active task.

Conversation text is not a checkpoint. Repository files are.

## Existing-repository reconciliation

When the repository already contains code:

1. run `gg.py verify` and `gg.py status`;
2. inspect package scripts, directory structure, tests, git status, and current behavior;
3. compare implemented behavior with task completion standards;
4. never mark tasks complete from filenames alone;
5. create evidence for implementation that is actually verified;
6. leave ambiguous tasks pending and report what proof is missing.

## Manual gates

The controller labels manual-gate tasks. Automation may prepare a test page, record form, fixture, diagnostics, or browser script. It may not claim the gate passed without the real evidence named in the manifest.

## Requirement conflict precedence

Use this order:

1. explicit current user instruction;
2. nearest active `AGENTS.md` safety rule;
3. specific TASK completion standard;
4. specific requirement ID;
5. module blueprint and interface contract;
6. general architecture or product prose.

When two items at the same level conflict, stop and create a minimal change proposal rather than guessing.

## Resume and scope rules

- The repository must be under Git before `begin` so the controller can snapshot changed paths and hashes.
- If a task is already `in_progress`, `gg.py next` returns that task with `[RESUME ACTIVE]`; calling `begin` again preserves the original baseline.
- Scope checks compare both new paths and further edits to files that were already uncommitted at task start.
- A filled task report with overall `Status: PASS` is required before `complete`.

## Milestone locking

Completing every task in a milestone does not automatically open the next milestone. Generate the gate report with `gg.py milestone MS-x --create-report`, execute the documented gate, fill the report honestly, then record it with `--record`. Only a validated PASS report unlocks the next milestone.

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
