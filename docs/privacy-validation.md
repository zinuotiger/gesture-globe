# Privacy and resource acceptance (TASK-706)

Automatic preparation uses a clearly labelled synthetic blank video with the real local MediaPipe model. It observes same-origin requests, no request bodies or external requests, no unexpected socket traffic, preference-only storage, ended software tracks and terminated Workers. This is not permission, physical camera, indicator or human acceptance.

## Consolidated manual procedure

Run the existing local development server after assets:fetch and assets:verify. Use Chrome and Edge separately with fresh site permissions. Record browser/version, OS, machine model, camera model/resolution, quality, configVersion, timestamp and anonymous tester in a new copy of TASK-706-manual-plan.json. Never change earlier pinned evidence. All current manual fields are NOT_RUN.

1. Open without activating gestures: no permission prompt, stream or Worker; manual controls work.
2. Deny camera permission after explicit activation: clear recoverable error and usable mouse/touch/keyboard; no microphone request.
3. Allow camera in a fresh permission run: video-only permission, real camera preview, actual local model READY. Observe all getUserMedia constraints have audio:false.
4. With DevTools Network Preserve log, activate, gesture, hide preview, pause, resume and close. Expected: local assets only; no video/frame/landmark requests, bodies, sockets or remote uploads. Inspect without exporting raw HAR bodies.
5. Inspect Application storage before/after: only gesture-globe.preferences.v1 and gesture-globe.onboarding.v1 with whitelisted scalar fields; no video/landmarks, session storage, IndexedDB, CacheStorage or service worker records. Existing unrelated site data must be distinguished rather than deleted silently.
6. Hide preview: physical camera indicator remains on while the active stream remains in use. Hiding is not a privacy stop.
7. Close gestures: tracks ended, video srcObject cleared, pending frame work and Worker released; browser and camera occupancy indicators extinguish. Record actual transition/time and any competing camera consumers.
8. Repeat activation/close ten times. Count exactly one active stream and at most one active inference Worker; all ended after each close. Inspect scalar resource diagnostics; do not persist camera frames or complete landmarks.
9. Activate then navigate away/close tab (pagehide): camera occupancy ends; return does not silently reactivate or request permission.

Record each check PASS/FAIL only after observation, with actual values and redacted evidence reference. Missing measurement stays NOT_RUN. Save redacted network metadata (method/origin/type/count, no bodies), storage key names, scalar lifecycle counts and typed indicator observations on failure. Never save real video, full landmark streams, raw HAR bodies or heap dumps. Final acceptance needs both browsers and actual device evidence; no script automatically signs it.

## Boundaries

Headless Chromium tests do not certify installed Chrome/Edge, physical privacy indicators or real permission dialogs. Public model redistribution remains BLOCKED_PENDING_LICENSE; local development is separate. This procedure is consolidated with the later final acceptance package under GOV-004/005; no human PASS is claimed here.
