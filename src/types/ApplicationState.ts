import type { Department } from './types';
import type { SchedulePreferences } from './schedule';
import {
  extrasOf,
  parseExportedEvents,
  type ExportData,
  type ParsedExportData,
} from './export';
import { ScheduleState, findCourseById } from './ScheduleState';
import type { SelectedCourse } from './schedule';
import {
  encodeCourseSelection,
  decodeCourseSelection,
} from '../utils/courseUtils';

const APPLICATION_STATE_VERSION: string = '4.4';

/**
 * Application-level state: all schedules plus preferences.
 * The complete exportable/importable unit, with conversion to/from export format.
 */
export class ApplicationState {
  readonly version: string;
  readonly timestamp: number;
  readonly activeScheduleId: string | null;
  readonly schedules: ScheduleState[];
  readonly preferences?: SchedulePreferences;
  /**
   * Per schedule (parallel to `schedules`): ids of courses the file named that
   * the catalog does not have. Only set by fromMinimalFormat.
   */
  readonly skippedCourseIds: string[][] = [];

  constructor(
    activeScheduleId: string | null,
    schedules: ScheduleState[],
    preferences?: SchedulePreferences,
    version: string = APPLICATION_STATE_VERSION,
    timestamp: number = Date.now(),
  ) {
    this.version = version;
    this.timestamp = timestamp;
    this.activeScheduleId = activeScheduleId;
    this.schedules = schedules;
    this.preferences = preferences;
  }

  toMinimalFormat(): ExportData {
    return {
      v: this.version,
      a: this.getActiveScheduleIndex(),
      s: this.schedules.map(schedule => {
        const tuple: ExportData['s'][number] = [
          schedule.name,
          schedule.selectedCourses.flatMap(course =>
            encodeCourseSelection(course),
          ),
          schedule.year ?? null,
        ];
        const extras = extrasOf(schedule);
        if (extras) tuple.push(extras);
        // Dropped when empty so a plain schedule still reads in a 4.3 build,
        // which rejects a null year.
        if (tuple[2] === null && tuple.length === 3) tuple.length = 2;
        return tuple;
      }),
      p: this.preferences?.theme
        ? {
            t: [0, 0] as [number, number],
            d: [],
            th: this.preferences.theme,
          }
        : undefined,
    };
  }

  static fromMinimalFormat(
    data: ParsedExportData,
    courseCatalog: Department[],
  ): ApplicationState {
    const skippedCourseIds: string[][] = [];
    const schedules = data.s.map(([name, coursesArray, year, extras]) => {
      const selectedCourses: SelectedCourse[] = [];
      const skipped: string[] = [];

      for (let i = 0; i < coursesArray.length; i += 4) {
        const courseId = coursesArray[i];
        if (!courseId) continue;

        const course = findCourseById(courseId, courseCatalog);
        if (!course) {
          skipped.push(courseId);
          continue;
        }

        const sections = decodeCourseSelection(
          coursesArray[i + 1],
          coursesArray[i + 2],
          coursesArray[i + 3],
          course,
        );

        const courseExtras = extras?.x?.[courseId];
        selectedCourses.push({
          course,
          selected: sections,
          isRequired: courseExtras?.r ?? false,
          lockedSections: new Set(courseExtras?.l),
          ...(courseExtras?.c && { customColor: courseExtras.c }),
          ...(courseExtras?.t && { allowedTerms: courseExtras.t }),
        });
      }
      skippedCourseIds.push(skipped);

      return new ScheduleState(
        `schedule_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        name,
        selectedCourses,
        [],
        Date.now(),
        parseExportedEvents(extras?.e ?? []),
        year ?? undefined,
      );
    });

    const activeScheduleId =
      data.a !== null ? (schedules[data.a]?.id ?? null) : null;

    const preferences: SchedulePreferences | undefined = data.p?.th
      ? {
          theme: data.p.th,
          bookmarkedCourseIds: [],
        }
      : undefined;

    const state = new ApplicationState(
      activeScheduleId,
      schedules,
      preferences,
      data.v,
      Date.now(),
    );
    state.skippedCourseIds.push(...skippedCourseIds);
    return state;
  }

  /** Index of the active schedule, or 0 if none. */
  getActiveScheduleIndex(): number {
    if (!this.activeScheduleId) return 0;
    const index = this.schedules.findIndex(s => s.id === this.activeScheduleId);
    return index >= 0 ? index : 0;
  }
}
