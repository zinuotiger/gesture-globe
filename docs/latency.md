# Latency measurement

TASK-702 measures an estimate from the accepted camera DTO capture timestamp to the next completed renderer submission. M06 remains the sole trace authority: continuous START/UPDATE/END use its trace, and a RESET trigger gets its own trace. App observes scalar timestamps only; M10 never retains frames, landmarks, model objects or device IDs.

Stages: capture → result → intent → accepted matching GlobeCommand → renderer.render return. The result includes each interval and capture-to-render nearest-rank P95/median/mean in the same configured five-second/600-sample window as TASK-701. Empty or expired values are unknown. Only accepted ROTATE, ZOOM and RESET_VIEW commands complete samples. Cancellation, hidden pages, stopped inference and disposal discard pending correlation. Coalesced movement conservatively retains the earliest contributing input and first matching command before a render. Unmatched/denied inputs expire; all three pending maps have the configured capacity bound.

`NEXT_RENDER_SUBMISSION` is an explicit estimate, not GPU completion, compositor presentation or photons on the display. Reset measures the first response frame, not completion of its animation. SELECT/PAUSE, mouse and agent commands have no capture-to-globe-motion sample; their absence is not zero latency. Real device threshold acceptance remains NOT_RUN until the manual performance protocol. A synthetic browser test exercises actual WebGL submission but does not establish camera, recognition or user performance.

All timing uses the shared epoch-aligned monotonic clock; invalid/backwards render timestamps cannot create samples. The basic Date fallback remains lower precision. Diagnostics cannot change control decisions when an observer fails.
