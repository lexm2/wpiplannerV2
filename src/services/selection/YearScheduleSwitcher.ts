import type { Course } from '../../types/types';
import type { ProfileStateManager } from '../../core/state/ProfileStateManager';
import type { ScheduleManagementService } from './ScheduleManagementService';
import type { CourseSelectionService } from './CourseSelectionService';
import { showConfirm } from '../../svelte/modals/modalState.svelte';
import { showAppError } from '../ui/uiState.svelte';
import { logger } from '../../utils/logger';

/** "2027-28" for 2027. */
function yearLabel(year: number): string {
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}

/**
 * A schedule never mixes academic years, so a course from another year can only
 * be added by moving to a schedule of that year. This offers the move (an
 * existing schedule of that year, else a new one) and, once confirmed, adds the
 * course there.
 */
export class YearScheduleSwitcher {
  constructor(
    private profileStateManager: ProfileStateManager,
    private scheduleManagementService: ScheduleManagementService,
    private courseSelectionService: CourseSelectionService,
  ) {}

  /** True when the course belongs to a different year than the active schedule. */
  isOtherYear(course: Course): boolean {
    const scheduleYear = this.profileStateManager.getActiveSchedule()?.year;
    return (
      typeof course.academicYear === 'number' &&
      typeof scheduleYear === 'number' &&
      course.academicYear !== scheduleYear
    );
  }

  /** Asks first; nothing changes unless the student confirms. */
  offerSwitch(course: Course, onDone?: () => void): void {
    const courseYear = course.academicYear;
    const scheduleYear = this.profileStateManager.getActiveSchedule()?.year;
    if (typeof courseYear !== 'number' || typeof scheduleYear !== 'number') {
      return;
    }
    const existing = this.profileStateManager
      .getAllSchedules()
      .find(s => s.year === courseYear);
    const label = yearLabel(courseYear);
    showConfirm({
      title: `${label} course`,
      message: [
        `${course.departmentAbbr} ${course.number} is a ${label} course, but this schedule is for ${yearLabel(scheduleYear)}.`,
        existing
          ? `Switch to "${existing.name}" and add it there?`
          : `Create a ${label} schedule and add it there?`,
      ].join('\n'),
      confirmLabel: existing ? 'Switch schedule' : `Create ${label} schedule`,
      onConfirm: () => {
        void this.switchAndAdd(course, courseYear, label, existing?.id).then(
          ok => ok && onDone?.(),
        );
      },
    });
  }

  private async switchAndAdd(
    course: Course,
    year: number,
    label: string,
    existingId: string | undefined,
  ): Promise<boolean> {
    try {
      const scheduleId =
        existingId ??
        this.profileStateManager.createSchedule(label, 'user', undefined, year)
          .id;
      const activated =
        await this.scheduleManagementService.setActiveSchedule(scheduleId);
      if (!activated.success) throw new Error(activated.error);
      if (!this.courseSelectionService.isCourseSelected(course)) {
        const added = await this.courseSelectionService.selectCourse(course);
        if (!added.success) throw new Error(added.error);
      }
      return true;
    } catch (error) {
      logger.error('Failed to switch schedule for course:', error);
      showAppError('Could not switch schedules. Please try again.');
      return false;
    }
  }
}
