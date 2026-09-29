# Error display and recovery

TASK-610 uses AppStore errors as the display source. Same code+session updates one card; within the validated3000ms window it increments occurrences, outside it starts a new count. Capacity20 is bounded and FATAL entries are retained. INFO does not occupy a persistent card. Unresolved errors cannot simply be dismissed. Details contain only code/count/time/configVersion, never exception stack, path, model internals or arbitrary messageKey.

Camera errors distinguish permission/device/busy/constraints/wait/ended/video readiness and provide concrete next steps. Explicit camera retry stops the old stream/request before activation. Model retry stops the previous Worker/pipeline and creates a new operation/session without a new camera permission request. Continue with mouse closes camera/vision and cancels gesture ownership while preserving view and selected coordinates. No automatic permission popup or fake browser-settings link.

Texture errors preserve usable geometry and have a true scoped HTTP retry. City errors preserve coordinates and allow city-only retry. Error removal follows actual recovery/irrelevance (ready state, camera deliberately closed, city cleared), not merely button completion. FATAL stops camera, inference, render/control activity and presents a static compatibility/reload view; the existing privacy node is moved into that view and restored on disposal. A late bootstrap cannot override FATAL.

The texture retry required separately audited REC-610-EARTH-TEXTURE-RETRY-001 because its owning module was outside the original UI card paths. No task graph/controller changes or App-owned Three mutations were used. Original failure, scope baseline, exact diff, hash guards and recovery gates are preserved in reports.

Automatic tests use explicitly synthetic media and actual local HTTP/WebGL fault injection. Actual devices, browser permission UI, resource indicators, real gesture usability/performance and visual acceptance remain deferred; no public model redistribution approval is implied. Layout consolidation is TASK-612.
