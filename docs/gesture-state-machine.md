# Gesture temporal state framework

GestureStateMachine is a pure per-candidate temporal rule. It receives explicit monotonic sample time, valid-hand presence, an entry predicate and a separate hold predicate. Numeric stability/release/cooldown parameters are injected from validated M09 config by the gesture modes; no timer, DOM, model object or camera is accessed.

NO_HAND/IDLE/CANDIDATE do not execute movement. A continuous candidate emits START only after consecutive stability, then UPDATE while its hold condition remains valid. Loss of hold enters RELEASING without a tail UPDATE; recovery returns ACTIVE, or the configured release count emits END. Hand loss emits END immediately and once. pause returns any active CANCEL before exposing PAUSED; resume clears counts and requires a new candidate sequence. Invalid or duplicate time cancels active work rather than reusing motion.

Discrete rules emit TRIGGER once and retain armed=false until departure has been observed and cooldown has elapsed. Hand loss can establish departure but cannot bypass cooldown. Rules have independent cooldown state so a reset cooldown does not disable other gestures. reset explicitly begins a new session; cancel/pause preserve the discrete rearm budget. Outputs are semantic transitions only. Gesture fusion/priority, actual movement payloads and final GestureIntent mapping belong to TASK-405 through TASK-410.

Tests use config-derived Open Palm/Victory timings as deterministic examples. They are not actual classifier or human-recognition evidence. Real tuning remains consolidated acceptance work.
