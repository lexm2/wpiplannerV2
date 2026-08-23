import type {
  Schedule,
  SchedulePreferences,
  SelectedCourse,
  ComponentKind,
  Course,
  Section,
  SectionsByKind,
  Department,
} from '../../types';
import { ApplicationState, COMPONENT_KINDS } from '../../types';
import { ScheduleState } from '../../types/ScheduleState';
import type { TransactionResult } from '../storage';
import { TransactionalStorageManager } from '../storage';
import { getAllSections, setReplacer, setReviver, logger } from '../../utils';
import { UndoRedoManager } from './UndoRedoManager';
import { appState } from './appState.svelte';
import { TermBoundsService } from '../../utils/termBounds';

export interface ProfileState {
  activeScheduleId: string | null;
  schedules: Schedule[];
  selectedCourses: SelectedCourse[];
  preferences: SchedulePreferences;
  isLoading: boolean;
  lastSaved: number;
  hasUnsavedChanges: boolean;
}

/** Single source of truth for application state with synchronous persistence and event-driven updates. */
export class ProfileStateManager {
  private static instance: ProfileStateManager | null = null;
  private storageManager: TransactionalStorageManager;
  private isLoadingFlag = false;
  private allDepartments: Department[] = [];
  private undoRedoManager: UndoRedoManager;
  private isRestoringState = false;
  private pendingSavePromises = new Set<Promise<void>>();
  private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
  public isBatchUpdate = false; // Flag to suppress individual event emissions during batch updates

