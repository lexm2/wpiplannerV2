import type {
  Schedule,
  SchedulePreferences,
  SelectedCourse,
} from '../../types/schedule';
import type {
  ComponentKind,
  Course,
  Section,
  SectionsByKind,
  Department,
} from '../../types/types';
import { COMPONENT_KINDS } from '../../types/types';
import { ApplicationState } from '../../types/ApplicationState';
import { ScheduleState } from '../../types/ScheduleState';
import type {
  RemoteChange,
  TransactionResult,
} from '../storage/TransactionalStorageManager';
import { TransactionalStorageManager } from '../storage/TransactionalStorageManager';
import type {
  LoadReport,
  WriteConflict,
} from '../storage/IndexedDBStorageManager';
import { getAllSections } from '../../utils/courseUtils';
import { TERM_ORDER } from '../../utils/typeGuards';
import { logger } from '../../utils/logger';
import { deepClone, setReplacer } from '../../utils/jsonSerializer';
import { errorMessage } from '../../utils/errorMessage';
import { ExportDataSchema } from '../../types/export';
import { UndoRedoManager } from './UndoRedoManager';
import { appState } from './appState.svelte';
import { TermBoundsService } from '../../utils/termBounds';
import { isYearPublished } from '../../utils/yearPublished';
import { showAppError } from '../../services/ui/uiState.svelte';
import { showConfirm } from '../../svelte/modals/modalState.svelte';

export interface ProfileState {
  activeScheduleId: string | null;
  schedules: Schedule[];
  selectedCourses: SelectedCourse[];
  preferences: SchedulePreferences;
  isLoading: boolean;
  lastSaved: number;
  hasUnsavedChanges: boolean;
}

/**
 * State kept outside the schedules that still belongs in the one undo history
 * (the Degree page's course placements). It is captured into every history
 * entry and handed back on undo/redo, so a step of either kind undoes in the
 * order it was made.
 */
export interface UndoSlice {
  capture(): unknown;
  restore(value: unknown): void;
}

/** An export file read against the catalog; see parseImport. */
export type ImportParse =
  | {
      ok: true;
      schedules: Schedule[];
      skipped: string[][];
      activeIndex: number;
    }
  | { ok: false; error: string };

/** A saved piece of a schedule that no longer matches the catalog. */
interface CatalogDrift {
  kind: 'section' | 'course';
  scheduleName: string;
  label: string;
}

/** Where resolveCourseReferences records what it could not match. */
interface DriftSink {
  scheduleName: string;
  into: CatalogDrift[];
}

const unchanged: TransactionResult = { success: true, transactionId: 'clean' };

const courseLabel = (course: Course): string =>
  `${course.departmentAbbr}${course.number}`;

/** Two copies of the same course (code), from different catalog years. */
function isOtherYearCopy(a: Course, b: Course): boolean {
  return (
    a.id !== b.id &&
    a.departmentAbbr === b.departmentAbbr &&
    a.number === b.number
  );
}

function sameSchedule(a: Schedule, b: Schedule): boolean {
  return JSON.stringify(a, setReplacer) === JSON.stringify(b, setReplacer);
}

/** Single source of truth for application state with synchronous persistence and event-driven updates. */
export class ProfileStateManager {
  private static instance: ProfileStateManager | null = null;
  private storageManager: TransactionalStorageManager;
  private isLoadingFlag = false;
  private allDepartments: Department[] = [];
  private undoRedoManager: UndoRedoManager;
  private undoSlice: UndoSlice | null = null;
  private isRestoringState = false;
  private pendingSavePromises = new Set<Promise<void>>();
  // The schedule object each id last saved (or loaded) successfully. Schedules
  // in state are replaced, never mutated, so an unchanged object needs no
  // re-save; a save writes exactly the schedules that differ from this map.
  private savedSchedules = new Map<string, Schedule>();
  // At most one flush runs at a time. A save() that lands while it does only
  // marks the state dirty again, so a burst of edits costs one write per
  // dirty schedule plus one trailing write, not one write per edit.
  private flushing = false;
  private flushRequested = false;
  private savedPreferences: SchedulePreferences | null = null;
  private savedActiveId: string | null | undefined;
  // Set while all data is being cleared, here or in another tab: whatever is
  // pending is moot and must not be written, and the leave-page prompt would
  // only nag.
  private discardingState = false;
  public isBatchUpdate = false;
  private driftReported = false;

  private constructor(storageManager?: TransactionalStorageManager) {
    this.storageManager = storageManager || new TransactionalStorageManager();
    this.undoRedoManager = new UndoRedoManager();
    this.setupBeforeUnloadHandler();
    this.storageManager.subscribe(change => void this.onRemoteChange(change));
  }

  /**
   * The reactive application state. Reads/writes go to the runes singleton;
   * assigning a `$state.raw` field (e.g. `this.state.selectedCourses = [...]`)
   * triggers reactivity, but in-place mutation does not - mutations below
   * always reassign immutably.
   */
  private get state(): ProfileState {
    return appState;
  }

  public static getInstance(): ProfileStateManager {
    if (!ProfileStateManager.instance) {
      ProfileStateManager.instance = new ProfileStateManager();
    }
    return ProfileStateManager.instance;
  }

