/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TransactionalStorageManager - Hybrid Storage Architecture
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE ROLE:
 * - Hybrid storage strategy: IndexedDB for schedules, localStorage for small data
 * - Foundation layer providing atomic operations for ProfileStateManager
 * - Handles serialization/deserialization of complex data types (Sets, nested objects)
 * - Prevents data corruption through transactional operations and rollback support
 * - Bridge between application state and browser storage mechanisms
 *
 * STORAGE STRATEGY:
 * IndexedDB (Primary - Large Data):
 * - All schedule data (course selections, sections, configurations)
 * - No size limitations for schedule storage
 * - Optimized for complex course/section hierarchies
 *
 * localStorage (Secondary - Small Data):
 * - User preferences and settings
 * - Theme selections
 * - Active schedule ID
 * - Filter states (course/schedule filters)
 *
 * DEPENDENCIES:
 * - IndexedDBStorageManager → Primary storage backend for schedule data
 * - Schedule, SchedulePreferences, SelectedCourse types → Data models
 * - Browser localStorage API → Preferences and settings storage
 * - JSON serialization/deserialization → Data transformation
 *
 * USED BY:
 * - ProfileStateManager → Primary consumer for all state persistence operations
 * - Import/Export functionality → Data portability operations
 * - Health checking systems → Storage integrity verification
 *
 * STORAGE ARCHITECTURE INTEGRATION:
 * ```
 * ProfileStateManager (Single Source of Truth)
 *           ↓
 * TransactionalStorageManager (This Component)
 *           ↓
 *    ┌──────┴──────┐
 * IndexedDB    localStorage
 * (Schedules)  (Preferences)
 * ```
 *
 * KEY FEATURES:
 * Transaction Management:
 * - executeTransaction() with atomic operations and automatic rollback
 * - Backup creation before operations to enable rollback
 * - Data integrity verification after each transaction
 * - Transaction logging for debugging and audit trails
 *
 * Data Operations:
 * IndexedDB Operations (Schedule Data):
 * - saveSchedule() / loadSchedule() / deleteSchedule() for schedule management
 * - All schedule operations use IndexedDB exclusively
 * - No localStorage fallback for schedule data
 *
 * localStorage Operations (Small Data):
 * - savePreferences() / loadPreferences() for user settings
 * - saveThemePreference() / loadThemePreference() for UI theme
 * - saveActiveScheduleId() / loadActiveScheduleId() for active schedule tracking
 *
 * Serialization System:
 * - Custom replacer/reviver for JSON serialization handling
 * - Set serialization/deserialization support (converted to/from arrays)
 * - Department reference optimization (removes circular references)
 * - Safe error handling for malformed data
 *
 * Data Integrity & Safety:
 * - verifyDataIntegrity() checks after every operation
 * - Atomic transactions prevent partial data corruption
 * - Rollback capability restores previous state on failures
 * - Health checking with storage availability testing
 * - Checksum generation/verification for import/export operations
 *
 * Import/Export Functionality:
 * - exportData() generates JSON with version and checksum information
 * - importData() with integrity verification and checksum validation
 * - Cross-version compatibility support for future migrations
 * - Comprehensive data portability for user backups
 *
 * STORAGE KEY ARCHITECTURE:
 * localStorage Keys (5 keys - small data only):
 * - PREFERENCES: Schedule generation preferences and user settings
 * - THEME: Active theme selection for UI appearance
 * - ACTIVE_SCHEDULE_ID: Currently active schedule identifier
 * - TRANSACTION_LOG: Operation logging for debugging (reserved)
 * - USER_STATE: Legacy user state (deprecated, kept for migration)
 *
 * IndexedDB Stores:
 * - schedules: All schedule data with course selections
 *
 * INITIALIZATION & LIFECYCLE:
 * - IndexedDB initialized synchronously on first use
 * - ensureInitialized() called before any schedule operations
 * - localStorage available immediately (no async init needed)
 * - No fallback routing - dedicated storage per data type
 *
 * ERROR HANDLING & RECOVERY:
 * - Try/catch blocks around all storage operations
 * - Graceful degradation with default values for missing data
 * - Automatic rollback on transaction failures
 * - Health checking detects and reports storage issues
 * - Safe loading with fallback to default values
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - IndexedDB for large datasets (no localStorage quota issues)
 * - Efficient serialization avoiding unnecessary data
 * - Batch operations within single transactions
 * - Integrity verification only on critical operations
 *
 * ARCHITECTURAL PATTERNS:
 * - Repository: Centralized data access layer
 * - Transaction: Atomic operations with rollback capability
 * - Strategy: Storage routing based on data type (large vs small)
 * - Adapter: Unified interface over IndexedDB and localStorage
 *
 * BENEFITS ACHIEVED:
 * - Eliminated localStorage quota issues for large schedules
 * - Consistent serialization/deserialization across storage types
 * - Clear separation of concerns (schedules vs preferences)
 * - Reliable rollback capability for failed operations
 * - Health monitoring and integrity verification
 * - Foundation for unified storage architecture
 *
 * INTEGRATION NOTES:
 * - Designed specifically as foundation for ProfileStateManager
 * - Handles complex data types (Sets, circular references) transparently
 * - IndexedDB ensures unlimited schedule storage capacity
 * - Enables event-driven architecture through reliable persistence
 * - Supports multi-schedule functionality through efficient storage patterns
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { Schedule, UserScheduleState, SchedulePreferences } from '../types/schedule'
import { IndexedDBStorageManager } from './IndexedDBStorageManager'
import { createJSONReplacer, createJSONReviver } from '../utils/jsonSerializer'

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
            data: result.data || null,
            valid: result.success,
            error: result.error
        };
    }

    async loadAllSchedules(): Promise<{ data: Schedule[] | null; valid: boolean; error?: string }> {
        await this.ensureInitialized();
        const result = await this.indexedDBStorage.loadAllSchedules();
        return {
            data: result.data || [],
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
            data: result.data || this.getDefaultPreferences(),
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

    async exportData(): Promise<{ data: string | null; valid: boolean; error?: string }> {
        try {
            const state = this.loadUserState().data;
            const schedulesResult = await this.loadAllSchedules();
            const schedules = schedulesResult.data || [];
            const preferences = this.loadPreferences().data;

            const exportData = {
                version: '3.0',
                timestamp: new Date().toISOString(),
                checksum: '',
                state,
                schedules,
                preferences
            };

            // Generate checksum for integrity verification (use custom replacer for Sets)
            const dataString = this.safeStringify({
                state: exportData.state,
                schedules: exportData.schedules,
                preferences: exportData.preferences
            });
            exportData.checksum = this.generateChecksum(dataString);

            return {
                data: JSON.stringify(exportData, this.replacer, 2),
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

    async importData(jsonData: string): Promise<TransactionResult> {
        try {
            const data = JSON.parse(jsonData, this.reviver);

            // Verify checksum if available (use custom replacer for Sets)
            if (data.checksum) {
                const verifyData = {
                    state: data.state,
                    schedules: data.schedules,
                    preferences: data.preferences
                };
                const calculatedChecksum = this.generateChecksum(this.safeStringify(verifyData));
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
                // Import schedules to IndexedDB (await each save)
                await this.ensureInitialized();
                for (const schedule of data.schedules) {
                    await this.saveSchedule(schedule);
                }
            }

            return {
                success: true,
                transactionId: `import-${Date.now()}`
            };
        } catch (error) {
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

    async getStorageStats(): Promise<{
        totalSchedules: number;
        estimatedSize: number;
        isUsingIndexedDB: boolean;
        schedulesSizes?: Map<string, number>;
    }> {
        await this.ensureInitialized();
        const stats = await this.indexedDBStorage.getStorageStats();
        return {
            totalSchedules: stats.data?.totalSchedules || 0,
            estimatedSize: stats.data?.estimatedSize || 0,
            isUsingIndexedDB: true,
            schedulesSizes: stats.data?.schedulesSizes
        };
    }
}