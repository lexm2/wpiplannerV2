/**
 * Hybrid storage layer with IndexedDB for schedules and localStorage for preferences, providing atomic transactions
 */
import { Schedule, SchedulePreferences } from '../../types/schedule';
import { IndexedDBStorageManager } from './IndexedDBStorageManager';
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
}

export class TransactionalStorageManager {
  /** Shared registry; see utils/storageKeys.ts. */
  private static readonly STORAGE_KEYS = STORAGE_KEYS;

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
      throw new Error(
        'IndexedDB initialization failed - schedule operations unavailable',
        { cause: error },
      );
    }
  }

  async saveSchedule(schedule: Schedule): Promise<TransactionResult> {
    await this.ensureInitialized();
    const result = await this.indexedDBStorage.saveSchedule(schedule);
    return {
      success: result.success,
      transactionId: `indexeddb-${Date.now()}`,
      error: result.error ? new Error(result.error) : undefined,
    };
  }

  async loadAllSchedules(): Promise<{
    data: Schedule[] | null;
    valid: boolean;
    error?: string;
  }> {
    await this.ensureInitialized();
    const result = await this.indexedDBStorage.loadAllSchedules();
    return {
      data: result.data ?? [],
      valid: result.success,
      error: result.error,
    };
  }

  async deleteSchedule(scheduleId: string): Promise<TransactionResult> {
    await this.ensureInitialized();
    const result = await this.indexedDBStorage.deleteSchedule(scheduleId);
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
    const result = this.safeLoad<SchedulePreferences>(
      TransactionalStorageManager.STORAGE_KEYS.PREFERENCES,
      this.getDefaultPreferences(),
      'preferences',
    );

    return {
      data: result.data ?? this.getDefaultPreferences(),
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
        error: error as Error,
      };
    }
  }

  /**
   * Expects full Schedule objects with Course/Section references. The caller
   * (ProfileStateManager) is responsible for converting from ExportData (IDs only)
   * to full objects before calling this method.
   */
  async importData(
    schedules: Schedule[],
    activeScheduleId: string | null,
    preferences?: SchedulePreferences,
  ): Promise<TransactionResult> {
    try {
      if (preferences) {
        localStorage.setItem(
          TransactionalStorageManager.STORAGE_KEYS.PREFERENCES,
          JSON.stringify(preferences, this.replacer),
        );
      }

      if (schedules.length > 0) {
        await this.ensureInitialized();
        for (const schedule of schedules) {
          const saved = await this.saveSchedule(schedule);
          if (!saved.success) {
            throw new Error(
              `Failed to import schedule "${schedule.name}": ${saved.error?.message}`,
            );
          }
        }
      }

      if (activeScheduleId !== undefined) {
        const saved = this.saveActiveScheduleId(activeScheduleId);
        if (!saved.success) {
          throw saved.error ?? new Error('Failed to save active schedule ID');
        }
      }

      return {
        success: true,
        transactionId: `import-${Date.now()}`,
      };
    } catch (error) {
      logger.error('[TransactionalStorageManager] importData() failed:', error);
      return {
        success: false,
        transactionId: `import-${Date.now()}`,
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
