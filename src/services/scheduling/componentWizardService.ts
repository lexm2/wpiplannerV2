import type { Course, ComponentKind, SectionsByKind } from '../../types/types';
import type { SelectedCourse } from '../../types/schedule';
import { wizardState } from '../../svelte/wizardState.svelte';
import { determineAvailableSteps } from '../../svelte/wizardLogic';
import { schedulePreviewState } from '../../svelte/schedule/schedulePreviewState.svelte';
import type { CourseSelectionService } from '../selection/CourseSelectionService';
import type { CourseDataService } from '../data/courseDataService';
import type { YearScheduleSwitcher } from '../selection/YearScheduleSwitcher';
import type { FilterService } from '../filtering/FilterService';
import { logger } from '../../utils/logger';
import { showAppError } from '../ui/uiState.svelte';

/**
 * Standalone component-selection wizard launcher for the schedule page.
 *
 * Drives the reactive `wizardState` store (WizardHost renders the
 * ComponentSelectionWizard panel) and pushes the calendar preview through the
 * `schedulePreviewState` rune. Persists committed selections via
 * CourseSelectionService - the schedule sidebar re-renders on its own.
 *
 * Needs the non-singleton services injected once via init() during bootstrap.
 */
class ComponentWizardService {
  private courseSelectionService: CourseSelectionService | null = null;
  private courseDataService: CourseDataService | null = null;
  private filterService: FilterService | null = null;
  private yearScheduleSwitcher: YearScheduleSwitcher | null = null;

  init(
    courseSelectionService: CourseSelectionService,
    courseDataService: CourseDataService,
    filterService: FilterService,
    yearScheduleSwitcher: YearScheduleSwitcher,
  ): void {
    this.yearScheduleSwitcher = yearScheduleSwitcher;
    this.courseSelectionService = courseSelectionService;
    this.courseDataService = courseDataService;
    this.filterService = filterService;
  }

  openComponentWizard(course: Course, initialStep?: ComponentKind): void {
    if (!this.courseDataService || !this.courseSelectionService) {
      logger.error('CourseDataService not available');
      return;
    }

    // Look up fresh course data from courseDataService to ensure we have the latest structure
    // (the passed course may be from cached localStorage with old structure)
    const freshCourse = this.courseDataService
      .getAllDepartments()
      .flatMap(d => d.courses)
      .find(c => c.id === course.id);

    if (!freshCourse) {
      logger.error('Could not find fresh course data for:', course.id);
      return;
    }

    // The wizard edits a course that is already on the schedule, and starts
    // from whatever it holds, whichever surface opened it.
    const existingSelections = this.courseSelectionService
      .getSelectedCourses()
      .find(sc => sc.course.id === freshCourse.id);
    if (!existingSelections) {
      logger.error('Course is not selected:', course.id);
      return;
    }

    // A wizard already open for another course leaves its previewed picks
    // drawn on the grid; they are abandoned, not committed.
    schedulePreviewState.clear();

    wizardState.open(
      {
        course: freshCourse,
        courseDataService: this.courseDataService,
        filterService: this.filterService,
        existingSelections,
        // onComplete returns void; onWizardComplete handles its own errors.
        onComplete: selections => {
          void this.onWizardComplete(freshCourse, selections);
        },
        onCancel: () => this.closeComponentWizard(),
        onSelectionChange: selections =>
          this.onWizardSelectionChange(freshCourse, selections),
        onHoverPreview: selections =>
          this.onWizardHoverPreview(freshCourse, selections),
      },
      initialStep,
    );
    // Seed the grid overlay with the wizard's own picks, so a hover preview
    // never swaps the course's real blocks for an empty selection.
    this.onWizardSelectionChange(freshCourse, wizardState.selections);
  }

  /**
   * The wizard was opened for a course of another academic year than the active
   * schedule. Offers the move; afterwards the wizard reopens on the new schedule.
   */
  offerYearSwitch(course: Course): void {
    this.yearScheduleSwitcher?.offerSwitch(course, () =>
      this.openComponentWizard(course),
    );
  }

  closeComponentWizard(): void {
    wizardState.close();

    // Clear the preview rune unconditionally - the grid drops preview blocks on its own.
    schedulePreviewState.clear();
  }

  private async onWizardComplete(
    course: Course,
    selections: SectionsByKind,
  ): Promise<void> {
    schedulePreviewState.clear();

    if (!this.courseSelectionService) return;

    try {
      const result = await this.courseSelectionService.setSelectedComponents(
        course,
        selections,
      );

      if (result.success) {
        // ScheduleSidebar is reactive on appState.selectedCourses, so the
        // updated selection re-renders on its own - nothing to do here.
      } else {
        logger.error('Failed to save component selections:', result.error);
        showAppError('Failed to save selections. Please try again.');
      }
    } catch (error) {
      logger.error('Error saving component selections:', error);
      showAppError('An error occurred while saving selections.');
    }

    this.closeComponentWizard();
  }

  private onWizardSelectionChange(
    course: Course,
    selections: SectionsByKind,
  ): void {
    // Committed wizard selection -> solid preview blocks (the grid reacts).
    schedulePreviewState.previewCourse = course;
    schedulePreviewState.selections = selections;
    schedulePreviewState.hover = null;
  }

  private onWizardHoverPreview(
    course: Course,
    selections: SectionsByKind,
  ): void {
    // Hovered (not-yet-committed) option -> dashed preview blocks.
    schedulePreviewState.previewCourse = course;
    schedulePreviewState.hover = selections;
  }

  /**
   * Check if a selected course has incomplete component selections.
   *
   * "Required components" is delegated to the wizard's own
   * {@link determineAvailableSteps} - the single source of truth for which steps
   * the wizard would present given the currently-selected lecture. Keeps the
   * schedule-sidebar warning in sync with the wizard, and narrows discussion/lab
   * to the SELECTED lecture rather than "any lecture".
   */
  getIncompleteSelectionInfo(selectedCourse: SelectedCourse): {
    isIncomplete: boolean;
    message: string;
  } {
    if (!this.courseDataService) return { isIncomplete: false, message: '' };

    const steps = determineAvailableSteps(
      selectedCourse.course,
      this.courseDataService,
      selectedCourse.selected.lecture ?? null,
    );

    const missing = steps.filter(step => !selectedCourse.selected[step]);
    if (missing.length === 0) return { isIncomplete: false, message: '' };

    return {
      isIncomplete: true,
      message: `Incomplete: Missing ${missing.join(', ')} selection`,
    };
  }
}

export const componentWizardService = new ComponentWizardService();
