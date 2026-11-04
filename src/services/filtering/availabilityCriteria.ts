import type { FilterService } from './FilterService';
import type { CourseSelectionService } from '../selection/CourseSelectionService';
import type { AutoScheduleOrchestrator } from '../scheduling/AutoScheduleOrchestrator';
import type {
  AvailabilityFilterCriteria,
  ConflictCriteria,
} from '../../types/filters';
import { isCalendarSlot } from '../scheduling/calendarEventProvider';

/**
 * The availability and period-conflict filters are edited from two sections of
 * the filter panel (the always-visible essentials and the "More filters"
 * details), so their criteria are read and written here once.
 */

export interface AvailabilityState {
  availableOnly: boolean;
  minAvailable: number | undefined;
  avoidConflicts: boolean;
  hasCalendarEvents: boolean;
  semesterSpans: boolean;
}

export function readAvailability(
  filterService: FilterService,
): AvailabilityState {
  const avail =
    filterService.getCriteria<AvailabilityFilterCriteria>('availability');
  const conflict =
    filterService.getCriteria<ConflictCriteria>('periodConflict');
  return {
    availableOnly: avail?.availableOnly ?? false,
    minAvailable: avail?.minAvailable,
    avoidConflicts: conflict?.avoidConflicts ?? false,
    hasCalendarEvents: (conflict?.blockedSlots ?? []).some(isCalendarSlot),
    // Unset means on: F conflicts with A and B, S with C and D.
    semesterSpans: conflict?.semesterSpansQuarters ?? true,
  };
}

export function writeAvailability(
  filterService: FilterService,
  availableOnly: boolean,
  minAvailable: number | undefined,
): void {
  if (availableOnly || minAvailable) {
    filterService.addFilter('availability', {
      availableOnly,
      minAvailable: minAvailable || undefined,
    });
  } else {
    filterService.removeFilter('availability');
  }
}

export function setAvoidConflicts(
  filterService: FilterService,
  courseSelectionService: CourseSelectionService,
  checked: boolean,
): void {
  const conflict =
    filterService.getCriteria<ConflictCriteria>('periodConflict');
  const blockedSlots = conflict?.blockedSlots ?? [];
  const semesterSpansQuarters = conflict?.semesterSpansQuarters ?? true;
  if (checked) {
    filterService.addFilter('periodConflict', {
      avoidConflicts: true,
      selectedCourses: courseSelectionService.getSelectedCourses(),
      blockedSlots, // preserve existing (e.g. calendar) slots
      semesterSpansQuarters,
    });
  } else if (blockedSlots.length > 0) {
    filterService.addFilter('periodConflict', {
      avoidConflicts: false,
      blockedSlots,
      semesterSpansQuarters,
    });
  } else {
    filterService.removeFilter('periodConflict');
  }
}

export function setCalendarConflicts(
  filterService: FilterService,
  courseSelectionService: CourseSelectionService,
  autoScheduleOrchestrator: AutoScheduleOrchestrator,
  checked: boolean,
): void {
  const conflict =
    filterService.getCriteria<ConflictCriteria>('periodConflict');
  const avoidConflicts = conflict?.avoidConflicts ?? false;
  const semesterSpansQuarters = conflict?.semesterSpansQuarters ?? true;
  const selectedCourses =
    conflict?.selectedCourses ?? courseSelectionService.getSelectedCourses();
  const nonCalendarSlots = (conflict?.blockedSlots ?? []).filter(
    s => !isCalendarSlot(s),
  );

  if (checked) {
    filterService.addFilter('periodConflict', {
      avoidConflicts,
      selectedCourses,
      blockedSlots: [
        ...nonCalendarSlots,
        ...autoScheduleOrchestrator.getAllCalendarBlockedTimes(),
      ],
      semesterSpansQuarters,
    });
  } else if (nonCalendarSlots.length > 0 || avoidConflicts) {
    filterService.addFilter('periodConflict', {
      avoidConflicts,
      selectedCourses,
      blockedSlots: nonCalendarSlots,
      semesterSpansQuarters,
    });
  } else {
    filterService.removeFilter('periodConflict');
  }
}

export function setSemesterSpans(
  filterService: FilterService,
  checked: boolean,
): void {
  const conflict =
    filterService.getCriteria<ConflictCriteria>('periodConflict');
  if (!conflict) return;
  filterService.addFilter('periodConflict', {
    ...conflict,
    semesterSpansQuarters: checked,
  });
}
