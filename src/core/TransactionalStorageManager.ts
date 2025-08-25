import { Schedule, UserScheduleState, SchedulePreferences, SelectedCourse } from '../types/schedule'

export interface StorageTransaction {
    id: string;
    operations: StorageOperation[];
    timestamp: number;
    backupData: Map<string, any>;
}

export interface StorageOperation {
    type: 'save' | 'delete';
    key: string;
    value?: any;
    previousValue?: any;
}

export interface TransactionResult {
    success: boolean;
    transactionId: string;
    error?: Error;
    rolledBack?: boolean;
}

export class TransactionalStorageManager {
    private static readonly STORAGE_KEYS = {
        USER_STATE: 'wpi-planner-user-state',
        PREFERENCES: 'wpi-planner-preferences',
        SCHEDULES: 'wpi-planner-schedules',
        SELECTED_COURSES: 'wpi-planner-selected-courses',
        THEME: 'wpi-planner-theme',
        ACTIVE_SCHEDULE_ID: 'wpi-planner-active-schedule-id',
        TRANSACTION_LOG: 'wpi-planner-transaction-log'
    };

    private activeTransactions = new Map<string, StorageTransaction>();
    private transactionCounter = 0;

    async executeTransaction(operations: (() => void)[]): Promise<TransactionResult> {
        const transactionId = this.generateTransactionId();
        const transaction: StorageTransaction = {
            id: transactionId,
            operations: [],
            timestamp: Date.now(),
            backupData: new Map()
        };

        this.activeTransactions.set(transactionId, transaction);

        try {
            // Create backup of all keys we might modify
            const keysToBackup = this.extractKeysFromOperations(operations);
            this.createBackup(transaction, keysToBackup);

            // Execute all operations
            for (const operation of operations) {
                operation();
            }

            // Verify data integrity after operations
            const integrityCheck = this.verifyDataIntegrity();
            if (!integrityCheck.valid) {
                throw new Error(`Data integrity check failed: ${integrityCheck.error}`);
            }

            // Commit transaction
            this.commitTransaction(transaction);
            
            return {
                success: true,
                transactionId
            };

        } catch (error) {
            console.warn(`Transaction ${transactionId} failed, rolling back:`, error);
            const rollbackSuccess = this.rollbackTransaction(transaction);
            
            return {
                success: false,
                transactionId,
                error: error as Error,
                rolledBack: rollbackSuccess
            };
        } finally {
            this.activeTransactions.delete(transactionId);
        }
    }

    saveUserState(state: UserScheduleState): TransactionResult {
        return this.executeSyncTransaction(() => {
            const serializedState = this.safeStringify(state);
            localStorage.setItem(TransactionalStorageManager.STORAGE_KEYS.USER_STATE, serializedState);
        });
    }

    loadUserState(): { data: UserScheduleState | null; valid: boolean; error?: string } {
        return this.safeLoad<UserScheduleState | null>(
            TransactionalStorageManager.STORAGE_KEYS.USER_STATE,
            null,
            'user state'
        );
    }

    saveSchedule(schedule: Schedule): TransactionResult {
        return this.executeSyncTransaction(() => {
            const schedules = this.loadAllSchedules().data || [];
            const existingIndex = schedules.findIndex(s => s.id === schedule.id);
            
            if (existingIndex >= 0) {
                schedules[existingIndex] = schedule;
            } else {
                schedules.push(schedule);
            }
            
            const serializedSchedules = this.safeStringify(schedules);
            localStorage.setItem(TransactionalStorageManager.STORAGE_KEYS.SCHEDULES, serializedSchedules);
        });
    }

    loadSchedule(scheduleId: string): { data: Schedule | null; valid: boolean; error?: string } {
        const schedulesResult = this.loadAllSchedules();
        if (!schedulesResult.valid || !schedulesResult.data) {
            return { data: null, valid: false, error: schedulesResult.error };
        }

        const schedule = schedulesResult.data.find(s => s.id === scheduleId) || null;
        return { data: schedule, valid: true };
    }

    loadAllSchedules(): { data: Schedule[] | null; valid: boolean; error?: string } {
        return this.safeLoad<Schedule[]>(
            TransactionalStorageManager.STORAGE_KEYS.SCHEDULES,
            [],
            'schedules'
        );
    }

