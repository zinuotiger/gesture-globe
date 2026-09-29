import { defaults } from '../config/index.ts';
import type { AppConfig } from '../config/index.ts';
import { distance } from '../shared/index.ts';
import type {
  HandObservation,
  NormalizedPoint,
  VisionFrame,
} from '../shared/index.ts';
import { extractFeatures } from './features/extractFeatures.ts';
import type { HandFeatures } from './features/extractFeatures.ts';

interface Candidate {
  hand: HandObservation;
  features: HandFeatures;
  quality: number;
}
export interface SelectedHand extends Candidate {
  localId: string;
  changed: boolean;
}
interface Track {
  id: string;
  palm: NormalizedPoint;
  lastSeen: number;
  lockedUntil: number;
}
const score = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;
const rank = (a: Candidate, b: Candidate) =>
  b.quality - a.quality ||
  a.features.palm.x - b.features.palm.x ||
  a.features.palm.y - b.features.palm.y;

/** Session-local motion continuity, never handedness preference or biological identity. */
export class PrimaryHandSelector {
  private session: string | undefined;
  private track: Track | undefined;
  private sequence = 0;
  private lastFrame = -1;
  private lastTime = -Infinity;
  constructor(private readonly config: Readonly<AppConfig> = defaults) {}
  reset(): void {
    this.session = undefined;
    this.track = undefined;
    this.sequence = 0;
    this.lastFrame = -1;
    this.lastTime = -Infinity;
  }
  getState() {
    return Object.freeze({
      sessionId: this.session,
      localId: this.track?.id,
      lastSeenMs: this.track?.lastSeen,
      lockedUntilMs: this.track?.lockedUntil,
    });
  }
  private candidate(
    hand: HandObservation,
    atMs: number,
  ): Candidate | undefined {
    const features = extractFeatures(hand, atMs, undefined, this.config);
    if (
      !features?.controlEligible ||
      !score(hand.handednessScore) ||
      !Array.isArray(hand.gestures) ||
      hand.gestures.some((g) => !g || !score(g.score))
    )
      return undefined;
    const c = this.config.handTracking,
      area = this.config.handQuality;
    const top = Math.max(0, ...hand.gestures.map((g) => g.score));
    const size = Math.min(
      1,
      Math.max(
        0,
        (features.bboxArea - area.minBboxArea) /
          (area.maxBboxArea - area.minBboxArea),
      ),
    );
    const quality =
      c.handednessWeight * hand.handednessScore +
      c.gestureWeight * top +
      c.completenessWeight * features.completeness +
      c.sizeWeight * size;
    return quality >= c.minQuality ? { hand, features, quality } : undefined;
  }
  select(frame: VisionFrame): SelectedHand | undefined {
    if (
      !frame ||
      frame.schemaVersion !== 1 ||
      typeof frame.sessionId !== 'string' ||
      !frame.sessionId ||
      !Number.isSafeInteger(frame.frameId) ||
      frame.frameId < 0 ||
      !Number.isFinite(frame.captureTimeMs) ||
      frame.captureTimeMs < 0 ||
      !Number.isFinite(frame.resultTimeMs) ||
      frame.resultTimeMs < frame.captureTimeMs ||
      frame.resultTimeMs - frame.captureTimeMs >
        this.config.vision.staleFrameMs ||
      !Array.isArray(frame.hands) ||
      frame.hands.length > 2
    )
      return undefined;
    if (frame.sessionId !== this.session) {
      this.reset();
      this.session = frame.sessionId;
    }
    if (frame.frameId <= this.lastFrame || frame.captureTimeMs <= this.lastTime)
      return undefined;
    this.lastFrame = frame.frameId;
    this.lastTime = frame.captureTimeMs;
    const now = frame.captureTimeMs;
    if (
      this.track &&
      now - this.track.lastSeen >= this.config.gesture.lostHandMs
    )
      this.track = undefined;
    const candidates = frame.hands
      .map((h) => this.candidate(h, now))
      .filter((c): c is Candidate => !!c)
      .sort(rank);
    let chosen = candidates[0];
    let retained = false;
    if (this.track) {
      const track = this.track,
        c = this.config.handTracking;
      const nearest = candidates
        .map((candidate) => ({
          candidate,
          distance: distance(candidate.features.palm, track.palm)!,
        }))
        .filter((item) => item.distance <= c.maxTrackDistance)
        .sort(
          (a, b) => a.distance - b.distance || rank(a.candidate, b.candidate),
        )[0];
      if (!nearest) return undefined; // brief loss never hands control to another person
      const continuity = Math.max(0, 1 - nearest.distance / c.maxTrackDistance);
      const retainedScore =
        c.continuityWeight * continuity +
        (1 - c.continuityWeight) * nearest.candidate.quality;
      if (
        now < track.lockedUntil ||
        chosen === nearest.candidate ||
        !chosen ||
        chosen.quality <= retainedScore + c.switchMargin
      ) {
        chosen = nearest.candidate;
        retained = true;
      }
    }
    if (!chosen) return undefined;
    const id = retained
      ? this.track!.id
      : `${this.session}:hand-${++this.sequence}`;
    this.track = {
      id,
      palm: { ...chosen.features.palm },
      lastSeen: now,
      lockedUntil: retained
        ? this.track!.lockedUntil
        : now + this.config.gesture.primaryHandLockMs,
    };
    return { ...chosen, localId: id, changed: !retained };
  }
}
