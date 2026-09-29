# Diagnostics and health

Open Settings → 打开诊断 to view this session. Production starts with the dialog closed. Updates and health evaluation run at the validated diagnostics.uiHz (default/max4Hz), driven by the application frame loop; hidden documents do not evaluate health. Numeric metrics are not in an aria-live region. Escape returns focus; the dialog offers camera shutdown and session-event clearing. No export, network logging or persistent event storage is enabled.

The 200-entry ring overwrites oldest entries. It accepts only fixed event categories, modules, source/command/gesture/state vocabulary, structured error codes, numeric timestamps and anonymous `session-N` ordinals. Unknown fields, free-form errors, device IDs, paths, landmarks and frame payloads are rejected. Error records retain module/code/recoverable/time/session but no stack/detail. Closing the app clears the ring; later disposal events cannot repopulate it.

Health defaults (config2026.09.2) are engineering policy, not measured device certification:

| Signal                         | Trigger                    | Recovery                                          |
| ------------------------------ | -------------------------- | ------------------------------------------------- |
| Render FPS                     | below30 for3s              | at least45 for10s                                 |
| Inference P95                  | above100ms for3s           | at most60ms for10s                                |
| Capture-to-render estimate P95 | above150ms for3s           | at most100ms for10s                               |
| busy/stale drop ratio          | above0.35 for3s            | at most0.15 for10s                                |
| Worker restart                 | observed counter increment | no further restart for10s of observed evaluations |

Drop ratio uses deltas `(busy + stale)/(submitted + busy)`, capped at1; rate-limited/unavailable samples remain separate counters. Reset counters establish a new baseline. Hysteresis-band or unavailable values reset dwell clocks; they never fabricate healthy recovery. Evaluation gaps over1500ms reset dwell clocks. Metrics retain the documented five-second window. No-data states display unknown and no active alert is not an acceptance PASS.

TASK-703 only reports health; automatic quality changes belong to TASK-704. The default recognition thresholds remain uncalibrated. Version increment records the new health configuration only. Real diagnostic overhead and device FPS/latency remain manual acceptance work.
