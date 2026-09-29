# Vision runtime lifecycle

The worker loads pinned, integrity-checked local SDK/WASM/model bytes. The model remains EXTERNAL_LOCAL / UNRESOLVED and is excluded from published files. SDK licensing does not cover model weights.

Use VisionWorkerClient for protocol/transfer ownership, FrameScheduler for one in-flight frame, and VisionHealthMonitor for activation/recovery. App owns visibility and camera access. Vision exposes plain numeric DTOs; consumers must discard control anchors whenever the client leaves READY. The full App/Gesture/Interaction connection is implemented in TASK-508.

All capture/result clocks use `performance.timeOrigin + performance.now()`. Normalization does not mirror or clamp model coordinates. Slot IDs are temporary, not persistent physical-hand identities. Results older than configured 150ms, duplicate/older IDs and pre-pause frames cannot drive control. Scheduler settlement is separate from accepted-result delivery so discarded results do not deadlock capture.

PAUSE immediately gates client delivery. Worker closes any active bitmap before PAUSED. An early RESUME waits for that acknowledgement; READY reopens scheduling. Pause/resume contains no queued old images. App's visibility adapter also disables processing when gesture control is disabled.

TASK-309 adds a bounded liveness extension to schema 1: PING/PONG carry only a nonnegative integer nonce and existing session metadata. Only a matching worker response acknowledges a probe; timers never synthesize recognition. ERROR may include frameId to acknowledge a failed inference without manufacturing a VisionFrame. Unknown versions remain errors. These additions implement the task's explicit heartbeat requirement without changing any task definition.

Health defaults are validated in M09: heartbeat interval 1000ms, timeout 3000ms (at least two intervals), maximum automatic restarts 1. Crash, heartbeat timeout and model/WASM load failure share that one activation budget. A second failure becomes DEGRADED. Initialization timeout and schema incompatibility do not loop. Individual inference errors release their slot; a valid result resets the consecutive count; three consecutive inference errors stop the session without automatic restart. Only explicit activation resets the restart budget. Monitor stop/dispose clears timers, subscriptions and pending probes; no frame history is stored. Its inference count/mean/max contain scalar timings only, not a real-device benchmark claim.

Synthetic deterministic tests cover fault policy. Integration tests load the actual local model, transfer an actual blank ImageBitmap, and check pause/resume and matching heartbeat responses in Chromium. Blank-image inference is not human gesture or physical-camera acceptance. The 20-minute and real-device matrix remains deferred until consolidated acceptance.
