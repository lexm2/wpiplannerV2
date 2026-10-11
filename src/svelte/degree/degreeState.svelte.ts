import { SvelteSet } from 'svelte/reactivity';
import type { DegreeBucketConfig, StudentRecord } from '../../types/degree';
import { EMPTY_BUCKET_CONFIG } from '../../types/degree';
import {
  buildBuckets,
  computePlacements,
  computeUnassigned,
  UMBRELLA_CATEGORIES,
  type DegreeBucket,
  type DegreeTile,
} from '../../services/degree/degreeBuckets';
import {
  buildCourseIndex,
  type CourseIndexEntry,
} from '../../services/degree/courseIndex';
import {
  effectiveProgress,
  type EffectiveProgress,
} from '../../services/degree/requirementProgress';
import { appState } from '../../core/state/appState.svelte';
import { openModal } from '../../services/ui/uiState.svelte';

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

  /**
   * Bucket id -> its live progress from the courses placed in it. Computed once
   * here so the status filter, the cards and the focus jump share one pass.
   */
  progressById = $derived.by<Map<string, EffectiveProgress>>(
    () =>
      new Map(
        this.buckets.map(b => [
          b.id,
          effectiveProgress(b, this.placements.get(b.id) ?? []),
        ]),
      ),
  );

  /** Bucket ids whose card is expanded to show every course. Not persisted. */
  expanded = new SvelteSet<string>();

  /**
   * Whether the degree-wide buckets (Total Credits, Residency) are listed.
   * Here rather than in RequirementList because the phone's Move sheet lists
   * buckets too, and offers the same ones the page is showing.
   */
  showUmbrella = $state(false);

  /** Whether the phone's "To place" list is open. Not persisted. */
  toPlaceOpen = $state(true);

  /** The course the phone's Move sheet is placing, while it is open. */
  moving = $state.raw<string | null>(null);

  /** Every course the page knows about, and which buckets hold it. */
  courseIndex = $derived.by<CourseIndexEntry[]>(() =>
    buildCourseIndex(this.buckets, this.placements, this.unassigned),
  );

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

/**
 * Open the phone's Move sheet for a schedule course: the touch path for placing
 * it, standing in for both dragging and the Assign menu there.
 */
export function openMoveSheet(courseId: string): void {
  degreeState.moving = courseId;
  openModal('move-course');
}

/**
 * The buckets a course can be placed in from the Move sheet or the Assign
 * menu: the ones the page is showing, so never a degree-wide bucket it hides -
 * unless the course already sits in it.
 */
export function placeableBuckets(current: string | null): DegreeBucket[] {
  return degreeState.buckets.filter(
    b =>
      degreeState.showUmbrella ||
      !UMBRELLA_CATEGORIES.has(b.category) ||
      b.id === current,
  );
}
