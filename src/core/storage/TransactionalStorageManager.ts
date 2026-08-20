/**
 * Hybrid storage layer with IndexedDB for schedules and localStorage for preferences, providing atomic transactions
 */
import { Schedule, UserScheduleState, SchedulePreferences } from '../../types/schedule'
import { IndexedDBStorageManager } from './IndexedDBStorageManager'
import { setReplacer, setReviver } from '../../utils/jsonSerializer'
import type { StudentRecord } from '../../types/degree'
import { logger } from '../../utils/logger'

export interface StorageTransaction {
    id: string;
    operations: StorageOperation[];
    timestamp: number;
    backupData: Map<string, string | null>;
}

export interface StorageOperation {
    type: 'save' | 'delete';
    key: string;
    value?: string | null;
    previousValue?: string | null;
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
        ACTIVE_SCHEDULE_ID: 'wpi-planner-active-schedule-id',
        DEGREE_RECORD: 'wpi-planner-degree-record',
        TRANSACTION_LOG: 'wpi-planner-transaction-log'
    };

    private activeTransactions = new Map<string, StorageTransaction>();
    private transactionCounter = 0;
    private indexedDBStorage: IndexedDBStorageManager;
    private indexedDBInitialized = false;

    constructor() {
        this.indexedDBStorage = new IndexedDBStorageManager();
    }

    private async ensureInitialized(): Promise<void> {
        if (this.indexedDBInitialized) {
            return;
        }

        try {
            const isCompatible = await this.indexedDBStorage.checkCompatibility();
            if (!isCompatible) {
                throw new Error('IndexedDB not available in this browser');
            }
            this.indexedDBInitialized = true;
        } catch (error) {
            logger.error('Failed to initialize IndexedDB:', error);
            throw new Error('IndexedDB initialization failed - schedule operations unavailable');
        }
    }

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
            const keysToBackup = this.extractKeysFromOperations(operations);
            this.createBackup(transaction, keysToBackup);

            for (const operation of operations) {
                operation();
            }

            const integrityCheck = this.verifyDataIntegrity();
            if (!integrityCheck.valid) {
                throw new Error(`Data integrity check failed: ${integrityCheck.error}`);
            }

            return {
                success: true,
                transactionId
            };

        } catch (error) {
            logger.warn(`Transaction ${transactionId} failed, rolling back:`, error);
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
            const serializedState = JSON.stringify(state, this.replacer);
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

    async saveSchedule(schedule: Schedule): Promise<TransactionResult> {
        await this.ensureInitialized();
        const result = await this.indexedDBStorage.saveSchedule(schedule);
        return {
            success: result.success,
            transactionId: `indexeddb-${Date.now()}`,
            error: result.error ? new Error(result.error) : undefined
        };
    }

    async loadSchedule(scheduleId: string): Promise<{ data: Schedule | null; valid: boolean; error?: string }> {
        await this.ensureInitialized();
        const result = await this.indexedDBStorage.loadSchedule(scheduleId);
        return {
            data: result.data ?? null,
            valid: result.success,
            error: result.error
        };
    }

    async loadAllSchedules(): Promise<{ data: Schedule[] | null; valid: boolean; error?: string }> {
        await this.ensureInitialized();
        const result = await this.indexedDBStorage.loadAllSchedules();
        return {
            data: result.data ?? [],
            valid: result.success,
            error: result.error
        };
    }

    async deleteSchedule(scheduleId: string): Promise<TransactionResult> {
        await this.ensureInitialized();
        const result = await this.indexedDBStorage.deleteSchedule(scheduleId);
        return {
            success: result.success,
            transactionId: `indexeddb-${Date.now()}`,
            error: result.error ? new Error(result.error) : undefined
        };
    }

    savePreferences(preferences: SchedulePreferences): TransactionResult {
        return this.executeSyncTransaction(() => {
            const serializedPreferences = JSON.stringify(preferences, this.replacer);
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
            data: result.data ?? this.getDefaultPreferences(),
            valid: result.valid,
            error: result.error
        };
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
                data: (saved?.length ?? 0) > 0 ? saved : null,
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

    /** Persist the imported degree record (a small single blob) to localStorage. */
    saveDegreeRecord(record: StudentRecord | null): TransactionResult {
        return this.executeSyncTransaction(() => {
            if (record) {
                localStorage.setItem(
                    TransactionalStorageManager.STORAGE_KEYS.DEGREE_RECORD,
                    JSON.stringify(record, this.replacer)
                );
            } else {
                localStorage.removeItem(TransactionalStorageManager.STORAGE_KEYS.DEGREE_RECORD);
            }
        });
    }

    /** Load the raw persisted degree record. Caller validates the schema. */
    loadDegreeRecord(): { data: StudentRecord | null; valid: boolean; error?: string } {
        return this.safeLoad<StudentRecord | null>(
            TransactionalStorageManager.STORAGE_KEYS.DEGREE_RECORD,
            null,
            'degree record'
        );
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

    async clearAllDataComplete(): Promise<TransactionResult> {
        try {
            await this.indexedDBStorage.clearAllSchedules();
            const result = this.clearAllData();
            return result;
        } catch (error) {
            return {
                success: false,
                transactionId: `clear-${Date.now()}`,
                error: error as Error
            };
        }
    }

    /**
     * Expects full Schedule objects with Course/Section references. The caller
     * (ProfileStateManager) is responsible for converting from SyncData (IDs only)
     * to full objects before calling this method.
     */
    async importData(
        schedules: Schedule[],
        activeScheduleId: string | null,
        preferences?: SchedulePreferences
    ): Promise<TransactionResult> {
        try {
            if (preferences) {
                localStorage.setItem(
                    TransactionalStorageManager.STORAGE_KEYS.PREFERENCES,
                    JSON.stringify(preferences, this.replacer)
                );
            }

            if (schedules.length > 0) {
                await this.ensureInitialized();
                for (const schedule of schedules) {
                    await this.saveSchedule(schedule);
                }
            }

            if (activeScheduleId !== undefined) {
                this.saveActiveScheduleId(activeScheduleId);
            }


            return {
                success: true,
                transactionId: `import-${Date.now()}`
            };
        } catch (error) {
            logger.error('[TransactionalStorageManager] importData() failed:', error);
            return {
                success: false,
                transactionId: `import-${Date.now()}`,
                error: error as Error
            };
        }
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
            this.createFullBackup(transaction);

            operation();

            const integrityCheck = this.verifyDataIntegrity();
            if (!integrityCheck.valid) {
                throw new Error(`Data integrity check failed: ${integrityCheck.error}`);
            }

            return {
                success: true,
                transactionId
            };

        } catch (error) {
            logger.warn(`Sync transaction ${transactionId} failed, rolling back:`, error);
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
            logger.warn(`Failed to load ${dataType}:`, error);
            return { 
                data: defaultValue,
                valid: false,
                error: `Failed to load ${dataType}: ${error}`
            };
        }
    }

    private readonly replacer = setReplacer;
    private readonly reviver = setReviver;

    private getDefaultPreferences(): SchedulePreferences {
        return {
            theme: 'wpi-dark',
            bookmarkedCourseIds: []
        };
    }

    private generateTransactionId(): string {
        return `tx_${Date.now()}_${++this.transactionCounter}_${Math.random().toString(36).substring(2, 11)}`;
    }

    private extractKeysFromOperations(_operations: (() => void)[]): string[] {
        return Object.values(TransactionalStorageManager.STORAGE_KEYS);
    }

    private createBackup(transaction: StorageTransaction, keys: string[]): void {
        for (const key of keys) {
            try {
                const value = localStorage.getItem(key);
                transaction.backupData.set(key, value);
            } catch (error) {
                logger.warn(`Failed to backup key ${key}:`, error);
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
            logger.error(`Failed to rollback transaction ${transaction.id}:`, error);
            return false;
        }
    }

    private verifyDataIntegrity(): { valid: boolean; error?: string } {
        try {
            const testKey = 'wpi-integrity-test';
            const testValue = 'test';
            localStorage.setItem(testKey, testValue);
            const retrieved = localStorage.getItem(testKey);
            localStorage.removeItem(testKey);

            if (retrieved !== testValue) {
                return { valid: false, error: 'localStorage read/write test failed' };
            }

            // Schedules live in IndexedDB and are checked separately
            const preferences = this.loadPreferences();
            if (!preferences.valid) {
                return { valid: false, error: `Preferences data invalid: ${preferences.error}` };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, error: `Integrity check failed: ${error}` };
        }
    }

    isHealthy(): { healthy: boolean; issues: string[] } {
        const issues: string[] = [];
        
        try {
            const testKey = 'wpi-health-check';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
        } catch (error) {
            issues.push(`localStorage unavailable: ${error}`);
        }

        const integrityCheck = this.verifyDataIntegrity();
        if (!integrityCheck.valid) {
            issues.push(`Data integrity issue: ${integrityCheck.error}`);
        }

        // Flag transactions that may be stuck
        if (this.activeTransactions.size > 0) {
            const stuckTransactions = Array.from(this.activeTransactions.values())
                .filter(tx => Date.now() - tx.timestamp > 30_000); // 30 seconds

            if (stuckTransactions.length > 0) {
                issues.push(`${stuckTransactions.length} transactions stuck for >30s`);
            }
        }

        return {
            healthy: issues.length === 0,
            issues
        };
    }

    async getStorageStats(): Promise<{
        totalSchedules: number;
        estimatedSize: number;
        isUsingIndexedDB: boolean;
        schedulesSizes?: Map<string, number>;
    }> {
        await this.ensureInitialized();
        const stats = await this.indexedDBStorage.getStorageStats();
        return {
            totalSchedules: stats.data?.totalSchedules ?? 0,
            estimatedSize: stats.data?.estimatedSize ?? 0,
            isUsingIndexedDB: true,
            schedulesSizes: stats.data?.schedulesSizes
        };
    }
}