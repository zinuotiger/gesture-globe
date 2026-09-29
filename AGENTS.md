<!-- BEGIN GESTURE-GLOBE-SKILL -->
# Gesture Globe repository instructions

## Canonical workflow

- Use the repo skill `$gesture-globe-delivery` for implementation, continuation, audits, and milestone validation.
- Canonical requirements: `docs/Gesture_Globe_实施级需求规格_v3.0.md`.
- Canonical task ledger: `.gesture-globe/state.json`; update it only through the skill controller script.
- Work on one task at a time. A batch may contain at most three tasks from the same milestone, completed and recorded sequentially.
- Do not begin a task whose dependencies are incomplete. Do not cross a milestone before its PASS gate report is recorded by `gg.py milestone MS-x --record`.
- Keep the repository under Git; `begin` and `check-scope` rely on a task-start baseline to protect existing changes.

## Repository safety

- Do not modify files outside this repository.
- Do not push, publish, deploy, delete branches, rewrite history, run destructive cleanup, or discard unrelated user changes unless explicitly authorized.
- Do not edit the canonical requirements document or task manifest unless the user explicitly requests requirement change control.
- Preserve pre-existing uncommitted work. Report conflicts instead of resetting it.
- Do not add production dependencies, credentials, or paid services without authorization.

## Architecture invariants

- `main.ts` is composition only.
- Camera owns media permissions and streams; Vision owns MediaPipe inference; Gesture owns pure interpretation; Interaction owns arbitration; Globe/Geo execute commands; UI reads state and dispatches actions.
- Vision must not manipulate Three.js. Gesture must not access DOM or camera APIs. UI must not read MediaPipe internals. Agent code must not bypass Interaction.
- All thresholds belong in validated configuration; no scattered magic numbers.
- Do not persist or upload video frames or complete landmark streams. Never request audio for gesture control.
- Mocks and fixtures may support tests but must not masquerade as final camera/model behavior.

## Verification

- Add tests for new behavior.
- Run targeted tests, then applicable lint, typecheck, test, and build scripts.
- Do not claim a missing or unrun command passed.
- Real-camera, real-human, browser-permission, performance, and long-duration gates require actual recorded evidence.
- Each completed task needs a fully filled, PASS `.gesture-globe/evidence/TASK-xxx.md`; template placeholders or unrun checks cannot be reported as passed.

## Task graph authority and governance changes

- The current user's explicit governance change authorization takes precedence within its stated scope.
- `task-manifest.json` is the authoritative machine-executable task graph; requirements chapter 24 is its detailed human-readable mirror.
- Requirements section 12.1 and other task-range tables are derived summaries, not additional task definitions.
- If the manifest and chapter 24 disagree on tasks, dependencies, manual gates, or completion criteria, stop and report; do not choose silently.
- If a derived summary disagrees with both, treat it as a governance baseline defect and repair it only under explicit governance authorization.
- Never invent tasks from summary ranges, and never delete existing manifest tasks to make validation pass.
- Keep a stopped execution intent as historical fact. Record governance work separately and begin a new product intent only after its required acceptance passes.
- Explicit authorization to continue across automated milestones applies only after a genuine PASS gate is recorded; it never substitutes for required human evidence.

<!-- END GESTURE-GLOBE-SKILL -->

## GOV-003 engineering progression with pending joint acceptance

The user's explicit 2026-09-27 joint-acceptance instruction authorizes GG-DEV-GATE-v1 in manifest.development_policy, mirrored exactly in requirements 24.15. This is the sole bounded exception to the earlier milestone-crossing/stop rules. Use only formal adopt-development-policy, defer-manual and engineering-gate commands. Engineering PASS is not overall acceptance PASS. TASK-208 and associated TASK-412 stay blocked with manual NOT_RUN/PARTIAL until actual joint camera/gesture evidence; preserve their original histories. Automated dependencies and all non-deferred tasks must pass first. Only declared consumers may use deferred engineering prerequisites. TASK-508 is the stop boundary for the combined real-camera/gesture check. No other human, performance, privacy or release standard is waived; no premature configVersion tuning claim. Do not manually edit the ledger or convert an engineering report into a full milestone report. Revalidate policy/evidence hashes; missing or changed evidence fails closed.

## GOV-004 full backlog engineering and consolidated acceptance

The user's current explicit instruction supersedes GOV-003's TASK-508 stop and earlier MS-8 exclusion: implement all original 84 cards including MS-8, preserving all original task definitions, dependencies, manual flags and acceptance standards. GG-DEV-GATE-v2 in manifest.development_policy and requirements 24.15 is authoritative. Six manual tasks may be formally deferred only with genuine complete automatic preparation; engineering gates permit the exact declared consumers and never constitute overall PASS. The joint acceptance boundary is TASK-806 after all automatic engineering work, not intermediate milestones. Public release/model licensing remains blocked until actual evidence. No new dependency, runtime, paid service or credentials are authorized. External adapters must distinguish implemented contracts from unrun real service integration.

Routine failures: preserve every failure; diagnose before retrying; use formal unblock/begin recovery and a documented new repair hypothesis. The prior two-repair stop is historical, not a new automatic stop condition. Do not repeat failed attempts without new evidence or weaken tests; consult the fixed coordinating review conversation for no-progress technical blockers. Continue existing authorized work without asking the user to operate PowerShell. User intervention is reserved for actual device evidence, credentials, additional costs or irreversible decisions. All repository, privacy, no-commit/no-publish constraints remain.

## GOV-005 explicit engineering and acceptance states

Under the user's latest authorization, the formal progress-model command adds engineeringStatus and acceptanceStatus without changing task definitions, IDs, dependency lists, task status or gate status. Manual tasks with verified defer-manual records remain blocked but ENGINEERING_COMPLETE / ACCEPTANCE_DEFERRED. Non-manual tasks whose entire automatic engineering is complete may declare **Acceptance status:** ACCEPTANCE_DEFERRED and a concrete ## Deferred acceptance section in their PASS engineering evidence (e.g. real stability or external integration). Complete pins that evidence and preserves the debt; no unimplemented code or failed automatic test may use this mechanism. Full milestone acceptance refuses any unresolved debt. Engineering progression still uses original dependencies. Only the acceptance command with explicit actual-user evidence confirmation may resolve non-manual acceptance debt; original deferral evidence stays immutable. Normal automatic completion is AUTOMATED_CHECKS_PASSED, never a claim that all real experience passed. Do not hand-edit ledger fields. The final package must report engineering, automatic tests, human/external integration and public license separately. No further task-manifest edits.
