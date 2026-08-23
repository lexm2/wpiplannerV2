/**
 * IndexedDB storage backend for schedules with high capacity and async operations
 */

import { Schedule } from '../../types/schedule';
import { setReplacer, setReviver } from '../../utils/jsonSerializer';
import {
  migrateStoredSchedule,
  SCHEDULE_SCHEMA_VERSION,
} from './scheduleMigration';
import LZString from 'lz-string';
import { StorageWorkerManager } from '../../workers/StorageWorkerManager';
import { WorkerTaskType } from '../../workers/protocol';
import { logger } from '../../utils/logger';
import { errorMessage } from '../../utils/errorMessage';

interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * A row in the SCHEDULES object store, as saveSchedule() writes it.
 *
 * The optional fields are absent on rows from older builds: serializedData and
 * compressed predate serialization, schemaVersion predates migrations.
 */
interface StoredScheduleRow {
  id: string;
  serializedData?: string;
  timestamp: number;
  compressed?: boolean;
  schemaVersion?: number;
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
    SELECTED_COURSES: 'selectedCourses',
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
        IndexedDBStorageManager.DB_VERSION,
      );

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (
          !db.objectStoreNames.contains(
            IndexedDBStorageManager.STORE_NAMES.SCHEDULES,
          )
        ) {
          const scheduleStore = db.createObjectStore(
            IndexedDBStorageManager.STORE_NAMES.SCHEDULES,
            { keyPath: 'id' },
          );
          scheduleStore.createIndex('name', 'name', { unique: false });
          scheduleStore.createIndex('timestamp', 'timestamp', {
            unique: false,
          });
        }

        if (
          !db.objectStoreNames.contains(
            IndexedDBStorageManager.STORE_NAMES.PREFERENCES,
          )
        ) {
          db.createObjectStore(IndexedDBStorageManager.STORE_NAMES.PREFERENCES);
        }

        if (
          !db.objectStoreNames.contains(
            IndexedDBStorageManager.STORE_NAMES.SELECTED_COURSES,
          )
        ) {
          db.createObjectStore(
            IndexedDBStorageManager.STORE_NAMES.SELECTED_COURSES,
          );
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
        timestamp: Date.now(),
      };

      const workerPool = StorageWorkerManager.getInstance();
      const compressed = await workerPool.executeTask<string>(
        WorkerTaskType.COMPRESS_DATA,
        { data: scheduleWithTimestamp },
      );

      return new Promise(resolve => {
        const transaction = db.transaction(
          [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
          'readwrite',
        );
        const store = transaction.objectStore(
          IndexedDBStorageManager.STORE_NAMES.SCHEDULES,
        );

        const dataToStore: StoredScheduleRow = {
          id: schedule.id,
          serializedData: compressed,
          timestamp: scheduleWithTimestamp.timestamp,
          compressed: true,
          schemaVersion: SCHEDULE_SCHEMA_VERSION,
        };

        const request = store.put(dataToStore);

        request.onsuccess = () => {
          resolve({ success: true });
        };

        request.onerror = () => {
          resolve({
            success: false,
            error: `Failed to save schedule: ${request.error?.message}`,
          });
        };
      });
    } catch (error) {
      return {
        success: false,
        error: `Exception saving schedule: ${errorMessage(error)}`,
      };
    }
  }

  async loadSchedule(scheduleId: string): Promise<StorageResult<Schedule>> {
    try {
      await this.initialize();
      const db = this.ensureDbInitialized();

      return new Promise(resolve => {
        const transaction = db.transaction(
          [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
          'readonly',
        );
        const store = transaction.objectStore(
          IndexedDBStorageManager.STORE_NAMES.SCHEDULES,
        );
        const request = store.get(scheduleId);

        request.onsuccess = async () => {
          // Every path must reach resolve(). loadSchedule's try/catch cannot
          // see a throw from here -- it runs long after that block returned --
          // so an uncaught one would leave the promise pending forever.
          try {
            const stored = request.result as StoredScheduleRow | undefined;

            if (!stored) {
              resolve({ success: false, error: 'Schedule not found' });
              return;
            }

            // Pre-serialization row: it stored the schedule object directly.
            if (!stored.serializedData) {
              resolve({
                success: true,
                data: migrateStoredSchedule(stored, stored.schemaVersion),
              });
              return;
            }

            let serialized = stored.serializedData;
            if (stored.compressed) {
              const workerPool = StorageWorkerManager.getInstance();
              const decompressed = await workerPool.executeTask<string>(
                WorkerTaskType.DECOMPRESS_DATA,
                { compressed: stored.serializedData },
              );

              if (!decompressed) {
                resolve({
                  success: false,
                  error: 'Failed to decompress schedule data',
                });
                return;
              }
              serialized = decompressed;
            }

            const deserialized: unknown = JSON.parse(serialized, setReviver);
            resolve({
              success: true,
              data: migrateStoredSchedule(deserialized, stored.schemaVersion),
            });
          } catch (error) {
            resolve({
              success: false,
              error: `Failed to read schedule: ${errorMessage(error)}`,
            });
          }
        };

        request.onerror = () => {
          resolve({
            success: false,
            error: `Failed to load schedule: ${request.error?.message}`,
          });
        };
      });
    } catch (error) {
      return {
        success: false,
        error: `Exception loading schedule: ${errorMessage(error)}`,
      };
    }
  }

  async loadAllSchedules(): Promise<StorageResult<Schedule[]>> {
    try {
      await this.initialize();
      const db = this.ensureDbInitialized();

      return new Promise(resolve => {
        const transaction = db.transaction(
          [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
          'readonly',
        );
        const store = transaction.objectStore(
          IndexedDBStorageManager.STORE_NAMES.SCHEDULES,
        );
        const request = store.getAll();

        request.onsuccess = () => {
          const results = request.result || [];
          const deserialized = results.map(
            (stored: Record<string, unknown>) => {
              const version = stored.schemaVersion as number | undefined;
              if (stored.serializedData) {
                // Handle both compressed and legacy uncompressed data
                const serialized = stored.serializedData as string;
                const json = stored.compressed
                  ? LZString.decompress(serialized)
                  : serialized;

                return migrateStoredSchedule(
                  JSON.parse(json || serialized, setReviver),
                  version,
                );
              }
              return migrateStoredSchedule(stored, version);
            },
          );
          resolve({ success: true, data: deserialized });
        };

        request.onerror = () => {
          resolve({
            success: false,
            error: `Failed to load schedules: ${request.error?.message}`,
          });
        };
      });
    } catch (error) {
      return {
        success: false,
        error: `Exception loading schedules: ${errorMessage(error)}`,
        data: [],
      };
    }
  }

  async deleteSchedule(scheduleId: string): Promise<StorageResult<void>> {
    try {
      await this.initialize();
      const db = this.ensureDbInitialized();

      return new Promise(resolve => {
        const transaction = db.transaction(
          [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
          'readwrite',
        );
        const store = transaction.objectStore(
          IndexedDBStorageManager.STORE_NAMES.SCHEDULES,
        );
        const request = store.delete(scheduleId);

        request.onsuccess = () => {
          resolve({ success: true });
        };

        request.onerror = () => {
          resolve({
            success: false,
            error: `Failed to delete schedule: ${request.error?.message}`,
          });
        };
      });
    } catch (error) {
      return {
        success: false,
        error: `Exception deleting schedule: ${errorMessage(error)}`,
      };
    }
  }

  async getStorageStats(): Promise<StorageResult<StorageStats>> {
    try {
      const schedulesResult = await this.loadAllSchedules();

      if (!schedulesResult.success || !schedulesResult.data) {
        return {
          success: false,
          error: 'Failed to load schedules for stats calculation',
        };
      }

      const schedules = schedulesResult.data;
      const schedulesSizes = new Map<string, number>();
      let totalSize = 0;

      schedules.forEach(schedule => {
        const serialized = JSON.stringify(schedule, setReplacer);
        const size = new Blob([serialized]).size;
        schedulesSizes.set(schedule.id, size);
        totalSize += size;
      });

      return {
        success: true,
        data: {
          totalSchedules: schedules.length,
          estimatedSize: totalSize,
          schedulesSizes,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Exception calculating storage stats: ${errorMessage(error)}`,
      };
    }
  }

  async clearAllSchedules(): Promise<StorageResult<void>> {
    try {
      await this.initialize();
      const db = this.ensureDbInitialized();

      return new Promise(resolve => {
        const transaction = db.transaction(
          [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
          'readwrite',
        );
        const store = transaction.objectStore(
          IndexedDBStorageManager.STORE_NAMES.SCHEDULES,
        );
        const request = store.clear();

        request.onsuccess = () => {
          resolve({ success: true });
        };

        request.onerror = () => {
          resolve({
            success: false,
            error: `Failed to clear schedules: ${request.error?.message}`,
          });
        };
      });
    } catch (error) {
      return {
        success: false,
        error: `Exception clearing schedules: ${errorMessage(error)}`,
      };
    }
  }

  async checkCompatibility(): Promise<boolean> {
    if (!window.indexedDB) {
      logger.warn('IndexedDB is not supported in this browser');
      return false;
    }

    try {
      await this.initialize();
      return this.db !== null;
    } catch (error) {
      logger.error('IndexedDB compatibility check failed:', error);
      return false;
    }
  }

  // The other half of initialize()'s lifecycle pair.
  // eslint-disable-next-line @typescript-eslint/require-await
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
