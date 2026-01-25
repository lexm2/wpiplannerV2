/**
 * IndexedDB storage backend for schedules with high capacity and async operations
 */

import { Schedule } from '../../types/schedule';
import { safeStringify, safeParse } from '../../utils/jsonSerializer';
import LZString from 'lz-string';
import { WorkerPoolManager } from '../../workers/WorkerPoolManager';
import { WorkerTaskType } from '../../workers/protocol';
import { perfMonitor } from '../../utils/PerformanceMonitor';

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
            const db = this.ensureDbInitialized();

            const scheduleWithTimestamp = {
                ...schedule,
                timestamp: Date.now()
            };

            const startTime = perfMonitor.startMeasure('save-compression');
            const workerPool = WorkerPoolManager.getInstance();
            const compressed = await workerPool.executeTask<string>(
                WorkerTaskType.COMPRESS_DATA,
                { data: scheduleWithTimestamp }
            );
            perfMonitor.endMeasure('save-compression', startTime);

            return new Promise((resolve) => {
                const transaction = db.transaction(
                    [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
                    'readwrite'
                );
                const store = transaction.objectStore(IndexedDBStorageManager.STORE_NAMES.SCHEDULES);

                const dataToStore = {
                    id: schedule.id,
                    serializedData: compressed,
                    timestamp: scheduleWithTimestamp.timestamp,
                    compressed: true
                };

                const request = store.put(dataToStore);

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
            const db = this.ensureDbInitialized();

            return new Promise(async (resolve) => {
                const transaction = db.transaction(
                    [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
                    'readonly'
                );
                const store = transaction.objectStore(IndexedDBStorageManager.STORE_NAMES.SCHEDULES);
                const request = store.get(scheduleId);

                request.onsuccess = async () => {
                    if (request.result) {
                        const stored = request.result;
                        if (stored.serializedData) {
                            if (stored.compressed) {
                                const startTime = perfMonitor.startMeasure('load-decompression');
                                const workerPool = WorkerPoolManager.getInstance();
                                const decompressed = await workerPool.executeTask<string>(
                                    WorkerTaskType.DECOMPRESS_DATA,
                                    { compressed: stored.serializedData }
                                );
                                perfMonitor.endMeasure('load-decompression', startTime);

                                if (!decompressed) {
                                    resolve({
                                        success: false,
                                        error: 'Failed to decompress schedule data'
                                    });
                                    return;
                                }

                                const deserialized = safeParse(decompressed) as Schedule;
                                resolve({ success: true, data: deserialized });
                            } else {
                                const deserialized = safeParse(stored.serializedData) as Schedule;
                                resolve({ success: true, data: deserialized });
                            }
                        } else {
                            resolve({ success: true, data: stored });
                        }
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
            const db = this.ensureDbInitialized();

            return new Promise((resolve) => {
                const transaction = db.transaction(
                    [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
                    'readonly'
                );
                const store = transaction.objectStore(IndexedDBStorageManager.STORE_NAMES.SCHEDULES);
                const request = store.getAll();

                request.onsuccess = () => {
                    const results = request.result || [];
                    const deserialized = results.map((stored: any) => {
                        if (stored.serializedData) {
                            // Handle both compressed and legacy uncompressed data
                            const json = stored.compressed
                                ? LZString.decompress(stored.serializedData)
                                : stored.serializedData;

                            return safeParse(json || stored.serializedData);
                        }
                        return stored;
                    });
                    resolve({ success: true, data: deserialized });
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
            const db = this.ensureDbInitialized();

            return new Promise((resolve) => {
                const transaction = db.transaction(
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
            const db = this.ensureDbInitialized();

            return new Promise((resolve) => {
                const transaction = db.transaction(
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

    private ensureDbInitialized(): IDBDatabase {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return this.db;
    }
}

export const indexedDBStorage = new IndexedDBStorageManager();
