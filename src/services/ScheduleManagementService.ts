import { Schedule, SelectedCourse, SchedulePreferences } from '../types/schedule'
import { StorageManager } from '../core/StorageManager'
import { CourseSelectionService } from './CourseSelectionService'

export class ScheduleManagementService {
    private storageManager: StorageManager;
    private courseSelectionService: CourseSelectionService;
    private activeScheduleId: string | null = null;
    private listeners: Array<(activeSchedule: Schedule | null) => void> = [];
    private isLoadingSchedule: boolean = false;
    private hasUnsavedChanges: boolean = false;
    private saveStateListeners: Array<(hasUnsavedChanges: boolean) => void> = [];

    constructor(storageManager?: StorageManager, courseSelectionService?: CourseSelectionService) {
        this.storageManager = storageManager || new StorageManager();
        this.courseSelectionService = courseSelectionService || new CourseSelectionService();
        this.loadActiveScheduleId();
    }

    createNewSchedule(name: string): Schedule {
        const schedule: Schedule = {
            id: this.generateScheduleId(),
            name: name,
            selectedCourses: [],
            generatedSchedules: []
        };

        this.storageManager.saveSchedule(schedule);
        return schedule;
    }

    createScheduleFromCurrent(name: string): Schedule {
        const currentSelectedCourses = this.courseSelectionService.getSelectedCourses();
        
        const schedule: Schedule = {
            id: this.generateScheduleId(),
            name: name,
            selectedCourses: [...currentSelectedCourses],
            generatedSchedules: []
        };

        this.storageManager.saveSchedule(schedule);
        return schedule;
    }

    saveCurrentAsSchedule(name: string): Schedule {
        return this.createScheduleFromCurrent(name);
    }

    loadSchedule(scheduleId: string): Schedule | null {
        return this.storageManager.loadSchedule(scheduleId);
    }

    saveSchedule(schedule: Schedule): void {
        this.storageManager.saveSchedule(schedule);
        
        if (this.activeScheduleId === schedule.id) {
            this.notifyListeners(schedule);
        }
    }

    deleteSchedule(scheduleId: string): boolean {
        const schedules = this.getAllSchedules();
        if (schedules.length <= 1) {
            return false;
        }

        this.storageManager.deleteSchedule(scheduleId);

        if (this.activeScheduleId === scheduleId) {
            const remainingSchedules = this.getAllSchedules();
            if (remainingSchedules.length > 0) {
                this.setActiveSchedule(remainingSchedules[0].id);
            } else {
                this.activeScheduleId = null;
                this.saveActiveScheduleId();
                this.notifyListeners(null);
            }
        }

        return true;
    }

    getAllSchedules(): Schedule[] {
        return this.storageManager.loadAllSchedules();
    }

    setActiveSchedule(scheduleId: string): void {
        const schedule = this.loadSchedule(scheduleId);
        if (!schedule) {
            console.warn('Schedule not found:', scheduleId);
            return;
        }

        console.log(`Switching to schedule: ${schedule.name} (${scheduleId})`);
        console.log(`Schedule contains ${schedule.selectedCourses.length} selected courses`);

        // Set loading flag to prevent course selection listener from triggering
        this.isLoadingSchedule = true;

        this.activeScheduleId = scheduleId;
        this.saveActiveScheduleId();

        // Clear current selections first
        this.courseSelectionService.clearAllSelections();
        
        // Load the schedule's selected courses
        schedule.selectedCourses.forEach(selectedCourse => {
            console.log(`Loading course: ${selectedCourse.course.department.abbreviation}${selectedCourse.course.number}`);
            this.courseSelectionService.selectCourse(selectedCourse.course, selectedCourse.isRequired);
            if (selectedCourse.selectedSectionNumber) {
                console.log(`  Setting section: ${selectedCourse.selectedSectionNumber}`);
                this.courseSelectionService.setSelectedSection(selectedCourse.course, selectedCourse.selectedSectionNumber);
            }
        });

        // Clear loading flag before final operations
        this.isLoadingSchedule = false;

        // Manually update the schedule once with final selections to ensure it's saved
        this.updateActiveScheduleFromCurrentSelections();

        // Notify listeners
        this.notifyListeners(schedule);
    }

    getActiveSchedule(): Schedule | null {
        if (!this.activeScheduleId) {
            return null;
        }
        return this.loadSchedule(this.activeScheduleId);
    }

    getActiveScheduleId(): string | null {
        return this.activeScheduleId;
    }

    updateActiveScheduleFromCurrentSelections(): void {
        console.log('🔄 updateActiveScheduleFromCurrentSelections: Starting update');
        
        if (!this.activeScheduleId) {
            console.log('❌ updateActiveScheduleFromCurrentSelections: No active schedule ID');
            return;
        }

        const activeSchedule = this.getActiveSchedule();
        if (!activeSchedule) {
            console.log('❌ updateActiveScheduleFromCurrentSelections: No active schedule found');
            return;
        }

        const currentSelectedCourses = this.courseSelectionService.getSelectedCourses();
        console.log(`📋 updateActiveScheduleFromCurrentSelections: Found ${currentSelectedCourses.length} selected courses`);

        const updatedSchedule: Schedule = {
            ...activeSchedule,
            selectedCourses: [...currentSelectedCourses]
        };

        console.log(`💾 updateActiveScheduleFromCurrentSelections: Saving schedule "${activeSchedule.name}" with ${updatedSchedule.selectedCourses.length} courses`);
        this.saveSchedule(updatedSchedule);
    }

