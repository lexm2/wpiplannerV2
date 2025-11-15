import { Schedule, SchedulePreferences, SelectedCourse } from '../types/schedule'
import { Course, Section, Department } from '../types/types'
import { TransactionalStorageManager, TransactionResult } from './TransactionalStorageManager'
import { getAllSections } from '../utils/courseUtils'
import { UndoRedoManager } from './UndoRedoManager'
import { createJSONReplacer, createJSONReviver } from '../utils/jsonSerializer'
import { OneDriveSyncService } from '../services/OneDriveSyncService'
import { ONEDRIVE_CONFIG } from '../config/onedrive.config'
import type { CloudStateData } from '../services/OneDriveSyncTypes'

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
    private state: ProfileState;
    private listeners = new Set<StateChangeListener>();
    private storageManager: TransactionalStorageManager;
    private isLoadingFlag = false;
    private eventQueue: StateChangeEvent[] = [];
    private processingQueue = false;
    private allDepartments: Department[] = [];
    private undoRedoManager: UndoRedoManager;
    private isRestoringState = false;
    private cloudSyncService: OneDriveSyncService | null = null;

    constructor(storageManager?: TransactionalStorageManager) {
        this.storageManager = storageManager || new TransactionalStorageManager();
        this.state = this.createInitialState();
        this.undoRedoManager = new UndoRedoManager();
        this.initializeCloudSync();
    }

    private async initializeCloudSync(): Promise<void> {
        try {
            this.cloudSyncService = OneDriveSyncService.getInstance();
            await this.cloudSyncService.initialize();
        } catch (error) {
            console.warn('Cloud sync initialization failed:', error);
        }
    }

    setCourseData(departments: Department[]): void {
        this.allDepartments = departments;
        console.log(`📚 Course catalog set with ${departments.length} departments`);
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

            console.warn(`Section ${sectionNumber} not found in course ${course.department.abbreviation}${course.number}`);
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
            if (this.state.schedules.length <= 1) return false;

            const deletedSchedule = this.state.schedules[scheduleIndex];
            this.state.schedules.splice(scheduleIndex, 1);

            // Remove from storage
            const deleteResult = await this.storageManager.deleteSchedule(scheduleId);
            if (!deleteResult.success) {
                console.warn('Failed to delete schedule from storage:', deleteResult.error);
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
            await this.save();
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
            await this.save();
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

    // Persistence methods - All saves are immediate (async for IndexedDB compatibility)
    async save(): Promise<void> {
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

            console.log('%cSAVING TO STORAGE', 'color: #4CAF50; font-weight: bold; font-size: 14px');
            console.log('Active Schedule ID:', this.state.activeScheduleId);
            console.log('Number of Schedules:', this.state.schedules.length);

            // Log what we're about to save
            const dataToSave = {
                activeScheduleId: this.state.activeScheduleId,
                schedules: this.state.schedules.map(s => ({
                    id: s.id,
                    name: s.name,
                    selectedCourses: s.selectedCourses.map(sc => ({
                        courseId: sc.course.id,
                        courseName: `${sc.course.department.abbreviation}${sc.course.number}`,
                        selectedSection: sc.selectedSectionNumber,
                        isRequired: sc.isRequired
                    }))
                })),
                preferences: this.state.preferences
            };
            console.log('Data being saved:', JSON.stringify(dataToSave, null, 2));

            this.storageManager.saveActiveScheduleId(this.state.activeScheduleId);

            // Await all schedule saves (async for IndexedDB)
            for (const schedule of this.state.schedules) {
                await this.storageManager.saveSchedule(schedule);
            }

            this.storageManager.savePreferences(this.state.preferences);

            const previousUnsavedState = this.state.hasUnsavedChanges;
            this.state.hasUnsavedChanges = false;
            this.state.lastSaved = Date.now();

            console.log('%cSAVED - All data persisted to storage', 'color: #4CAF50; font-weight: bold');

            if (previousUnsavedState) {
                this.emitEvent('save_state_changed', { hasUnsavedChanges: false }, 'system');
            }

            if (ONEDRIVE_CONFIG.autoSyncEnabled && this.cloudSyncService?.isAuthenticated()) {
                this.syncToCloud();
            }
        } catch (error) {
            console.error('Save failed:', error);
        }
    }

    async loadFromStorage(): Promise<boolean> {
        // Prevent concurrent calls - if already loading, skip this call
        if (this.isLoadingFlag) {
            console.log('⏭Already loading from storage, skipping duplicate call');
            return false;
        }

        // Skip if already loaded with schedules (redundant call prevention)
        if (this.state.schedules.length > 0 && !this.state.isLoading) {
            console.log('⏭Already loaded with schedules, skipping redundant call');
            return true;
        }

        try {
            this.state.isLoading = true;
            this.isLoadingFlag = true;

            console.log('%cLOADING FROM STORAGE', 'color: #2196F3; font-weight: bold; font-size: 14px');

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
            console.log('%cLOADED - Parsed Data:', 'color: #2196F3; font-weight: bold');
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
            console.log(JSON.stringify(loadedData, null, 2));
            console.log('---');

            // If no schedules exist, create a default one
            if (this.state.schedules.length === 0) {
                console.log('No schedules found, creating default schedule');
                const defaultSchedule = this.createSchedule('My Schedule', 'system');
                this.state.activeScheduleId = defaultSchedule.id;
            }

            // If no active schedule but schedules exist, set the last one as active
            if (!this.state.activeScheduleId && this.state.schedules.length > 0) {
                console.log('No active schedule, setting last schedule as active');
                this.state.activeScheduleId = this.state.schedules[this.state.schedules.length - 1].id;
            }

            this.state.hasUnsavedChanges = false;
            this.state.lastSaved = Date.now();
            return true;

        } catch (error) {
            console.error('Load failed:', error);
            return false;
        } finally {
            this.state.isLoading = false;
            this.isLoadingFlag = false;
        }
    }

    // Export/Import functionality
    async exportData(): Promise<string | null> {
        const exportResult = await this.storageManager.exportData();
        return exportResult.valid ? exportResult.data : null;
    }

    async importData(jsonData: string): Promise<TransactionResult> {
        const result = await this.storageManager.importData(jsonData);
        if (result.success) {
            // Reload state from storage after successful import
            await this.loadFromStorage();
            this.emitEvent('schedule_changed', { action: 'imported' }, 'system');
        }
        return result;
    }

    private async syncToCloud(): Promise<void> {
        if (!this.cloudSyncService) return;

        try {
            const exportedData = await this.exportData();
            if (!exportedData) return;

            const cloudData: CloudStateData = JSON.parse(exportedData);
            await this.cloudSyncService.syncToCloud(cloudData);
        } catch (error) {
            console.error('Cloud sync failed:', error);
        }
    }

    async pullFromCloudAndMerge(): Promise<boolean> {
        if (!this.cloudSyncService?.isAuthenticated()) {
            console.warn('Not authenticated with OneDrive');
            return false;
        }

        try {
            const result = await this.cloudSyncService.pullFromCloud();
            if (result.success && result.data) {
                const cloudData = result.data as CloudStateData;
                const jsonData = JSON.stringify(cloudData);
                const importResult = await this.importData(jsonData);
                return importResult.success;
            }
            return false;
        } catch (error) {
            console.error('Failed to pull from cloud:', error);
            return false;
        }
    }

    getCloudSyncService(): OneDriveSyncService | null {
        return this.cloudSyncService;
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
            console.warn('Course catalog not available, skipping section reference resolution');
            return selectedCourses;
        }

        console.log(`Resolving course references for ${selectedCourses.length} courses`);

        return selectedCourses.map(selectedCourse => {
            const courseId = selectedCourse.course.id;

            let liveCourse: Course | undefined;
            for (const dept of this.allDepartments) {
                liveCourse = dept.courses.find(c => c.id === courseId);
                if (liveCourse) break;
            }

            if (!liveCourse) {
                console.warn(`Course ${courseId} not found in catalog, keeping original reference`);
                return selectedCourse;
            }

            const resolveSection = (section: Section | null): Section | null => {
                if (!section || !liveCourse) return null;

                const allSections = getAllSections(liveCourse);
                const liveSection = allSections.find((s: Section) => s.crn === section.crn);
                if (!liveSection) {
                    console.warn(`Section CRN ${section.crn} not found for course ${courseId}`);
                    return null;
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
                theme: 'wpi-dark'
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

        // Fire and forget - save happens in background
        this.save().catch(error => console.error('Save failed:', error));
    }

    private async withStateUpdateAsync<T>(updateFn: () => Promise<T>): Promise<T> {
        const previousUnsavedState = this.state.hasUnsavedChanges;
        const result = await updateFn();
        this.state.hasUnsavedChanges = true;

        // Emit save state change event if state actually changed
        if (!previousUnsavedState) {
            this.emitEvent('save_state_changed', { hasUnsavedChanges: true }, 'system');
        }

        await this.save();
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

        // Fire and forget - save happens in background
        this.save().catch(error => console.error('Save failed:', error));
        return result;
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
                        console.error('Error in state change listener:', error);
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
        return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Debug methods
    debugState(): void {
        console.log('=== PROFILE STATE DEBUG ===');
        console.log('Active Schedule ID:', this.state.activeScheduleId);
        console.log('Schedules:', this.state.schedules.map(s => ({
            id: s.id,
            name: s.name,
            courseCount: s.selectedCourses.length
        })));
        console.log('Selected Courses:', this.state.selectedCourses.length);
        console.log('Has Unsaved Changes:', this.state.hasUnsavedChanges);
        console.log('Last Saved:', new Date(this.state.lastSaved).toISOString());
        console.log('Listeners:', this.listeners.size);
        console.log('Health Check:', this.isHealthy());
        console.log('===============================');
    }

    async getStorageStats() {
        return this.storageManager.getStorageStats();
    }
}