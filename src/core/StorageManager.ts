import { Schedule, UserScheduleState, SchedulePreferences, SelectedCourse } from '../types/schedule'
import { TransactionalStorageManager } from './TransactionalStorageManager'

/**
 * @deprecated Use ProfileStateManager instead - this class will be removed in a future version
 * This class exists only for backward compatibility and redirects all calls to TransactionalStorageManager
 */
export class StorageManager {
    private static readonly STORAGE_KEYS = {
        USER_STATE: 'wpi-planner-user-state',
        PREFERENCES: 'wpi-planner-preferences',
        SCHEDULES: 'wpi-planner-schedules',
        SELECTED_COURSES: 'wpi-planner-selected-courses',
        THEME: 'wpi-planner-theme',
        ACTIVE_SCHEDULE_ID: 'wpi-planner-active-schedule-id'
    };

    private transactionalStorage = new TransactionalStorageManager();

    saveUserState(state: UserScheduleState): void {
        console.warn('StorageManager.saveUserState is deprecated. Use ProfileStateManager instead.');
        this.transactionalStorage.saveUserState(state);
    }

    loadUserState(): UserScheduleState | null {
        console.warn('StorageManager.loadUserState is deprecated. Use ProfileStateManager instead.');
        const result = this.transactionalStorage.loadUserState();
        return result.data;
    }

    saveSchedule(schedule: Schedule): void {
        console.warn('StorageManager.saveSchedule is deprecated. Use ProfileStateManager instead.');
        this.transactionalStorage.saveSchedule(schedule);
    }

    loadSchedule(scheduleId: string): Schedule | null {
        console.warn('StorageManager.loadSchedule is deprecated. Use ProfileStateManager instead.');
        const result = this.transactionalStorage.loadSchedule(scheduleId);
        return result.data;
    }

    loadAllSchedules(): Schedule[] {
        console.warn('StorageManager.loadAllSchedules is deprecated. Use ProfileStateManager instead.');
        const result = this.transactionalStorage.loadAllSchedules();
        return result.data || [];
    }

    deleteSchedule(scheduleId: string): void {
        console.warn('StorageManager.deleteSchedule is deprecated. Use ProfileStateManager instead.');
        this.transactionalStorage.deleteSchedule(scheduleId);
    }

    savePreferences(preferences: SchedulePreferences): void {
        console.warn('StorageManager.savePreferences is deprecated. Use ProfileStateManager instead.');
        this.transactionalStorage.savePreferences(preferences);
    }

    loadPreferences(): SchedulePreferences | null {
        console.warn('StorageManager.loadPreferences is deprecated. Use ProfileStateManager instead.');
        const result = this.transactionalStorage.loadPreferences();
        return result.data;
    }


    clearAllData(): void {
        console.warn('StorageManager.clearAllData is deprecated. Use ProfileStateManager instead.');
        this.transactionalStorage.clearAllData();
    }

    exportData(): string {
        console.warn('StorageManager.exportData is deprecated. Use ProfileStateManager instead.');
        const result = this.transactionalStorage.exportData();
        return result.data || '{}';
    }

    importData(jsonData: string): boolean {
        console.warn('StorageManager.importData is deprecated. Use ProfileStateManager instead.');
        const result = this.transactionalStorage.importData(jsonData);
        return result.success;
    }


    saveThemePreference(themeId: string): void {
        console.warn('StorageManager.saveThemePreference is deprecated. Use ProfileStateManager instead.');
        this.transactionalStorage.saveThemePreference(themeId);
    }

    loadThemePreference(): string {
        console.warn('StorageManager.loadThemePreference is deprecated. Use ProfileStateManager instead.');
        const result = this.transactionalStorage.loadThemePreference();
        return result.data;
    }

    saveSelectedCourses(selectedCourses: SelectedCourse[]): void {
        console.warn('StorageManager.saveSelectedCourses is deprecated. Use ProfileStateManager instead.');
        this.transactionalStorage.saveSelectedCourses(selectedCourses);
    }

    loadSelectedCourses(): SelectedCourse[] {
        console.warn('StorageManager.loadSelectedCourses is deprecated. Use ProfileStateManager instead.');
        const result = this.transactionalStorage.loadSelectedCourses();
        return result.data || [];
    }

    clearSelectedCourses(): void {
        console.warn('StorageManager.clearSelectedCourses is deprecated. Use ProfileStateManager instead.');
        this.saveSelectedCourses([]);
    }

    saveActiveScheduleId(scheduleId: string | null): void {
        console.warn('StorageManager.saveActiveScheduleId is deprecated. Use ProfileStateManager instead.');
        this.transactionalStorage.saveActiveScheduleId(scheduleId);
    }

    loadActiveScheduleId(): string | null {
        console.warn('StorageManager.loadActiveScheduleId is deprecated. Use ProfileStateManager instead.');
        const result = this.transactionalStorage.loadActiveScheduleId();
        return result.data;
    }

    clearActiveScheduleId(): void {
        console.warn('StorageManager.clearActiveScheduleId is deprecated. Use ProfileStateManager instead.');
        this.saveActiveScheduleId(null);
    }
}