# Configuration baseline and validation

`src/config/defaults.ts` owns the single set of defaults; `numericRules.ts`
records units, bounds, integer constraints and runtime editability. Requirements
§7.7/§21 describe each setting's purpose. `parseConfig` merges partial plain
objects and rejects unknown fields, accessors, invalid types, nonfinite numbers,
out-of-range values and cross-field contradictions. `loadConfig` returns safe
frozen defaults plus exact issue paths for the error layer. App bootstrap calls
it before returning a runtime. No configuration is persisted here.

Boolean fields are switches: camera mirror changes display only; hiddenPause
must stay true; automatic rotation is a startup preference; inversion switches
belong to rotate/zoom. Quality accepts LOW/MEDIUM/HIGH/AUTO and pointer mode
accepts safeRect/fullViewport. configVersion and schemaVersion are fixed.

P0 fixes numHands=1, worldLandmarks=false and maxAutoRestarts≤1. Diagnostics UI
is capped at 4 Hz by OBS-006 even though the general tuning table lists 10 Hz.
Agent, voice and diagnostics export remain off; feature owners/phases are
listed beside defaults. Debug/mock flags are accepted only when the caller
explicitly selects development/test; production rejects them and arbitrary
asset URL injection. Earth radius is normalized to1. Longitude offset0 and the negative-Z east
convention are covered by Geo coordinate/seam tests; human geographic visual
approval is still a separate acceptance item. Current configVersion2026.09.3
adds bounded diagnostics and adaptive policy; gesture thresholds are not
represented as human calibrated.

No defaults constitute real-human tuning evidence. TASK-412 and release gates
must record configVersion and actual device results before asserting quality.
