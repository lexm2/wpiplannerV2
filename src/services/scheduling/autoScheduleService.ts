import { appState } from '../../core/state/appState.svelte';
import { modalState } from '../../svelte/modals/modalState.svelte';
import { openModal, showAppError } from '../ui/uiState.svelte';
import type { SelectedCourse } from '../../types/schedule';
import type { CourseSelectionService } from '../selection/CourseSelectionService';
import type { FilterService } from '../filtering/FilterService';
import type { CourseColorService } from './CourseColorService';
import type {
  AutoScheduleOrchestrator,
  GenerateOutcome,
} from './AutoScheduleOrchestrator';
import type { Course } from '../../types/types';
import { logger } from '../../utils/logger';
import { errorMessage } from '../../utils/errorMessage';

/**
 * Standalone auto-schedule modal orchestration for the schedule page.
 *
 * Drives the intro -> filter modal sequence (modalState + continuation callbacks)
 * and generation via AutoScheduleOrchestrator. Reads the selection through
 * CourseSelectionService and surfaces the generating overlay through the
 * `appState.scheduleGenerating` rune.
 *
 * Needs the non-singleton services injected once via init() from AppBootstrap.
 */
class AutoScheduleService {
  private courseSelectionService: CourseSelectionService | null = null;
  private filterService: FilterService | null = null;
  private colorService: CourseColorService | null = null;
  private orchestrator: AutoScheduleOrchestrator | null = null;

  init(
    courseSelectionService: CourseSelectionService,
    filterService: FilterService,
    colorService: CourseColorService,
    orchestrator: AutoScheduleOrchestrator,
  ): void {
    this.courseSelectionService = courseSelectionService;
    this.filterService = filterService;
    this.colorService = colorService;
    this.orchestrator = orchestrator;
  }

  openAutoSchedule(): void {
    if (!this.filterService || !this.courseSelectionService) {
      logger.error('[Auto-Schedule] Filter service not available');
      showAppError('Filter service not available. Please try again.');
      return;
    }

    const selectedCourses = this.courseSelectionService.getSelectedCourses();

    if (selectedCourses.length === 0) {
      logger.warn('[Auto-Schedule] No courses selected');
      showAppError('No courses selected. Please select courses first.');
      return;
    }

    // Intro modal -> its onNext opens the filter modal with the term-filtered courses.
    modalState.autoScheduleIntro = {
      selectedCourses,
      getColor: id => this.colorService?.getCourseColor(id) ?? '',
      onNext: filtered => this.openScheduleFilterModal(filtered),
    };
    openModal('auto-schedule-intro');
  }

  /** Open the declarative FilterModal (auto-schedule mode) for the given courses. */
  private openScheduleFilterModal(coursesToSchedule: SelectedCourse[]): void {
    if (!this.filterService) return;
    modalState.filter = {
      mode: 'auto-schedule',
      coursesToSchedule,
      // onGenerate returns void; doGenerateSchedules handles its own errors.
      onGenerate: () => {
        void this.doGenerateSchedules(coursesToSchedule);
      },
    };
    openModal('auto-schedule-filter');
  }

  openAutoScheduleIntro(): void {
    if (!this.courseSelectionService) return;
    const selectedCourses = this.courseSelectionService.getSelectedCourses();
    modalState.autoScheduleIntro = {
      selectedCourses,
      getColor: id => this.colorService?.getCourseColor(id) ?? '',
      onNext: filtered => this.openScheduleFilterModal(filtered),
    };
    openModal('auto-schedule-intro');
  }

  updateAutoScheduleIntroTerms(preferences: Record<string, string[]>): void {
    // Override channel the intro modal merges into its per-course term selection.
    modalState.autoScheduleIntroTermPrefs = preferences;
  }

  openAutoScheduleFilter(): void {
    if (!this.filterService || !this.courseSelectionService) return;
    const selectedCourses = this.courseSelectionService.getSelectedCourses();
    // Same FilterModal as openScheduleFilterModal, but for the current selection
    // (direct button / tutorial reopen path).
    this.openScheduleFilterModal(selectedCourses);
  }

  runAutoSchedule(): void {
    if (!this.courseSelectionService) return;
    const selectedCourses = this.courseSelectionService.getSelectedCourses();
    void this.doGenerateSchedules(selectedCourses);
  }

  private async doGenerateSchedules(
    selectedCourses: SelectedCourse[],
  ): Promise<void> {
    if (!this.orchestrator) return;

    // Drive the grid's generating overlay via a rune.
    appState.scheduleGenerating = true;

    try {
      const outcome =
        await this.orchestrator.generateSchedules(selectedCourses);

      if (outcome.status !== 'generated') {
        logger.warn(`[Auto-Schedule] No schedule generated: ${outcome.status}`);
        showAppError(failureMessage(outcome));
      }
      // On success the grid and footer re-render on their own: the orchestrator
      // applied the schedule via batchSetSelectedComponents, and AutoScheduleControls
      // reacts via appState.autoScheduleCount/Index.
    } catch (error) {
      // The message as a string: some consoles render a bare Error as "Error".
      logger.error(
        `[Auto-Schedule] Error generating schedules: ${errorMessage(error)}`,
        error,
      );
      showAppError(
        `An error occurred while generating the schedule: ${errorMessage(error)}.\n\nTry including fewer courses or narrowing their terms.`,
      );
    } finally {
      appState.scheduleGenerating = false;
    }
  }
}

/** "A", "A and B", "A, B and C". */
function listCourses(courses: Course[]): string {
  const codes = courses.map(c => `${c.departmentAbbr}${c.number}`);
  if (codes.length <= 1) return codes.join('');
  return `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`;
}

/** Banner text for a generation that produced no schedule. */
function failureMessage(
  outcome: Exclude<GenerateOutcome, { status: 'generated' }>,
): string {
  switch (outcome.status) {
    case 'nothing-to-schedule':
      return 'No courses are included in auto-scheduling: every course is locked to its current sections.\n\nRestart and click the courses you want rescheduled.';
    case 'no-candidates': {
      const one = outcome.courses.length === 1;
      return `Could not generate a schedule: no section of ${listCourses(outcome.courses)} can be used.\n\nCommon causes:\n• Active schedule filters exclude all of ${one ? 'its' : 'their'} sections\n• ${one ? 'Its' : 'Their'} sections clash with locked courses or calendar events\n• ${one ? 'Its' : 'Their'} sections are missing time/day data`;
    }
    case 'no-schedules':
      return 'Could not generate a schedule: every combination of the included courses has a time conflict.\n\nTry locking fewer courses, allowing more terms, or removing a course.';
  }
}

export const autoScheduleService = new AutoScheduleService();