    deleteSchedule(scheduleId: string): TransactionResult {
        return this.executeSyncTransaction(() => {
            const schedules = this.loadAllSchedules().data || [];
            const filtered = schedules.filter(s => s.id !== scheduleId);
            const serializedSchedules = this.safeStringify(filtered);
            localStorage.setItem(TransactionalStorageManager.STORAGE_KEYS.SCHEDULES, serializedSchedules);
        });
    }

    savePreferences(preferences: SchedulePreferences): TransactionResult {
        return this.executeSyncTransaction(() => {
            const serializedPreferences = this.safeStringify(preferences);
            localStorage.setItem(TransactionalStorageManager.STORAGE_KEYS.PREFERENCES, serializedPreferences);
        });
    }

    loadPreferences(): { data: SchedulePreferences; valid: boolean; error?: string } {
        const result = this.safeLoad<SchedulePreferences>(
            TransactionalStorageManager.STORAGE_KEYS.PREFERENCES,
            this.getDefaultPreferences(),
            'preferences'
        );
        
        return {
            data: result.data || this.getDefaultPreferences(),
            valid: result.valid,
            error: result.error
        };
    }

    saveSelectedCourses(selectedCourses: SelectedCourse[]): TransactionResult {
        console.log(`🗄️ TransactionalStorageManager: Saving ${selectedCourses.length} courses to localStorage key '${TransactionalStorageManager.STORAGE_KEYS.SELECTED_COURSES}'`);
        const result = this.executeSyncTransaction(() => {
            const serializedCourses = this.safeStringify(selectedCourses);
            console.log('🗄️ Serialized data length:', serializedCourses.length, 'characters');
            localStorage.setItem(TransactionalStorageManager.STORAGE_KEYS.SELECTED_COURSES, serializedCourses);
            console.log('✅ Saved to localStorage successfully');
        });
        console.log('🗄️ Transaction result:', result.success ? 'SUCCESS' : 'FAILED', result.error || '');
        return result;
    }

    loadSelectedCourses(): { data: SelectedCourse[]; valid: boolean; error?: string } {
        console.log(`📂 TransactionalStorageManager: Loading courses from localStorage key '${TransactionalStorageManager.STORAGE_KEYS.SELECTED_COURSES}'`);
        const result = this.safeLoad<SelectedCourse[]>(
            TransactionalStorageManager.STORAGE_KEYS.SELECTED_COURSES,
            [],
            'selected courses'
        );
        
        console.log(`📂 Load result - Valid: ${result.valid}, Data length: ${result.data?.length || 0}`, result.error ? `Error: ${result.error}` : '');
        
        return {
            data: result.data || [],
            valid: result.valid,
            error: result.error
        };
    }

    saveThemePreference(themeId: string): TransactionResult {
        return this.executeSyncTransaction(() => {
            localStorage.setItem(TransactionalStorageManager.STORAGE_KEYS.THEME, themeId);
        });
    }

    loadThemePreference(): { data: string; valid: boolean; error?: string } {
        try {
            const savedTheme = localStorage.getItem(TransactionalStorageManager.STORAGE_KEYS.THEME);
            return { 
                data: savedTheme || 'wpi-classic',
                valid: true
            };
        } catch (error) {
            return { 
                data: 'wpi-classic',
                valid: false,
                error: `Failed to load theme preference: ${error}`
            };
        }
    }

    saveActiveScheduleId(scheduleId: string | null): TransactionResult {
        return this.executeSyncTransaction(() => {
            if (scheduleId) {
                localStorage.setItem(TransactionalStorageManager.STORAGE_KEYS.ACTIVE_SCHEDULE_ID, scheduleId);
            } else {
                localStorage.removeItem(TransactionalStorageManager.STORAGE_KEYS.ACTIVE_SCHEDULE_ID);
            }
        });
    }

    loadActiveScheduleId(): { data: string | null; valid: boolean; error?: string } {
        try {
            const saved = localStorage.getItem(TransactionalStorageManager.STORAGE_KEYS.ACTIVE_SCHEDULE_ID);
            return { 
                data: saved && saved.length > 0 ? saved : null,
                valid: true
            };
        } catch (error) {
            return { 
                data: null,
                valid: false,
                error: `Failed to load active schedule ID: ${error}`
            };
        }
    }

