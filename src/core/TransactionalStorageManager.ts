/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TransactionalStorageManager - Atomic localStorage Operations Foundation
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ARCHITECTURE ROLE:
 * - Low-level localStorage operations with transaction support and data consistency
 * - Foundation layer providing atomic operations for ProfileStateManager
 * - Handles serialization/deserialization of complex data types (Sets, nested objects)
 * - Prevents data corruption through transactional operations and rollback support
 * - Bridge between application state and browser localStorage persistence
 * 
 * DEPENDENCIES:
 * - Schedule, SchedulePreferences, SelectedCourse types → Data models for storage operations
 * - UserScheduleState interface → Legacy state model for backward compatibility
 * - Browser localStorage API → Underlying persistence mechanism
 * - JSON serialization/deserialization → Data transformation for storage
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
 *      localStorage
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
 * - saveSchedule() / loadSchedule() / deleteSchedule() for schedule management
 * - savePreferences() / loadPreferences() for user settings persistence
 * - saveSelectedCourses() / loadSelectedCourses() for course selection state
 * - saveThemePreference() / loadThemePreference() for UI theme persistence
 * - saveActiveScheduleId() / loadActiveScheduleId() for active schedule tracking
 * 
 * Serialization System:
 * - Custom replacer/reviver for JSON serialization handling
 * - Set serialization/deserialization support (converted to/from arrays)
 * - Department reference optimization (removes circular references)
 * - Section object filtering to prevent duplicate storage
 * - Safe error handling for malformed data
 * 
 * Data Integrity & Safety:
 * - verifyDataIntegrity() checks after every operation
 * - Atomic transactions prevent partial data corruption
 * - Rollback capability restores previous state on failures
 * - Health checking with localStorage availability testing
 * - Checksum generation/verification for import/export operations
 * 
 * Import/Export Functionality:
 * - exportData() generates JSON with version and checksum information
 * - importData() with integrity verification and checksum validation
 * - Cross-version compatibility support for future migrations
 * - Comprehensive data portability for user backups
 * 
 * STORAGE KEY ARCHITECTURE:
 * - USER_STATE: Legacy user state for backward compatibility
 * - PREFERENCES: Schedule generation preferences and user settings
 * - SCHEDULES: All saved schedules with course selections
 * - SELECTED_COURSES: Standalone course selections (fallback)
 * - THEME: Active theme selection for UI appearance
 * - ACTIVE_SCHEDULE_ID: Currently active schedule identifier
 * - TRANSACTION_LOG: Operation logging for debugging (reserved)
 * 
 * TRANSACTION FLOW:
 * 1. Begin transaction with unique ID generation
 * 2. Create backup of all affected localStorage keys
 * 3. Execute all operations in sequence
 * 4. Verify data integrity after operations
 * 5. Commit transaction on success OR rollback on failure
 * 6. Clean up transaction records and return result
 * 
 * ERROR HANDLING & RECOVERY:
 * - Try/catch blocks around all localStorage operations
 * - Graceful degradation with default values for missing data
 * - Automatic rollback on transaction failures
 * - Health checking detects and reports storage issues
 * - Safe loading with fallback to default values
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Lazy loading patterns for large data structures
 * - Efficient serialization avoiding unnecessary data
 * - Batch operations within single transactions
 * - Integrity verification only on critical operations
 * 
 * ARCHITECTURAL PATTERNS:
 * - Repository: Centralized data access layer
 * - Transaction: Atomic operations with rollback capability
 * - Template Method: Consistent operation patterns for all data types  
 * - Strategy: Pluggable serialization/deserialization strategies
 * - Singleton: Shared storage manager instance across components
 * 
 * BENEFITS ACHIEVED:
 * - Eliminated data corruption through atomic operations
 * - Consistent serialization/deserialization across all data types
 * - Reliable rollback capability for failed operations
 * - Health monitoring and integrity verification
 * - Data portability through export/import functionality
 * - Foundation for unified storage architecture
 * 
 * INTEGRATION NOTES:
 * - Designed specifically as foundation for ProfileStateManager
 * - Handles complex data types (Sets, circular references) transparently
 * - Provides transaction abstraction over localStorage limitations
 * - Enables event-driven architecture through reliable persistence
 * - Supports multi-schedule functionality through efficient storage patterns
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { Schedule, UserScheduleState, SchedulePreferences, SelectedCourse } from '../types/schedule'
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
        SELECTED_COURSES: 'wpi-planner-selected-courses',
        THEME: 'wpi-planner-theme',
        ACTIVE_SCHEDULE_ID: 'wpi-planner-active-schedule-id',
        TRANSACTION_LOG: 'wpi-planner-transaction-log'
    };

    private activeTransactions = new Map<string, StorageTransaction>();
    private transactionCounter = 0;
    private indexedDBStorage: IndexedDBStorageManager;
    private useIndexedDB = false;

    constructor() {
        this.indexedDBStorage = new IndexedDBStorageManager();
        this.initializeIndexedDB();
    }

    private async initializeIndexedDB(): Promise<void> {
        try {
            const isCompatible = await this.indexedDBStorage.checkCompatibility();
            if (isCompatible) {
                this.useIndexedDB = true;
                console.log('IndexedDB initialized successfully');
            } else {
                console.warn('IndexedDB not available, using localStorage fallback');
            }
        } catch (error) {
            console.error('Failed to initialize IndexedDB:', error);
            this.useIndexedDB = false;
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
        if (this.useIndexedDB) {
            const result = await this.indexedDBStorage.saveSchedule(schedule);
            return {
                success: result.success,
                transactionId: `indexeddb-${Date.now()}`,
                error: result.error ? new Error(result.error) : undefined
            };
        } else {
            return this.saveScheduleToLocalStorage(schedule);
        }
    }

    async loadSchedule(scheduleId: string): Promise<{ data: Schedule | null; valid: boolean; error?: string }> {
        if (this.useIndexedDB) {
            const result = await this.indexedDBStorage.loadSchedule(scheduleId);
            return {
                data: result.data || null,
                valid: result.success,
                error: result.error
            };
        } else {
            return this.loadScheduleFromLocalStorage(scheduleId);
        }
    }

    async loadAllSchedules(): Promise<{ data: Schedule[] | null; valid: boolean; error?: string }> {
        if (this.useIndexedDB) {
            const result = await this.indexedDBStorage.loadAllSchedules();
            return {
                data: result.data || [],
                valid: result.success,
                error: result.error
            };
        } else {
            return this.loadAllSchedulesFromLocalStorage();
        }
    }

    async deleteSchedule(scheduleId: string): Promise<TransactionResult> {
        if (this.useIndexedDB) {
            const result = await this.indexedDBStorage.deleteSchedule(scheduleId);
            return {
                success: result.success,
                transactionId: `indexeddb-${Date.now()}`,
                error: result.error ? new Error(result.error) : undefined
            };
        } else {
            return this.deleteScheduleFromLocalStorage(scheduleId);
        }
    }

    private saveScheduleToLocalStorage(schedule: Schedule): TransactionResult {
        return this.executeSyncTransaction(() => {
            const schedules = this.loadAllSchedulesFromLocalStorage().data || [];
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

    private loadScheduleFromLocalStorage(scheduleId: string): { data: Schedule | null; valid: boolean; error?: string } {
        const schedulesResult = this.loadAllSchedulesFromLocalStorage();
        if (!schedulesResult.valid || !schedulesResult.data) {
            return { data: null, valid: false, error: schedulesResult.error };
        }

        const schedule = schedulesResult.data.find(s => s.id === scheduleId) || null;
        return { data: schedule, valid: true };
    }

    private loadAllSchedulesFromLocalStorage(): { data: Schedule[] | null; valid: boolean; error?: string } {
        return this.safeLoad<Schedule[]>(
            TransactionalStorageManager.STORAGE_KEYS.SCHEDULES,
            [],
            'schedules'
        );
    }

    private deleteScheduleFromLocalStorage(scheduleId: string): TransactionResult {
        return this.executeSyncTransaction(() => {
            const schedules = this.loadAllSchedulesFromLocalStorage().data || [];
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
        const result = this.executeSyncTransaction(() => {
            const serializedCourses = this.safeStringify(selectedCourses);
            localStorage.setItem(TransactionalStorageManager.STORAGE_KEYS.SELECTED_COURSES, serializedCourses);
        });
        return result;
    }

    loadSelectedCourses(): { data: SelectedCourse[]; valid: boolean; error?: string } {
        const result = this.safeLoad<SelectedCourse[]>(
            TransactionalStorageManager.STORAGE_KEYS.SELECTED_COURSES,
            [],
            'selected courses'
        );
        
        
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
            const schedules = this.loadAllSchedulesFromLocalStorage().data || [];
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

            // Generate checksum for integrity verification (use custom replacer for Sets)
            const dataString = this.safeStringify({
                state: exportData.state,
                schedules: exportData.schedules,
                preferences: exportData.preferences,
                selectedCourses: exportData.selectedCourses
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

    importData(jsonData: string): TransactionResult {
        return this.executeSyncTransaction(() => {
            const data = JSON.parse(jsonData, this.reviver);

            // Verify checksum if available (use custom replacer for Sets)
            if (data.checksum) {
                const verifyData = {
                    state: data.state,
                    schedules: data.schedules,
                    preferences: data.preferences,
                    selectedCourses: data.selectedCourses
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

            // Verify key data structures can be parsed
            const schedules = this.loadAllSchedulesFromLocalStorage();
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

    async getStorageStats(): Promise<{
        totalSchedules: number;
        estimatedSize: number;
        isUsingIndexedDB: boolean;
        schedulesSizes?: Map<string, number>;
    }> {
        if (this.useIndexedDB) {
            const stats = await this.indexedDBStorage.getStorageStats();
            return {
                totalSchedules: stats.data?.totalSchedules || 0,
                estimatedSize: stats.data?.estimatedSize || 0,
                isUsingIndexedDB: true,
                schedulesSizes: stats.data?.schedulesSizes
            };
        } else {
            const schedulesResult = this.loadAllSchedulesFromLocalStorage();
            const schedules = schedulesResult.data || [];
            const serialized = this.safeStringify(schedules);
            const size = new Blob([serialized]).size;

            return {
                totalSchedules: schedules.length,
                estimatedSize: size,
                isUsingIndexedDB: false
            };
        }
    }
}