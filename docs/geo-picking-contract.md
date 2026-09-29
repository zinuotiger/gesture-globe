# Geo picking boundary

TASK-601 exports mapScreenPoint/toNdc and EarthRaycaster from src/geo/index.ts. Screen input is client CSS pixels, canvas rect uses left/top/width/height in CSS pixels. It first subtracts the canvas offset, rejects outside/nonfinite/zero-size input, then maps to NDC. Pixel ratio affects only the optional buffer-pixel output; it cannot alter the ray direction. Camera CoordinateAdapter owns the sole mirror and preview/safe-rectangle mapping. Never flip the pointer again here.

EarthRaycaster takes the public Three camera and an explicit array of earth-pick meshes. It does not scan the scene, atmosphere, star field, markers or children. It updates camera/mesh world matrices, respects ancestor visibility, returns only the closest positive finite intersection and an immutable world point/normal/distance DTO. No-hit is undefined, not an error or geographic selection. It neither modifies the view nor creates a marker. App composition will connect this boundary to M06 selection requests; dwell and city selection are separate cards.

Tests use actual Three geometry/rays without a browser GPU. They demonstrate numeric picking, not human pointing accuracy or visual acceptance. UI target filtering must happen before a client pointer is sent here: a bare numeric point cannot determine which DOM element is in front of the canvas.

## Dwell selection

TASK604 DwellSelector consumes a normalized canvas pointer, valid earth hit and monotonic timestamp; never frames or gesture classifier objects. Uses point.dwellMs/radiusNorm/driftGraceMs/cooldownMs and vision.staleFrameMs from validated configuration. The spherical target drift guard derives an angle from radiusNorm as a fraction of a full revolution (2π×radiusNorm); this engineering convention is explicit, not human-calibrated. No additional hardcoded duration or classification threshold.

Only intervals between uninterrupted inside-radius valid hits accumulate. Short pointer drift pauses without counting the pause; prolonged drift or angular target change resets the candidate. Background, invalid timestamp/point, explicit cancellation and stale gaps reset progress. expire(now) permits the App render loop to clear silent stale input without an internal timer. Completion freezes the initial target point and emits one increasing selectionId. Holding it through cooldown stays latched; release or movement is required before another candidate. Cancellation cannot erase the prior selection cooldown or reuse an ID. The caller renders getState().progress; it must not run a separate UI dwell clock.
# Location coordination (TASK-606)

The application maps the public normalized pointer with Camera CoordinateAdapter (mirror/object-fit once), checks actual canvas/UI occlusion, then submits screen coordinates to Geo. Hidden preview retains plain numeric dimensions; camera close makes mapping unavailable. Only the named public earth mesh enters raycasting.

LocationSelection publishes frozen coordinates immediately and asynchronously enriches them from the verified local CityIndex. Both generation and selectionId must still match; abort is advisory, never the only stale-result defense. Failed city data keeps coordinates and offers an explicit retry. Marker and card consume the same selected ID. RESET preserves selection; clear/Escape invalidate requests and remove both. Focus passes through the UI input adapter and Interaction arbitration.

Browser fixtures generate synthetic pointer/camera input only. They exercise real raycasting, dwell, city integrity, card actions and WebGL; they are not human gesture/camera acceptance. Store-wide status and final responsive composition follow TASK-607/612.
