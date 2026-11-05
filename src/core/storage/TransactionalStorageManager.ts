/**
 * Hybrid storage layer with IndexedDB for schedules and localStorage for preferences, providing atomic transactions
 */
import { Schedule, SchedulePreferences } from '../../types/schedule';
import {
  IndexedDBStorageManager,
  type LoadReport,
  type WriteConflict,
} from './IndexedDBStorageManager';
import { CrossTabChannel } from './CrossTabChannel';
import { validateStoredPreferences } from './storageValidation';
import { PANEL_WIDTHS } from '../../svelte/panelWidths';
import { setReplacer, setReviver } from '../../utils/jsonSerializer';
import { STORAGE_KEYS } from '../../utils/storageKeys';
import type { DegreeBucketConfig, StudentRecord } from '../../types/degree';
import { logger } from '../../utils/logger';
import { errorMessage } from '../../utils/errorMessage';

interface StorageTransaction {
  id: string;
  backupData: Map<string, string | null>;
}

export interface TransactionResult {
  success: boolean;
  transactionId: string;
  error?: Error;
  rolledBack?: boolean;
  /** Set when a schedule write was refused because another tab changed it. */
  conflict?: WriteConflict;
}

/** A change another tab made to shared storage. */
export type RemoteChange =
  | { type: 'schedule'; id: string }
  | { type: 'deleted'; id: string }
  | { type: 'preferences' }
  | { type: 'cleared' };

/** Tutorial schedules are scratch copies; no other tab needs to hear of them. */
const isTutorialId = (id: string): boolean => id.startsWith('tutorial_');

export class TransactionalStorageManager {
  /** Shared registry; see utils/storageKeys.ts. */
  private static readonly STORAGE_KEYS = STORAGE_KEYS;

  private transactionCounter = 0;
  private indexedDBStorage: IndexedDBStorageManager;
  private indexedDBInitialized = false;
  private channel = new CrossTabChannel();

  constructor() {
    this.indexedDBStorage = new IndexedDBStorageManager();
  }

