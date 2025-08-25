import { ProfileStateManager } from '../core/ProfileStateManager'
import { SchedulePreferences, Schedule, SelectedCourse } from '../types/schedule'
import { ThemeStorage } from '../themes/ThemeManager'

/**
 * Unified storage service that provides a simple interface to ProfileStateManager
 * This is the recommended way to access persistent storage throughout the application
 */
export class StorageService implements ThemeStorage {
    private static instance: StorageService | null = null;
    private profileStateManager: ProfileStateManager;
    private isInitialized = false;

    private constructor(profileStateManager?: ProfileStateManager) {
        this.profileStateManager = profileStateManager || new ProfileStateManager();
    }

    static getInstance(profileStateManager?: ProfileStateManager): StorageService {
        if (!StorageService.instance) {
            StorageService.instance = new StorageService(profileStateManager);
        }
        return StorageService.instance;
    }

    static resetInstance(): void {
        StorageService.instance = null;
    }

    async initialize(): Promise<boolean> {
        if (this.isInitialized) return true;
        
        try {
            await this.profileStateManager.loadFromStorage();
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize StorageService:', error);
            return false;
        }
    }

    // Theme operations
    saveThemePreference(themeId: string): void {
        this.profileStateManager.updatePreferences({ theme: themeId }, 'storage-service');
    }

    loadThemePreference(): string {
        const preferences = this.profileStateManager.getPreferences();
        return preferences.theme || 'wpi-classic';
    }

    // Preferences operations
    savePreferences(preferences: SchedulePreferences): void {
        this.profileStateManager.updatePreferences(preferences, 'storage-service');
    }

    loadPreferences(): SchedulePreferences {
        return this.profileStateManager.getPreferences();
    }

    // Schedule operations
    saveSchedule(schedule: Schedule): boolean {
        return this.profileStateManager.updateSchedule(schedule.id, schedule, 'storage-service');
    }

    loadSchedule(scheduleId: string): Schedule | null {
        return this.profileStateManager.getAllSchedules().find(s => s.id === scheduleId) || null;
    }

    loadAllSchedules(): Schedule[] {
        return this.profileStateManager.getAllSchedules();
    }

    deleteSchedule(scheduleId: string): boolean {
        return this.profileStateManager.deleteSchedule(scheduleId, 'storage-service');
    }

    // Selected courses operations
    saveSelectedCourses(selectedCourses: SelectedCourse[]): void {
        // Clear all selections first, then add the new ones
        this.profileStateManager.clearAllSelections('storage-service');
        selectedCourses.forEach(sc => {
            this.profileStateManager.selectCourse(sc.course, sc.isRequired, 'storage-service');
            if (sc.selectedSectionNumber) {
                this.profileStateManager.setSelectedSection(sc.course, sc.selectedSectionNumber, 'storage-service');
            }
        });
    }

    loadSelectedCourses(): SelectedCourse[] {
        return this.profileStateManager.getSelectedCourses();
    }

    clearSelectedCourses(): void {
        this.profileStateManager.clearAllSelections('storage-service');
    }

    // Active schedule operations
    saveActiveScheduleId(scheduleId: string | null): void {
        if (scheduleId) {
            this.profileStateManager.setActiveSchedule(scheduleId, 'storage-service');
        }
    }

    loadActiveScheduleId(): string | null {
        const activeSchedule = this.profileStateManager.getActiveSchedule();
        return activeSchedule?.id || null;
    }

    clearActiveScheduleId(): void {
        // Set to the first available schedule or null
        const schedules = this.profileStateManager.getAllSchedules();
        if (schedules.length > 0) {
            this.profileStateManager.setActiveSchedule(schedules[0].id, 'storage-service');
        }
    }

    // Data management
    async save(): Promise<boolean> {
        const result = await this.profileStateManager.save();
        return result.success;
    }

    hasUnsavedChanges(): boolean {
        return this.profileStateManager.hasUnsavedChanges();
    }

    async exportData(): Promise<string | null> {
        return this.profileStateManager.exportData();
    }

    async importData(jsonData: string): Promise<boolean> {
        const result = await this.profileStateManager.importData(jsonData);
        return result.success;
    }

    clearAllData(): void {
        this.profileStateManager.clearAllSelections('storage-service');
        // Note: We don't clear preferences or schedules completely, just reset to defaults
    }

    // Access to underlying ProfileStateManager for advanced operations
    getProfileStateManager(): ProfileStateManager {
        return this.profileStateManager;
    }

    // Health check
    isHealthy(): { healthy: boolean; issues: string[] } {
        return this.profileStateManager.isHealthy();
    }
}