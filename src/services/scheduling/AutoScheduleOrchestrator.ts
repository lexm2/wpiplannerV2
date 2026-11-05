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
import { rateMyProfessorService } from '../external/RateMyProfessorService';
import { logger } from '../../utils/logger';

export interface CalendarEventProvider {
  getAllLocalEventBlockedTimes(): WeeklyTimeSlot[];
  getLocalEventCount(): number;
}

/** Why generateSchedules did or didn't produce a schedule. */
export type GenerateOutcome =
  | { status: 'generated' }
  | { status: 'nothing-to-schedule' }
  | {
      status: 'no-candidates';
      courses: Course[];
      /** The ones that would have a usable section without the calendar events. */
      blockedByEvents?: Course[];
    }
  | { status: 'no-schedules' }
  /** The student switched schedules or changed courses while it ran. */
  | { status: 'stale' };

export class AutoScheduleOrchestrator {
  private generatedSchedules: ScheduleResult[][] = [];
  private currentScheduleIndex: number = 0;
  private isApplyingAutoSchedule: boolean = false;
  // Bumped whenever the selection changes. A run compares it after the worker
  // returns: results computed for another schedule or course set must not be
  // written into whatever is on screen now.
  private selectionEpoch = 0;
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
    this.selectionEpoch++;
    this.generatedSchedules = [];
    this.currentScheduleIndex = 0;
    this.notifyStateChange();
  }

  getGeneratedSchedules(): ScheduleResult[][] {
    return this.generatedSchedules;
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
    const originScheduleId = appState.activeScheduleId;
    const originEpoch = this.selectionEpoch;
    try {
      // Events are read now, not when a filter was set: unless the user
      // opted out, classes stay clear of whatever is on the calendar today.
      const calendarSlots =
        appState.preferences.avoidCalendarEvents === false
          ? []
          : this.getAllCalendarBlockedTimes();
      const preferences = appState.rankingPreferences;
      const build = (slots: typeof calendarSlots) =>
        new SmartScheduler(this.filterService, slots).buildCandidateData(
          selectedCourses,
          preferences,
          rateMyProfessorService,
        );
      const built = build(calendarSlots);

      if (!built.ok) {
        this.resetSchedules();
        // Say so when it's the calendar events that leave a course nothing.
        let blockedByEvents: Course[] = [];
        if (calendarSlots.length > 0) {
          const without = build([]);
          blockedByEvents = built.unschedulable.filter(
            c => without.ok || !without.unschedulable.includes(c),
          );
        }
        return {
          status: 'no-candidates',
          courses: built.unschedulable,
          blockedByEvents,
        };
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

      if (
        appState.activeScheduleId !== originScheduleId ||
        this.selectionEpoch !== originEpoch
      ) {
        this.resetSchedules();
        return { status: 'stale' };
      }

      if (allSchedules.length === 0) {
        this.resetSchedules();
        return { status: 'no-schedules' };
      }

      this.generatedSchedules = allSchedules;
      this.currentScheduleIndex = 0;

      // The first apply is the one that must be undoable: Undo then returns to
      // exactly what the student had before pressing Generate.
      if (!(await this.applyScheduleAtIndex(0, false))) {
        this.resetSchedules();
        return { status: 'stale' };
      }
      this.notifyStateChange();
      return { status: 'generated' };
    } catch (error) {
      // Reset and rethrow; the caller logs and reports it.
      this.resetSchedules();
      throw error;
    }
  }

  private async applyScheduleAtIndex(
    index: number,
    skipSnapshot = true,
  ): Promise<boolean> {
    const schedule = this.generatedSchedules[index];
    if (!schedule) {
      logger.warn(`[Auto-Schedule] No schedule found at index ${index}`);
      return false;
    }

    this.isApplyingAutoSchedule = true;
    try {
      const selections: CourseComponentSelections[] = schedule.map(result => ({
        course: result.course,
        selected: result.combination,
      }));

      if (selections.length === 0) return true;
      const result =
        await this.courseSelectionService.batchSetSelectedComponents(
          selections,
          skipSnapshot,
        );
      if (!result.success) logger.warn(`[Auto-Schedule] ${result.error}`);
      return result.success;
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