  /**
   * Calls `listener` when another tab changes shared storage: a schedule
   * written or deleted, preferences changed, or everything cleared. Never for
   * this tab's own writes.
   */
  subscribe(listener: (change: RemoteChange) => void): () => void {
    const stopChannel = this.channel.subscribe(message => {
      if (message.type === 'cleared') listener({ type: 'cleared' });
      else if (!isTutorialId(message.id)) listener(message);
    });
    // Preferences live in localStorage, which already tells other tabs.
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === TransactionalStorageManager.STORAGE_KEYS.PREFERENCES &&
        event.newValue
      ) {
        listener({ type: 'preferences' });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      stopChannel();
      window.removeEventListener('storage', onStorage);
    };
  }

  /**
   * Tells other tabs everything was cleared. Separate from clearAllDataComplete
   * so the caller can send it once the fresh state has been written: a tab that
   * reloads on hearing it must find that state, not an empty store.
   */
  announceCleared(): void {
    this.channel.post({ type: 'cleared' });
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
      throw new Error(
        'IndexedDB initialization failed - schedule operations unavailable',
        { cause: error },
      );
    }
  }

  async saveSchedule(schedule: Schedule): Promise<TransactionResult> {
    await this.ensureInitialized();
    const result = await this.indexedDBStorage.saveSchedule(schedule);
    if (result.success && !isTutorialId(schedule.id)) {
      this.channel.post({ type: 'schedule', id: schedule.id });
    }
    return {
      success: result.success,
      transactionId: `indexeddb-${Date.now()}`,
      error: result.error ? new Error(result.error) : undefined,
      conflict: result.conflict,
    };
  }

  async loadAllSchedules(): Promise<{
    data: Schedule[] | null;
    valid: boolean;
    error?: string;
    report: LoadReport;
  }> {
    await this.ensureInitialized();
    const result = await this.indexedDBStorage.loadAllSchedules();
    return {
      data: result.data ?? [],
      valid: result.success,
      error: result.error,
      report: result.report,
    };
  }

  /** One schedule re-read from storage; data is null if it is gone or unreadable. */
  async loadSchedule(
    scheduleId: string,
  ): Promise<{ data: Schedule | null; valid: boolean; error?: string }> {
    await this.ensureInitialized();
    const result = await this.indexedDBStorage.loadSchedule(scheduleId);
    return {
      data: result.data ?? null,
      valid: result.success,
      error: result.error,
    };
  }

  async deleteSchedule(scheduleId: string): Promise<TransactionResult> {
    await this.ensureInitialized();
    const result = await this.indexedDBStorage.deleteSchedule(scheduleId);
    if (result.success && !isTutorialId(scheduleId)) {
      this.channel.post({ type: 'deleted', id: scheduleId });
    }
    return {
      success: result.success,
      transactionId: `indexeddb-${Date.now()}`,
      error: result.error ? new Error(result.error) : undefined,
    };
  }

  savePreferences(preferences: SchedulePreferences): TransactionResult {
    return this.executeSyncTransaction(() => {
      const serializedPreferences = JSON.stringify(preferences, this.replacer);
      localStorage.setItem(
        TransactionalStorageManager.STORAGE_KEYS.PREFERENCES,
        serializedPreferences,
      );
    }, [TransactionalStorageManager.STORAGE_KEYS.PREFERENCES]);
  }

  loadPreferences(): {
    data: SchedulePreferences;
    valid: boolean;
    error?: string;
  } {
    const result = this.safeLoad<unknown>(
      TransactionalStorageManager.STORAGE_KEYS.PREFERENCES,
      null,
      'preferences',
    );
    // Absent is fine (defaults); present but not an object is as unusable as
    // unparseable, and a field of the wrong type is dropped, not trusted.
    const validated =
      result.data === null ? null : validateStoredPreferences(result.data);
    if (result.valid && result.data !== null && validated === null) {
      logger.warn('Stored preferences are not an object; using defaults');
    }

    return {
      data: validated ?? this.getDefaultPreferences(),
      valid: result.valid,
      error: result.error,
    };
  }

  saveActiveScheduleId(scheduleId: string | null): TransactionResult {
    return this.executeSyncTransaction(() => {
      if (scheduleId) {
        localStorage.setItem(
          TransactionalStorageManager.STORAGE_KEYS.ACTIVE_SCHEDULE_ID,
          scheduleId,
        );
      } else {
        localStorage.removeItem(
          TransactionalStorageManager.STORAGE_KEYS.ACTIVE_SCHEDULE_ID,
        );
      }
    }, [TransactionalStorageManager.STORAGE_KEYS.ACTIVE_SCHEDULE_ID]);
  }

  loadActiveScheduleId(): {
    data: string | null;
    valid: boolean;
    error?: string;
  } {
    try {
      const saved = localStorage.getItem(
        TransactionalStorageManager.STORAGE_KEYS.ACTIVE_SCHEDULE_ID,
      );
      return {
        data: (saved?.length ?? 0) > 0 ? saved : null,
        valid: true,
      };
    } catch (error) {
      return {
        data: null,
        valid: false,
        error: `Failed to load active schedule ID: ${errorMessage(error)}`,
      };
    }
  }

  /** Persist the imported degree record (a small single blob) to localStorage. */
  saveDegreeRecord(record: StudentRecord | null): TransactionResult {
    return this.executeSyncTransaction(() => {
      if (record) {
        localStorage.setItem(
          TransactionalStorageManager.STORAGE_KEYS.DEGREE_RECORD,
          JSON.stringify(record, this.replacer),
        );
      } else {
        localStorage.removeItem(
          TransactionalStorageManager.STORAGE_KEYS.DEGREE_RECORD,
        );
      }
    }, [TransactionalStorageManager.STORAGE_KEYS.DEGREE_RECORD]);
  }

  /** Load the raw persisted degree record. Caller validates the schema. */
  loadDegreeRecord(): {
    data: StudentRecord | null;
    valid: boolean;
    error?: string;
  } {
    return this.safeLoad<StudentRecord | null>(
      TransactionalStorageManager.STORAGE_KEYS.DEGREE_RECORD,
      null,
      'degree record',
    );
  }

  /** Persist the manual degree-bucket config (layout + course placements). */
  saveDegreeBucketConfig(config: DegreeBucketConfig | null): TransactionResult {
    return this.executeSyncTransaction(() => {
      if (config) {
        localStorage.setItem(
          TransactionalStorageManager.STORAGE_KEYS.DEGREE_BUCKET_CONFIG,
          JSON.stringify(config, this.replacer),
        );
      } else {
        localStorage.removeItem(
          TransactionalStorageManager.STORAGE_KEYS.DEGREE_BUCKET_CONFIG,
        );
      }
    }, [TransactionalStorageManager.STORAGE_KEYS.DEGREE_BUCKET_CONFIG]);
  }

  /** Load the raw persisted bucket config. Caller validates the schema. */
  loadDegreeBucketConfig(): {
    data: DegreeBucketConfig | null;
    valid: boolean;
    error?: string;
  } {
    return this.safeLoad<DegreeBucketConfig | null>(
      TransactionalStorageManager.STORAGE_KEYS.DEGREE_BUCKET_CONFIG,
      null,
      'degree bucket config',
    );
  }

  clearAllData(): TransactionResult {
    return this.executeSyncTransaction(() => {
      Object.values(TransactionalStorageManager.STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
      // Panel widths keep their own keys (see panelWidths.ts).
      for (const { storageKey } of Object.values(PANEL_WIDTHS)) {
        localStorage.removeItem(storageKey);
      }
    });
  }

  async clearAllDataComplete(): Promise<TransactionResult> {
    try {
      const cleared = await this.indexedDBStorage.clearAllSchedules();
      if (!cleared.success) {
        return {
          success: false,
          transactionId: `clear-${Date.now()}`,
          error: new Error(cleared.error),
        };
      }
      return this.clearAllData();
    } catch (error) {
      return {
        success: false,
        transactionId: `clear-${Date.now()}`,
        error: error as Error,
      };
    }
  }

  /**
   * Runs one localStorage write, rolling back `keys` if it throws (a full
   * quota, say). Only the keys the write touches are backed up and checked,
   * so a failure never restores or blames data some other write owns.
   */
  private executeSyncTransaction(
    operation: () => void,
    keys: string[] = Object.values(TransactionalStorageManager.STORAGE_KEYS),
  ): TransactionResult {
    const transactionId = this.generateTransactionId();
    const transaction: StorageTransaction = {
      id: transactionId,
      backupData: new Map(),
    };

    try {
      this.createBackup(transaction, keys);

      operation();

      const integrityCheck = this.verifyDataIntegrity(keys);
      if (!integrityCheck.valid) {
        throw new Error(`Data integrity check failed: ${integrityCheck.error}`);
      }

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      logger.warn(
        `Sync transaction ${transactionId} failed, rolling back:`,
        error,
      );
      const rollbackSuccess = this.rollbackTransaction(transaction);

      return {
        success: false,
        transactionId,
        error: error as Error,
        rolledBack: rollbackSuccess,
      };
    }
  }

  private safeLoad<T>(
    key: string,
    defaultValue: T,
    dataType: string,
  ): { data: T | null; valid: boolean; error?: string } {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) {
        return { data: defaultValue, valid: true };
      }

      // T is the caller's expectation for this key; a mismatch surfaces as a
      // validation failure downstream.
      const parsed = JSON.parse(stored, this.reviver) as T;
      return { data: parsed, valid: true };
    } catch (error) {
      logger.warn(`Failed to load ${dataType}:`, error);
      return {
        data: defaultValue,
        valid: false,
        error: `Failed to load ${dataType}: ${errorMessage(error)}`,
      };
    }
  }

  private readonly replacer = setReplacer;
  private readonly reviver = setReviver;

  private getDefaultPreferences(): SchedulePreferences {
    return {
      theme: 'wpi-dark',
      bookmarkedCourseIds: [],
    };
  }

  private generateTransactionId(): string {
    return `tx_${Date.now()}_${++this.transactionCounter}_${Math.random().toString(36).substring(2, 11)}`;
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

  private verifyDataIntegrity(
    keys: string[] = Object.values(TransactionalStorageManager.STORAGE_KEYS),
  ): { valid: boolean; error?: string } {
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
      if (keys.includes(TransactionalStorageManager.STORAGE_KEYS.PREFERENCES)) {
        const preferences = this.loadPreferences();
        if (!preferences.valid) {
          return {
            valid: false,
            error: `Preferences data invalid: ${preferences.error}`,
          };
        }
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Integrity check failed: ${errorMessage(error)}`,
      };
    }
  }

  isHealthy(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];

    try {
      const testKey = 'wpi-health-check';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
    } catch (error) {
      issues.push(`localStorage unavailable: ${errorMessage(error)}`);
    }

    const integrityCheck = this.verifyDataIntegrity();
    if (!integrityCheck.valid) {
      issues.push(`Data integrity issue: ${integrityCheck.error}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }
}
