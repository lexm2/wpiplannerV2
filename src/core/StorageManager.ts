import { Schedule, UserScheduleState, SchedulePreferences } from '../types/schedule'

export class StorageManager {
    private static readonly STORAGE_KEYS = {
        USER_STATE: 'wpi-planner-user-state',
        PREFERENCES: 'wpi-planner-preferences',
        SCHEDULES: 'wpi-planner-schedules'
    };

    saveUserState(state: UserScheduleState): void {
        try {
            localStorage.setItem(StorageManager.STORAGE_KEYS.USER_STATE, JSON.stringify(state));
        } catch (error) {
            console.warn('Failed to save user state:', error);
        }
    }

    loadUserState(): UserScheduleState | null {
        try {
            const stored = localStorage.getItem(StorageManager.STORAGE_KEYS.USER_STATE);
            if (!stored) return null;
            
            return JSON.parse(stored);
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
            
            localStorage.setItem(StorageManager.STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));
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
            
            return JSON.parse(stored);
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
            localStorage.setItem(StorageManager.STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
        } catch (error) {
            console.warn('Failed to save preferences:', error);
        }
    }

    loadPreferences(): SchedulePreferences | null {
        try {
            const stored = localStorage.getItem(StorageManager.STORAGE_KEYS.PREFERENCES);
            if (!stored) return this.getDefaultPreferences();
            
            return JSON.parse(stored);
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
            preferredBuildings: []
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
}