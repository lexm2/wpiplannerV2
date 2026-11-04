import type { SelectedCourse } from '../../types/schedule';
import type { Course, SectionsByKind } from '../../types/types';
import {
  AutoScheduler,
  type ScheduleResult,
  type MaskedCandidate,
  type RatingSource,
} from './AutoScheduler';
import { ScheduleScorer } from './ScheduleScorer';
import type { RankingPreferences } from './rankingPreferences';
import { masksConflict } from '../../core/scheduling/BitMaskEngine';
import type { FilterService } from '../filtering/FilterService';
import { logger } from '../../utils/logger';
import { getDisplayTerms } from '../../utils/typeGuards';

export interface SchedulerInput {
  candidatesPerCourse: MaskedCandidate[][];
  courses: Course[];
  preferences: RankingPreferences;
}

/** A group's cheapest conflict-free combination and its cost. */
interface GroupBest {
  combos: SectionsByKind[];
  cost: number;
}

/** Candidates for each course to schedule, or the courses that have none. */
export type CandidateData =
  { ok: true; input: SchedulerInput } | { ok: false; unschedulable: Course[] };

export class SmartScheduler {
  constructor(private filterService: FilterService) {}

  /**
   * `ratings` is only consulted when the preferences rank by instructor
   * rating, so a caller can always pass it.
   */
  buildCandidateData(
    selectedCourses: SelectedCourse[],
    preferences: RankingPreferences,
    ratings?: RatingSource,
  ): CandidateData {
    if (selectedCourses.length === 0)
      return {
        ok: true,
        input: { candidatesPerCourse: [], courses: [], preferences },
      };
    const ratingSource =
      preferences.instructorRating.importance === 'off' ? undefined : ratings;

    const autoScheduler = new AutoScheduler(this.filterService);
    // A course with no allowed terms was locked in the intro: it keeps its
    // current sections, so those block the courses being scheduled.
    const blockedMasks = autoScheduler.getBlockedMasksByTerm(
      selectedCourses.filter(sc => sc.allowedTerms?.length === 0),
    );

    const candidatesPerCourse: MaskedCandidate[][] = [];
    const scheduledCourses: Course[] = [];
    // Keep going past the first failure so the user hears about all of them.
    const unschedulable: Course[] = [];
    for (const sc of selectedCourses) {
      if (sc.allowedTerms?.length === 0) continue;
      const candidates = autoScheduler.getMaskedCandidates(
        sc,
        blockedMasks,
        ratingSource,
      );
      if (candidates.length === 0) {
        logger.warn(
          `[SmartScheduler] No valid candidates for ${sc.course.departmentAbbr}${sc.course.number}`,
        );
        unschedulable.push(sc.course);
        continue;
      }
      candidatesPerCourse.push(candidates);
      scheduledCourses.push(sc.course);
    }

    if (unschedulable.length > 0) return { ok: false, unschedulable };
    return {
      ok: true,
      input: { candidatesPerCourse, courses: scheduledCourses, preferences },
    };
  }

  static findSchedules(
    input: SchedulerInput,
    maxResults: number,
  ): ScheduleResult[][] {
    const { candidatesPerCourse, courses, preferences } = input;

    if (candidatesPerCourse.length === 0) return [];

    const termOptionsPerCourse = candidatesPerCourse.map(candidates => [
      ...new Set(candidates.map(c => c.term)),
    ]);

    const numDistinctTerms = new Set(termOptionsPerCourse.flat()).size;
    // Prefer at most 3 courses per term, relaxing only when no assignment
    // fits. A relaxed cap of 3 or less admits nothing the first pass didn't.
    const relaxed = Math.ceil(courses.length / Math.max(numDistinctTerms, 1));
    const assignments = SmartScheduler.firstNonEmpty(
      termOptionsPerCourse,
      relaxed > 3 ? [3, relaxed, Infinity] : [3, Infinity],
    );

    const scorer = new ScheduleScorer(preferences);
    const results: { schedule: ScheduleResult[]; cost: number }[] = [];
    const bestByGroup = new Map<string, GroupBest | null>();

    for (const assignment of assignments) {
      if (results.length >= maxResults) break;

      const termGroups = new Map<string, number[]>();
      for (let i = 0; i < courses.length; i++) {
        const term = assignment[i];
        if (!termGroups.has(term)) termGroups.set(term, []);
        termGroups.get(term)!.push(i);
      }

      const allSelections: Array<{ courseIdx: number; combo: SectionsByKind }> =
        [];
      let valid = true;
      let cost = scorer.termBalanceCost(assignment);

      for (const indices of SmartScheduler.overlappingGroups(termGroups)) {
        // Assignments share most of their groups, and a group's best
        // combination depends only on its courses and their terms.
        const key = indices.map(i => `${i}:${assignment[i]}`).join(',');
        let best = bestByGroup.get(key);
        if (best === undefined) {
          const groupCandidates = indices.map(i =>
            candidatesPerCourse[i].filter(c => c.term === assignment[i]),
          );
          best = SmartScheduler.bestForTermGroup(groupCandidates, scorer);
          bestByGroup.set(key, best);
        }
        if (!best) {
          valid = false;
          break;
        }
        cost += best.cost;
        const { combos } = best;
        indices.forEach((courseIdx, i) => {
          allSelections.push({ courseIdx, combo: combos[i] });
        });
      }

      if (!valid) continue;

      results.push({
        schedule: allSelections.map(({ courseIdx, combo }) => ({
          course: courses[courseIdx],
          combination: combo,
        })),
        cost,
      });
    }

    // Stable, so schedules of equal cost keep their enumeration order.
    return results.sort((a, b) => a.cost - b.cost).map(r => r.schedule);
  }

