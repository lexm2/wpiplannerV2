import type { Course, Department } from './types';
import type {
  SelectedCourse,
  ScheduleCombination,
  Schedule,
  LocalCalendarEvent,
} from './schedule';

/**
 * Single source of truth for one schedule's data, holding full
 * Course/Section objects for app use.
 */
export class ScheduleState {
  readonly id: string;
  readonly name: string;
  readonly selectedCourses: SelectedCourse[];
  readonly generatedSchedules: ScheduleCombination[];
  readonly timestamp: number;
  readonly localEvents: LocalCalendarEvent[];
  readonly year?: number;

  constructor(
    id: string,
    name: string,
    selectedCourses: SelectedCourse[] = [],
    generatedSchedules: ScheduleCombination[] = [],
    timestamp: number = Date.now(),
    localEvents: LocalCalendarEvent[] = [],
    year?: number,
  ) {
    this.id = id;
    this.name = name;
    this.selectedCourses = selectedCourses;
    this.generatedSchedules = generatedSchedules;
    this.timestamp = timestamp;
    this.localEvents = localEvents;
    this.year = year;
  }

  /** Create from a plain Schedule interface. */
  static fromSchedule(schedule: Schedule): ScheduleState {
    return new ScheduleState(
      schedule.id,
      schedule.name,
      schedule.selectedCourses,
      schedule.generatedSchedules,
      schedule.timestamp || Date.now(),
      schedule.localEvents || [],
      schedule.year,
    );
  }

  /** Convert to a plain Schedule interface. */
  toSchedule(): Schedule {
    return {
      id: this.id,
      name: this.name,
      selectedCourses: this.selectedCourses,
      generatedSchedules: this.generatedSchedules,
      timestamp: this.timestamp,
      localEvents: this.localEvents,
      year: this.year,
    };
  }
}

/** Find a course by ID across all departments. */
export function findCourseById(
  courseId: string,
  departments: Department[],
): Course | null {
  for (const dept of departments) {
    const course = dept.courses.find(c => c.id === courseId);
    if (course) return course;
  }
  return null;
}