  private setupBeforeUnloadHandler(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
      if (this.shouldWarnBeforeUnload()) {
        // Calling preventDefault() triggers the browser's "leave site?" prompt.
        e.preventDefault();
      }
    });
  }

  /** Whether leaving the page now would lose a change still being written. */
  shouldWarnBeforeUnload(): boolean {
    return this.pendingSavePromises.size > 0 && !this.discardingState;
  }

  /**
   * Attach (or refresh) the catalog, and point every saved selection at its
   * live course and section objects. Storage loads before the catalog does,
   * so until this runs selections hold the stored copies, with stale seat
   * counts. Not an edit: nothing is saved and no undo step is recorded.
   */
  setCourseData(departments: Department[]): void {
    this.allDepartments = departments;
    logger.log(
      `[CATALOG] Course catalog set with ${departments.length} departments`,
    );
    if (departments.length === 0) return;

    const drift: CatalogDrift[] = [];
    this.state.schedules = this.state.schedules.map(s => {
      const resolved = {
        ...s,
        selectedCourses: this.resolveCourseReferences(s.selectedCourses, {
          scheduleName: s.name,
          into: drift,
        }),
      };
      // Pointing at the live catalog is not an edit: a schedule that was clean
      // stays clean under its new object.
      if (this.savedSchedules.get(s.id) === s) {
        this.savedSchedules.set(s.id, resolved);
      }
      return resolved;
    });
    this.state.selectedCourses = this.resolveCourseReferences(
      this.state.selectedCourses,
    );
    this.reportCatalogDrift(drift);
  }

  /**
   * Tells the student, once per page load, which saved sections vanished from
   * the catalog and which saved courses are from an older catalog year. Both
   * stay quiet otherwise: a section that is silently dropped looks like a
   * lost schedule.
   */
  private reportCatalogDrift(drift: CatalogDrift[]): void {
    if (this.driftReported || drift.length === 0) return;
    this.driftReported = true;

    const lines: string[] = [];
    const missing = drift.filter(d => d.kind === 'section');
    const stale = drift.filter(d => d.kind === 'course');
    if (missing.length > 0) {
      lines.push('These saved sections are no longer offered:');
      lines.push(...missing.map(d => `${d.scheduleName}: ${d.label}`));
    }
    if (stale.length > 0) {
      lines.push(
        'These saved courses are not in the current catalog, so their times and seats may be out of date. Add the current version from the course list to replace each:',
      );
      lines.push(...stale.map(d => `${d.scheduleName}: ${d.label}`));
    }
    const shown = lines.slice(0, 14);
    if (lines.length > shown.length) {
      shown.push(`...and ${lines.length - shown.length} more`);
    }
    showConfirm({
      title: 'Your saved schedules have changed',
      message: shown.join('\n'),
      confirmLabel: 'OK',
      notice: true,
      onConfirm: () => {},
    });
  }

  getState(): Readonly<ProfileState> {
    // Explicit copy (not `{...this.state}`): appState is a runes class whose
    // fields are accessors, so spreading would not capture values reliably.
    return {
      activeScheduleId: appState.activeScheduleId,
      schedules: appState.schedules,
      selectedCourses: appState.selectedCourses,
      preferences: appState.preferences,
      isLoading: appState.isLoading,
      lastSaved: appState.lastSaved,
      hasUnsavedChanges: appState.hasUnsavedChanges,
    };
  }

  getActiveSchedule(): Schedule | null {
    if (!this.state.activeScheduleId) return null;
    return (
      this.state.schedules.find(s => s.id === this.state.activeScheduleId) ||
      null
    );
  }

  getAllSchedules(): Schedule[] {
    return [...this.state.schedules];
  }

  getSelectedCourses(): SelectedCourse[] {
    return [...this.state.selectedCourses];
  }

  getSelectedCourse(course: Course): SelectedCourse | undefined {
    return this.state.selectedCourses.find(sc => sc.course.id === course.id);
  }

  getPreferences(): SchedulePreferences {
    return { ...this.state.preferences };
  }

  hasPendingSaves(): boolean {
    return this.pendingSavePromises.size > 0;
  }

  /**
   * Immutably patch the SelectedCourse for `courseId` by reassigning the
   * selectedCourses array (required for `$state.raw` reactivity). Returns
   * whether a matching course was found.
   */
  private patchSelectedCourse(
    courseId: string,
    patch: (sc: SelectedCourse) => SelectedCourse,
  ): boolean {
    let found = false;
    this.state.selectedCourses = this.state.selectedCourses.map(sc => {
      if (sc.course.id === courseId) {
        found = true;
        return patch(sc);
      }
      return sc;
    });
    return found;
  }

  /**
   * Set one component kind, leaving the others alone.
   *
   * `selected` is nested, so `{ ...sc, ...patch }` with a partial map would
   * replace the whole thing and silently drop the other kinds. Going through
   * here - rather than building a patch at the call site - is what keeps that
   * unrepresentable.
   */
  private setComponent(
    courseId: string,
    kind: ComponentKind,
    section: Section,
  ): boolean {
    return this.patchSelectedCourse(courseId, sc => ({
      ...sc,
      selected: { ...sc.selected, [kind]: section },
    }));
  }

  /** Clear every component kind for a course. */
  private clearComponents(courseId: string): boolean {
    return this.patchSelectedCourse(courseId, sc => ({ ...sc, selected: {} }));
  }

  selectCourse(
    course: Course,
    isRequired: boolean = false,
    _source: string = 'user',
  ): void {
    this.withStateUpdate(() => {
      const existing = this.state.selectedCourses.find(
        sc => sc.course.id === course.id,
      );

      if (existing) {
        this.patchSelectedCourse(course.id, sc => ({ ...sc, isRequired }));
      } else {
        const selectedCourse: SelectedCourse = {
          course,
          selected: {},
          isRequired,
          lockedSections: new Set(),
        };
        // A saved copy of this course from another catalog year is the same
        // course to the student: replace it rather than hold both. Its picks
        // are CRNs of the old year and mean nothing here.
        const staleIndex = this.state.selectedCourses.findIndex(sc =>
          isOtherYearCopy(sc.course, course),
        );
        if (staleIndex >= 0) {
          const stale = this.state.selectedCourses[staleIndex];
          this.state.selectedCourses = this.state.selectedCourses.map(
            (sc, i) =>
              i === staleIndex
                ? {
                    ...selectedCourse,
                    isRequired: isRequired || stale.isRequired,
                    customColor: stale.customColor,
                    allowedTerms: stale.allowedTerms,
                  }
                : sc,
          );
        } else {
          this.state.selectedCourses = [
            ...this.state.selectedCourses,
            selectedCourse,
          ];
        }
      }

      this.updateActiveScheduleWithCurrentCourses();
    });
  }

  unselectCourse(course: Course, _source: string = 'user'): void {
    this.withStateUpdate(() => {
      const index = this.state.selectedCourses.findIndex(
        sc => sc.course.id === course.id,
      );
      if (index >= 0) {
        this.state.selectedCourses = this.state.selectedCourses.filter(
          sc => sc.course.id !== course.id,
        );
        this.updateActiveScheduleWithCurrentCourses();
      }
    });
  }

  setSelectedSection(
    course: Course,
    sectionNumber: string | null,
    _source: string = 'user',
  ): void {
    this.withStateUpdate(() => {
      const selectedCourse = this.state.selectedCourses.find(
        sc => sc.course.id === course.id,
      );
      if (!selectedCourse) return;

      // A bare section number carries no kind, so it has to be recovered
      // from where the section sits in the course tree.
      let hit: { kind: ComponentKind; section: Section } | 'clear' | null =
        null;

      if (!sectionNumber) {
        hit = 'clear';
      } else if (course.lectures) {
        for (const lectureGroup of course.lectures) {
          if (lectureGroup.section.number === sectionNumber) {
            hit = { kind: 'lecture', section: lectureGroup.section };
            break;
          }
          const discussion = lectureGroup.compatibleDiscussions.find(
            d => d.number === sectionNumber,
          );
          if (discussion) {
            hit = { kind: 'discussion', section: discussion };
            break;
          }
          const lab = lectureGroup.compatibleLabs.find(
            l => l.number === sectionNumber,
          );
          if (lab) {
            hit = { kind: 'lab', section: lab };
            break;
          }
        }
      }

      // A standalone lab fills the same slot as a lecture group's lab.
      if (!hit && sectionNumber && course.standaloneLabs) {
        const lab = course.standaloneLabs.find(l => l.number === sectionNumber);
        if (lab) {
          hit = { kind: 'lab', section: lab };
        }
      }

      if (!hit) {
        logger.warn(
          `Section ${sectionNumber} not found in course ${course.departmentAbbr}${course.number}`,
        );
        return;
      }

      // Setting one kind deliberately leaves the others in place.
      if (hit === 'clear') {
        this.clearComponents(course.id);
      } else {
        this.setComponent(course.id, hit.kind, hit.section);
      }
      this.updateActiveScheduleWithCurrentCourses();
    });
  }

  setSelectedComponents(
    course: Course,
    selected: SectionsByKind,
    _source: string = 'user',
  ): void {
    this.withStateUpdate(() => {
      const found = this.patchSelectedCourse(course.id, sc => ({
        ...sc,
        selected,
      }));
      if (found) {
        this.updateActiveScheduleWithCurrentCourses();
      }
    });
  }

  setCourseColor(
    courseId: string,
    color: string,
    _source: string = 'user',
  ): void {
    this.withStateUpdate(() => {
      const found = this.patchSelectedCourse(courseId, sc => ({
        ...sc,
        customColor: color,
      }));
      if (found) {
        this.updateActiveScheduleWithCurrentCourses();
      }
    });
  }

  /**
   * The academic year to select by default: the current academic year
   * (date-driven, from term bounds) when course data exists for it, otherwise
   * the newest year with data. Once the next year is published it takes over,
   * rather than waiting for the current year's last term to end.
   */
  getDefaultAcademicYear(now: Date = new Date()): number | undefined {
    const counts = new Map<number, number>();
    for (const course of this.allDepartments.flatMap(d => d.courses)) {
      if (course.academicYear)
        counts.set(
          course.academicYear,
          (counts.get(course.academicYear) ?? 0) + 1,
        );
    }
    if (!counts.size) return undefined;
    const current = TermBoundsService.getInstance().getCurrentAcademicYear(now);
    if (current === null || !counts.has(current)) {
      return Math.max(...counts.keys());
    }
    const next = current + 1;
    return isYearPublished(counts.get(next) ?? 0, counts.get(current) ?? 0)
      ? next
      : current;
  }

  createSchedule(
    name: string,
    _source: string = 'user',
    id?: string,
    year?: number,
  ): Schedule {
    return this.withStateUpdateSync(() => {
      const schedule: Schedule = {
        id: id ?? this.generateScheduleId(),
        name,
        selectedCourses: [],
        generatedSchedules: [],
        year: year ?? this.getDefaultAcademicYear(),
      };

      this.state.schedules = [...this.state.schedules, schedule];
      return schedule;
    });
  }

  /** Adds a schedule built elsewhere (an import) under a fresh id. */
  createScheduleFrom(content: Omit<Schedule, 'id'>): Schedule {
    return this.withStateUpdateSync(() => {
      const schedule: Schedule = {
        ...content,
        id: this.generateScheduleId(),
        generatedSchedules: [],
      };
      this.state.schedules = [...this.state.schedules, schedule];
      return schedule;
    });
  }

  setActiveSchedule(scheduleId: string, source: string = 'user'): boolean {
    return this.withStateUpdateSync(() => {
      const schedule = this.state.schedules.find(s => s.id === scheduleId);
      if (!schedule) return false;

      this.isLoadingFlag = true;
      this.state.activeScheduleId = scheduleId;

      this.undoRedoManager.clear();

      const loadedCourses = [...schedule.selectedCourses];
      this.state.selectedCourses = this.resolveCourseReferences(loadedCourses);

      this.signalActivation(source);

      this.isLoadingFlag = false;
      return true;
    });
  }

  updateSchedule(
    scheduleId: string,
    updates: Partial<Schedule>,
    source: string = 'user',
  ): boolean {
    const isAutomated = source === 'storage-service';
    const update = () => {
      const index = this.state.schedules.findIndex(s => s.id === scheduleId);
      if (index < 0) return false;

      const updated = { ...this.state.schedules[index], ...updates };
      this.state.schedules = this.state.schedules.map(s =>
        s.id === scheduleId ? updated : s,
      );

      if (scheduleId === this.state.activeScheduleId) {
        // The live selection mirrors the active schedule, so a course-list
        // change has to reach it too. Doing it here, rather than through
        // setActiveSchedule, keeps the undo history.
        if (updates.selectedCourses) {
          this.state.selectedCourses = this.resolveCourseReferences([
            ...updates.selectedCourses,
          ]);
        }
        this.signalActivation(source);
      }
      return true;
    };
    return isAutomated
      ? this.withPersistSync(update)
      : this.withStateUpdateSync(update);
  }

  async deleteSchedule(
    scheduleId: string,
    source: string = 'user',
  ): Promise<boolean> {
    return this.withStateUpdateAsync(async () => {
      const scheduleIndex = this.state.schedules.findIndex(
        s => s.id === scheduleId,
      );
      if (scheduleIndex < 0) return false;

      if (this.state.schedules.length <= 1) {
        logger.warn('Cannot delete the only remaining schedule');
        return false;
      }

      this.state.schedules = this.state.schedules.filter(
        s => s.id !== scheduleId,
      );

      this.savedSchedules.delete(scheduleId);
      const deleteResult = await this.storageManager.deleteSchedule(scheduleId);
      if (!deleteResult.success) {
        logger.warn(
          'Failed to delete schedule from storage:',
          deleteResult.error,
        );
      }

      if (this.state.activeScheduleId === scheduleId) {
        const nextSchedule = this.state.schedules[0];
        this.state.activeScheduleId = nextSchedule.id;
        this.state.selectedCourses = [...nextSchedule.selectedCourses];
        this.signalActivation(source);
      }
      return true;
    });
  }

  renameSchedule(
    scheduleId: string,
    newName: string,
    source: string = 'user',
  ): boolean {
    return this.updateSchedule(scheduleId, { name: newName }, source);
  }

  duplicateSchedule(
    scheduleId: string,
    newName: string,
    _source: string = 'user',
  ): Schedule | null {
    const originalSchedule = this.state.schedules.find(
      s => s.id === scheduleId,
    );
    if (!originalSchedule) return null;

    return this.withStateUpdateSync(() => {
      const duplicatedSchedule: Schedule = {
        id: this.generateScheduleId(),
        name: newName,
        selectedCourses: [...originalSchedule.selectedCourses],
        generatedSchedules: [...originalSchedule.generatedSchedules],
        // Events are part of the plan: Auto-Schedule keeps classes clear of
        // them, so a copy without them would book over the student's commitments.
        ...(originalSchedule.localEvents && {
          localEvents: [...originalSchedule.localEvents],
        }),
        year: originalSchedule.year,
      };

      this.state.schedules = [...this.state.schedules, duplicatedSchedule];
      return duplicatedSchedule;
    });
  }

  updatePreferences(
    updates: Partial<SchedulePreferences>,
    _source: string = 'user',
  ): void {
    this.withPersist(() => {
      this.state.preferences = { ...this.state.preferences, ...updates };
    });
  }

  bookmarkCourse(courseId: string, _source: string = 'user'): void {
    this.withStateUpdate(() => {
      const bookmarks = this.state.preferences.bookmarkedCourseIds ?? [];
      if (!bookmarks.includes(courseId)) {
        this.state.preferences = {
          ...this.state.preferences,
          bookmarkedCourseIds: [...bookmarks, courseId],
        };
      }
    });
  }

  unbookmarkCourse(courseId: string, _source: string = 'user'): void {
    this.withStateUpdate(() => {
      const bookmarks = this.state.preferences.bookmarkedCourseIds ?? [];
      const index = bookmarks.indexOf(courseId);
      if (index >= 0) {
        this.state.preferences = {
          ...this.state.preferences,
          bookmarkedCourseIds: bookmarks.filter(id => id !== courseId),
        };
      }
    });
  }

  isBookmarked(courseId: string): boolean {
    return (
      this.state.preferences.bookmarkedCourseIds?.includes(courseId) ?? false
    );
  }

  getBookmarkedCourseIds(): string[] {
    return [...(this.state.preferences.bookmarkedCourseIds ?? [])];
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- consumed as a promise by callers
  async undo(): Promise<boolean> {
    const snapshot = this.undoRedoManager.undo(this.state.schedules);
    if (!snapshot) return false;

    this.isRestoringState = true;
    try {
      this.restoreFromSnapshot(snapshot);
      if (snapshot.extra !== undefined) this.undoSlice?.restore(snapshot.extra);
      this.save();
      return true;
    } finally {
      this.isRestoringState = false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- consumed as a promise by callers
  async redo(): Promise<boolean> {
    const snapshot = this.undoRedoManager.redo(this.state.schedules);
    if (!snapshot) return false;

    this.isRestoringState = true;
    try {
      this.restoreFromSnapshot(snapshot);
      if (snapshot.extra !== undefined) this.undoSlice?.restore(snapshot.extra);
      this.save();
      return true;
    } finally {
      this.isRestoringState = false;
    }
  }

  registerUndoSlice(slice: UndoSlice): void {
    this.undoSlice = slice;
  }

  /**
   * Make the slice's current value a history step of its own, for changes that
   * touch no schedule and so never reach save().
   */
  recordUndoStep(): void {
    if (this.isRestoringState) return;
    this.undoRedoManager.captureSnapshot(
      this.state.activeScheduleId,
      new Map(this.state.schedules.map(s => [s.id, s])),
      this.state.preferences,
      this.undoSlice?.capture(),
    );
  }

  private restoreFromSnapshot(snapshot: {
    activeScheduleId: string | null;
    schedules: Map<string, Schedule>;
    preferences: SchedulePreferences;
  }): void {
    this.state.activeScheduleId = snapshot.activeScheduleId;

    // A schedule the snapshot shares with the present keeps its object (and
    // so its clean state): only schedules the step really changed are
    // rewritten. The rest are cloned, which detaches every Course from the
    // catalog, so they are pointed back at it (as loadFromStorage and
    // setCourseData do) - for all of them, not just the active one, because
    // switching to another schedule reads these.
    const present = new Map(this.state.schedules.map(s => [s.id, s]));
    this.state.schedules = Array.from(snapshot.schedules.values()).map(snap => {
      const current = present.get(snap.id);
      if (current && (current === snap || sameSchedule(current, snap))) {
        return current;
      }
      const cloned = deepClone(snap);
      return {
        ...cloned,
        selectedCourses: this.resolveCourseReferences(cloned.selectedCourses),
      };
    });
    this.state.preferences = deepClone(snapshot.preferences);

    if (this.state.activeScheduleId) {
      const activeSchedule = this.state.schedules.find(
        s => s.id === this.state.activeScheduleId,
      );
      if (activeSchedule) {
        this.state.selectedCourses = this.resolveCourseReferences(
          activeSchedule.selectedCourses,
        );
      } else {
        this.state.selectedCourses = [];
      }
    } else {
      this.state.selectedCourses = [];
    }
  }

  /**
   * Records the as-loaded state as history[0] so the user's first change is
   * undoable. `canUndo()` needs `currentIndex > 0`, so without this the first
   * captured snapshot becomes the baseline and cannot be stepped back past.
   * Call after the catalog is attached and before any user edit.
   */
  seedUndoBaseline(): void {
    this.undoRedoManager.captureBaseline(
      this.state.activeScheduleId,
      new Map(this.state.schedules.map(s => [s.id, s])),
      this.state.preferences,
      this.undoSlice?.capture(),
    );
  }

  canUndo(): boolean {
    return this.undoRedoManager.canUndo();
  }

  canRedo(): boolean {
    return this.undoRedoManager.canRedo();
  }

  /**
   * Make the next save write the active schedule. save() skips a schedule
   * whose object is unchanged, so a caller that edited its courses in place
   * calls this first.
   */
  markActiveScheduleChanged(): void {
    const active = this.state.schedules.find(
      s => s.id === this.state.activeScheduleId,
    );
    if (!active) return;
    this.savedSchedules.delete(active.id);
    this.undoRedoManager.forget(active);
  }

  save(skipSnapshot = false): void {
    if (this.discardingState) return;
    if (!this.isRestoringState && !skipSnapshot) {
      const schedulesMap = new Map(this.state.schedules.map(s => [s.id, s]));
      this.undoRedoManager.captureSnapshot(
        this.state.activeScheduleId,
        schedulesMap,
        this.state.preferences,
        this.undoSlice?.capture(),
      );
    }

    this.flushRequested = true;
    if (this.flushing) return;
    this.flushing = true;
    const flush = this.runFlushes();
    this.pendingSavePromises.add(flush);
    void flush.finally(() => this.pendingSavePromises.delete(flush));
  }

  private async runFlushes(): Promise<void> {
    try {
      while (this.flushRequested && !this.discardingState) {
        this.flushRequested = false;
        await this.flushOnce();
      }
    } finally {
      this.flushing = false;
    }
  }

  private async flushOnce(): Promise<void> {
    try {
      // Each write is skipped unless its data changed, so a tab that edits
      // one schedule never rewrites (and so never overwrites) the others.
      const activeId = this.state.activeScheduleId;
      const activeIdResult =
        activeId === this.savedActiveId
          ? unchanged
          : this.storageManager.saveActiveScheduleId(activeId);

      const liveSchedules = this.state.schedules;
      const toSave = liveSchedules.filter(
        schedule => this.savedSchedules.get(schedule.id) !== schedule,
      );
      // Saved before, absent now: removed by a delete, or by undoing/redoing
      // past the schedule's creation. Storage must lose it too, or a reload
      // brings it back.
      const liveIds = new Set(liveSchedules.map(s => s.id));
      const toDelete = [...this.savedSchedules.entries()].filter(
        ([id]) => !liveIds.has(id),
      );

      const writes = toSave.map(schedule =>
        this.storageManager.saveSchedule({
          ...schedule,
          selectedCourses: schedule.selectedCourses.filter(
            sc => !sc.course.transient,
          ),
        }),
      );
      const deletes = toDelete.map(([id]) =>
        this.storageManager.deleteSchedule(id),
      );
      const [results, deleteResults] = await Promise.all([
        Promise.all(writes),
        Promise.all(deletes),
      ]);
      const conflicts: { schedule: Schedule; conflict: WriteConflict }[] = [];
      results.forEach((result, i) => {
        if (result.success) {
          this.savedSchedules.set(toSave[i].id, toSave[i]);
        } else if (result.conflict) {
          conflicts.push({ schedule: toSave[i], conflict: result.conflict });
        }
      });
      deleteResults.forEach((result, i) => {
        const [id, savedCopy] = toDelete[i];
        if (result.success && this.savedSchedules.get(id) === savedCopy) {
          this.savedSchedules.delete(id);
        }
      });
      if (activeIdResult.success) this.savedActiveId = activeId;

      const preferences = this.state.preferences;
      const preferencesResult =
        preferences === this.savedPreferences
          ? unchanged
          : this.storageManager.savePreferences(preferences);
      if (preferencesResult.success) this.savedPreferences = preferences;

      for (const { schedule, conflict } of conflicts) {
        await this.resolveWriteConflict(schedule, conflict);
      }

      // A rejected write comes back as a result, not a throw: falling through
      // here would mark the state clean while the schedule is silently gone on
      // the next reload. Stay dirty and say so instead. The localStorage
      // writes (active id, preferences) fail the same way on a full quota. A
      // conflict is not a failure: it was answered above.
      const failed = [
        ...results.filter(r => !r.conflict),
        ...deleteResults,
        activeIdResult,
        preferencesResult,
      ].filter(r => !r.success);
      if (failed.length > 0) {
        logger.error(
          `Save failed for ${failed.length} write(s):`,
          failed.map(f => f.error),
        );
        showAppError(
          'Your latest change could not be saved and will be lost if you reload.',
        );
        return;
      }

      this.state.hasUnsavedChanges = false;
      this.state.lastSaved = Date.now();
    } catch (error) {
      logger.error('Save failed:', error);
    }
  }

  async loadFromStorage(): Promise<boolean> {
    if (this.isLoadingFlag) {
      return false;
    }

    if (this.state.schedules.length > 0 && !this.state.isLoading) {
      return true;
    }

    try {
      this.state.isLoading = true;
      this.isLoadingFlag = true;
      this.savedSchedules.clear();

      const preferencesResult = this.storageManager.loadPreferences();
      if (preferencesResult.valid && preferencesResult.data) {
        this.state.preferences = preferencesResult.data;
        this.savedPreferences = this.state.preferences;
      }

      const schedulesResult = await this.storageManager.loadAllSchedules();

      const drift: CatalogDrift[] = [];
      if (schedulesResult.valid && schedulesResult.data) {
        // Tutorial schedules aren't saved any more, but older builds left one
        // behind on every reload mid-tutorial.
        for (const s of schedulesResult.data) {
          if (s.id.startsWith('tutorial_')) {
            void this.storageManager.deleteSchedule(s.id);
          }
        }
        this.state.schedules = schedulesResult.data
          .filter(s => !s.id.startsWith('tutorial_'))
          .map(s => ({
            ...s,
            selectedCourses: this.resolveCourseReferences(s.selectedCourses, {
              scheduleName: s.name,
              into: drift,
            }),
          }));
        // As loaded, every schedule is what storage holds: only an edit makes
        // one dirty, so this tab's first save writes just what it changed.
        for (const schedule of this.state.schedules) {
          this.savedSchedules.set(schedule.id, schedule);
        }
        this.reportCatalogDrift(drift);
        this.reportUnreadable(schedulesResult.report);
      }

      // The saved id can name a schedule that was not loaded back, like a
      // tutorial schedule from an older build. Fall back to the first real one.
      const activeIdResult = this.storageManager.loadActiveScheduleId();
      const savedId = activeIdResult.valid ? activeIdResult.data : null;
      this.savedActiveId = activeIdResult.valid ? savedId : undefined;
      this.state.activeScheduleId = this.state.schedules.some(
        s => s.id === savedId,
      )
        ? savedId
        : (this.state.schedules[0]?.id ?? null);

      // Selected courses come from the active schedule only (no fallback)
      let loadedCourses: SelectedCourse[] = [];
      if (this.state.activeScheduleId) {
        const activeSchedule = this.state.schedules.find(
          s => s.id === this.state.activeScheduleId,
        );
        if (activeSchedule) {
          loadedCourses = activeSchedule.selectedCourses;
        }
      }

      this.state.selectedCourses = loadedCourses;

      logger.log(
        '%cLOADED - Parsed Data:',
        'color: #2196F3; font-weight: bold',
      );
      const loadedData = {
        activeScheduleId: this.state.activeScheduleId,
        schedulesCount: this.state.schedules.length,
        schedules: this.state.schedules.map(s => ({
          id: s.id,
          name: s.name,
          coursesCount: s.selectedCourses.length,
          selectedCourses: s.selectedCourses.map(sc => ({
            courseId: sc.course.id,
            courseName: `${sc.course.departmentAbbr}${sc.course.number}`,
            selectedComponents: sc.selected,
            isRequired: sc.isRequired,
          })),
        })),
        selectedCoursesCount: loadedCourses.length,
        selectedCourses: loadedCourses.map(sc => ({
          courseId: sc.course.id,
          courseName: `${sc.course.departmentAbbr}${sc.course.number}`,
          selectedComponents: sc.selected,
        })),
      };
      logger.log(JSON.stringify(loadedData, null, 2));
      logger.log('---');

      if (this.state.schedules.length === 0) {
        logger.log('No schedules found, creating default schedule');
        const defaultSchedule = this.createSchedule('My Schedule', 'system');
        this.state.activeScheduleId = defaultSchedule.id;
      }

      if (!this.state.activeScheduleId && this.state.schedules.length > 0) {
        logger.log('No active schedule, setting last schedule as active');
        this.state.activeScheduleId =
          this.state.schedules[this.state.schedules.length - 1].id;
      }

      this.state.hasUnsavedChanges = false;
      this.state.lastSaved = Date.now();
      return true;
    } catch (error) {
      logger.error('Load failed:', error);
      return false;
    } finally {
      this.state.isLoading = false;
      this.isLoadingFlag = false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- awaited by callers
  async exportData(): Promise<string | null> {
    const applicationState = this.createApplicationState();
    const minimalData = applicationState.toMinimalFormat();
    return JSON.stringify(minimalData);
  }

  private createApplicationState(): ApplicationState {
    const schedules = this.state.schedules.map(s =>
      ScheduleState.fromSchedule(s),
    );
    return new ApplicationState(
      this.state.activeScheduleId,
      schedules,
      this.state.preferences,
    );
  }

  /**
   * Reads an export file against the live catalog. Courses the catalog lacks
   * are left out and named in `skipped` (parallel to `schedules`), so one
   * stale course never costs the rest of the file.
   */
  parseImport(text: string): ImportParse {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        ok: false,
        error: 'This file is not valid JSON, so it cannot be a planner export.',
      };
    }
    const parsed = ExportDataSchema.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'This file is not a planner export, or it is damaged. Pick a file saved with Export or Export All.',
      };
    }
    if (!parsed.data.v.startsWith('4')) {
      return {
        ok: false,
        error:
          'Unsupported import format. Please export your schedules again using the latest version.',
      };
    }
    const state = ApplicationState.fromMinimalFormat(
      parsed.data,
      this.allDepartments,
    );
    return {
      ok: true,
      schedules: state.schedules.map(s => s.toSchedule()),
      skipped: state.skippedCourseIds,
      activeIndex: state.getActiveScheduleIndex(),
    };
  }

  isHealthy(): { healthy: boolean; issues: string[] } {
    const storageHealth = this.storageManager.isHealthy();
    const issues = [...storageHealth.issues];

    if (
      this.state.activeScheduleId &&
      !this.state.schedules.find(s => s.id === this.state.activeScheduleId)
    ) {
      issues.push('Active schedule ID references non-existent schedule');
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }

  private resolveCourseReferences(
    selectedCourses: SelectedCourse[],
    sink?: DriftSink,
  ): SelectedCourse[] {
    // Before the catalog loads there is nothing to resolve against;
    // setCourseData resolves everything once it arrives.
    if (this.allDepartments.length === 0) return selectedCourses;

    logger.log(
      `Resolving course references for ${selectedCourses.length} courses`,
    );

    return selectedCourses.map(selectedCourse => {
      const courseId = selectedCourse.course.id;

      let liveCourse: Course | undefined;
      for (const dept of this.allDepartments) {
        liveCourse = dept.courses.find(c => c.id === courseId);
        if (liveCourse) break;
      }

      if (!liveCourse) {
        logger.warn(
          `Course ${courseId} not found in catalog, keeping original reference`,
        );
        if (sink && !selectedCourse.course.transient) {
          sink.into.push({
            kind: 'course',
            scheduleName: sink.scheduleName,
            label: courseLabel(selectedCourse.course),
          });
        }
        return selectedCourse;
      }

      const resolveSection = (section: Section | null): Section | null => {
        if (!section || !liveCourse) return null;

        if (typeof section.crn !== 'number') {
          logger.warn(
            `Section missing CRN field, cannot resolve for course ${courseId}`,
          );
          return null;
        }

        const allSections = getAllSections(liveCourse);
        const liveSection = allSections.find(
          (s: Section) => s.crn === section.crn,
        );

        if (!liveSection) {
          logger.warn(
            `Section CRN ${section.crn} not found for course ${courseId}, section may no longer exist`,
          );
          sink?.into.push({
            kind: 'section',
            scheduleName: sink.scheduleName,
            label: `${courseLabel(liveCourse)} ${section.number ?? section.crn}`,
          });
          return null;
        }

        if (
          typeof liveSection.computedTerm !== 'string' ||
          !TERM_ORDER.includes(liveSection.computedTerm)
        ) {
          logger.error(
            `Resolved section CRN ${liveSection.crn} has invalid computedTerm: ${liveSection.computedTerm}`,
          );
        }

        return liveSection;
      };

      const lockedSections =
        selectedCourse.lockedSections instanceof Set
          ? selectedCourse.lockedSections
          : new Set(
              Array.isArray(selectedCourse.lockedSections)
                ? selectedCourse.lockedSections
                : [],
            );

      // Spread the stored course rather than naming each field: an allowlist
      // rebuild silently drops every field it doesn't mention (allowedTerms)
      // and would drop the next one anyone adds.
      // A section that no longer exists in the catalog loses its key
      // rather than becoming an explicit null.
      const selected: SectionsByKind = {};
      for (const kind of COMPONENT_KINDS) {
        const live = resolveSection(selectedCourse.selected[kind] ?? null);
        if (live) selected[kind] = live;
      }

      const resolved: SelectedCourse = {
        ...selectedCourse,
        course: liveCourse,
        selected,
        lockedSections,
      };

      return resolved;
    });
  }

  /**
   * Signal that the active schedule was (re)activated or its metadata changed.
   * Publishes a fresh activation event object; consumers `watch` it and read
   * `.source` to branch on origin.
   */
  private signalActivation(source: string): void {
    appState.activation = { source };
  }

  // In batch mode the trailing save is skipped; withBatch saves once at the end.
  private withStateUpdate(updateFn: () => void): void {
    updateFn();
    this.state.hasUnsavedChanges = true;

    if (!this.isBatchUpdate) {
      this.save();
    }
  }

  private async withStateUpdateAsync<T>(
    updateFn: () => Promise<T>,
  ): Promise<T> {
    const result = await updateFn();
    this.state.hasUnsavedChanges = true;

    if (!this.isBatchUpdate) {
      this.save();
    }
    return result;
  }

  private withStateUpdateSync<T>(updateFn: () => T): T {
    const result = updateFn();
    this.state.hasUnsavedChanges = true;

    if (!this.isBatchUpdate) {
      this.save();
    }
    return result;
  }

  private withPersist(updateFn: () => void): void {
    updateFn();
    this.state.hasUnsavedChanges = true;

    if (!this.isBatchUpdate) {
      this.save(true);
    }
  }

  private withPersistSync<T>(updateFn: () => T): T {
    const result = updateFn();
    this.state.hasUnsavedChanges = true;

    if (!this.isBatchUpdate) {
      this.save(true);
    }
    return result;
  }

  /**
   * Run multiple state updates in batch mode, saving once at the end.
   * @param skipSnapshot - Skip expensive snapshot capture during save (useful for rapid navigation)
   */
  async withBatch<T>(fn: () => Promise<T>, skipSnapshot = false): Promise<T> {
    const wasBatch = this.isBatchUpdate;
    if (!wasBatch) {
      this.isBatchUpdate = true;
    }

    try {
      return await fn();
    } finally {
      if (!wasBatch) {
        this.isBatchUpdate = false;
        this.save(skipSnapshot);
      }
    }
  }

  private updateActiveScheduleWithCurrentCourses(): void {
    const activeId = this.state.activeScheduleId;
    if (!activeId) return;
    if (!this.state.schedules.some(s => s.id === activeId)) return;
    const currentCourses = [...this.state.selectedCourses];
    this.state.schedules = this.state.schedules.map(s =>
      s.id === activeId ? { ...s, selectedCourses: currentCourses } : s,
    );
  }

  private generateScheduleId(): string {
    return `schedule_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Wipes every key and schedule this app stores, writes the fresh starting
   * schedule, then reloads the page: the theme, degree record, panel widths and
   * disclosure state all live outside this class, and reloading is what makes
   * the screen match storage. Other tabs are told to reload only once the fresh
   * schedule is written, so each finds it instead of making its own, and none
   * can write a stale copy back over the cleared store.
   */
  async clearAllData(): Promise<{ success: boolean; error?: string }> {
    // Whatever is still being written is moot, and must not land after the
    // clear and bring the data back.
    this.discardingState = true;
    try {
      await Promise.allSettled([...this.pendingSavePromises]);
      const result = await this.storageManager.clearAllDataComplete();
      if (!result.success) {
        this.discardingState = false;
        return {
          success: false,
          error: result.error?.message || 'Failed to clear storage',
        };
      }

      this.savedSchedules.clear();
      this.savedPreferences = null;
      this.savedActiveId = undefined;
      this.undoRedoManager.clear();
      this.state.schedules = [];
      this.state.selectedCourses = [];
      this.state.activeScheduleId = null;
      this.state.preferences = { theme: 'wpi-dark', bookmarkedCourseIds: [] };

      this.discardingState = false;
      const fresh = this.createSchedule('My Schedule', 'system');
      this.setActiveSchedule(fresh.id, 'system');
      await Promise.allSettled([...this.pendingSavePromises]);

      this.discardingState = true;
      this.storageManager.announceCleared();
      window.location.reload();
      return { success: true };
    } catch (error) {
      this.discardingState = false;
      return {
        success: false,
        error: `Failed to clear data: ${errorMessage(error)}`,
      };
    }
  }

  /** One notice for rows the load had to leave out. */
  private reportUnreadable(report: LoadReport): void {
    const lines: string[] = [];
    if (report.unreadable > 0) {
      lines.push(
        `${report.unreadable} saved schedule${report.unreadable === 1 ? '' : 's'} could not be read and ${report.unreadable === 1 ? 'was' : 'were'} skipped.`,
      );
    }
    if (report.newerVersion > 0) {
      lines.push(
        `${report.newerVersion} saved schedule${report.newerVersion === 1 ? ' was' : 's were'} written by a newer version of the planner and ${report.newerVersion === 1 ? 'was' : 'were'} skipped.`,
      );
    }
    if (report.dropped > 0) {
      lines.push(
        `${report.dropped} course${report.dropped === 1 ? '' : 's'} or event${report.dropped === 1 ? '' : 's'} inside your schedules could not be read and ${report.dropped === 1 ? 'was' : 'were'} left out.`,
      );
    }
    if (lines.length === 0) return;
    lines.push('Nothing was deleted from storage.');
    showConfirm({
      title: 'Some saved data could not be loaded',
      message: lines.join('\n'),
      confirmLabel: 'OK',
      notice: true,
      onConfirm: () => {},
    });
  }

  /** Re-reads one schedule another tab changed and shows that copy. */
  private async adoptStoredSchedule(id: string): Promise<void> {
    const loaded = await this.storageManager.loadSchedule(id);
    if (!loaded.valid) return;
    if (!loaded.data) {
      this.dropScheduleLocally(id);
      return;
    }
    const resolved: Schedule = {
      ...loaded.data,
      selectedCourses: this.resolveCourseReferences(
        loaded.data.selectedCourses,
      ),
    };
    const known = this.state.schedules.some(s => s.id === id);
    this.state.schedules = known
      ? this.state.schedules.map(s => (s.id === id ? resolved : s))
      : [...this.state.schedules, resolved];
    this.savedSchedules.set(id, resolved);

    if (id === this.state.activeScheduleId) {
      this.state.selectedCourses = resolved.selectedCourses;
      this.signalActivation('remote');
    }
  }

  /** Removes a schedule that is gone from storage, without writing anything. */
  private dropScheduleLocally(id: string): void {
    this.savedSchedules.delete(id);
    if (!this.state.schedules.some(s => s.id === id)) return;

    this.state.schedules = this.state.schedules.filter(s => s.id !== id);
    if (id !== this.state.activeScheduleId) return;

    const next = this.state.schedules[0];
    if (next) {
      this.state.activeScheduleId = next.id;
      this.state.selectedCourses = next.selectedCourses;
      this.signalActivation('remote');
    } else {
      // The other tab deleted the last one (or cleared everything).
      const fresh = this.createSchedule('My Schedule', 'system');
      this.setActiveSchedule(fresh.id, 'system');
    }
  }

  private async onRemoteChange(change: RemoteChange): Promise<void> {
    try {
      if (change.type === 'cleared') {
        this.discardingState = true;
        window.location.reload();
      } else if (change.type === 'preferences') {
        const loaded = this.storageManager.loadPreferences();
        if (loaded.valid) {
          this.state.preferences = loaded.data;
          this.savedPreferences = loaded.data;
        }
      } else if (change.type === 'deleted') {
        this.dropScheduleLocally(change.id);
      } else {
        await this.adoptStoredSchedule(change.id);
      }
    } catch (error) {
      logger.error('Could not apply a change from another tab:', error);
    }
  }

  /**
   * A write was refused because another tab changed or deleted the schedule
   * meanwhile. The other tab's version stays; the student is told that this
   * tab's latest edit to it did not make it.
   */
  private async resolveWriteConflict(
    schedule: Schedule,
    conflict: WriteConflict,
  ): Promise<void> {
    if (conflict === 'deleted') {
      this.dropScheduleLocally(schedule.id);
    } else {
      await this.adoptStoredSchedule(schedule.id);
    }
    showConfirm({
      title: 'Schedule changed in another tab',
      message:
        conflict === 'deleted'
          ? `"${schedule.name}" was deleted in another tab, so your latest change to it was not saved.`
          : `"${schedule.name}" was changed in another tab, so your latest change to it was not saved. The newer version is shown.`,
      confirmLabel: 'OK',
      notice: true,
      onConfirm: () => {},
    });
  }
}