  /**
   * Assignments under the first cap that admits any, generated lazily: the
   * caller stops at maxResults, long before the ~4^n full set.
   */
  private static firstNonEmpty(
    termOptions: string[][],
    caps: number[],
  ): Iterable<string[]> {
    for (const cap of caps) {
      const assignments = SmartScheduler.enumerateTermAssignments(
        termOptions,
        cap,
      );
      const first = assignments.next();
      if (first.done) continue;
      return (function* () {
        yield first.value;
        yield* assignments;
      })();
    }
    return [];
  }

  private static *enumerateTermAssignments(
    termOptions: string[][],
    maxPerTerm: number,
  ): Generator<string[], void, undefined> {
    const counts = new Map<string, number>();
    const current: string[] = [];

    function* dfs(i: number): Generator<string[], void, undefined> {
      if (i === termOptions.length) {
        yield [...current];
        return;
      }
      for (const term of termOptions[i]) {
        const count = counts.get(term) ?? 0;
        if (count >= maxPerTerm) continue;
        counts.set(term, count + 1);
        current.push(term);
        yield* dfs(i + 1);
        current.pop();
        counts.set(term, count);
      }
    }

    yield* dfs(0);
  }

  /**
   * Splits term groups into sets that must be checked against each other: an
   * F section meets in A and B, an S section in C and D, so F joins any A/B
   * group and S any C/D group. Groups sharing no quarter stay apart, keeping
   * each search's cartesian product small.
   */
  private static overlappingGroups(
    termGroups: Map<string, number[]>,
  ): number[][] {
    const merged: Array<{ quarters: Set<string>; indices: number[] }> = [];
    for (const [term, indices] of termGroups) {
      const group = {
        quarters: new Set(getDisplayTerms(term)),
        indices: [...indices],
      };
      for (let i = merged.length - 1; i >= 0; i--) {
        if (![...merged[i].quarters].some(q => group.quarters.has(q))) continue;
        merged[i].quarters.forEach(q => group.quarters.add(q));
        group.indices.push(...merged[i].indices);
        merged.splice(i, 1);
      }
      merged.push(group);
    }
    return merged.map(g => g.indices.sort((a, b) => a - b));
  }

  /**
   * The conflict-free combination of least cost, or null. A depth-first walk
   * in course order that abandons a branch at its first clash, so
   * combinations are visited in the same order as the full cartesian product
   * (ties still go to the first one found) while clashing prefixes are never
   * extended.
   */
  private static bestForTermGroup(
    candidatesPerCourse: MaskedCandidate[][],
    scorer: ScheduleScorer,
  ): GroupBest | null {
    const n = candidatesPerCourse.length;
    if (n === 0) return { combos: [], cost: 0 };

    let bestCost = Infinity;
    let bestCombo: SectionsByKind[] | null = null;

    // Occupied time per quarter: a semester section fills both of its own.
    const occupied = new Map<string, bigint>();
    const selections: MaskedCandidate[] = [];

    const visit = (i: number): void => {
      if (i === n) {
        const cost = scorer.groupCost(selections);
        if (cost < bestCost) {
          bestCost = cost;
          bestCombo = selections.map(s => s.combination);
        }
        return;
      }
      for (const candidate of candidatesPerCourse[i]) {
        // Costs are never negative, so nothing beats zero, and ties keep the
        // first found.
        if (bestCost === 0) return;
        const quarters = getDisplayTerms(candidate.term);
        const before = quarters.map(q => occupied.get(q) ?? 0n);
        if (before.some(mask => masksConflict(candidate.mask, mask))) continue;

        quarters.forEach((q, k) => occupied.set(q, before[k] | candidate.mask));
        selections.push(candidate);
        visit(i + 1);
        selections.pop();
        quarters.forEach((q, k) => occupied.set(q, before[k]));
      }
    };
    visit(0);

    return bestCombo ? { combos: bestCombo, cost: bestCost } : null;
  }
}
