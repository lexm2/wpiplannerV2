import type { FilterService } from './FilterService';
import type { CourseSelectionService } from '../selection/CourseSelectionService';
import type {
  AvailabilityFilterCriteria,
  ConflictCriteria,
} from '../../types/filters';

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
    hasCalendarEvents: conflict?.avoidCalendarEvents ?? false,
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
  const avoidCalendarEvents = conflict?.avoidCalendarEvents ?? false;
  if (checked) {
    filterService.addFilter('periodConflict', {
      avoidConflicts: true,
      selectedCourses: courseSelectionService.getSelectedCourses(),
      blockedSlots,
      semesterSpansQuarters,
      avoidCalendarEvents,
    });
  } else if (blockedSlots.length > 0 || avoidCalendarEvents) {
    filterService.addFilter('periodConflict', {
      avoidConflicts: false,
      blockedSlots,
      semesterSpansQuarters,
      avoidCalendarEvents,
    });
  } else {
    filterService.removeFilter('periodConflict');
  }
}

/**
 * Turns hiding sections that clash with calendar events on or off. Only the
 * flag is stored: ConflictFilter reads the events when it runs, so a copy of
 * their slots can never go stale.
 */
export function setCalendarConflicts(
  filterService: FilterService,
  courseSelectionService: CourseSelectionService,
  checked: boolean,
): void {
  const conflict =
    filterService.getCriteria<ConflictCriteria>('periodConflict');
  const avoidConflicts = conflict?.avoidConflicts ?? false;
  const blockedSlots = conflict?.blockedSlots ?? [];
  const semesterSpansQuarters = conflict?.semesterSpansQuarters ?? true;

  if (checked || avoidConflicts || blockedSlots.length > 0) {
    filterService.addFilter('periodConflict', {
      avoidConflicts,
      selectedCourses:
        conflict?.selectedCourses ??
        courseSelectionService.getSelectedCourses(),
      blockedSlots,
      semesterSpansQuarters,
      avoidCalendarEvents: checked,
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
