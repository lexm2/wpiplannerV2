/**
 * Degree page view preferences: which bucket layout is showing, and how the
 * course finder modal groups its list.
 *
 * These are presentation choices, not data, so they live apart from
 * degreeState's record/config and persist under their own key. Kept out of
 * DegreeBucketConfig deliberately: that document is schema-versioned and
 * round-trips through the storage manager, and a view toggle has no business
 * forcing a migration.
 */
import { STORAGE_KEYS } from '../../utils/storageKeys';
import { logger } from '../../utils/logger';
import type { CourseSort } from '../../services/degree/courseIndex';
import { COURSE_SORTS, nextSort } from '../../services/degree/courseIndex';

/** `grid` = bounded cards, many per row. `full` = one bucket per row, all of it. */
type BucketView = 'grid' | 'full';

interface DegreeViewPrefs {
  bucketView: BucketView;
  courseSort: CourseSort;
}

const DEFAULTS: DegreeViewPrefs = {
  bucketView: 'full',
  courseSort: 'source',
};

/**
 * A phone opens on Grid until told otherwise: Full draws every empty slot as
 * its own row, which on one narrow column runs a single bucket past a screen.
 */
function defaults(): DegreeViewPrefs {
  const phone =
    typeof matchMedia === 'function' &&
    matchMedia('(max-width: 560px)').matches;
  return { ...DEFAULTS, bucketView: phone ? 'grid' : DEFAULTS.bucketView };
}

function load(): DegreeViewPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEGREE_VIEW);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<DegreeViewPrefs>;
    return {
      bucketView: parsed.bucketView === 'grid' ? 'grid' : 'full',
      courseSort: COURSE_SORTS.some(s => s.key === parsed.courseSort)
        ? (parsed.courseSort as CourseSort)
        : DEFAULTS.courseSort,
    };
  } catch (error) {
    logger.warn('Could not read degree view preferences', error);
    return defaults();
  }
}

class DegreeViewState {
  #initial = load();

  bucketView = $state<BucketView>(this.#initial.bucketView);
  courseSort = $state<CourseSort>(this.#initial.courseSort);

  #persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEYS.DEGREE_VIEW,
        JSON.stringify({
          bucketView: this.bucketView,
          courseSort: this.courseSort,
        }),
      );
    } catch (error) {
      logger.warn('Could not save degree view preferences', error);
    }
  }

  setBucketView(view: BucketView): void {
    this.bucketView = view;
    this.#persist();
  }

  /** Advance the sort button one step through COURSE_SORTS. */
  cycleSort(): void {
    this.courseSort = nextSort(this.courseSort);
    this.#persist();
  }
}

export const degreeViewState = new DegreeViewState();
