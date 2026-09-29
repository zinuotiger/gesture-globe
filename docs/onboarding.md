# First-use guide

The first activation opens a native modal with exactly three steps: local video/privacy, five gestures, and preparation. No camera request occurs during tutorial navigation. Explicit final activation or “skip teaching and enable” calls the existing camera activation action. Cancel/Escape returns focus and requests nothing. Help reopens the guide without starting a camera. Tab/Shift+Tab cycle within visible enabled actions.

Only `{schemaVersion:1,completed:true}` is stored under `gesture-globe.onboarding.v1`. Corrupt/incompatible/unavailable storage falls back safely; completion is still remembered for the current application instance. Reset clears that preference. No frames, landmarks, device identifiers or camera permission decisions are stored.

The dialog and live camera preparation text use AppStore camera/vision/hand summaries. Unknown, no hand, unready hand and ready model are distinct. Complete framing/distance comes from the existing eligibility result; lighting is guidance for the user, not an invented automatic illumination measurement. Completing/skipping teaching does not count as real-camera or human gesture acceptance.

Existing camera/worker regression suites use an explicit returning-user fixture that writes only the tutorial completion preference. They still exercise the original permission requests, denial, lifecycle, real local model and no-audio assertions. A separate fresh-browser suite covers first use, zero early permission calls, all five gestures, three steps, both supported viewports, cancellation, focus, skip, help and storage faults. No browser media permission is pre-granted by either fixture.
