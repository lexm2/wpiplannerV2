import type { TransactionalStorageManager } from '../../core/storage/TransactionalStorageManager';
import type {
  BucketOverride,
  CustomBucket,
  DegreeBucketConfig,
} from '../../types/degree';
import { DEGREE_BUCKET_CONFIG_VERSION } from '../../types/degree';
import { degreeState } from '../../svelte/degree/degreeState.svelte';
import { logger } from '../../utils/logger';

/** Fields the "add bucket" form collects; the id is assigned here. */
type NewBucketInput = Omit<CustomBucket, 'id'>;

/**
 * Owns the user's bucket layout: which buckets exist, what they are called and
 * require, what order they sit in, and which schedule course is placed where.
 *
 * The UI talks only to this service, which mutates degreeState and writes
 * through to localStorage on every change. The config is kept separate from the
 * imported StudentRecord so a re-import replaces the transcript without
 * discarding the user's work.
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

  addBucket(input: NewBucketInput): string {
    const id = `custom:${this.nextCustomIndex()}`;
    this.update(c => ({
      ...c,
      custom: [...c.custom, { ...input, id }],
      // Only extend an order the user has actually set; otherwise leave it empty
      // so buildBuckets keeps its natural ordering.
      order: c.order.length ? [...c.order, id] : c.order,
    }));
    return id;
  }

  /**
   * Rename or retarget a bucket. Custom buckets are edited in place; imported
   * ones get an override layer, leaving the Workday record untouched.
   */
  updateBucket(id: string, patch: BucketOverride): void {
    this.update(c =>
      c.custom.some(b => b.id === id)
        ? {
            ...c,
            custom: c.custom.map(b => (b.id === id ? { ...b, ...patch } : b)),
          }
        : {
            ...c,
            overrides: {
              ...c.overrides,
              [id]: { ...c.overrides[id], ...patch },
            },
          },
    );
  }

  /**
   * Remove a bucket and free every course placed in it. A custom bucket is
   * dropped outright; an imported one is recorded in `hidden`, leaving the
   * record authoritative.
   */
  deleteBucket(id: string): void {
    this.update(c => {
      const isCustom = c.custom.some(b => b.id === id);
      const assignments = Object.fromEntries(
        Object.entries(c.assignments).filter(([, bucketId]) => bucketId !== id),
      );
      const { [id]: _dropped, ...overrides } = c.overrides;
      return {
        ...c,
        custom: isCustom ? c.custom.filter(b => b.id !== id) : c.custom,
        hidden:
          isCustom || c.hidden.includes(id) ? c.hidden : [...c.hidden, id],
        overrides,
        order: c.order.filter(x => x !== id),
        assignments,
      };
    });
  }

  reorder(ids: string[]): void {
    this.update(c => ({ ...c, order: ids }));
  }

  /** How many schedule courses currently sit in a bucket (for delete confirms). */
  assignedCount(bucketId: string): number {
    return Object.values(degreeState.config.assignments).filter(
      id => id === bucketId,
    ).length;
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

  /** Monotonic so ids stay unique after deletions. */
  private nextCustomIndex(): number {
    const used = degreeState.config.custom
      .map(b => Number(b.id.slice('custom:'.length)))
      .filter(n => Number.isFinite(n));
    return used.length ? Math.max(...used) + 1 : 1;
  }
}

function isValidBucketConfig(value: unknown): value is DegreeBucketConfig {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Partial<DegreeBucketConfig>;
  return (
    c.schemaVersion === DEGREE_BUCKET_CONFIG_VERSION &&
    Array.isArray(c.custom) &&
    Array.isArray(c.hidden) &&
    Array.isArray(c.order) &&
    typeof c.overrides === 'object' &&
    c.overrides !== null &&
    typeof c.assignments === 'object' &&
    c.assignments !== null
  );
}

export const degreeBucketService = new DegreeBucketService();
