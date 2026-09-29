# Gesture intent boundary

`assertGestureIntent(unknown)` validates an exact plain, finite schemaVersion=1 wire DTO. Metadata requires nonblank id/sessionId/sourceHandId, source=gesture, nonnegative timestampMs and confidence in [0,1]. Optional traceId must be nonblank. Optional debug contains only candidate and nonnegative integer stableFrames. Extra fields, raw landmarks, accessors, cyclic objects, private objects and nonfinite numbers are rejected.

This strict assertion protects this version's producers. Consumers use `parseGestureIntent(unknown)`: per requirements 19.6, it discards unknown optional top-level fields, validates all known semantics and returns copied known payloads. Unknown raw fields are neither retained nor forwarded. Unsupported schema versions, invalid known data and non-plain inputs remain rejected; compatibility does not bypass those checks.

| Kind | Phases | Payload |
| --- | --- | --- |
| ROTATE, ZOOM | START, UPDATE, END, CANCEL | START zero delta; UPDATE finite delta; END/CANCEL none |
| SELECT | START, UPDATE, END, CANCEL | START/UPDATE normalized [0,1] pointer; END/CANCEL none |
| PAUSE | START, END, CANCEL | none; held pause produces no repeated UPDATE |
| RESET | TRIGGER | none |
| NONE | END, CANCEL | inert, no payload; engine does not emit it |

SELECT is a pointer stream, not a geographic selection trigger. Downstream Geo owns actual hit/dwell and selectionId. This schema validates individual values; order, source ownership, freshness and duplicate prevention remain stateful Interaction responsibilities. START zero delta anchors continuous motion. END/CANCEL never contain the previous movement payload.

`mapTransition(transition, context)` is pure and validates its result. Caller supplies identity, time, confidence, source hand and optional trace; payloads are copied. GestureEngine uses this function for every output and a monotonic per-engine sequence for IDs, including after session reset. No random source, DOM or global clock is involved. Manual source lock is an injected context input, not a dependency on Interaction internals.
