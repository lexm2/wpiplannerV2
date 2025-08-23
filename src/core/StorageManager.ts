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
        this.handleStorageOperation(
            () => {
                const serializedState = JSON.stringify(state, this.replacer);
                localStorage.setItem(StorageManager.STORAGE_KEYS.USER_STATE, serializedState);
            },
            'Failed to save user state'
        );
    }

    loadUserState(): UserScheduleState | null {
        return this.handleStorageOperation(
            () => {
                const stored = localStorage.getItem(StorageManager.STORAGE_KEYS.USER_STATE);
                if (!stored) return null;
                return JSON.parse(stored, this.reviver);
            },
            'Failed to load user state',
            null
        );
    }

    saveSchedule(schedule: Schedule): void {
        this.handleStorageOperation(
            () => {
                const schedules = this.loadAllSchedules();
                const existingIndex = schedules.findIndex(s => s.id === schedule.id);
                
                if (existingIndex >= 0) {
                    schedules[existingIndex] = schedule;
                } else {
                    schedules.push(schedule);
                }
                
                const serializedSchedules = JSON.stringify(schedules, this.replacer);
                localStorage.setItem(StorageManager.STORAGE_KEYS.SCHEDULES, serializedSchedules);
            },
            'Failed to save schedule'
        );
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
        return this.handleStorageOperation(
            () => {
                const stored = localStorage.getItem(StorageManager.STORAGE_KEYS.SCHEDULES);
                if (!stored) return [];
                return JSON.parse(stored, this.reviver);
            },
            'Failed to load schedules',
            []
        );
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
        this.handleStorageOperation(
            () => {
                const serializedPreferences = JSON.stringify(preferences, this.replacer);
                localStorage.setItem(StorageManager.STORAGE_KEYS.PREFERENCES, serializedPreferences);
            },
            'Failed to save preferences'
        );
    }

    loadPreferences(): SchedulePreferences | null {
        return this.handleStorageOperation(
            () => {
                const stored = localStorage.getItem(StorageManager.STORAGE_KEYS.PREFERENCES);
                if (!stored) return this.getDefaultPreferences();
                return JSON.parse(stored, this.reviver);
            },
            'Failed to load preferences',
            this.getDefaultPreferences()
        );
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

    private handleStorageOperation<T>(
        operation: () => T,
        errorMessage: string,
        fallback?: T
    ): T | undefined {
        try {
            return operation();
        } catch (error) {
            console.warn(`${errorMessage}:`, error);
            return fallback;
        }
    }

    private readonly replacer = (key: string, value: any): any => {
        if (value instanceof Set) {
            return { __type: 'Set', value: [...value] };
        }
        return value;
    };

    private readonly reviver = (key: string, value: any): any => {
        if (typeof value === 'object' && value !== null && value.__type === 'Set') {
            return new Set(value.value);
        }
        return value;
    };

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
        this.handleStorageOperation(
            () => {
                const serializedCourses = JSON.stringify(selectedCourses, this.replacer);
                localStorage.setItem(StorageManager.STORAGE_KEYS.SELECTED_COURSES, serializedCourses);
            },
            'Failed to save selected courses'
        );
    }

    loadSelectedCourses(): SelectedCourse[] {
        return this.handleStorageOperation(
            () => {
                const stored = localStorage.getItem(StorageManager.STORAGE_KEYS.SELECTED_COURSES);
                if (!stored) return [];
                return JSON.parse(stored, this.reviver);
            },
            'Failed to load selected courses',
            []
        );
    }

    clearSelectedCourses(): void {
        try {
            localStorage.removeItem(StorageManager.STORAGE_KEYS.SELECTED_COURSES);
        } catch (error) {
            console.warn('Failed to clear selected courses:', error);
        }
    }
}