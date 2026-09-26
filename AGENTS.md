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
<!-- END GESTURE-GLOBE-SKILL -->
