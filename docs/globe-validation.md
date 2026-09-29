# Globe validation and evidence boundaries

MS-1 uses the public SceneManager commands and browser controls without a camera. Globe meshes stay fixed; CameraRig controls the view. Day texture comes from the registered Natural Earth derivative. MediaPipe model license remains unresolved and is unrelated to the texture license.

| Behavior | Executable evidence |
| --- | --- |
| Rig limits, nonfinite deltas, frame intervals | camera-rig unit tests |
| Invalid/stale/duplicate command rejection | command-executor unit tests |
| Ten city focus, shortest path, reset and cancellation | transitions unit tests, orbit E2E |
| North-up east/right orientation and UV mapping | earth-layer unit tests and TASK-102 user confirmation |
| Actual mouse/wheel, no panning, disable/dispose | orbit E2E, TASK-102 user confirmation |
| Host resize, bounded DPR and fullscreen | scene-manager unit tests, orbit E2E |
| Quality without scene/view replacement | quality unit tests, orbit E2E |
| Texture 404, one retry, fallback and late resource cleanup | earth-layer unit tests, globe-faults E2E |
| WebGL unavailable/lost/restored/deadline | foundation/globe-faults E2E; deterministic unit ownership tests |
| Keyboard fallback using semantic controls | control-commands unit tests, foundation E2E with Tab/Enter and actual canvas change |

The MS-1 keyboard path uses focusable buttons for rotation, zoom, reset and cancel. Global Arrow/+/-/R/Esc arbitration and focus conflicts remain TASK-506; no early Interaction implementation is claimed. UI emits actions to application wiring, which uses the existing validated GlobeCommand interface. The later Interaction milestone must route all sources through its orchestrator.

Visual evidence combines explicit geometric/projection regressions, actual rendered canvas changes, captured screenshots at 1366×768 and 1920×1080, and the user's TASK-102 oral confirmation bound to source hashes. This is not a cross-GPU pixel-golden certification. The user's device/GPU/browser full version were not supplied; they remain unknown. Automated Chromium version is recorded by the tool environment and must not be attributed to the user's browser.

AUTO initially maps to the validated configured HIGH profile; it does not claim measured adaptive FPS. LOW caps DPR and disables the atmosphere. Clouds and postprocessing remain off for all current profiles. Measured performance adaptation and physical benchmarks belong to later tasks.

Current automatic screenshots are `current-chromium-1366.png` and `current-chromium-1920.png` under `.gesture-globe/reports`; original TASK-102 captures and its original BLOCKED record are preserved. Physical camera, gestures, FPS/latency/memory and twenty-minute stability are not covered by this evidence. Public model redistribution remains blocked.
