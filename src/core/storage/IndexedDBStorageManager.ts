/**
 * IndexedDB storage backend for schedules with high capacity and async operations
 */

import { Schedule } from '../../types/schedule';
import { setReviver } from '../../utils/jsonSerializer';
import {
  migrateStoredSchedule,
  SCHEDULE_SCHEMA_VERSION,
} from './scheduleMigration';
import {
  UnreadableScheduleError,
  validateStoredSchedule,
} from './storageValidation';
import LZString from 'lz-string';
import { StorageWorkerManager } from '../../workers/StorageWorkerManager';
import { WorkerTaskType } from '../../workers/protocol';
import { logger } from '../../utils/logger';
import { errorMessage } from '../../utils/errorMessage';

/**
 * Why a write was refused rather than failed: another tab changed the row
 * since this tab last read or wrote it. The row is left as the other tab has
 * it; the caller decides what to tell the student.
 */
export type WriteConflict = 'newer' | 'deleted';

interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  conflict?: WriteConflict;
}

/** What loading skipped, for one notice to the student. */
export interface LoadReport {
  /** Rows that could not be turned into a schedule (left untouched in storage). */
  unreadable: number;
  /** Rows written by a newer build than this one (also left untouched). */
  newerVersion: number;
  /** Courses and events dropped from schedules that otherwise loaded. */
  dropped: number;
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
  // The row timestamp this tab last read or wrote, per schedule id. A write
  // is only allowed over the row it was based on (see writeSchedule); an id
  // absent here is new to this tab.
  private known = new Map<string, number>();
  // Tail of the write queue. saveSchedule awaits compression before opening
  // its transaction, so without this a delete or clear issued while a save
  // is compressing would land first and then be undone by the late put.
  private writeQueue: Promise<unknown> = Promise.resolve();

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    const opening = new Promise<void>((resolve, reject) => {
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

      // A tab on an older build keeps its connection open and holds up this
      // upgrade. The old tab closes itself (onversionchange below); until it
      // does, say what is wrong instead of leaving startup pending forever.
      request.onblocked = () => {
        logger.warn('Database upgrade is blocked by another open tab');
        reject(
          new Error(
            'The planner is open in another tab that has to close before this one can update. Close the other planner tabs and reload.',
          ),
        );
      };

      request.onsuccess = () => {
        const db = request.result;
        // A newer build in another tab is upgrading the database: step aside
        // so it can, and stop using a connection that is about to be invalid.
        db.onversionchange = () => {
          db.close();
          this.db = null;
          this.initPromise = null;
          logger.warn('Database closed for an upgrade from another tab');
        };
        this.db = db;
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

    // A failed open is not remembered: a retry (after the other tab closes)
    // must reopen rather than replay the rejection.
    this.initPromise = opening;
    opening.catch(() => {
      if (this.initPromise === opening) this.initPromise = null;
    });
    return opening;
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

        // Compare and swap in one transaction: the row is only replaced if it
        // is still the one this tab last saw. Otherwise another tab wrote or
        // deleted the schedule meanwhile, and this tab's copy is stale.
        let written: number | null = null;
        let conflict: WriteConflict | null = null;
        const current = store.get(schedule.id);
        current.onsuccess = () => {
          const existing = current.result as StoredScheduleRow | undefined;
          const expected = this.known.get(schedule.id);
          if (expected !== undefined) {
            if (!existing) conflict = 'deleted';
            else if ((existing.timestamp ?? 0) !== expected) conflict = 'newer';
          }
          if (conflict) return;

          // Strictly increasing per row, so "changed" is never a tie.
          written = Math.max(Date.now(), (existing?.timestamp ?? 0) + 1);
          const dataToStore: StoredScheduleRow = {
            id: schedule.id,
            serializedData: compressed,
            timestamp: written,
            compressed: true,
            schemaVersion: SCHEDULE_SCHEMA_VERSION,
          };
          store.put(dataToStore);
        };

        // Settle on the transaction, not the put request: a quota error can
        // abort the transaction after the request itself has succeeded.
        transaction.oncomplete = () => {
          if (conflict) {
            resolve({
              success: false,
              conflict,
              error: `Schedule "${schedule.name}" was ${conflict === 'deleted' ? 'deleted' : 'changed'} in another tab`,
            });
            return;
          }
          if (written !== null) this.known.set(schedule.id, written);
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

  async loadAllSchedules(): Promise<
    StorageResult<Schedule[]> & { report: LoadReport }
  > {
    const report: LoadReport = { unreadable: 0, newerVersion: 0, dropped: 0 };
    try {
      await this.initialize();
      const db = this.ensureDbInitialized();

      return await new Promise(resolve => {
        const transaction = db.transaction(
          [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
          'readonly',
        );
        const store = transaction.objectStore(
          IndexedDBStorageManager.STORE_NAMES.SCHEDULES,
        );
        const request = store.getAll();

        // Every path must reach resolve(): the outer try/catch cannot see a
        // throw from these handlers, which would leave the promise pending and
        // the app stuck loading. Each row is decoded on its own, and a bad
        // one is skipped rather than failing them all.
        request.onsuccess = () => {
          const results = (request.result || []) as StoredScheduleRow[];
          const loaded: Schedule[] = [];
          const stamps = new Map<string, number>();
          for (const stored of results) {
            const decoded = this.decodeRow(stored, report);
            if (!decoded) continue;
            loaded.push(decoded);
            stamps.set(decoded.id, stored.timestamp ?? 0);
          }
          // The load is the new baseline for every row it read.
          this.known = stamps;
          resolve({ success: true, data: loaded, report });
        };

        const fail = (error: DOMException | null) => {
          resolve({
            success: false,
            error: `Failed to load schedules: ${error?.message}`,
            data: [],
            report,
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
        report,
      };
    }
  }

  /**
   * Re-reads one schedule, to pick up a change another tab made. `data` is
   * null when the row is gone or unreadable. Becomes this tab's baseline for
   * the row, so a later write is allowed over it.
   */
  async loadSchedule(
    scheduleId: string,
  ): Promise<StorageResult<Schedule | null>> {
    try {
      await this.initialize();
      const db = this.ensureDbInitialized();

      return await new Promise(resolve => {
        const transaction = db.transaction(
          [IndexedDBStorageManager.STORE_NAMES.SCHEDULES],
          'readonly',
        );
        const request = transaction
          .objectStore(IndexedDBStorageManager.STORE_NAMES.SCHEDULES)
          .get(scheduleId);
        request.onsuccess = () => {
          const stored = request.result as StoredScheduleRow | undefined;
          const decoded = stored
            ? this.decodeRow(stored, {
                unreadable: 0,
                newerVersion: 0,
                dropped: 0,
              })
            : null;
          if (decoded && stored) {
            this.known.set(decoded.id, stored.timestamp ?? 0);
          } else {
            this.known.delete(scheduleId);
          }
          resolve({ success: true, data: decoded });
        };
        const fail = (error: DOMException | null) =>
          resolve({
            success: false,
            error: `Failed to load schedule: ${error?.message}`,
          });
        request.onerror = () => fail(request.error);
        transaction.onabort = () => fail(transaction.error);
      });
    } catch (error) {
      return {
        success: false,
        error: `Exception loading schedule: ${errorMessage(error)}`,
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
          this.known.delete(scheduleId);
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

  /**
   * Decodes one row (any past format) into a schedule, or null if it must be
   * skipped. Skips are counted in `report`; the row itself is left in the
   * store, so nothing is lost by not showing it.
   */
  private decodeRow(
    stored: StoredScheduleRow,
    report: LoadReport,
  ): Schedule | null {
    const version = stored.schemaVersion;
    if (typeof version === 'number' && version > SCHEDULE_SCHEMA_VERSION) {
      // A newer build wrote this. Loading and then saving it would stamp it
      // with a shape this build only guesses at.
      logger.warn(
        `Skipping schedule row "${String(stored?.id)}": schema ${version} is newer than ${SCHEDULE_SCHEMA_VERSION}`,
      );
      report.newerVersion++;
      return null;
    }

    try {
      const { schedule, dropped } = validateStoredSchedule(
        this.parseRow(stored, version),
        String(stored?.id),
      );
      report.dropped += dropped;
      return schedule;
    } catch (error) {
      if (!(error instanceof UnreadableScheduleError)) {
        logger.error(
          `Skipping unreadable schedule row "${String(stored?.id)}":`,
          error,
        );
      } else {
        logger.warn(
          `Skipping malformed schedule row "${String(stored?.id)}": ${error.message}`,
        );
      }
      report.unreadable++;
      return null;
    }
  }

  private parseRow(stored: StoredScheduleRow, version?: number): unknown {
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
      throw new UnreadableScheduleError('Stored schedule is not an object');
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
          this.known.clear();
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
