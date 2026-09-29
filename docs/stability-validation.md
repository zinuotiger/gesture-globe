# Stability and slow-inference validation (TASK-707)

## Automatic evidence and limits

The deterministic slow-inference test drives the actual FrameScheduler through 2,400 virtual500ms completions: at most one in-flight frame, busy drops instead of queues, the current timestamp on each new capture, all synthetic ownership objects closed. This is not20minutes of measured runtime or actual model performance.

The local fixture `/tests/fixtures/stability.html` mounts the real application and its real local model. It never starts camera permission automatically. Start20minute collection separately from enabling camera. Every1second it copies scalar observations only, with at most1,201 samples. The clock is performance.now; no invented timestamps. Hiding the page or a gap over2.5seconds marks the collection incomplete. Stop freezes the report. A complete duration is READY_FOR_REVIEW, never PASS. The browser smoke intentionally stops early and must stay INCOMPLETE.

Fields: elapsed time, visibility, main-thread JS heap if available, measured render FPS, inference P95, recent capture-to-render maximum, scheduler in-flight/busy count and currently active structured-error count. Latency uses the previous5second window of next render submission, not display photons. Absent measurements remain null. Active errors are not cumulative exception totals. Unsupported memory APIs leave memory unknown; main-thread heap excludes Worker/GPU/native allocations. Endpoint heap delta is not a leak conclusion. One-second observation cannot rule out every sub-second transient.

## Actual consolidated acceptance

For Chrome and Edge record exact browser version, OS, CPU/GPU/RAM, camera model/resolution, quality, configVersion, anonymous tester, timestamp and power/thermal conditions. Use local development with verified external-local model; public distribution is still blocked. Keep unrelated workload stable.

1. Open the fixture, enable the real camera explicitly and verify actual inference READY. Begin collection only after documenting startup/warmup. Keep it visible for20actualminutes.
2. Follow a documented repeatable cycle: five real gestures, mouse preemption, point/select/reset, preview/skeleton toggles, and camera close/reopen. Record phase times and ten close/reopen cycles. Do not fabricate valid recognition when no hand is detected.
3. Observe in-flight≤1, no control-latency backlog over1second, no continuously growing memory or latency. Record actual distributions and any deviations. Review raw scalar time series, multiple comparable time windows and GC sawtooth patterns, not just first/last heap samples.
4. Use browser task-manager/process memory observations at start and each minute to cover Worker/native/GPU memory missing from performance.memory. Save numeric observations only; no heap dumps, frames or complete landmarks. Missing memory coverage remains NOT_RUN/PARTIAL.
5. Repeat under explicitly recorded CPU throttling or a genuinely slow reference device. Do not change recognition thresholds to force success. Busy drops may increase; in-flight stays≤1, no linear latency growth, manual controls stay usable, adaptive quality/Hz is observable. Record throttle setting and reference machine.
6. Separately run2minute rendering distribution (median≥50FPS/P95frame≤33ms), target inference20–30Hz/no backlog, capture-to-renderP95≤150ms, and diagnostics closed/open A/B on the same scene (target<5%FPS loss). These targets are not satisfied by the fixture smoke or a single instantaneous FPS value.
7. Stop collection and export the scalar JSON; save it inside this repository with an explicit run identifier. Stop camera and verify physical indicator off. Attach redacted console codes, phase timestamps and memory/latency series on failure. Aborted/hidden/gapped runs retain their incomplete report and require a new run; never edit timestamps to bridge gaps.

Use TASK-707-manual-plan.json as a blank record, preserve it and write actual observations separately. Reviewers must identify hardware/browser/configuration and distinguish actual versus virtual time. No automatic acceptance-signing command is provided. Real20minute, slow-device and diagnostic A/B runs are currently NOT_RUN and deferred to the final consolidated boundary.
