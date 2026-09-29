# ImageBitmap ownership and final stability acceptance

TASK-306 engineering separates ownership from actual long-duration acceptance. `BitmapOwnership` captures frame/session/time/dimensions before use and closes the transferred bitmap in `finally`, on success and failure. Worker protocol rejection also closes real transferred bitmaps. Main-thread client transfers ownership or closes failed submissions. Scheduler permits at most one capture/inference slot and closes captures invalidated by stop/session change. Only scalar counters are retained.

Camera capture is composed in `src/app/createCameraFrameSource.ts` through Camera's public VideoSource; Vision neither owns camera permissions nor reads private MediaPipe objects outside its adapter. Frame timestamps use `performance.timeOrigin + performance.now()` to preserve a shared monotonic millisecond domain across the main thread and worker. No image history, recording, upload or microphone request.

## Automatic checks actually available

`tests/integration/bitmap-transfer.test.mjs` creates real ImageBitmaps from a synthetic canvas in a real local Chromium worker. Its 1200 frames include 71 deliberate processing faults. It checks detached sender width, zero worker width after close, preserved metadata and counters received=closed, active=0, maximumActive=1. This is a bounded synthetic lifetime check, not real-camera recognition or a 20-minute memory benchmark.

## Prepared 20-minute resource tool

On the existing local developer preview, `/tests/fixtures/bitmap-harness.html` has a **Run 20-minute synthetic resource check** button. Keep the tab visible for 20 real minutes. It uses sequential transferred synthetic frames and reports actual elapsed time, counts, closed/active objects and failures; it stores no images. A thrown ownership/metadata violation displays FAIL. The button cannot turn a short test into a claimed 20-minute PASS. The page is test-only and is not part of the release file list.

This long run is NOT_RUN in TASK-306. The final consolidated acceptance also needs the actual camera/model/application stability run under TASK-707. Record device model, OS/browser versions, camera resolution, app/config/model hashes, start/end time, memory series, dropped-frame/latency observations and stop/resource results. Do not extrapolate real FPS or memory from the synthetic ownership test. If unavailable, retain ACCEPTANCE_DEFERRED; never fill PASS automatically.

Failures: record timestamp, scalar counters, error text, reproduction steps and browser version. Do not save video, raw frames, full landmarks or unique device IDs. No user action is requested mid-development; this page and checklist are preparation for final joint acceptance.
