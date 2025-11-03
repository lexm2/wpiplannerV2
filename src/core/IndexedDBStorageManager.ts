/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * IndexedDBStorageManager - Primary Schedule Storage Backend
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE ROLE:
 * - Primary storage backend for all schedule data in the application
 * - High-capacity storage layer using browser IndexedDB API
 * - Handles large schedule collections without localStorage 5-10MB limits
 * - Provides async operations for non-blocking UI interactions
 * - Supports storage monitoring and usage statistics
 *
 * STORAGE STRATEGY:
 * - IndexedDB is the ONLY storage mechanism for schedules (no localStorage fallback)
 * - localStorage used separately for small data (preferences, theme, active schedule ID)
 * - Clear separation: IndexedDB = schedules, localStorage = configuration
 *
 * STORAGE ARCHITECTURE:
 * - Database: "wpi-planner-db"
 * - Object Stores: schedules (primary), preferences (reserved), selectedCourses (reserved)
 * - Indexes: By schedule ID, timestamp, name
 * - All schedule operations route through this manager exclusively
 *
 * KEY FEATURES:
 * - Unlimited storage capacity for schedules (browser quota applies, typically 50MB+)
 * - Async operations prevent UI blocking during large data operations
 * - Transaction support for data integrity and atomic operations
 * - Storage usage monitoring and statistics
 * - Automatic database versioning and migrations
 * - Mandatory initialization before use (called by TransactionalStorageManager)
 *
 * INTEGRATION:
 * - Used exclusively by TransactionalStorageManager for schedule operations
 * - Initialized on-demand before first schedule access
 * - No direct access from other components (encapsulated behind TransactionalStorageManager)
 */

import { Schedule } from '../types/schedule';
import { safeStringify } from '../utils/jsonSerializer';

interface StorageResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

interface StorageStats {
    totalSchedules: number;
    estimatedSize: number;
    schedulesSizes: Map<string, number>;
}

export class IndexedDBStorageManager {
    private static readonly DB_NAME = 'wpi-planner-db';
    private static readonly DB_VERSION = 1;
    private static readonly STORE_NAMES = {
        SCHEDULES: 'schedules',
        PREFERENCES: 'preferences',
        SELECTED_COURSES: 'selectedCourses'
    };

    private db: IDBDatabase | null = null;
    private initPromise: Promise<void> | null = null;

    async initialize(): Promise<void> {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB is not supported in this browser'));
                return;
            }

            const request = indexedDB.open(
                IndexedDBStorageManager.DB_NAME,
                IndexedDBStorageManager.DB_VERSION
            );

