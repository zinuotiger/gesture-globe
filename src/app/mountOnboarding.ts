import type { AppStore } from './AppStore.ts';
import type { AppConfig } from '../config/index.ts';
import { OnboardingPreference } from './OnboardingPreference.ts';
import {
  createOnboardingDialog,
  createGestureGuide,
  preparationText,
} from '../ui/index.ts';

export function mountOnboarding(
  root: HTMLElement,
  store: AppStore,
  config: Readonly<AppConfig>,
) {
  const document = root.ownerDocument;
  let storage: Storage | undefined;
  try {
    storage = document.defaultView?.localStorage;
  } catch {
    /* Restricted storage: session-only tutorial. */
  }
  const preference = new OnboardingPreference(storage);
  const guide = createOnboardingDialog(document);
  const pictures = createGestureGuide(document, {
    dwellMs: config.point.dwellMs,
    victoryCooldownMs: config.victory.cooldownMs,
  });
  const pictureButton = document.createElement('button');
  pictureButton.type = 'button';
  pictureButton.textContent = '手势图解';
  pictureButton.setAttribute('aria-expanded', 'false');
  pictureButton.setAttribute('aria-controls', 'gesture-guide');
  const showPictures = () => pictures.open(pictureButton);
  pictureButton.addEventListener('click', showPictures);
  const help = document.createElement('button');
  help.type = 'button';
  help.textContent = '手势帮助';
  const preparation = document.createElement('p');
  preparation.className = 'preparation-check';
  preparation.setAttribute('aria-live', 'polite');
  const openHelp = () => guide.open(help, () => preference.complete());
  help.addEventListener('click', openHelp);
  root.append(guide.element, pictures.element);
  const unsubscribe = store.subscribe(
    (state) =>
      `${state.cameraStatus}|${state.visionStatus}|${state.handStatus}`,
    () => {
      const state = store.getState();
      guide.update(state);
      preparation.hidden = state.cameraStatus === 'OFF';
      preparation.textContent = preparationText(state);
    },
  );
  return {
    requestActivation(start: () => void, trigger: HTMLElement) {
      if (preference.isComplete()) start();
      else guide.open(trigger, () => preference.complete(), start);
    },
    attach() {
      root.querySelector('.camera-actions')?.append(pictureButton, help);
      root.querySelector('.camera-secondary')?.append(preparation);
    },
    reset: () => preference.reset(),
    dispose() {
      unsubscribe();
      help.removeEventListener('click', openHelp);
      help.remove();
      preparation.remove();
      guide.dispose();
      pictureButton.removeEventListener('click', showPictures);
      pictureButton.remove();
      pictures.dispose();
    },
  };
}
