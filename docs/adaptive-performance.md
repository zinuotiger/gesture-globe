# Adaptive performance

TASK-704 uses observed, sustained LOW_RENDER/HIGH_INFERENCE/HIGH_LATENCY health alerts from TASK-703. Current bad scalar data must still support the alert. A worker restart or busy-drop warning alone never changes quality. No synthetic measurements enter production decisions.

With config2026.09.3, pressure moves0→1→2 with at least5000ms between changes. AUTO quality steps from its configured initial tier down toward LOW; HIGH/MEDIUM/LOW explicitly selected by the user remain pinned. Inference targets24→20→15Hz under defaults, clamped to configured min/target bounds. Only runtime scheduler cadence changes: no stream/worker restart, recognition threshold change, permission request or queue growth. LOW disables atmosphere and caps DPR to1; clouds/postprocessing were already absent. Existing single-in-flight behavior remains.

Recovery requires the health alert to recover plus15000ms of continuous observed healthy render/inference data per upward step. Missing, invalid, hysteresis-band, hidden-page or gap data break the recovery dwell. No available gesture latency is not interpreted as zero. Inference recovery checks are required only while inference is active. Evaluation uses the same≤4Hz app cadence; window sorting is not performed for adaptation on every rendered frame.

The globe quality selector shows AUTO's actual tier. Diagnostics display actual target inference Hz. User preferences remain unchanged; adaptive pressure is ephemeral. Fractional schema-valid startup inference rates can be restored exactly; arbitrary fractional runtime overrides remain rejected by the scheduler. An empty integer adaptive interval retains the configured startup rate rather than crossing a configured bound.

Tests cover sustained signals, cooldown, bounded steps, recovery/hidden gaps, manual pinning, real scheduler20/15Hz behavior without queue growth, and actual WebGL tier changes under explicitly synthetic metric pressure. These prove policy and wiring, not reference-device FPS/latency or human performance acceptance, which remain NOT_RUN.