            request.onerror = () => {
                reject(new Error(`Failed to open database: ${request.error?.message}`));
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                if (!db.objectStoreNames.contains(IndexedDBStorageManager.STORE_NAMES.SCHEDULES)) {
                    const scheduleStore = db.createObjectStore(
                        IndexedDBStorageManager.STORE_NAMES.SCHEDULES,
                        { keyPath: 'id' }
                    );
                    scheduleStore.createIndex('name', 'name', { unique: false });
                    scheduleStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                if (!db.objectStoreNames.contains(IndexedDBStorageManager.STORE_NAMES.PREFERENCES)) {
                    db.createObjectStore(IndexedDBStorageManager.STORE_NAMES.PREFERENCES);
                }

                if (!db.objectStoreNames.contains(IndexedDBStorageManager.STORE_NAMES.SELECTED_COURSES)) {
                    db.createObjectStore(IndexedDBStorageManager.STORE_NAMES.SELECTED_COURSES);
                }
            };
        });

        return this.initPromise;
    }

    async saveSchedule(schedule: Schedule): Promise<StorageResult<void>> {
        try {
            await this.initialize();

            if (!this.db) {
                return { success: false, error: 'Database not initialized' };
            }

            return new Promise((resolve) => {
                const transaction = this.db!.transaction(
                    [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
                    'readwrite'
                );
                const store = transaction.objectStore(IndexedDBStorageManager.STORE_NAMES.SCHEDULES);

                const scheduleWithTimestamp = {
                    ...schedule,
                    timestamp: Date.now()
                };

                const request = store.put(scheduleWithTimestamp);

                request.onsuccess = () => {
                    resolve({ success: true });
                };

                request.onerror = () => {
                    resolve({
                        success: false,
                        error: `Failed to save schedule: ${request.error?.message}`
                    });
                };
            });
        } catch (error) {
            return {
                success: false,
                error: `Exception saving schedule: ${(error as Error).message}`
            };
        }
    }

    async loadSchedule(scheduleId: string): Promise<StorageResult<Schedule>> {
        try {
            await this.initialize();

            if (!this.db) {
                return { success: false, error: 'Database not initialized' };
            }

            return new Promise((resolve) => {
                const transaction = this.db!.transaction(
                    [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
                    'readonly'
                );
                const store = transaction.objectStore(IndexedDBStorageManager.STORE_NAMES.SCHEDULES);
                const request = store.get(scheduleId);

                request.onsuccess = () => {
                    if (request.result) {
                        resolve({ success: true, data: request.result });
                    } else {
                        resolve({ success: false, error: 'Schedule not found' });
                    }
                };

                request.onerror = () => {
                    resolve({
                        success: false,
                        error: `Failed to load schedule: ${request.error?.message}`
                    });
                };
            });
        } catch (error) {
            return {
                success: false,
                error: `Exception loading schedule: ${(error as Error).message}`
            };
        }
    }

    async loadAllSchedules(): Promise<StorageResult<Schedule[]>> {
        try {
            await this.initialize();

            if (!this.db) {
                return { success: false, error: 'Database not initialized' };
            }

            return new Promise((resolve) => {
                const transaction = this.db!.transaction(
                    [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
                    'readonly'
                );
                const store = transaction.objectStore(IndexedDBStorageManager.STORE_NAMES.SCHEDULES);
                const request = store.getAll();

                request.onsuccess = () => {
                    resolve({ success: true, data: request.result || [] });
                };

                request.onerror = () => {
                    resolve({
                        success: false,
                        error: `Failed to load schedules: ${request.error?.message}`
                    });
                };
            });
        } catch (error) {
            return {
                success: false,
                error: `Exception loading schedules: ${(error as Error).message}`,
                data: []
            };
        }
    }

    async deleteSchedule(scheduleId: string): Promise<StorageResult<void>> {
        try {
            await this.initialize();

            if (!this.db) {
                return { success: false, error: 'Database not initialized' };
            }

            return new Promise((resolve) => {
                const transaction = this.db!.transaction(
                    [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
                    'readwrite'
                );
                const store = transaction.objectStore(IndexedDBStorageManager.STORE_NAMES.SCHEDULES);
                const request = store.delete(scheduleId);

                request.onsuccess = () => {
                    resolve({ success: true });
                };

                request.onerror = () => {
                    resolve({
                        success: false,
                        error: `Failed to delete schedule: ${request.error?.message}`
                    });
                };
            });
        } catch (error) {
            return {
                success: false,
                error: `Exception deleting schedule: ${(error as Error).message}`
            };
        }
    }

    async getStorageStats(): Promise<StorageResult<StorageStats>> {
        try {
            const schedulesResult = await this.loadAllSchedules();

            if (!schedulesResult.success || !schedulesResult.data) {
                return {
                    success: false,
                    error: 'Failed to load schedules for stats calculation'
                };
            }

            const schedules = schedulesResult.data;
            const schedulesSizes = new Map<string, number>();
            let totalSize = 0;

            schedules.forEach(schedule => {
                const serialized = safeStringify(schedule);
                const size = new Blob([serialized]).size;
                schedulesSizes.set(schedule.id, size);
                totalSize += size;
            });

            return {
                success: true,
                data: {
                    totalSchedules: schedules.length,
                    estimatedSize: totalSize,
                    schedulesSizes
                }
            };
        } catch (error) {
            return {
                success: false,
                error: `Exception calculating storage stats: ${(error as Error).message}`
            };
        }
    }

    async clearAllSchedules(): Promise<StorageResult<void>> {
        try {
            await this.initialize();

            if (!this.db) {
                return { success: false, error: 'Database not initialized' };
            }

            return new Promise((resolve) => {
                const transaction = this.db!.transaction(
                    [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
                    'readwrite'
                );
                const store = transaction.objectStore(IndexedDBStorageManager.STORE_NAMES.SCHEDULES);
                const request = store.clear();

                request.onsuccess = () => {
                    resolve({ success: true });
                };

                request.onerror = () => {
                    resolve({
                        success: false,
                        error: `Failed to clear schedules: ${request.error?.message}`
                    });
                };
            });
        } catch (error) {
            return {
                success: false,
                error: `Exception clearing schedules: ${(error as Error).message}`
            };
        }
    }

    async checkCompatibility(): Promise<boolean> {
        if (!window.indexedDB) {
            console.warn('IndexedDB is not supported in this browser');
            return false;
        }

        try {
            await this.initialize();
            return this.db !== null;
        } catch (error) {
            console.error('IndexedDB compatibility check failed:', error);
            return false;
        }
    }

    async close(): Promise<void> {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.initPromise = null;
        }
    }
}

export const indexedDBStorage = new IndexedDBStorageManager();