  private constructor(storageManager?: TransactionalStorageManager) {
    this.storageManager = storageManager || new TransactionalStorageManager();
    this.undoRedoManager = new UndoRedoManager();
    this.setupBeforeUnloadHandler();
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

  public static resetInstance(): void {
    if (ProfileStateManager.instance) {
      ProfileStateManager.instance.destroy();
      ProfileStateManager.instance = null;
    }
  }

  private setupBeforeUnloadHandler(): void {
    if (typeof window === 'undefined') return;

    this.beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      if (this.pendingSavePromises.size > 0) {
        // Calling preventDefault() triggers the browser's "leave site?" prompt;
        // the legacy returnValue mechanism is deprecated and no longer needed.
        e.preventDefault();
      }
    };

    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  destroy(): void {
    if (this.beforeUnloadHandler && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
  }

  setCourseData(departments: Department[]): void {
    this.allDepartments = departments;
    logger.log(
      `[CATALOG] Course catalog set with ${departments.length} departments`,
    );
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

  hasUnsavedChanges(): boolean {
    return this.state.hasUnsavedChanges;
  }

  hasPendingSaves(): boolean {
    return this.pendingSavePromises.size > 0;
  }

  isLoading(): boolean {
    return this.state.isLoading || this.isLoadingFlag;
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
        this.state.selectedCourses = [
          ...this.state.selectedCourses,
          selectedCourse,
        ];
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

  clearAllSelections(_source: string = 'user'): void {
    this.withStateUpdate(() => {
      this.state.selectedCourses = [];
      this.updateActiveScheduleWithCurrentCourses();
    });
  }

  lockSection(
    course: Course,
    sectionCrn: string,
    _source: string = 'user',
  ): void {
    this.withStateUpdate(() => {
      const found = this.patchSelectedCourse(course.id, sc => {
        const lockedSections = new Set(sc.lockedSections ?? []);
        lockedSections.add(sectionCrn);
        return { ...sc, lockedSections };
      });
      if (found) {
        this.updateActiveScheduleWithCurrentCourses();
      }
    });
  }

  unlockSection(
    course: Course,
    sectionCrn: string,
    _source: string = 'user',
  ): void {
    this.withStateUpdate(() => {
      let changed = false;
      this.patchSelectedCourse(course.id, sc => {
        if (sc.lockedSections?.has(sectionCrn)) {
          const lockedSections = new Set(sc.lockedSections);
          lockedSections.delete(sectionCrn);
          changed = true;
          return { ...sc, lockedSections };
        }
        return sc;
      });
      if (changed) {
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

  isSectionLocked(course: Course, sectionCrn: string): boolean {
    const selectedCourse = this.state.selectedCourses.find(
      sc => sc.course.id === course.id,
    );
    return selectedCourse?.lockedSections?.has(sectionCrn) || false;
  }

  getLockedSections(course: Course): Set<string> {
    const selectedCourse = this.state.selectedCourses.find(
      sc => sc.course.id === course.id,
    );
    return selectedCourse?.lockedSections || new Set();
  }

  getNewestAcademicYear(): number | undefined {
    const years = this.allDepartments
      .flatMap(d => d.courses)
      .map(c => c.academicYear)
      .filter(Boolean) as number[];
    return years.length ? Math.max(...years) : undefined;
  }

  /**
   * The academic year to select by default: the current academic year (date-driven,
   * from term bounds) when course data exists for it, otherwise the newest year with data.
   */
  getDefaultAcademicYear(): number | undefined {
    const available = new Set(
      this.allDepartments
        .flatMap(d => d.courses)
        .map(c => c.academicYear)
        .filter(Boolean) as number[],
    );
    if (!available.size) return undefined;
    const current = TermBoundsService.getInstance().getCurrentAcademicYear();
    if (current !== null && available.has(current)) return current;
    return Math.max(...available); // fallback: newest year with data
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
    const isAutomated =
      source === 'calendar-event-exclusion' || source === 'storage-service';
    const update = () => {
      const index = this.state.schedules.findIndex(s => s.id === scheduleId);
      if (index < 0) return false;

      const updated = { ...this.state.schedules[index], ...updates };
      this.state.schedules = this.state.schedules.map(s =>
        s.id === scheduleId ? updated : s,
      );

      if (scheduleId === this.state.activeScheduleId) {
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

      // Don't allow deleting if it's the only schedule
      if (this.state.schedules.length <= 1) {
        logger.warn('Cannot delete the only remaining schedule');
        return false;
      }

      this.state.schedules = this.state.schedules.filter(
        s => s.id !== scheduleId,
      );

      const deleteResult = await this.storageManager.deleteSchedule(scheduleId);
      if (!deleteResult.success) {
        logger.warn(
          'Failed to delete schedule from storage:',
          deleteResult.error,
        );
      }

      // If we deleted the active schedule, switch to another one
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

  async undo(): Promise<boolean> {
    const snapshot = this.undoRedoManager.undo();
    if (!snapshot) return false;

    this.isRestoringState = true;
    try {
      this.restoreFromSnapshot(snapshot);
      this.save();
      return true;
    } finally {
      this.isRestoringState = false;
    }
  }

  async redo(): Promise<boolean> {
    const snapshot = this.undoRedoManager.redo();
    if (!snapshot) return false;

    this.isRestoringState = true;
    try {
      this.restoreFromSnapshot(snapshot);
      this.save();
      return true;
    } finally {
      this.isRestoringState = false;
    }
  }

  private restoreFromSnapshot(snapshot: {
    activeScheduleId: string | null;
    schedules: Map<string, Schedule>;
    preferences: SchedulePreferences;
  }): void {
    this.state.activeScheduleId = snapshot.activeScheduleId;

    const schedulesArray = Array.from(
      snapshot.schedules.values(),
    ) as Schedule[];
    this.state.schedules = this.deepClone(schedulesArray);
    this.state.preferences = this.deepClone(snapshot.preferences);

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

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj, setReplacer), setReviver);
  }

  restoreTutorialState(data: {
    activeScheduleId: string | null;
    schedules: Schedule[];
    preferences: SchedulePreferences;
  }): void {
    this.isRestoringState = true;
    try {
      const schedulesMap = new Map(data.schedules.map(s => [s.id, s]));
      this.restoreFromSnapshot({
        activeScheduleId: data.activeScheduleId,
        schedules: schedulesMap,
        preferences: data.preferences,
      });
      this.save(true);
    } finally {
      this.isRestoringState = false;
    }
  }

  canUndo(): boolean {
    return this.undoRedoManager.canUndo();
  }

  canRedo(): boolean {
    return this.undoRedoManager.canRedo();
  }

  save(skipSnapshot = false): void {
    const savePromise = this.executeSave(skipSnapshot);
    this.pendingSavePromises.add(savePromise);

    savePromise
      .catch(error => logger.error('Save failed:', error))
      .finally(() => this.pendingSavePromises.delete(savePromise));
  }

  private async executeSave(skipSnapshot = false): Promise<void> {
    try {
      if (!this.isRestoringState && !skipSnapshot) {
        const schedulesMap = new Map(this.state.schedules.map(s => [s.id, s]));
        this.undoRedoManager.captureSnapshot(
          this.state.activeScheduleId,
          schedulesMap,
          this.state.preferences,
        );
      }

      this.storageManager.saveActiveScheduleId(this.state.activeScheduleId);

      const savePromises = this.state.schedules.map(schedule => {
        const scheduleToSave = {
          ...schedule,
          selectedCourses: schedule.selectedCourses.filter(
            sc => !sc.course.transient,
          ),
        };
        return this.storageManager.saveSchedule(scheduleToSave);
      });
      await Promise.all(savePromises);

      this.storageManager.savePreferences(this.state.preferences);

      this.state.hasUnsavedChanges = false;
      this.state.lastSaved = Date.now();
    } catch (error) {
      logger.error('Save failed:', error);
    }
  }

  async loadFromStorage(): Promise<boolean> {
    // Prevent concurrent calls - if already loading, skip this call
    if (this.isLoadingFlag) {
      return false;
    }

    // Skip if already loaded with schedules (redundant call prevention)
    if (this.state.schedules.length > 0 && !this.state.isLoading) {
      return true;
    }

    try {
      this.state.isLoading = true;
      this.isLoadingFlag = true;

      const preferencesResult = this.storageManager.loadPreferences();
      if (preferencesResult.valid && preferencesResult.data) {
        this.state.preferences = preferencesResult.data;
      }

      const schedulesResult = await this.storageManager.loadAllSchedules();

      if (schedulesResult.valid && schedulesResult.data) {
        this.state.schedules = schedulesResult.data
          .filter(s => !s.id.startsWith('tutorial_'))
          .map(s => ({
            ...s,
            selectedCourses: this.resolveCourseReferences(s.selectedCourses),
          }));
      }

      const activeIdResult = this.storageManager.loadActiveScheduleId();
      if (activeIdResult.valid && activeIdResult.data) {
        this.state.activeScheduleId = activeIdResult.data;
      }

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

      // If no schedules exist, create a default one
      if (this.state.schedules.length === 0) {
        logger.log('No schedules found, creating default schedule');
        const defaultSchedule = this.createSchedule('My Schedule', 'system');
        this.state.activeScheduleId = defaultSchedule.id;
      }

      // If no active schedule but schedules exist, set the last one as active
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

  parseImportCourses(data: string): SelectedCourse[] {
    const parsed = JSON.parse(data);
    const applicationState = ApplicationState.fromMinimalFormat(
      parsed,
      this.allDepartments,
    );
    return applicationState.schedules[0]?.toSchedule().selectedCourses ?? [];
  }

  async importData(data: string): Promise<TransactionResult> {
    try {
      const parsed = JSON.parse(data);
      const applicationState = ApplicationState.fromMinimalFormat(
        parsed,
        this.allDepartments,
      );
      const schedules = applicationState.schedules.map(s => s.toSchedule());

      const result = await this.storageManager.importData(
        schedules,
        applicationState.activeScheduleId,
        applicationState.preferences,
      );

      if (result.success) {
        this.state.schedules = [];
        this.state.selectedCourses = [];
        this.state.activeScheduleId = null;
        await this.loadFromStorage();
      } else {
        logger.error('[ProfileStateManager] Import failed:', result.error);
      }

      return result;
    } catch (error) {
      logger.error('[ProfileStateManager] importData() failed:', error);
      return {
        success: false,
        transactionId: `import-${Date.now()}`,
        error: error as Error,
      };
    }
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
  ): SelectedCourse[] {
    if (this.allDepartments.length === 0) {
      logger.warn(
        'Course catalog not available, skipping section reference resolution',
      );
      return selectedCourses;
    }

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
          return null;
        }

        if (
          typeof liveSection.computedTerm !== 'string' ||
          !['A', 'B', 'C', 'D'].includes(liveSection.computedTerm)
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

      // Spread the stored course rather than naming each field: this used to
      // be an allowlist rebuild, which silently dropped every field it didn't
      // mention (allowedTerms) and would drop the next one anyone adds.
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

  /** Reset reactive state back to defaults (immutable reassignment). */
  private resetState(): void {
    appState.activeScheduleId = null;
    appState.schedules = [];
    appState.selectedCourses = [];
    appState.preferences = { theme: 'wpi-dark', bookmarkedCourseIds: [] };
    appState.isLoading = false;
    appState.lastSaved = 0;
    appState.hasUnsavedChanges = false;
  }

  /**
   * Signal that the active schedule was (re)activated or its metadata changed
   * (the old `active_schedule_changed` event). Publishes a fresh activation
   * event object; consumers `watch` it and read `.source` to branch on origin.
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

  /** Synchronous version of withBatch for non-async batch operations. */
  withBatchSync<T>(fn: () => T): T {
    const wasBatch = this.isBatchUpdate;
    if (!wasBatch) {
      this.isBatchUpdate = true;
    }

    try {
      const result = fn();
      return result;
    } finally {
      if (!wasBatch) {
        this.isBatchUpdate = false;
        this.save();
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

  async getStorageStats() {
    return this.storageManager.getStorageStats();
  }

  async clearAllData(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.storageManager.clearAllDataComplete();
      if (!result.success) {
        return {
          success: false,
          error: result.error?.message || 'Failed to clear storage',
        };
      }

      this.resetState();
      this.undoRedoManager.clear();

      const defaultSchedule = this.createSchedule('My Schedule', 'system');
      this.setActiveSchedule(defaultSchedule.id, 'system');

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to clear data: ${error}`,
      };
    }
  }
}
