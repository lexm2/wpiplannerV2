import type { SelectedCourse } from '../../types/schedule';
import type { Course, SectionsByKind } from '../../types/types';
import { sectionsOf } from '../../utils/courseUtils';
import {
  AutoScheduler,
  type ScheduleResult,
  type MaskedCandidate,
} from './AutoScheduler';
import { masksConflict } from '../../core/scheduling/BitMaskEngine';
import type { FilterService } from '../filtering/FilterService';
import { logger } from '../../utils/logger';
import { getDisplayTerms } from '../../utils/typeGuards';

export interface SchedulerInput {
  candidatesPerCourse: MaskedCandidate[][];
  courses: Course[];
}

/** Candidates for each course to schedule, or the courses that have none. */
export type CandidateData =
  { ok: true; input: SchedulerInput } | { ok: false; unschedulable: Course[] };

export class SmartScheduler {
  constructor(private filterService: FilterService) {}

  buildCandidateData(selectedCourses: SelectedCourse[]): CandidateData {
    if (selectedCourses.length === 0)
      return { ok: true, input: { candidatesPerCourse: [], courses: [] } };

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
      const candidates = autoScheduler.getMaskedCandidates(sc, blockedMasks);
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
      input: { candidatesPerCourse, courses: scheduledCourses },
    };
  }

  static findSchedules(
    input: SchedulerInput,
    maxResults: number,
  ): ScheduleResult[][] {
    const { candidatesPerCourse, courses } = input;

    if (candidatesPerCourse.length === 0) return [];

    const termOptionsPerCourse = candidatesPerCourse.map(candidates => [
      ...new Set(candidates.map(c => c.term)),
    ]);

    const numDistinctTerms = new Set(termOptionsPerCourse.flat()).size;
    let assignments = SmartScheduler.enumerateTermAssignments(
      termOptionsPerCourse,
      3,
    );
    if (assignments.length === 0) {
      const relaxed = Math.ceil(courses.length / Math.max(numDistinctTerms, 1));
      assignments = SmartScheduler.enumerateTermAssignments(
        termOptionsPerCourse,
        relaxed,
      );
    }
    if (assignments.length === 0) {
      assignments = SmartScheduler.enumerateTermAssignments(
        termOptionsPerCourse,
        Infinity,
      );
    }

    const results: ScheduleResult[][] = [];
    const bestByGroup = new Map<string, SectionsByKind[] | null>();

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

      for (const indices of SmartScheduler.overlappingGroups(termGroups)) {
        // Assignments share most of their groups, and a group's best
        // combination depends only on its courses and their terms.
        const key = indices.map(i => `${i}:${assignment[i]}`).join(',');
        let combos = bestByGroup.get(key);
        if (combos === undefined) {
          const groupCandidates = indices.map(i =>
            candidatesPerCourse[i].filter(c => c.term === assignment[i]),
          );
          combos = SmartScheduler.bestForTermGroup(groupCandidates);
          bestByGroup.set(key, combos);
        }
        if (!combos) {
          valid = false;
          break;
        }
        indices.forEach((courseIdx, i) => {
          allSelections.push({ courseIdx, combo: combos[i] });
        });
      }

      if (!valid) continue;

      results.push(
        allSelections.map(({ courseIdx, combo }) => ({
          course: courses[courseIdx],
          combination: combo,
        })),
      );
    }

    return results;
  }

  private static enumerateTermAssignments(
    termOptions: string[][],
    maxPerTerm: number,
  ): string[][] {
    const results: string[][] = [];
    const counts = new Map<string, number>();

    const dfs = (i: number, current: string[]): void => {
      if (i === termOptions.length) {
        results.push([...current]);
        return;
      }
      for (const term of termOptions[i]) {
        const count = counts.get(term) ?? 0;
        if (count >= maxPerTerm) continue;
        counts.set(term, count + 1);
        current.push(term);
        dfs(i + 1, current);
        current.pop();
        counts.set(term, count);
      }
    };

    dfs(0, []);
    return results;
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
   * The conflict-free combination with the least idle time, or null. A
   * depth-first walk in course order that abandons a branch at its first
   * clash, so combinations are visited in the same order as the full
   * cartesian product (ties still go to the first one found) while clashing
   * prefixes are never extended.
   */
  private static bestForTermGroup(
    candidatesPerCourse: MaskedCandidate[][],
  ): SectionsByKind[] | null {
    const n = candidatesPerCourse.length;
    if (n === 0) return [];

    let bestGap = Infinity;
    let bestCombo: SectionsByKind[] | null = null;

    // Occupied time per quarter: a semester section fills both of its own.
    const occupied = new Map<string, bigint>();
    const selections: MaskedCandidate[] = [];

    const visit = (i: number): void => {
      if (i === n) {
        const gap = SmartScheduler.gapForSelections(selections);
        if (gap < bestGap) {
          bestGap = gap;
          bestCombo = selections.map(s => s.combination);
        }
        return;
      }
      for (const candidate of candidatesPerCourse[i]) {
        // Nothing can beat zero idle time, and ties keep the first found.
        if (bestGap === 0) return;
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

    return bestCombo;
  }

  /** Idle minutes between classes, summed per quarter and day. */
  private static gapForSelections(selections: MaskedCandidate[]): number {
    const byQuarterDay = new Map<string, { start: number; end: number }[]>();

    for (const { combination, term } of selections) {
      for (const section of sectionsOf(combination)) {
        for (const period of section.periods) {
          if (period.isAsync) continue;
          for (const quarter of getDisplayTerms(term)) {
            for (const day of period.days) {
              const key = `${quarter}-${day}`;
              if (!byQuarterDay.has(key)) byQuarterDay.set(key, []);
              byQuarterDay.get(key)!.push({
                start: period.startTime.hours * 60 + period.startTime.minutes,
                end: period.endTime.hours * 60 + period.endTime.minutes,
              });
            }
          }
        }
      }
    }

    let total = 0;
    for (const slots of byQuarterDay.values()) {
      if (slots.length < 2) continue;
      slots.sort((a, b) => a.start - b.start);
      for (let i = 1; i < slots.length; i++) {
        total += Math.max(0, slots[i].start - slots[i - 1].end);
      }
    }
    return total;
  }
}