    clearAllData(): TransactionResult {
        return this.executeSyncTransaction(() => {
            Object.values(TransactionalStorageManager.STORAGE_KEYS).forEach(key => {
                if (key !== TransactionalStorageManager.STORAGE_KEYS.TRANSACTION_LOG) {
                    localStorage.removeItem(key);
                }
            });
        });
    }

    exportData(): { data: string | null; valid: boolean; error?: string } {
        try {
            const state = this.loadUserState().data;
            const schedules = this.loadAllSchedules().data || [];
            const preferences = this.loadPreferences().data;
            const selectedCourses = this.loadSelectedCourses().data || [];

            const exportData = {
                version: '2.0',
                timestamp: new Date().toISOString(),
                checksum: '',
                state,
                schedules,
                preferences,
                selectedCourses
            };

            // Generate checksum for integrity verification
            const dataString = JSON.stringify({
                state: exportData.state,
                schedules: exportData.schedules,
                preferences: exportData.preferences,
                selectedCourses: exportData.selectedCourses
            });
            exportData.checksum = this.generateChecksum(dataString);

            return {
                data: JSON.stringify(exportData, null, 2),
                valid: true
            };
        } catch (error) {
            return {
                data: null,
                valid: false,
                error: `Failed to export data: ${error}`
            };
        }
    }

    importData(jsonData: string): TransactionResult {
        return this.executeSyncTransaction(() => {
            const data = JSON.parse(jsonData);
            
            // Verify checksum if available
            if (data.checksum) {
                const verifyData = {
                    state: data.state,
                    schedules: data.schedules,
                    preferences: data.preferences,
                    selectedCourses: data.selectedCourses
                };
                const calculatedChecksum = this.generateChecksum(JSON.stringify(verifyData));
                if (calculatedChecksum !== data.checksum) {
                    throw new Error('Data integrity check failed - checksum mismatch');
                }
            }
            
            if (data.state) {
                localStorage.setItem(TransactionalStorageManager.STORAGE_KEYS.USER_STATE, this.safeStringify(data.state));
            }
            if (data.preferences) {
                localStorage.setItem(TransactionalStorageManager.STORAGE_KEYS.PREFERENCES, this.safeStringify(data.preferences));
            }
            if (data.schedules) {
                localStorage.setItem(TransactionalStorageManager.STORAGE_KEYS.SCHEDULES, this.safeStringify(data.schedules));
            }
            if (data.selectedCourses) {
                localStorage.setItem(TransactionalStorageManager.STORAGE_KEYS.SELECTED_COURSES, this.safeStringify(data.selectedCourses));
            }
        });
    }

    private executeSyncTransaction(operation: () => void): TransactionResult {
        const transactionId = this.generateTransactionId();
        const transaction: StorageTransaction = {
            id: transactionId,
            operations: [],
            timestamp: Date.now(),
            backupData: new Map()
        };

        try {
            // Create backup of current localStorage state
            this.createFullBackup(transaction);

            // Execute operation
            operation();

            // Verify data integrity
            const integrityCheck = this.verifyDataIntegrity();
            if (!integrityCheck.valid) {
                throw new Error(`Data integrity check failed: ${integrityCheck.error}`);
            }

            return {
                success: true,
                transactionId
            };

        } catch (error) {
            console.warn(`Sync transaction ${transactionId} failed, rolling back:`, error);
            const rollbackSuccess = this.rollbackTransaction(transaction);
            
            return {
                success: false,
                transactionId,
                error: error as Error,
                rolledBack: rollbackSuccess
            };
        }
    }

    private safeLoad<T>(key: string, defaultValue: T, dataType: string): { data: T | null; valid: boolean; error?: string } {
        try {
            const stored = localStorage.getItem(key);
            if (!stored) {
                return { data: defaultValue, valid: true };
            }
            
            const parsed = JSON.parse(stored, this.reviver);
            return { data: parsed, valid: true };
        } catch (error) {
            console.warn(`Failed to load ${dataType}:`, error);
            return { 
                data: defaultValue,
                valid: false,
                error: `Failed to load ${dataType}: ${error}`
            };
        }
    }

    private safeStringify(data: any): string {
        return JSON.stringify(data, this.replacer);
    }

