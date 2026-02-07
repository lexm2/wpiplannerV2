/**
 * Hybrid storage layer with IndexedDB for schedules and localStorage for preferences, providing atomic transactions
 */
import { Schedule, UserScheduleState, SchedulePreferences } from '../../types/schedule'
import { IndexedDBStorageManager } from './IndexedDBStorageManager'
import { createJSONReplacer, createJSONReviver } from '../../utils/jsonSerializer'
import { ScheduleState } from '../../types/ScheduleState'
import { ApplicationState } from '../../types/ApplicationState'

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
        THEME: 'wpi-planner-theme',
        ACTIVE_SCHEDULE_ID: 'wpi-planner-active-schedule-id',
        TRANSACTION_LOG: 'wpi-planner-transaction-log'
    };

    private activeTransactions = new Map<string, StorageTransaction>();
    private transactionCounter = 0;
    private indexedDBStorage: IndexedDBStorageManager;
    private indexedDBInitialized = false;

    constructor() {
        this.indexedDBStorage = new IndexedDBStorageManager();
    }

    /**
     * Ensures IndexedDB is initialized before any schedule operations.
     * Called automatically by all schedule-related methods.
     */
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
            console.log('IndexedDB initialized successfully');
        } catch (error) {
            console.error('Failed to initialize IndexedDB:', error);
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
            data: result.data ?? this.getDefaultPreferences(),
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
                data: savedTheme ?? 'wpi-dark',
                valid: true
            };
        } catch (error) {
            return {
                data: 'wpi-dark',
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

    clearAllData(): TransactionResult {
        return this.executeSyncTransaction(() => {
            Object.values(TransactionalStorageManager.STORAGE_KEYS).forEach(key => {
                if (key !== TransactionalStorageManager.STORAGE_KEYS.TRANSACTION_LOG) {
                    localStorage.removeItem(key);
                }
            });
        });
    }

    async exportData(options: { compressed?: boolean } = {}): Promise<{ data: string | null; valid: boolean; error?: string }> {
        try {
            const schedulesResult = await this.loadAllSchedules();
            const fullSchedules = schedulesResult.data ?? [];
            const preferences = this.loadPreferences().data;
            const activeScheduleIdResult = this.loadActiveScheduleId();
            const activeScheduleId = activeScheduleIdResult.data;

            // Convert legacy Schedule objects to ScheduleState
            const scheduleStates = fullSchedules.map(s => ScheduleState.fromLegacySchedule(s));

            // Create ApplicationState (with full objects)
            const appState = new ApplicationState(
                activeScheduleId,
                scheduleStates,
                preferences
            );

            // Export as minimal JSON format
            const minimalData = appState.toMinimalFormat();

            console.log('[TransactionalStorageManager] Exported minimal data:', {
                version: minimalData.v,
                activeScheduleIndex: minimalData.a,
                scheduleCount: minimalData.s.length,
                totalCourses: minimalData.s.reduce((sum, [_, courses]) => sum + courses.length / 2, 0)
            });

            return {
                data: JSON.stringify(minimalData, this.replacer, 2),
                valid: true
            };
        } catch (error) {
            console.error('[TransactionalStorageManager] Export failed:', error);
            return {
                data: null,
                valid: false,
                error: `Failed to export data: ${error}`
            };
        }
    }

    /**
     * Import data with full Schedule objects (not IDs)
     *
     * NOTE: This method expects full Schedule objects with Course/Section references.
     * The caller (ProfileStateManager) is responsible for converting from SyncData
     * (IDs only) to full objects before calling this method.
     *
     * @param schedules - Full Schedule objects to import
     * @param activeScheduleId - ID of active schedule
     * @param preferences - Optional preferences
     */
    async importData(
        schedules: Schedule[],
        activeScheduleId: string | null,
        preferences?: SchedulePreferences
    ): Promise<TransactionResult> {
        try {
            // Save preferences if provided
            if (preferences) {
                localStorage.setItem(
                    TransactionalStorageManager.STORAGE_KEYS.PREFERENCES,
                    this.safeStringify(preferences)
                );
            }

            // Save schedules to IndexedDB
            if (schedules.length > 0) {
                await this.ensureInitialized();
                for (const schedule of schedules) {
                    await this.saveSchedule(schedule);
                }
                console.log('[TransactionalStorageManager] All schedules saved');
            }

            // Save active schedule ID
            if (activeScheduleId !== undefined) {
                this.saveActiveScheduleId(activeScheduleId);
                console.log('[TransactionalStorageManager] Saved activeScheduleId:', activeScheduleId);
            }

            console.log('[TransactionalStorageManager] Import completed successfully');

            return {
                success: true,
                transactionId: `import-${Date.now()}`
            };
        } catch (error) {
            console.error('[TransactionalStorageManager] importData() failed:', error);
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
        return JSON.stringify(data, createJSONReplacer());
    }

    private readonly replacer = createJSONReplacer();
    private readonly reviver = createJSONReviver();

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

            // Verify preferences data can be parsed (schedules are in IndexedDB, checked separately)
            const preferences = this.loadPreferences();
            if (!preferences.valid) {
                return { valid: false, error: `Preferences data invalid: ${preferences.error}` };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, error: `Integrity check failed: ${error}` };
        }
    }

    private async generateChecksum(data: string): Promise<string> {
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            try {
                const encoder = new TextEncoder();
                const dataBuffer = encoder.encode(data);
                const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            } catch (error) {
                console.warn('Web Crypto API failed, falling back to simple hash:', error);
                return this.fallbackChecksum(data);
            }
        }
        return this.fallbackChecksum(data);
    }

    private fallbackChecksum(data: string): string {
        let hash = 0;
        if (data.length === 0) return hash.toString();

        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
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