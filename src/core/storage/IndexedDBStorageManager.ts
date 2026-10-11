/**
 * IndexedDB storage backend for schedules with high capacity and async operations
 */

import { Schedule } from '../../types/schedule';
import { setReviver } from '../../utils/jsonSerializer';
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
  // Tail of the write queue. saveSchedule awaits compression before opening
  // its transaction, so without this a delete or clear issued while a save
  // is compressing would land first and then be undone by the late put.
  private writeQueue: Promise<unknown> = Promise.resolve();

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

  /** Runs writes one at a time, in call order. */
  private enqueueWrite<T>(write: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(write, write);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  saveSchedule(schedule: Schedule): Promise<StorageResult<void>> {
    return this.enqueueWrite(() => this.writeSchedule(schedule));
  }

  private async writeSchedule(
    schedule: Schedule,
  ): Promise<StorageResult<void>> {
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

        store.put(dataToStore);

        // Settle on the transaction, not the put request: a quota error can
        // abort the transaction after the request itself has succeeded.
        transaction.oncomplete = () => {
          resolve({ success: true });
        };

        transaction.onabort = () => {
          resolve({
            success: false,
            error: `Failed to save schedule: ${transaction.error?.message}`,
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

        // Every path must reach resolve(): the outer try/catch cannot see a
        // throw from these handlers, which would leave the promise pending and the app stuck loading, so each row is decoded
        // on its own and a bad one is skipped rather than failing them all.
        request.onsuccess = () => {
          const results = (request.result || []) as StoredScheduleRow[];
          const deserialized: Schedule[] = [];
          for (const stored of results) {
            try {
              deserialized.push(this.decodeRow(stored));
            } catch (error) {
              logger.error(
                `Skipping unreadable schedule row "${String(stored?.id)}":`,
                error,
              );
            }
          }
          resolve({ success: true, data: deserialized });
        };

        const fail = (error: DOMException | null) => {
          resolve({
            success: false,
            error: `Failed to load schedules: ${error?.message}`,
            data: [],
          });
        };
        request.onerror = () => fail(request.error);
        // Settles the promise if the transaction dies without a request
        // error (resolve is a no-op once onsuccess has run).
        transaction.onabort = () => fail(transaction.error);
      });
    } catch (error) {
      return {
        success: false,
        error: `Exception loading schedules: ${errorMessage(error)}`,
        data: [],
      };
    }
  }

  deleteSchedule(scheduleId: string): Promise<StorageResult<void>> {
    return this.enqueueWrite(() => this.removeSchedule(scheduleId));
  }

  private async removeSchedule(
    scheduleId: string,
  ): Promise<StorageResult<void>> {
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

  /** Decodes one row from loadAllSchedules (rows from any past format). */
  private decodeRow(stored: StoredScheduleRow): Schedule {
    const version = stored.schemaVersion;
    if (!stored.serializedData) {
      // Pre-serialization row: it stored the schedule object directly.
      return migrateStoredSchedule(stored, version);
    }

    // Handle both compressed and legacy uncompressed data
    const serialized = stored.serializedData;
    const json = stored.compressed
      ? LZString.decompress(serialized)
      : serialized;

    const parsed: unknown = JSON.parse(json || serialized, setReviver);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Stored schedule is not an object');
    }
    return migrateStoredSchedule(parsed, version);
  }

  clearAllSchedules(): Promise<StorageResult<void>> {
    return this.enqueueWrite(() => this.removeAllSchedules());
  }

  private async removeAllSchedules(): Promise<StorageResult<void>> {
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

  private ensureDbInitialized(): IDBDatabase {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }
}