    manualSaveCurrentProfile(): boolean {
        try {
            this.updateActiveScheduleFromCurrentSelections();
            this.setUnsavedChanges(false);
            return true;
        } catch (error) {
            console.error('Failed to save profile:', error);
            return false;
        }
    }

    hasUnsavedChangesStatus(): boolean {
        return this.hasUnsavedChanges;
    }

    markAsUnsaved(): void {
        this.setUnsavedChanges(true);
    }

    private setUnsavedChanges(hasChanges: boolean): void {
        if (this.hasUnsavedChanges !== hasChanges) {
            this.hasUnsavedChanges = hasChanges;
            this.notifySaveStateListeners(hasChanges);
        }
    }

    onSaveStateChange(listener: (hasUnsavedChanges: boolean) => void): void {
        this.saveStateListeners.push(listener);
    }

    offSaveStateChange(listener: (hasUnsavedChanges: boolean) => void): void {
        const index = this.saveStateListeners.indexOf(listener);
        if (index > -1) {
            this.saveStateListeners.splice(index, 1);
        }
    }

    private notifySaveStateListeners(hasUnsavedChanges: boolean): void {
        this.saveStateListeners.forEach(listener => {
            try {
                listener(hasUnsavedChanges);
            } catch (error) {
                console.error('Error in save state listener:', error);
            }
        });
    }

    renameSchedule(scheduleId: string, newName: string): boolean {
        const schedule = this.loadSchedule(scheduleId);
        if (!schedule) {
            return false;
        }

        schedule.name = newName;
        this.saveSchedule(schedule);
        return true;
    }

    duplicateSchedule(scheduleId: string, newName: string): Schedule | null {
        const originalSchedule = this.loadSchedule(scheduleId);
        if (!originalSchedule) {
            return null;
        }

        const duplicatedSchedule: Schedule = {
            id: this.generateScheduleId(),
            name: newName,
            selectedCourses: [...originalSchedule.selectedCourses],
            generatedSchedules: [...originalSchedule.generatedSchedules]
        };

        this.storageManager.saveSchedule(duplicatedSchedule);
        return duplicatedSchedule;
    }

    initializeDefaultScheduleIfNeeded(): void {
        const existingSchedules = this.getAllSchedules();
        
        if (existingSchedules.length === 0) {
            const currentSelectedCourses = this.courseSelectionService.getSelectedCourses();
            const defaultSchedule = this.createNewSchedule('My Schedule');
            
            if (currentSelectedCourses.length > 0) {
                defaultSchedule.selectedCourses = [...currentSelectedCourses];
                this.saveSchedule(defaultSchedule);
            }
            
            this.setActiveSchedule(defaultSchedule.id);
        } else if (!this.activeScheduleId) {
            this.setActiveSchedule(existingSchedules[0].id);
        }
        
        this.setupCourseSelectionListener();
    }

    private setupCourseSelectionListener(): void {
        this.courseSelectionService.onSelectionChange(() => {
            console.log('📞 ScheduleManagementService: Received course selection change event');
            
            // Don't mark as unsaved if we're currently loading a schedule
            if (this.isLoadingSchedule) {
                console.log('⏸️ ScheduleManagementService: Skipping unsaved mark - currently loading schedule');
                return;
            }
            
            console.log('🔄 ScheduleManagementService: Marking changes as unsaved');
            this.markAsUnsaved();
        });
    }

    // Debug method to inspect the current state
    debugState(): void {
        console.log('=== SCHEDULE MANAGEMENT DEBUG ===');
        console.log('Active Schedule ID:', this.activeScheduleId);
        console.log('All Schedules:', this.getAllSchedules().map(s => ({
            id: s.id,
            name: s.name,
            courseCount: s.selectedCourses.length
        })));
        console.log('Active Schedule:', this.getActiveSchedule());
        console.log('Current Selected Courses:', this.courseSelectionService.getSelectedCourses().length);
        console.log('=================================');
    }

    onActiveScheduleChange(listener: (activeSchedule: Schedule | null) => void): void {
        this.listeners.push(listener);
    }

    offActiveScheduleChange(listener: (activeSchedule: Schedule | null) => void): void {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    private notifyListeners(activeSchedule: Schedule | null): void {
        this.listeners.forEach(listener => {
            try {
                listener(activeSchedule);
            } catch (error) {
                console.error('Error in schedule change listener:', error);
            }
        });
    }

    private generateScheduleId(): string {
        return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private saveActiveScheduleId(): void {
        this.storageManager.saveActiveScheduleId(this.activeScheduleId);
    }

    private loadActiveScheduleId(): void {
        this.activeScheduleId = this.storageManager.loadActiveScheduleId();
    }

    exportSchedule(scheduleId: string): string | null {
        const schedule = this.loadSchedule(scheduleId);
        if (!schedule) {
            return null;
        }

        const exportData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            schedule: schedule
        };

        return JSON.stringify(exportData, null, 2);
    }

    importSchedule(jsonData: string): Schedule | null {
        try {
            const data = JSON.parse(jsonData);
            
            if (!data.schedule) {
                return null;
            }

            const importedSchedule: Schedule = {
                ...data.schedule,
                id: this.generateScheduleId()
            };

            this.storageManager.saveSchedule(importedSchedule);
            return importedSchedule;
        } catch (error) {
            console.error('Failed to import schedule:', error);
            return null;
        }
    }

    getCourseSelectionService(): CourseSelectionService {
        return this.courseSelectionService;
    }
}