    private readonly replacer = (key: string, value: any): any => {
        if (value instanceof Set) {
            return { __type: 'Set', value: [...value] };
        }

        if (key === 'department' && value && value.courses) {
            return {
                abbreviation: value.abbreviation,
                name: value.name
            };
        }

        if (key === 'selectedSection' && value && typeof value === 'object' && value.number) {
            return undefined;
        }

        return value;
    };

    private readonly reviver = (key: string, value: any): any => {
        if (typeof value === 'object' && value !== null && value.__type === 'Set') {
            return new Set(value.value);
        }
        return value;
    };

    private getDefaultPreferences(): SchedulePreferences {
        return {
            preferredTimeRange: {
                startTime: { hours: 8, minutes: 0 },
                endTime: { hours: 18, minutes: 0 }
            },
            preferredDays: new Set(['mon', 'tue', 'wed', 'thu', 'fri']),
            avoidBackToBackClasses: false,
            theme: 'wpi-classic'
        };
    }

    private generateTransactionId(): string {
        return `tx_${Date.now()}_${++this.transactionCounter}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private extractKeysFromOperations(operations: (() => void)[]): string[] {
        return Object.values(TransactionalStorageManager.STORAGE_KEYS);
    }

    private createBackup(transaction: StorageTransaction, keys: string[]): void {
        for (const key of keys) {
            try {
                const value = localStorage.getItem(key);
                transaction.backupData.set(key, value);
            } catch (error) {
                console.warn(`Failed to backup key ${key}:`, error);
            }
        }
    }

    private createFullBackup(transaction: StorageTransaction): void {
        const keys = Object.values(TransactionalStorageManager.STORAGE_KEYS);
        this.createBackup(transaction, keys);
    }

    private rollbackTransaction(transaction: StorageTransaction): boolean {
        try {
            for (const [key, value] of transaction.backupData.entries()) {
                if (value === null) {
                    localStorage.removeItem(key);
                } else {
                    localStorage.setItem(key, value);
                }
            }
            return true;
        } catch (error) {
            console.error(`Failed to rollback transaction ${transaction.id}:`, error);
            return false;
        }
    }

    private commitTransaction(transaction: StorageTransaction): void {
        // Log successful transaction for debugging
        console.log(`Transaction ${transaction.id} committed successfully`);
    }

    private verifyDataIntegrity(): { valid: boolean; error?: string } {
        try {
            // Check that localStorage is still accessible
            const testKey = 'wpi-integrity-test';
            const testValue = 'test';
            localStorage.setItem(testKey, testValue);
            const retrieved = localStorage.getItem(testKey);
            localStorage.removeItem(testKey);
            
            if (retrieved !== testValue) {
                return { valid: false, error: 'localStorage read/write test failed' };
            }

            // Verify key data structures can be parsed
            const schedules = this.loadAllSchedules();
            if (!schedules.valid) {
                return { valid: false, error: `Schedule data invalid: ${schedules.error}` };
            }

            const preferences = this.loadPreferences();
            if (!preferences.valid) {
                return { valid: false, error: `Preferences data invalid: ${preferences.error}` };
            }

            const selectedCourses = this.loadSelectedCourses();
            if (!selectedCourses.valid) {
                return { valid: false, error: `Selected courses data invalid: ${selectedCourses.error}` };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, error: `Integrity check failed: ${error}` };
        }
    }

    private generateChecksum(data: string): string {
        let hash = 0;
        if (data.length === 0) return hash.toString();
        
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return hash.toString();
    }

    isHealthy(): { healthy: boolean; issues: string[] } {
        const issues: string[] = [];
        
        try {
            // Test localStorage availability
            const testKey = 'wpi-health-check';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
        } catch (error) {
            issues.push(`localStorage unavailable: ${error}`);
        }

        // Check data integrity
        const integrityCheck = this.verifyDataIntegrity();
        if (!integrityCheck.valid) {
            issues.push(`Data integrity issue: ${integrityCheck.error}`);
        }

        // Check for active transactions that might be stuck
        if (this.activeTransactions.size > 0) {
            const stuckTransactions = Array.from(this.activeTransactions.values())
                .filter(tx => Date.now() - tx.timestamp > 30000); // 30 seconds
            
            if (stuckTransactions.length > 0) {
                issues.push(`${stuckTransactions.length} transactions stuck for >30s`);
            }
        }

        return {
            healthy: issues.length === 0,
            issues
        };
    }
}