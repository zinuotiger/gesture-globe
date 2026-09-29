export const onboardingKey = 'gesture-globe.onboarding.v1';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
/** Only tutorial completion is persisted; storage failure never blocks local use. */
export class OnboardingPreference {
  private completed = false;
  constructor(private readonly storage: PreferenceStorage | undefined) {
    try {
      const raw: unknown = JSON.parse(
        storage?.getItem(onboardingKey) ?? 'null',
      );
      this.completed =
        !!raw &&
        typeof raw === 'object' &&
        'schemaVersion' in raw &&
        raw.schemaVersion === 1 &&
        'completed' in raw &&
        raw.completed === true;
    } catch {
      /* Corrupt/unavailable preferences fall back to the first-use guide. */
    }
  }
  isComplete() {
    return this.completed;
  }
  complete() {
    this.completed = true;
    try {
      this.storage?.setItem(
        onboardingKey,
        JSON.stringify({ schemaVersion: 1, completed: true }),
      );
    } catch {
      /* Session remains usable. */
    }
  }
  reset() {
    this.completed = false;
    try {
      this.storage?.removeItem(onboardingKey);
    } catch {
      /* Current session is reset. */
    }
  }
}
