# Application state and status

AppStore owns finite immutable camera, vision, hand, gesture, control, selection, view, quality, errors and diagnostics slices. Public selectors subscribe independently; unchanged slices retain identity. Each action carries a monotonic timestamp. Vision events carry sessionId plus operationId; stale or illegal updates are rejected with deduplicated E-APP-STATE-001. Subscriber faults are isolated.

Camera OFF clears vision/session/hand/active gesture. Non-ready vision cannot retain active/paused/cooldown gesture. Manual source leases suppress gesture presentation; FATAL cannot retain a control source. Dwell requires active SELECT. Changing session invalidates prior control/progress; actual frame, engine, lock and transition cancellation remains owned by the existing lifecycle and M06. Geo asynchronous matching independently guards its selectionId and generation.

Runtime state includes only scalar hand counts/readiness and semantic gesture data. Observed but ineligible hands are UNREADY; an actual empty detection is NO_HAND, and no current accepted observation is UNKNOWN. No video or landmark stream enters this Store or storage.

TopStatusBar consumes AppState and uses the configured diagnostics.uiHz (maximum4) through a coalescing StatusPresenter. Render-loop time drives delivery, never recognition. Camera authorization waiting and denial remain distinct from OFF; stopping inference does not overwrite camera permission state. LocationCard now reads the selection slice and continues emitting only public actions.

Automatic tests cover invariants/session rejection, source priority, dwell guards, frozen slices, observer failure and4Hz delivery, plus real local-model blank-input status and synthetic permission denial in Chromium. This is not human recognition, Chrome/Edge device or real performance acceptance.
