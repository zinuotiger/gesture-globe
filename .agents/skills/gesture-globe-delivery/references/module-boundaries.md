# Module boundaries

| Module | Owns | May depend on | Must not depend on |
|---|---|---|---|
| M01 App Shell | bootstrap, orthogonal state, lifecycle, error boundary | public interfaces of M02–M10, config, shared | internal module objects |
| M02 Globe Engine | Three.js scene, camera rig, render loop, transitions | Three.js, config, shared commands | MediaPipe, gesture names, camera |
| M03 Camera | permission, stream, video source, display coordinate adapter | browser media APIs, config, lifecycle | gesture, Three.js |
| M04 Vision Runtime | worker, model/WASM, frame scheduling, DTO normalization | MediaPipe, worker APIs, shared DTO | DOM, Three.js, product UI |
| M05 Gesture Engine | features, filtering, fusion, state machine, intents | config, pure math, VisionFrame DTO | DOM, camera, Three.js |
| M06 Interaction | input adapters, source arbitration, validation, command bus | public module interfaces, shared commands | raw landmarks, MediaPipe internals |
| M07 Geo Selection | raycast, world/geo conversion, dwell, cities, markers | M02 pick interface, Three.js, static data | gesture classifier, camera |
| M08 UI & Onboarding | HUD, dialogs, camera card, feedback, error center | AppStore selectors/actions | private worker/model/renderer objects |
| M09 Config & Data | validated defaults, assets, city data, feature flags | schema utilities | runtime side effects |
| M10 Diagnostics | bounded metrics, tracing, health, redacted events | event interfaces | raw video and full landmark persistence |
| M11 QA & Build | tests, fixtures, CI, evidence tooling | public interfaces | production shortcuts |
| M12 Agent Gateway | tool registry, redacted context, cancellable actions | M06/M07 whitelist | frames, device IDs, arbitrary script execution |

## Stable data flow

```text
Camera frame
  -> Vision Worker
  -> VisionFrame DTO
  -> Gesture Engine
  -> GestureIntent
  -> Interaction Orchestrator
  -> GlobeCommand / GeoSelectRequest
  -> Globe / Geo
  -> AppStore
  -> UI and redacted Diagnostics
```

## Review questions

- Did any module import another module's private file instead of its public index?
- Did any UI event mutate Three.js directly?
- Did any worker message contain a class instance or non-cloneable object?
- Did any gesture algorithm read the DOM, video element, or renderer?
- Did any command bypass validation, source priority, or cancellation?
- Did any diagnostic or test artifact store real frames or complete landmark histories?
