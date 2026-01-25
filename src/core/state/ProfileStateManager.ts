import type { Schedule, SchedulePreferences, SelectedCourse, Course, Section, Department } from '../../types'
import { ApplicationState } from '../../types'
import { ScheduleState } from '../../types/ScheduleState'
import type { TransactionResult } from '../storage'
import { TransactionalStorageManager } from '../storage'
import { getAllSections, createJSONReplacer, createJSONReviver, logger } from '../../utils'
import { UndoRedoManager } from './UndoRedoManager'
import { ModalService } from '../../services/ui'

export interface StateChangeEvent {
    type: 'schedule_changed' | 'courses_changed' | 'preferences_changed' | 'active_schedule_changed' | 'save_state_changed';
    data: any;
    timestamp: number;
    source: string;
}

export interface ProfileState {
    activeScheduleId: string | null;
    schedules: Schedule[];
    selectedCourses: SelectedCourse[];
    preferences: SchedulePreferences;
    isLoading: boolean;
    lastSaved: number;
    hasUnsavedChanges: boolean;
}

export type StateChangeListener = (event: StateChangeEvent, state: ProfileState) => void;

/**
 * Single source of truth for application state with synchronous persistence and event-driven updates
 */
export class ProfileStateManager {
    private static instance: ProfileStateManager | null = null;
    private state: ProfileState;
    private listeners = new Set<StateChangeListener>();
    private storageManager: TransactionalStorageManager;
    private isLoadingFlag = false;
    private eventQueue: StateChangeEvent[] = [];
    private processingQueue = false;
    private allDepartments: Department[] = [];
    private undoRedoManager: UndoRedoManager;
    private isRestoringState = false;
    private pendingSavePromises = new Set<Promise<void>>();
    private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
    private modalService: ModalService | null = null;
    public isBatchUpdate = false; // Flag to suppress individual event emissions during batch updates

