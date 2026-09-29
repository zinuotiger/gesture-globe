# Local developer model

Run `npm run assets:fetch`, then `npm run assets:verify`. The script downloads only the Google versioned object registered in `src/config/assets.manifest.json`, checks its pinned SHA-256/size and atomically promotes a temporary file. It records source/version/time before fetching and a local receipt after success. An existing file without a valid matching receipt is refused, not overwritten.

`gesture_recognizer.task` is EXTERNAL_LOCAL, license UNRESOLVED, redistributionAllowed=false and releaseStatus=BLOCKED_PENDING_LICENSE. It and receipts are ignored by this directory's .gitignore. Never force-add them. `npm run dev` serves this directory on loopback for local use. Normal build verifies local readiness but copies only approved manifest release files; it never copies this model. Preview/build therefore does not supply gesture inference until a lawful distribution strategy is resolved.

`npm run release:verify` intentionally exits 2 while the model redistribution license remains unresolved. That expected denial is tested; it is not a public-release PASS. Local development and tests may proceed. See `docs/NOTICE.md` and `.gesture-globe/reports/TASK-007-RECOVERY-001.md`.

This conservative engineering policy is not legal advice. No model license is inferred from the SDK license.

TASK-301: mediapipe-0.10.32/ contains unmodified JS/WASM from the existing installed SDK, plus standard Apache-2.0 license terms. These SDK software files are BUNDLED, individually hashed in assets.manifest.json, and copied to the allowlisted build output. The separate .task model remains EXTERNAL_LOCAL / UNRESOLVED, ignored and excluded. No runtime latest URL, CDN request, package installation or model redistribution was introduced.

TASK-303: vision-worker-bootstrap.js is registered FIRST_PARTY code. A classic worker host dynamically loads the same-origin Vite entry so the SDK's importScripts works in development and built output. Model responses are checked for HTTP, MIME/body kind, bounded size and pinned SHA-256 before modelAssetBuffer reaches the SDK. WASM/loader bytes are separately verified and loaded from short-lived object URLs, revoked after initialization. Missing .task MIME is supported only with exact size/hash; HTML/JSON/text are rejected. No model is copied to dist, and this bootstrap alone does not make production inference available.
