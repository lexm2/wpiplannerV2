import { appState } from '../../core/state/appState.svelte';
import { modalState } from '../../svelte/modals/modalState.svelte';
import { openModal, showAppError } from '../ui/uiState.svelte';
import type { SelectedCourse } from '../../types/schedule';
import type { WeeklyTimeSlot } from '../../types/schedule';
import type { CourseSelectionService } from '../selection/CourseSelectionService';
import type { FilterService } from '../filtering/FilterService';
import type { CourseColorService } from './CourseColorService';
import type { AutoScheduleOrchestrator } from './AutoScheduleOrchestrator';
import { logger } from '../../utils/logger';

/**
 * Standalone auto-schedule modal orchestration for the schedule page.
 *
 * Drives the intro → filter modal sequence (modalState + continuation callbacks)
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

  async openAutoSchedule(): Promise<void> {
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

    // Intro modal → its onNext opens the filter modal with the term-filtered courses.
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
      onGenerate: () => this.doGenerateSchedules(coursesToSchedule),
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
    this.doGenerateSchedules(selectedCourses);
  }

  private async doGenerateSchedules(
    selectedCourses: SelectedCourse[],
    settings?: { blockedTimes: WeeklyTimeSlot[] },
  ): Promise<void> {
    if (!this.orchestrator) return;

    // Drive the grid's generating overlay via a rune.
    appState.scheduleGenerating = true;

    try {
      const success = await this.orchestrator.generateSchedules(
        selectedCourses,
        settings,
      );

      if (!success) {
        logger.warn('[Auto-Schedule] No valid schedules found');
        showAppError(
          'Could not generate a valid schedule.\n\nCommon causes:\n• Missing or invalid time/day data for course sections\n• Active schedule filters that exclude all sections\n• Course sections with conflicts',
        );
      }
      // On success the grid and footer re-render on their own: the orchestrator
      // applied the schedule via batchSetSelectedComponents, and AutoScheduleControls
      // reacts via appState.autoScheduleCount/Index.
    } catch (error) {
      logger.error('[Auto-Schedule] Error generating schedules:', error);
      showAppError(
        'An error occurred while generating the schedule. Please try again.',
      );
    } finally {
      appState.scheduleGenerating = false;
    }
  }
}

export const autoScheduleService = new AutoScheduleService();
