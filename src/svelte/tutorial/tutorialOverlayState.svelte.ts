import type { TutorialStep } from '../../types/tutorial';

/**
 * Reactive home for the tutorial overlay's current step - the runes-native
 * replacement for TutorialService's single-slot `onStepChange` callback.
 *
 * TutorialService (a plain service) writes these as it applies/advances/ends a
 * step, exactly as ProfileStateManager writes appState. FloatingTextBox reads
 * them to render the floating box. `step === null` means no tutorial is active.
 */
class TutorialOverlayState {
  step = $state.raw<TutorialStep | null>(null);
  index = $state(0);
  total = $state(0);

  set(step: TutorialStep | null, index: number, total: number): void {
    this.step = step;
    this.index = index;
    this.total = total;
  }
}

export const tutorialOverlayState = new TutorialOverlayState();
