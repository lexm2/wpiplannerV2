/**
 * Lookup over the tracking-sheet bucket constants (src/constants/degreeBucketRules.ts).
 * Pure (no service/state deps), so it's unit-testable and usable from anywhere.
 *
 * Resolves the effective requirement-bucket rules for a given (major, class year),
 * merging the institution-wide defaults with per-major overrides, and converts a
 * bucket rule into criteria for the backend-only `degreeBucket` filter.
 */
import type { RequirementCategory } from '../../types/degree';
import type { DegreeBucketFilterCriteria } from '../../types/filters';
import {
  WPI_WIDE_RULES,
  MAJOR_RULES,
  type DegreeBucketRule,
  type SheetRules,
  type DegreeYearRules,
} from '../../constants/degreeBucketRules';

/**
 * Maps the major string the app sees at runtime (StudentRecord.major, derived from
 * the Workday MQP requirement, e.g. "Applied Physics") onto the key used in
 * MAJOR_RULES (derived from tracking-sheet filenames, e.g. "Physics Applied").
 * Only needed where the two differ.
 *
 * Confident entries are filled in. Add the rest once a real (non-CS) "View My
 * Academic Progress" export confirms the exact Workday strings - entries left out
 * simply fall back to WPI-wide defaults + the browse heuristic (no harm, just less
 * precise). Ambiguous concentration programs are noted below.
 */
const MAJOR_ALIASES: Record<string, string> = {
  // Workday lists one "Aerospace Engineering" major; the Aero/Astro tracks share
  // identical department rules, so either key is correct.
  'Aerospace Engineering': 'Aerospace Engineering-Aeronautical',
  // Program's official name is "Applied Physics"; our sheet key is "Physics Applied".
  'Applied Physics': 'Physics Applied',

  // TODO (need a real export to confirm the exact Workday string):
  // 'Society, Technology, and Policy Studies': 'Society Technology Policy',
  // 'Economics': 'Economic Science',
};

/** Resolve a runtime major name to its MAJOR_RULES entry, applying aliases. */
function majorYears(major: string): DegreeYearRules | undefined {
  return MAJOR_RULES[major] ?? MAJOR_RULES[MAJOR_ALIASES[major]];
}

/** Newest year-keyed entry whose key <= the requested year (null year => latest). */
function resolveYear<T>(
  byYear: Record<number, T>,
  year: number | null,
): T | undefined {
  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => a - b);
  if (!years.length) return undefined;
  if (year == null) return byYear[years[years.length - 1]];
  let chosen: number | undefined;
  for (const y of years) {
    if (y <= year) chosen = y;
    else break;
  }
  // If the student predates every emitted ruleset, fall back to the earliest.
  return byYear[chosen ?? years[0]];
}

/**
 * Effective bucket rules for (major, classYear): WPI-wide defaults unioned with the
 * major's overrides. A major rule replaces a WPI-wide rule when they share a
 * category+label; otherwise it is added. `classYear` is the class (graduation) year.
 */
export function getSheetRules(
  major: string,
  classYear: number | null,
): SheetRules {
  const years = majorYears(major);
  const overrides = years ? (resolveYear(years, classYear) ?? []) : [];

  const byKey = new Map<string, DegreeBucketRule>();
  const keyOf = (r: DegreeBucketRule) => `${r.category}|${r.label}`;
  for (const r of WPI_WIDE_RULES) byKey.set(keyOf(r), r);
  for (const r of overrides) byKey.set(keyOf(r), r); // major wins
  return [...byKey.values()];
}

/**
 * One bucket rule by category, optionally disambiguated by label (needed when a
 * major has several `major_specific` buckets). Matching is exact on category, then
 * a case-insensitive substring match on label when provided.
 */
export function getBucketRule(
  major: string,
  classYear: number | null,
  category: RequirementCategory,
  label?: string,
): DegreeBucketRule | null {
  const candidates = getSheetRules(major, classYear).filter(
    r => r.category === category,
  );
  if (!candidates.length) return null;
  if (candidates.length === 1 || !label) return candidates[0];

  const needle = label.trim().toLowerCase();
  const exact = candidates.find(r => r.label.toLowerCase() === needle);
  if (exact) return exact;
  const partial = candidates.find(
    r =>
      r.label.toLowerCase().includes(needle) ||
      needle.includes(r.label.toLowerCase()),
  );
  return partial ?? candidates[0];
}

/** Convert a bucket rule into `degreeBucket` filter criteria. */
function bucketRuleToCriteria(
  rule: DegreeBucketRule,
): DegreeBucketFilterCriteria {
  return {
    allowedDepartments: rule.validDepartments,
    excludedCourses: rule.excludedCourses,
    label: rule.label,
  };
}

/**
 * Convenience: criteria for a degree requirement bucket, or null when the tracking
 * sheets carry no rule for it (caller should fall back to its own heuristic).
 */
export function getDegreeBucketCriteria(
  major: string,
  classYear: number | null,
  category: RequirementCategory,
  label?: string,
): DegreeBucketFilterCriteria | null {
  const rule = getBucketRule(major, classYear, category, label);
  return rule ? bucketRuleToCriteria(rule) : null;
}
