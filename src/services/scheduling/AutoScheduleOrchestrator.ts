import { SelectedCourse } from '../../types/schedule';
import type { WeeklyTimeSlot } from '../../types/schedule';
import type { CourseComponentSelections } from '../../types/scheduling';
import type { Course } from '../../types/types';
import { CourseSelectionService } from '../selection/CourseSelectionService';
import { FilterService } from '../filtering/FilterService';
import { appState } from '../../core/state/appState.svelte';
import type { ScheduleResult } from './AutoScheduler';
import { SmartScheduler } from './SmartScheduler';
import { ScheduleWorkerManager } from '../../workers/ScheduleWorkerManager';
import { logger } from '../../utils/logger';
import { sectionsOf } from '../../utils/courseUtils';

export interface CalendarEventProvider {
  getAllLocalEventBlockedTimes(): WeeklyTimeSlot[];
  getLocalEventCount(): number;
}

/** Why generateSchedules did or didn't produce a schedule. */
export type GenerateOutcome =
  | { status: 'generated' }
  | { status: 'nothing-to-schedule' }
  | { status: 'no-candidates'; courses: Course[] }
  | { status: 'no-schedules' };

export class AutoScheduleOrchestrator {
  private generatedSchedules: ScheduleResult[][] = [];
  private currentScheduleIndex: number = 0;
  private isApplyingAutoSchedule: boolean = false;
  private autoAppliedCRNs: Set<string> = new Set();
  private courseSelectionService: CourseSelectionService;
  private filterService: FilterService;
  private calendarEventProvider: CalendarEventProvider | null = null;

  constructor(
    courseSelectionService: CourseSelectionService,
    filterService: FilterService,
  ) {
    this.courseSelectionService = courseSelectionService;
    this.filterService = filterService;
  }

  setCalendarEventProvider(provider: CalendarEventProvider): void {
    this.calendarEventProvider = provider;
  }

  // Publish the result count + applied index the AutoScheduleControls footer reads.
  private notifyStateChange(): void {
    appState.autoScheduleCount = this.generatedSchedules.length;
    appState.autoScheduleIndex = this.currentScheduleIndex;
  }

  // Invalidate generated schedules whenever the selection changes (driven by an
  // App.svelte $effect keyed on appState.selectedById). The isApplyingAutoSchedule
  // guard suppresses the self-trigger while a generated schedule is being applied.
  invalidateOnSelectionChange(): void {
    if (this.isApplyingAutoSchedule) return;
    this.generatedSchedules = [];
    this.currentScheduleIndex = 0;
    this.notifyStateChange();
  }

  getGeneratedSchedules(): ScheduleResult[][] {
    return this.generatedSchedules;
  }

  getCurrentScheduleIndex(): number {
    return this.currentScheduleIndex;
  }

  getIsApplyingAutoSchedule(): boolean {
    return this.isApplyingAutoSchedule;
  }

  getAllCalendarBlockedTimes(): WeeklyTimeSlot[] {
    return this.calendarEventProvider?.getAllLocalEventBlockedTimes() ?? [];
  }

  getLocalEventCount(): number {
    return this.calendarEventProvider?.getLocalEventCount() ?? 0;
  }

  async navigateSchedule(direction: 1 | -1): Promise<void> {
    if (this.generatedSchedules.length === 0) return;

    this.currentScheduleIndex =
      (this.currentScheduleIndex + direction + this.generatedSchedules.length) %
      this.generatedSchedules.length;

    await this.applyScheduleAtIndex(this.currentScheduleIndex);
    this.notifyStateChange();
  }

  async generateSchedules(
    selectedCourses: SelectedCourse[],
  ): Promise<GenerateOutcome> {
    try {
      const scheduler = new SmartScheduler(this.filterService);
      const built = scheduler.buildCandidateData(selectedCourses);

      if (!built.ok) {
        this.resetSchedules();
        return { status: 'no-candidates', courses: built.unschedulable };
      }
      // Every course was left locked in the intro.
      if (built.input.courses.length === 0) {
        this.resetSchedules();
        return { status: 'nothing-to-schedule' };
      }

      const allSchedules = await ScheduleWorkerManager.getInstance().generate(
        built.input,
        500,
      );

      if (allSchedules.length === 0) {
        this.resetSchedules();
        return { status: 'no-schedules' };
      }

      this.generatedSchedules = allSchedules;
      this.currentScheduleIndex = 0;

      await this.applyScheduleAtIndex(0);
      this.notifyStateChange();
      return { status: 'generated' };
    } catch (error) {
      // Reset and rethrow; the caller logs and reports it.
      this.resetSchedules();
      throw error;
    }
  }

  private async applyScheduleAtIndex(index: number): Promise<void> {
    const schedule = this.generatedSchedules[index];
    if (!schedule) {
      logger.warn(`[Auto-Schedule] No schedule found at index ${index}`);
      return;
    }

    this.isApplyingAutoSchedule = true;
    this.autoAppliedCRNs = new Set();
    try {
      const selections: CourseComponentSelections[] = [];

      for (const result of schedule) {
        for (const section of sectionsOf(result.combination)) {
          this.autoAppliedCRNs.add(String(section.crn));
        }
        selections.push({
          course: result.course,
          selected: result.combination,
        });
      }

      if (selections.length > 0) {
        await this.courseSelectionService.batchSetSelectedComponents(
          selections,
          true,
        );
      }
    } finally {
      this.isApplyingAutoSchedule = false;
    }
  }

  resetSchedules(): void {
    this.generatedSchedules = [];
    this.currentScheduleIndex = 0;
    this.notifyStateChange();
  }
}
