import { SvelteSet } from 'svelte/reactivity';
import type { DegreeBucketConfig, StudentRecord } from '../../types/degree';
import { EMPTY_BUCKET_CONFIG } from '../../types/degree';
import {
  buildBuckets,
  computePlacements,
  computeUnassigned,
  type DegreeBucket,
  type DegreeTile,
} from '../../services/degree/degreeBuckets';
import { appState } from '../../core/state/appState.svelte';

/**
 * Reactive state for the Degree page.
 *
 * `record` (the Workday import) and `config` (the user's bucket layout and
 * placements) are both $state.raw: each is replaced wholesale and persisted, so
 * they must stay plain and structured-cloneable.
 *
 * Everything else derives from them plus appState.selectedCourses, so the
 * buckets and the rail track the active schedule live.
 *
 * `expanded` is the exception: transient view state, never persisted. It lives
 * here rather than in RequirementCard because RequirementList keys its {#each}
 * on bucket.id, so changing a status filter unmounts cards - a component-local
 * rune would silently forget which ones were open.
 */
class DegreeState {
  record = $state.raw<StudentRecord | null>(null);
  status = $state<'empty' | 'parsing' | 'ready' | 'error'>('empty');
  errorMessage = $state<string | null>(null);

  /** Bucket layout + placements; persisted by DegreeBucketService. */
  config = $state.raw<DegreeBucketConfig>(EMPTY_BUCKET_CONFIG);

  /** Imported + custom buckets, in display order. */
  buckets = $derived.by<DegreeBucket[]>(() =>
    buildBuckets(this.record, this.config),
  );

  /** Bucket id -> the courses placed in it. */
  placements = $derived.by<Map<string, DegreeTile[]>>(() =>
    computePlacements(
      this.buckets,
      appState.selectedCourses,
      this.config.assignments,
    ),
  );

  /** Bucket ids whose card is expanded to show every course. Not persisted. */
  expanded = new SvelteSet<string>();

  /** Schedule courses still waiting to be placed. */
  unassigned = $derived.by<DegreeTile[]>(() =>
    computeUnassigned(
      this.record,
      appState.selectedCourses,
      this.config.assignments,
    ),
  );
}

export const degreeState = new DegreeState();

export function isExpanded(bucketId: string): boolean {
  return degreeState.expanded.has(bucketId);
}

export function toggleExpanded(bucketId: string): void {
  if (!degreeState.expanded.delete(bucketId))
    degreeState.expanded.add(bucketId);
}
