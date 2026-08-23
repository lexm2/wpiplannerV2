/**
 * Reactive home of the component-selection wizard - the single source of truth
 * for the wizard's open/step/selection state.
 *
 * `componentWizardService` owns the services and opens the wizard by calling
 * `open()` with a per-launch config (course, services, callbacks). The config
 * carries the services so the app's "services are injected, never imported" rule
 * still holds - this store just holds whatever the service hands it.
 *
 * `ComponentSelectionWizard.svelte` reads this store and derives everything else;
 * `currentStep`/`selections` live here (not in the component) so external callers
 * (e.g. via `wizardState.jumpToStep`) can drive navigation without a component
 * ref.
 */
import {
  COMPONENT_KINDS,
  type ComponentKind,
  type Course,
  type SectionsByKind,
} from '../types/types';
import type { SelectedCourse } from '../types/schedule';

import type { CourseDataService } from '../services/data/courseDataService';
import type { FilterService } from '../services/filtering/FilterService';
import { determineAvailableSteps } from './wizardLogic';

export interface WizardConfig {
  course: Course;
  courseDataService: CourseDataService;
  filterService: FilterService | null;
  existingSelections?: SelectedCourse;
  onComplete: (selections: SectionsByKind) => void;
  onCancel: () => void;
  onSelectionChange?: (selections: SectionsByKind) => void;
  onHoverPreview?: (selections: SectionsByKind) => void;
}

class WizardState {
  config = $state.raw<WizardConfig | null>(null);
  currentStep = $state.raw<ComponentKind>('lecture');
  /**
   * `.raw`, not deep `$state`: on complete this object is handed to the state
   * layer as-is and ends up inside a persisted Schedule, which crosses
   * `postMessage` to the storage worker. A deep-state Proxy is not
   * structured-cloneable, so every save of that schedule would throw
   * DataCloneError. `.raw` is also all this needs - every write reassigns the
   * whole object - and it keeps the sections `===` the catalog's.
   */
  selections = $state.raw<SectionsByKind>({});
  /** Last navigation direction, drives the step slide-in animation. */
  direction = $state.raw<'forward' | 'backward'>('forward');

  get isOpen(): boolean {
    return this.config !== null;
  }

  open(config: WizardConfig, initialStep?: ComponentKind): void {
    this.config = config;
    // Copied, not aliased: this object is edited as the user navigates, and
    // it must not be the one living in appState.selectedCourses.
    this.selections = { ...config.existingSelections?.selected };

    const steps = determineAvailableSteps(
      config.course,
      config.courseDataService,
      this.selections.lecture ?? null,
    );
    const start =
      initialStep && steps.includes(initialStep)
        ? initialStep
        : (steps[0] ?? 'lecture');
    this.currentStep = start;
    this.direction = 'forward';
  }

  /**
   * Only clears `config` (which drives `isOpen`). `selections` is deliberately
   * NOT reset here: the wizard plays a 250ms fade-out, during which the
   * component is still mounted and still reading these values - resetting now
   * would visibly blank the selected badges and flip the footer button
   * mid-outro. `open()` re-seeds selections on every launch anyway, so the
   * reset was always redundant.
   */
  close(): void {
    this.config = null;
  }

  /**
   * Navigate to a step, computing direction from the canonical kind order -
   * which covers external jumps that don't know the course's available steps.
   */
  jumpToStep(step: ComponentKind): void {
    if (step === this.currentStep) return;
    this.direction =
      COMPONENT_KINDS.indexOf(step) > COMPONENT_KINDS.indexOf(this.currentStep)
        ? 'forward'
        : 'backward';
    this.currentStep = step;
  }
}

export const wizardState = new WizardState();
