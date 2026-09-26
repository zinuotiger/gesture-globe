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