    private constructor(storageManager?: TransactionalStorageManager) {
        this.storageManager = storageManager || new TransactionalStorageManager();
        this.state = this.createInitialState();
        this.undoRedoManager = new UndoRedoManager();
        this.setupBeforeUnloadHandler();
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

    setModalService(modalService: ModalService): void {
        this.modalService = modalService;
    }

    private setupBeforeUnloadHandler(): void {
        if (typeof window === 'undefined') return;

        this.beforeUnloadHandler = (e: BeforeUnloadEvent) => {
            if (this.pendingSavePromises.size > 0) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        };

        window.addEventListener('beforeunload', this.beforeUnloadHandler);
    }

    destroy(): void {
        if (this.beforeUnloadHandler && typeof window !== 'undefined') {
            window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        }
        this.removeAllListeners();
    }

    setCourseData(departments: Department[]): void {
        this.allDepartments = departments;
        logger.log(`[CATALOG] Course catalog set with ${departments.length} departments`);
    }

    // Public API for state access
    getState(): Readonly<ProfileState> {
        return { ...this.state };
    }

    getActiveSchedule(): Schedule | null {
        if (!this.state.activeScheduleId) return null;
        return this.state.schedules.find(s => s.id === this.state.activeScheduleId) || null;
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

    // Course selection methods
    selectCourse(course: Course, isRequired: boolean = false, source: string = 'user'): void {
        this.withStateUpdate(() => {
            const existingIndex = this.state.selectedCourses.findIndex(sc => sc.course.id === course.id);
            
            if (existingIndex >= 0) {
                // Update existing selection
                this.state.selectedCourses[existingIndex] = {
                    ...this.state.selectedCourses[existingIndex],
                    isRequired
                };
            } else {
                // Add new selection
                const selectedCourse: SelectedCourse = {
                    course,
                    selectedLecture: null,
                    selectedDiscussion: null,
                    selectedLab: null,
                    selectedSection: null,
                    selectedSectionNumber: null,
                    isRequired,
                    lockedSections: new Set()
                };
                this.state.selectedCourses.push(selectedCourse);
            }

            this.updateActiveScheduleWithCurrentCourses();
            this.emitEvent('courses_changed', { course, action: 'selected', isRequired }, source);
        });
    }

    unselectCourse(course: Course, source: string = 'user'): void {
        this.withStateUpdate(() => {
            const index = this.state.selectedCourses.findIndex(sc => sc.course.id === course.id);
            if (index >= 0) {
                this.state.selectedCourses.splice(index, 1);
                this.updateActiveScheduleWithCurrentCourses();
                this.emitEvent('courses_changed', { course, action: 'unselected' }, source);
            }
        });
    }

    setSelectedSection(course: Course, sectionNumber: string | null, source: string = 'user'): void {
        this.withStateUpdate(() => {
            const selectedCourse = this.state.selectedCourses.find(sc => sc.course.id === course.id);
            if (!selectedCourse) return;

            // If clearing selection
            if (!sectionNumber) {
                selectedCourse.selectedLecture = null;
                selectedCourse.selectedDiscussion = null;
                selectedCourse.selectedLab = null;
                this.updateActiveScheduleWithCurrentCourses();
                this.emitEvent('courses_changed', { course, sectionNumber, action: 'section_changed' }, source);
                return;
            }

            // Find the section - check lectures first
            if (course.lectures) {
                for (const lectureGroup of course.lectures) {
                    if (lectureGroup.section.number === sectionNumber) {
                        selectedCourse.selectedLecture = lectureGroup.section;
                        this.updateActiveScheduleWithCurrentCourses();
                        this.emitEvent('courses_changed', { course, sectionNumber, action: 'section_changed' }, source);
                        return;
                    }
                    // Check discussions
                    const discussion = lectureGroup.compatibleDiscussions.find(d => d.number === sectionNumber);
                    if (discussion) {
                        selectedCourse.selectedDiscussion = discussion;
                        this.updateActiveScheduleWithCurrentCourses();
                        this.emitEvent('courses_changed', { course, sectionNumber, action: 'section_changed' }, source);
                        return;
                    }
                    // Check labs
                    const lab = lectureGroup.compatibleLabs.find(l => l.number === sectionNumber);
                    if (lab) {
                        selectedCourse.selectedLab = lab;
                        this.updateActiveScheduleWithCurrentCourses();
                        this.emitEvent('courses_changed', { course, sectionNumber, action: 'section_changed' }, source);
                        return;
                    }
                }
            }

            // Check standalone labs
            if (course.standaloneLabs) {
                const lab = course.standaloneLabs.find(l => l.number === sectionNumber);
                if (lab) {
                    selectedCourse.selectedLab = lab;
                    this.updateActiveScheduleWithCurrentCourses();
                    this.emitEvent('courses_changed', { course, sectionNumber, action: 'section_changed' }, source);
                    return;
                }
            }

            logger.warn(`Section ${sectionNumber} not found in course ${course.department.abbreviation}${course.number}`);
        });
    }

    setSelectedComponents(
        course: Course,
        lecture: Section | null,
        discussion: Section | null,
        lab: Section | null,
        source: string = 'user'
    ): void {
        this.withStateUpdate(() => {
            const selectedCourse = this.state.selectedCourses.find(sc => sc.course.id === course.id);
            if (selectedCourse) {
                selectedCourse.selectedLecture = lecture;
                selectedCourse.selectedDiscussion = discussion;
                selectedCourse.selectedLab = lab;

                this.updateActiveScheduleWithCurrentCourses();
                this.emitEvent('courses_changed', {
                    course,
                    lecture: lecture?.number,
                    discussion: discussion?.number,
                    lab: lab?.number,
                    action: 'components_changed'
                }, source);
            }
        });
    }

    clearAllSelections(source: string = 'user'): void {
        this.withStateUpdate(() => {
            this.state.selectedCourses = [];
            this.updateActiveScheduleWithCurrentCourses();
            this.emitEvent('courses_changed', { action: 'cleared' }, source);
        });
    }

    lockSection(course: Course, sectionCrn: string, source: string = 'user'): void {
        this.withStateUpdate(() => {
            const selectedCourse = this.state.selectedCourses.find(sc => sc.course.id === course.id);
            if (selectedCourse) {
                if (!selectedCourse.lockedSections) {
                    selectedCourse.lockedSections = new Set();
                }
                selectedCourse.lockedSections.add(sectionCrn);
                this.updateActiveScheduleWithCurrentCourses();
                this.emitEvent('courses_changed', { course, sectionCrn, action: 'section_locked' }, source);
            }
        });
    }

    unlockSection(course: Course, sectionCrn: string, source: string = 'user'): void {
        this.withStateUpdate(() => {
            const selectedCourse = this.state.selectedCourses.find(sc => sc.course.id === course.id);
            if (selectedCourse && selectedCourse.lockedSections) {
                selectedCourse.lockedSections.delete(sectionCrn);
                this.updateActiveScheduleWithCurrentCourses();
                this.emitEvent('courses_changed', { course, sectionCrn, action: 'section_unlocked' }, source);
            }
        });
    }

    setCourseColor(courseId: string, color: string, source: string = 'user'): void {
        this.withStateUpdate(() => {
            const selectedCourse = this.state.selectedCourses.find(sc => sc.course.id === courseId);
            if (selectedCourse) {
                selectedCourse.customColor = color;
                this.updateActiveScheduleWithCurrentCourses();
                this.emitEvent('courses_changed', {
                    action: 'color_changed',
                    courseId,
                    color
                }, source);
            }
        });
    }

    isSectionLocked(course: Course, sectionCrn: string): boolean {
        const selectedCourse = this.state.selectedCourses.find(sc => sc.course.id === course.id);
        return selectedCourse?.lockedSections?.has(sectionCrn) || false;
    }

    getLockedSections(course: Course): Set<string> {
        const selectedCourse = this.state.selectedCourses.find(sc => sc.course.id === course.id);
        return selectedCourse?.lockedSections || new Set();
    }

    // Schedule management methods
    createSchedule(name: string, source: string = 'user'): Schedule {
        return this.withStateUpdateSync(() => {
            const schedule: Schedule = {
                id: this.generateScheduleId(),
                name,
                selectedCourses: [...this.state.selectedCourses],
                generatedSchedules: []
            };

            this.state.schedules.push(schedule);
            this.emitEvent('schedule_changed', { schedule, action: 'created' }, source);
            return schedule;
        });
    }


    setActiveSchedule(scheduleId: string, source: string = 'user'): boolean {
        return this.withStateUpdateSync(() => {
            const schedule = this.state.schedules.find(s => s.id === scheduleId);
            if (!schedule) return false;

            this.isLoadingFlag = true;
            this.state.activeScheduleId = scheduleId;

            // Clear undo history when switching schedules
            this.undoRedoManager.clear();

            // Load schedule's courses and resolve section references
            const loadedCourses = [...schedule.selectedCourses];
            this.state.selectedCourses = this.resolveCourseReferences(loadedCourses);

            this.emitEvent('active_schedule_changed', { schedule }, source);
            this.emitEvent('courses_changed', { action: 'loaded_from_schedule', schedule }, source);

            this.isLoadingFlag = false;
            return true;
        });
    }

    updateSchedule(scheduleId: string, updates: Partial<Schedule>, source: string = 'user'): boolean {
        return this.withStateUpdateSync(() => {
            const index = this.state.schedules.findIndex(s => s.id === scheduleId);
            if (index < 0) return false;

            this.state.schedules[index] = { ...this.state.schedules[index], ...updates };
            
            // If this is the active schedule, emit active schedule changed event
            if (scheduleId === this.state.activeScheduleId) {
                this.emitEvent('active_schedule_changed', { schedule: this.state.schedules[index] }, source);
            }
            
            this.emitEvent('schedule_changed', { schedule: this.state.schedules[index], action: 'updated' }, source);
            return true;
        });
    }

    async deleteSchedule(scheduleId: string, source: string = 'user'): Promise<boolean> {
        return this.withStateUpdateAsync(async () => {
            const scheduleIndex = this.state.schedules.findIndex(s => s.id === scheduleId);
            if (scheduleIndex < 0) return false;

            // Don't allow deleting if it's the only schedule
            if (this.state.schedules.length <= 1) {
                logger.warn('Cannot delete the only remaining schedule');
                return false;
            }

            const deletedSchedule = this.state.schedules[scheduleIndex];
            this.state.schedules.splice(scheduleIndex, 1);

            // Remove from storage
            const deleteResult = await this.storageManager.deleteSchedule(scheduleId);
            if (!deleteResult.success) {
                logger.warn('Failed to delete schedule from storage:', deleteResult.error);
            }

            // If we deleted the active schedule, switch to another one
            if (this.state.activeScheduleId === scheduleId) {
                const nextSchedule = this.state.schedules[0];
                this.state.activeScheduleId = nextSchedule.id;
                this.state.selectedCourses = [...nextSchedule.selectedCourses];
                this.emitEvent('active_schedule_changed', { schedule: nextSchedule }, source);
            }

            this.emitEvent('schedule_changed', { schedule: deletedSchedule, action: 'deleted' }, source);
            return true;
        });
    }

    renameSchedule(scheduleId: string, newName: string, source: string = 'user'): boolean {
        return this.updateSchedule(scheduleId, { name: newName }, source);
    }

    duplicateSchedule(scheduleId: string, newName: string, source: string = 'user'): Schedule | null {
        const originalSchedule = this.state.schedules.find(s => s.id === scheduleId);
        if (!originalSchedule) return null;

        return this.withStateUpdateSync(() => {
            const duplicatedSchedule: Schedule = {
                id: this.generateScheduleId(),
                name: newName,
                selectedCourses: [...originalSchedule.selectedCourses],
                generatedSchedules: [...originalSchedule.generatedSchedules]
            };

            this.state.schedules.push(duplicatedSchedule);
            this.emitEvent('schedule_changed', { schedule: duplicatedSchedule, action: 'duplicated' }, source);
            return duplicatedSchedule;
        });
    }

    // Preferences management
    updatePreferences(updates: Partial<SchedulePreferences>, source: string = 'user'): void {
        this.withStateUpdate(() => {
            this.state.preferences = { ...this.state.preferences, ...updates };
            this.emitEvent('preferences_changed', { preferences: this.state.preferences }, source);
        });
    }

    // Bookmark management
    bookmarkCourse(courseId: string, source: string = 'user'): void {
        this.withStateUpdate(() => {
            const bookmarks = this.state.preferences.bookmarkedCourseIds ?? [];
            if (!bookmarks.includes(courseId)) {
                this.state.preferences = {
                    ...this.state.preferences,
                    bookmarkedCourseIds: [...bookmarks, courseId]
                };
                this.emitEvent('preferences_changed', {
                    preferences: this.state.preferences,
                    action: 'bookmark_added',
                    courseId
                }, source);
            }
        });
    }

    unbookmarkCourse(courseId: string, source: string = 'user'): void {
        this.withStateUpdate(() => {
            const bookmarks = this.state.preferences.bookmarkedCourseIds ?? [];
            const index = bookmarks.indexOf(courseId);
            if (index >= 0) {
                this.state.preferences = {
                    ...this.state.preferences,
                    bookmarkedCourseIds: bookmarks.filter(id => id !== courseId)
                };
                this.emitEvent('preferences_changed', {
                    preferences: this.state.preferences,
                    action: 'bookmark_removed',
                    courseId
                }, source);
            }
        });
    }

    isBookmarked(courseId: string): boolean {
        return this.state.preferences.bookmarkedCourseIds?.includes(courseId) ?? false;
    }

    getBookmarkedCourseIds(): string[] {
        return [...(this.state.preferences.bookmarkedCourseIds ?? [])];
    }

    // Event handling
    addListener(listener: StateChangeListener): void {
        this.listeners.add(listener);
    }

    removeListener(listener: StateChangeListener): void {
        this.listeners.delete(listener);
    }

    removeAllListeners(): void {
        this.listeners.clear();
    }

    // Undo/Redo methods
    async undo(): Promise<boolean> {
        const snapshot = this.undoRedoManager.undo();
        if (!snapshot) return false;

        this.isRestoringState = true;
        try {
            this.restoreFromSnapshot(snapshot);
            this.emitEvent('courses_changed', { action: 'undo' }, 'system');
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
            this.emitEvent('courses_changed', { action: 'redo' }, 'system');
            this.save();
            return true;
        } finally {
            this.isRestoringState = false;
        }
    }

    private restoreFromSnapshot(snapshot: any): void {
        this.state.activeScheduleId = snapshot.activeScheduleId;

        const schedulesArray = Array.from(snapshot.schedules.values()) as Schedule[];
        this.state.schedules = this.deepClone(schedulesArray);
        this.state.preferences = this.deepClone(snapshot.preferences);

        if (this.state.activeScheduleId) {
            const activeSchedule = this.state.schedules.find(s => s.id === this.state.activeScheduleId);
            if (activeSchedule) {
                this.state.selectedCourses = this.resolveCourseReferences(activeSchedule.selectedCourses);
            } else {
                this.state.selectedCourses = [];
            }
        } else {
            this.state.selectedCourses = [];
        }
    }

    private deepClone<T>(obj: T): T {
        return JSON.parse(JSON.stringify(obj, createJSONReplacer()), createJSONReviver());
    }

    canUndo(): boolean {
        return this.undoRedoManager.canUndo();
    }

    canRedo(): boolean {
        return this.undoRedoManager.canRedo();
    }

    onUndoRedoChange(listener: () => void): () => void {
        return this.undoRedoManager.onChange(listener);
    }

    save(): void {
        const savePromise = this.executeSave();
        this.pendingSavePromises.add(savePromise);

        savePromise
            .catch(error => logger.error('Save failed:', error))
            .finally(() => this.pendingSavePromises.delete(savePromise));
    }

    private async executeSave(): Promise<void> {
        try {
            // Capture snapshot before saving (unless we're restoring from undo/redo)
            if (!this.isRestoringState) {
                const schedulesMap = new Map(this.state.schedules.map(s => [s.id, s]));
                this.undoRedoManager.captureSnapshot(
                    this.state.activeScheduleId,
                    schedulesMap,
                    this.state.preferences
                );
            }

            this.storageManager.saveActiveScheduleId(this.state.activeScheduleId);

            const savePromises = this.state.schedules.map(schedule =>
                this.storageManager.saveSchedule(schedule)
            );
            await Promise.all(savePromises);

            this.storageManager.savePreferences(this.state.preferences);

            const previousUnsavedState = this.state.hasUnsavedChanges;
            this.state.hasUnsavedChanges = false;
            this.state.lastSaved = Date.now();

            if (previousUnsavedState) {
                this.emitEvent('save_state_changed', { hasUnsavedChanges: false }, 'system');
            }
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

            // Load preferences first
            const preferencesResult = this.storageManager.loadPreferences();
            if (preferencesResult.valid && preferencesResult.data) {
                this.state.preferences = preferencesResult.data;
            }

            // Load all schedules
            const schedulesResult = await this.storageManager.loadAllSchedules();

            if (schedulesResult.valid && schedulesResult.data) {
                this.state.schedules = schedulesResult.data;

                // Resolve course references for all schedules
                for (const schedule of this.state.schedules) {
                    schedule.selectedCourses = this.resolveCourseReferences(schedule.selectedCourses);
                }
            }

            // Load active schedule ID
            const activeIdResult = this.storageManager.loadActiveScheduleId();
            if (activeIdResult.valid && activeIdResult.data) {
                this.state.activeScheduleId = activeIdResult.data;
            }

            // Load selected courses from active schedule only (no fallback)
            let loadedCourses: SelectedCourse[] = [];
            if (this.state.activeScheduleId) {
                const activeSchedule = this.state.schedules.find(s => s.id === this.state.activeScheduleId);
                if (activeSchedule) {
                    loadedCourses = activeSchedule.selectedCourses;
                }
            }

            // Resolve references for active courses (already resolved in schedule, but ensure consistency)
            this.state.selectedCourses = loadedCourses;

            // Log what was loaded
            logger.log('%cLOADED - Parsed Data:', 'color: #2196F3; font-weight: bold');
            const loadedData = {
                activeScheduleId: this.state.activeScheduleId,
                schedulesCount: this.state.schedules.length,
                schedules: this.state.schedules.map(s => ({
                    id: s.id,
                    name: s.name,
                    coursesCount: s.selectedCourses.length,
                    selectedCourses: s.selectedCourses.map(sc => ({
                        courseId: sc.course.id,
                        courseName: `${sc.course.department.abbreviation}${sc.course.number}`,
                        selectedSection: sc.selectedSectionNumber,
                        isRequired: sc.isRequired
                    }))
                })),
                selectedCoursesCount: loadedCourses.length,
                selectedCourses: loadedCourses.map(sc => ({
                    courseId: sc.course.id,
                    courseName: `${sc.course.department.abbreviation}${sc.course.number}`,
                    selectedSection: sc.selectedSectionNumber
                }))
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
                this.state.activeScheduleId = this.state.schedules[this.state.schedules.length - 1].id;
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
        const appState = this.createApplicationState();
        const minimalData = appState.toMinimalFormat();
        return JSON.stringify(minimalData);
    }

    private createApplicationState(): ApplicationState {
        const schedules = this.state.schedules.map(s => ScheduleState.fromLegacySchedule(s));
        return new ApplicationState(
            this.state.activeScheduleId,
            schedules,
            this.state.preferences
        );
    }

    async importData(data: string): Promise<TransactionResult> {
        try {
            const parsed = JSON.parse(data);
            const appState = ApplicationState.fromMinimalFormat(parsed, this.allDepartments);
            const legacySchedules = appState.schedules.map(s => s.toLegacySchedule());

            const result = await this.storageManager.importData(
                legacySchedules,
                appState.activeScheduleId,
                appState.preferences
            );

            if (result.success) {
                this.state.schedules = [];
                this.state.selectedCourses = [];
                this.state.activeScheduleId = null;
                await this.loadFromStorage();
                this.emitEvent('schedule_changed', { action: 'imported' }, 'system');
            } else {
                console.error('[ProfileStateManager] Import failed:', result.error);
            }

            return result;
        } catch (error) {
            console.error('[ProfileStateManager] importData() failed:', error);
            return {
                success: false,
                transactionId: `import-${Date.now()}`,
                error: error as Error
            };
        }
    }

    // Health check
    isHealthy(): { healthy: boolean; issues: string[] } {
        const storageHealth = this.storageManager.isHealthy();
        const issues = [...storageHealth.issues];

        // Check state consistency
        if (this.state.activeScheduleId && !this.state.schedules.find(s => s.id === this.state.activeScheduleId)) {
            issues.push('Active schedule ID references non-existent schedule');
        }

        return {
            healthy: issues.length === 0,
            issues
        };
    }

    private resolveCourseReferences(selectedCourses: SelectedCourse[]): SelectedCourse[] {
        if (this.allDepartments.length === 0) {
            logger.warn('Course catalog not available, skipping section reference resolution');
            return selectedCourses;
        }

        logger.log(`Resolving course references for ${selectedCourses.length} courses`);

        return selectedCourses.map(selectedCourse => {
            const courseId = selectedCourse.course.id;

            let liveCourse: Course | undefined;
            for (const dept of this.allDepartments) {
                liveCourse = dept.courses.find(c => c.id === courseId);
                if (liveCourse) break;
            }

            if (!liveCourse) {
                logger.warn(`Course ${courseId} not found in catalog, keeping original reference`);
                return selectedCourse;
            }

            const resolveSection = (section: Section | null): Section | null => {
                if (!section || !liveCourse) return null;

                // Validate that section has required CRN field
                if (typeof section.crn !== 'number') {
                    logger.warn(`Section missing CRN field, cannot resolve for course ${courseId}`);
                    return null;
                }

                const allSections = getAllSections(liveCourse);
                const liveSection = allSections.find((s: Section) => s.crn === section.crn);

                if (!liveSection) {
                    logger.warn(`Section CRN ${section.crn} not found for course ${courseId}, section may no longer exist`);
                    return null;
                }

                // Verify resolved section has all required fields
                if (typeof liveSection.computedTerm !== 'string' || !['A', 'B', 'C', 'D'].includes(liveSection.computedTerm)) {
                    logger.error(`Resolved section CRN ${liveSection.crn} has invalid computedTerm: ${liveSection.computedTerm}`);
                }

                return liveSection;
            };

            const lockedSections = selectedCourse.lockedSections instanceof Set
                ? selectedCourse.lockedSections
                : new Set(Array.isArray(selectedCourse.lockedSections) ? selectedCourse.lockedSections : []);

            const resolved: SelectedCourse = {
                course: liveCourse,
                selectedLecture: resolveSection(selectedCourse.selectedLecture),
                selectedDiscussion: resolveSection(selectedCourse.selectedDiscussion),
                selectedLab: resolveSection(selectedCourse.selectedLab),
                selectedSection: resolveSection(selectedCourse.selectedSection),
                selectedSectionNumber: selectedCourse.selectedSectionNumber,
                isRequired: selectedCourse.isRequired,
                lockedSections
            };

            return resolved;
        });
    }

    // Private helper methods
    private createInitialState(): ProfileState {
        return {
            activeScheduleId: null,
            schedules: [],
            selectedCourses: [],
            preferences: {
                preferredTimeRange: {
                    startTime: { hours: 8, minutes: 0 },
                    endTime: { hours: 18, minutes: 0 }
                },
                preferredDays: new Set(['mon', 'tue', 'wed', 'thu', 'fri']),
                avoidBackToBackClasses: false,
                theme: 'wpi-dark',
                bookmarkedCourseIds: []
            },
            isLoading: false,
            lastSaved: 0,
            hasUnsavedChanges: false
        };
    }


    private withStateUpdate(updateFn: () => void): void {
        const previousUnsavedState = this.state.hasUnsavedChanges;
        updateFn();
        this.state.hasUnsavedChanges = true;

        // Emit save state change event if state actually changed
        if (!previousUnsavedState) {
            this.emitEvent('save_state_changed', { hasUnsavedChanges: true }, 'system');
        }

        // Skip save if in batch mode - batch will handle save at the end
        if (!this.isBatchUpdate) {
            this.save();
        }
    }

    private async withStateUpdateAsync<T>(updateFn: () => Promise<T>): Promise<T> {
        const previousUnsavedState = this.state.hasUnsavedChanges;
        const result = await updateFn();
        this.state.hasUnsavedChanges = true;

        // Emit save state change event if state actually changed
        if (!previousUnsavedState) {
            this.emitEvent('save_state_changed', { hasUnsavedChanges: true }, 'system');
        }

        // Skip save if in batch mode - batch will handle save at the end
        if (!this.isBatchUpdate) {
            this.save();
        }
        return result;
    }

    private withStateUpdateSync<T>(updateFn: () => T): T {
        const previousUnsavedState = this.state.hasUnsavedChanges;
        const result = updateFn();
        this.state.hasUnsavedChanges = true;

        // Emit save state change event if state actually changed
        if (!previousUnsavedState) {
            this.emitEvent('save_state_changed', { hasUnsavedChanges: true }, 'system');
        }

        // Skip save if in batch mode - batch will handle save at the end
        if (!this.isBatchUpdate) {
            this.save();
        }
        return result;
    }

    /**
     * Execute multiple state updates in batch mode (single save at end).
     * Automatically manages batch flag, saves once at completion, and emits sync event.
     *
     * @param fn - Function containing batch updates
     * @returns Result of the batch function
     *
     * @example
     * await profileStateManager.withBatch(async () => {
     *     for (const course of courses) {
     *         profileStateManager.selectCourse(course);
     *     }
     * });
     */
    async withBatch<T>(fn: () => Promise<T>): Promise<T> {
        const wasBatch = this.isBatchUpdate;
        if (!wasBatch) {
            this.isBatchUpdate = true;
        }

        try {
            return await fn();
        } finally {
            if (!wasBatch) {
                this.isBatchUpdate = false;
                this.save();
            }
        }
    }

    /**
     * Synchronous version of withBatch for non-async batch operations.
     *
     * @param fn - Function containing batch updates
     * @returns Result of the batch function
     *
     * @example
     * profileStateManager.withBatchSync(() => {
     *     for (const course of courses) {
     *         profileStateManager.selectCourse(course);
     *     }
     * });
     */
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
        if (this.state.activeScheduleId) {
            const activeScheduleIndex = this.state.schedules.findIndex(s => s.id === this.state.activeScheduleId);
            if (activeScheduleIndex >= 0) {
                this.state.schedules[activeScheduleIndex].selectedCourses = [...this.state.selectedCourses];
            }
        }
    }

    private emitEvent(type: StateChangeEvent['type'], data: any, source: string): void {
        // Skip event emission if we're in batch update mode
        if (this.isBatchUpdate) {
            return;
        }

        const event: StateChangeEvent = {
            type,
            data,
            timestamp: Date.now(),
            source
        };

        this.eventQueue.push(event);
        this.processEventQueue();
    }

    private processEventQueue(): void {
        if (this.processingQueue) return;
        this.processingQueue = true;

        // Process events in next tick to avoid recursion
        setTimeout(() => {
            const eventsToProcess = [...this.eventQueue];
            this.eventQueue = [];

            eventsToProcess.forEach(event => {
                this.listeners.forEach(listener => {
                    try {
                        listener(event, this.getState());
                    } catch (error) {
                        logger.error('Error in state change listener:', error);
                    }
                });
            });

            this.processingQueue = false;

            // If more events were queued while processing, process them
            if (this.eventQueue.length > 0) {
                this.processEventQueue();
            }
        }, 0);
    }


    private generateScheduleId(): string {
        return `schedule_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    // Debug methods
    debugState(): void {
        logger.log('=== PROFILE STATE DEBUG ===');
        logger.log('Active Schedule ID:', this.state.activeScheduleId);

        // Convert to ScheduleState for debugging with utility methods
        const scheduleStates = this.state.schedules.map(s => ({
            id: s.id,
            name: s.name,
            courseCount: s.selectedCourses.length,
            isEmpty: s.selectedCourses.length === 0,
            requiredCount: s.selectedCourses.filter(sc => sc.isRequired).length,
            electiveCount: s.selectedCourses.filter(sc => !sc.isRequired).length
        }));

        logger.log('Schedules:', scheduleStates);
        logger.log('Selected Courses:', this.state.selectedCourses.length);
        logger.log('Has Unsaved Changes:', this.state.hasUnsavedChanges);
        logger.log('Last Saved:', new Date(this.state.lastSaved).toISOString());
        logger.log('Listeners:', this.listeners.size);
        logger.log('Health Check:', this.isHealthy());
        logger.log('===============================');
    }

    async getStorageStats() {
        return this.storageManager.getStorageStats();
    }
}