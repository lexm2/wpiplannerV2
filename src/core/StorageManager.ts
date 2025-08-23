import { Schedule, UserScheduleState, SchedulePreferences, SelectedCourse } from '../types/schedule'

export class StorageManager {
    private static readonly STORAGE_KEYS = {
        USER_STATE: 'wpi-planner-user-state',
        PREFERENCES: 'wpi-planner-preferences',
        SCHEDULES: 'wpi-planner-schedules',
        SELECTED_COURSES: 'wpi-planner-selected-courses',
        THEME: 'wpi-planner-theme'
    };

    saveUserState(state: UserScheduleState): void {
        try {
            const serializedState = this.serializeWithSets(state);
            localStorage.setItem(StorageManager.STORAGE_KEYS.USER_STATE, JSON.stringify(serializedState));
        } catch (error) {
            console.warn('Failed to save user state:', error);
        }
    }

    loadUserState(): UserScheduleState | null {
        try {
            const stored = localStorage.getItem(StorageManager.STORAGE_KEYS.USER_STATE);
            if (!stored) return null;
            
            const parsed = JSON.parse(stored);
            return this.deserializeWithSets(parsed);
        } catch (error) {
            console.warn('Failed to load user state:', error);
            return null;
        }
    }

    saveSchedule(schedule: Schedule): void {
        try {
            const schedules = this.loadAllSchedules();
            const existingIndex = schedules.findIndex(s => s.id === schedule.id);
            
            if (existingIndex >= 0) {
                schedules[existingIndex] = schedule;
            } else {
                schedules.push(schedule);
            }
            
            const serializedSchedules = this.serializeWithSets(schedules);
            localStorage.setItem(StorageManager.STORAGE_KEYS.SCHEDULES, JSON.stringify(serializedSchedules));
        } catch (error) {
            console.warn('Failed to save schedule:', error);
        }
    }

    loadSchedule(scheduleId: string): Schedule | null {
        try {
            const schedules = this.loadAllSchedules();
            return schedules.find(s => s.id === scheduleId) || null;
        } catch (error) {
            console.warn('Failed to load schedule:', error);
            return null;
        }
    }

    loadAllSchedules(): Schedule[] {
        try {
            const stored = localStorage.getItem(StorageManager.STORAGE_KEYS.SCHEDULES);
            if (!stored) return [];
            
            const parsed = JSON.parse(stored);
            return this.deserializeWithSets(parsed);
        } catch (error) {
            console.warn('Failed to load schedules:', error);
            return [];
        }
    }

    deleteSchedule(scheduleId: string): void {
        try {
            const schedules = this.loadAllSchedules();
            const filtered = schedules.filter(s => s.id !== scheduleId);
            localStorage.setItem(StorageManager.STORAGE_KEYS.SCHEDULES, JSON.stringify(filtered));
        } catch (error) {
            console.warn('Failed to delete schedule:', error);
        }
    }

    savePreferences(preferences: SchedulePreferences): void {
        try {
            const serializedPreferences = this.serializeWithSets(preferences);
            localStorage.setItem(StorageManager.STORAGE_KEYS.PREFERENCES, JSON.stringify(serializedPreferences));
        } catch (error) {
            console.warn('Failed to save preferences:', error);
        }
    }

    loadPreferences(): SchedulePreferences | null {
        try {
            const stored = localStorage.getItem(StorageManager.STORAGE_KEYS.PREFERENCES);
            if (!stored) return this.getDefaultPreferences();
            
            const parsed = JSON.parse(stored);
            return this.deserializeWithSets(parsed);
        } catch (error) {
            console.warn('Failed to load preferences:', error);
            return this.getDefaultPreferences();
        }
    }

    private getDefaultPreferences(): SchedulePreferences {
        return {
            preferredTimeRange: {
                startTime: { hours: 8, minutes: 0 },
                endTime: { hours: 18, minutes: 0 }
            },
            preferredDays: new Set(['mon', 'tue', 'wed', 'thu', 'fri']),
            avoidBackToBackClasses: false,
            maxDailyHours: 8,
            preferredBuildings: [],
            theme: 'wpi-classic'
        };
    }

    clearAllData(): void {
        try {
            Object.values(StorageManager.STORAGE_KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
        } catch (error) {
            console.warn('Failed to clear storage:', error);
        }
    }

    exportData(): string {
        const state = this.loadUserState();
        const schedules = this.loadAllSchedules();
        const preferences = this.loadPreferences();

        const exportData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            state,
            schedules,
            preferences
        };

        return JSON.stringify(exportData, null, 2);
    }

    importData(jsonData: string): boolean {
        try {
            const data = JSON.parse(jsonData);
            
            if (data.state) this.saveUserState(data.state);
            if (data.preferences) this.savePreferences(data.preferences);
            if (data.schedules) {
                data.schedules.forEach((schedule: Schedule) => {
                    this.saveSchedule(schedule);
                });
            }
            
            return true;
        } catch (error) {
            console.error('Failed to import data:', error);
            return false;
        }
    }

    private serializeWithSets(obj: any): any {
        if (obj === null || obj === undefined) {
            return obj;
        }
        
        if (obj instanceof Set) {
            return { __type: 'Set', value: Array.from(obj) };
        }
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.serializeWithSets(item));
        }
        
        if (typeof obj === 'object') {
            const result: any = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    result[key] = this.serializeWithSets(obj[key]);
                }
            }
            return result;
        }
        
        return obj;
    }

    private deserializeWithSets(obj: any): any {
        if (obj === null || obj === undefined) {
            return obj;
        }
        
        if (typeof obj === 'object' && obj.__type === 'Set') {
            return new Set(obj.value);
        }
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.deserializeWithSets(item));
        }
        
        if (typeof obj === 'object') {
            const result: any = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    result[key] = this.deserializeWithSets(obj[key]);
                }
            }
            return result;
        }
        
        return obj;
    }

    saveThemePreference(themeId: string): void {
        try {
            localStorage.setItem(StorageManager.STORAGE_KEYS.THEME, themeId);
        } catch (error) {
            console.warn('Failed to save theme preference:', error);
        }
    }

    loadThemePreference(): string {
        try {
            const savedTheme = localStorage.getItem(StorageManager.STORAGE_KEYS.THEME);
            return savedTheme || 'wpi-classic';
        } catch (error) {
            console.warn('Failed to load theme preference:', error);
            return 'wpi-classic';
        }
    }

    saveSelectedCourses(selectedCourses: SelectedCourse[]): void {
        try {
            const serializedCourses = this.serializeWithSets(selectedCourses);
            localStorage.setItem(StorageManager.STORAGE_KEYS.SELECTED_COURSES, JSON.stringify(serializedCourses));
        } catch (error) {
            console.warn('Failed to save selected courses:', error);
        }
    }

    loadSelectedCourses(): SelectedCourse[] {
        try {
            const stored = localStorage.getItem(StorageManager.STORAGE_KEYS.SELECTED_COURSES);
            if (!stored) return [];
            
            const parsed = JSON.parse(stored);
            return this.deserializeWithSets(parsed);
        } catch (error) {
            console.warn('Failed to load selected courses:', error);
            return [];
        }
    }

    clearSelectedCourses(): void {
        try {
            localStorage.removeItem(StorageManager.STORAGE_KEYS.SELECTED_COURSES);
        } catch (error) {
            console.warn('Failed to clear selected courses:', error);
        }
    }
}