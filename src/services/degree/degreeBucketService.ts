import type { TransactionalStorageManager } from '../../core/storage/TransactionalStorageManager';
import type { DegreeBucketConfig } from '../../types/degree';
import { DEGREE_BUCKET_CONFIG_VERSION } from '../../types/degree';
import { degreeState } from '../../svelte/degree/degreeState.svelte';
import { logger } from '../../utils/logger';

/**
 * Owns where each schedule course is placed.
 *
 * The UI talks only to this service, which mutates degreeState and writes
 * through to localStorage on every change. The config is kept separate from the
 * imported StudentRecord so a re-import replaces the transcript without
 * discarding the user's placements.
 */
class DegreeBucketService {
  private storage: TransactionalStorageManager | null = null;

  init(storage: TransactionalStorageManager): void {
    this.storage = storage;
  }

  /** Rehydrate the persisted config at startup; drops an incompatible schema. */
  load(): void {
    if (!this.storage) return;
    const result = this.storage.loadDegreeBucketConfig();
    if (!result.valid || !result.data) return;
    if (isValidBucketConfig(result.data)) {
      degreeState.config = result.data;
    } else {
      logger.warn('Discarding incompatible stored degree bucket config');
      this.storage.saveDegreeBucketConfig(null);
    }
  }

  /** Place a schedule course into a bucket (or move it between buckets). */
  assign(courseId: string, bucketId: string): void {
    this.update(c => ({
      ...c,
      assignments: { ...c.assignments, [courseId]: bucketId },
    }));
  }

  /** Send a course back to the unassigned rail. */
  unassign(courseId: string): void {
    this.update(c => {
      const { [courseId]: _removed, ...rest } = c.assignments;
      return { ...c, assignments: rest };
    });
  }

  /** Config is $state.raw, so every write reassigns it immutably, then persists. */
  private update(fn: (config: DegreeBucketConfig) => DegreeBucketConfig): void {
    const next = fn(degreeState.config);
    degreeState.config = next;
    const result = this.storage?.saveDegreeBucketConfig(next);
    if (result && !result.success) {
      logger.warn('Failed to persist degree bucket config:', result.error);
    }
  }
}

function isValidBucketConfig(value: unknown): value is DegreeBucketConfig {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Partial<DegreeBucketConfig>;
  return (
    c.schemaVersion === DEGREE_BUCKET_CONFIG_VERSION &&
    typeof c.assignments === 'object' &&
    c.assignments !== null
  );
}

export const degreeBucketService = new DegreeBucketService();
