import type { SelectedCourse } from '../../types/schedule';
import type { ComponentSelections } from '../../types/scheduling';
import type { Section } from '../../types/types';
import { AutoScheduler, type ScheduleResult, type MaskedCandidate } from './AutoScheduler';
import { sectionToMask, masksConflict } from '../../core/scheduling/BitMaskEngine';
import type { FilterService } from '../filtering/FilterService';

export class SmartScheduler {
    constructor(private filterService: FilterService) {}

    generateSchedules(selectedCourses: SelectedCourse[], maxResults: number): ScheduleResult[][] {
        if (selectedCourses.length === 0) return [];

        const autoScheduler = new AutoScheduler(this.filterService);
        const blockedMasks = autoScheduler.getBlockedMasksByTerm();

        const lockedResults: ScheduleResult[] = [];
        const unlocked: SelectedCourse[] = [];
        const lockedMaskByTerm = new Map<string, bigint>();

        for (const sc of selectedCourses) {
            const lockedCombo = autoScheduler.getLockedCombination(sc);
            if (lockedCombo) {
                lockedResults.push({ course: sc.course, combination: lockedCombo, isLocked: true });
                let mask = 0n;
                if (lockedCombo.lecture) mask |= sectionToMask(lockedCombo.lecture);
                if (lockedCombo.discussion) mask |= sectionToMask(lockedCombo.discussion);
                if (lockedCombo.lab) mask |= sectionToMask(lockedCombo.lab);
                const term = lockedCombo.lecture?.computedTerm
                    ?? lockedCombo.discussion?.computedTerm
                    ?? lockedCombo.lab?.computedTerm;
                if (term) lockedMaskByTerm.set(term, (lockedMaskByTerm.get(term) ?? 0n) | mask);
            } else {
                unlocked.push(sc);
            }
        }

        if (unlocked.length === 0) return [lockedResults];

        const candidatesPerCourse: MaskedCandidate[][] = [];
        for (const sc of unlocked) {
            const candidates = autoScheduler.getMaskedCandidates(sc, blockedMasks);
            if (candidates.length === 0) {
                console.warn(`[SmartScheduler] No valid candidates for ${sc.course.departmentAbbr}${sc.course.number}`);
                return [];
            }
            candidatesPerCourse.push(candidates);
        }

        const termOptionsPerCourse = candidatesPerCourse.map(candidates =>
            [...new Set(candidates.map(c => c.term))]
        );

        const numDistinctTerms = new Set(termOptionsPerCourse.flat()).size;
        let assignments = this.enumerateTermAssignments(termOptionsPerCourse, 3);
        if (assignments.length === 0) {
            const relaxed = Math.ceil(unlocked.length / Math.max(numDistinctTerms, 1));
            assignments = this.enumerateTermAssignments(termOptionsPerCourse, relaxed);
        }
        if (assignments.length === 0) {
            assignments = this.enumerateTermAssignments(termOptionsPerCourse, Infinity);
        }

        const results: ScheduleResult[][] = [];

        for (const assignment of assignments) {
            if (results.length >= maxResults) break;

            const termGroups = new Map<string, number[]>();
            for (let i = 0; i < unlocked.length; i++) {
                const term = assignment[i];
                if (!termGroups.has(term)) termGroups.set(term, []);
                termGroups.get(term)!.push(i);
            }

            const allSelections: Array<{ courseIdx: number; combo: ComponentSelections }> = [];
            let valid = true;

            for (const [term, indices] of termGroups) {
                const groupCandidates = indices.map(i =>
                    candidatesPerCourse[i].filter(c => c.term === term)
                );
                const lockedMask = lockedMaskByTerm.get(term) ?? 0n;
                const combos = this.bestForTermGroup(groupCandidates, lockedMask);
                if (!combos) { valid = false; break; }
                indices.forEach((courseIdx, i) => {
                    allSelections.push({ courseIdx, combo: combos[i] });
                });
            }

            if (!valid) continue;

            results.push([
                ...lockedResults,
                ...allSelections.map(({ courseIdx, combo }) => ({
                    course: unlocked[courseIdx].course,
                    combination: combo,
                })),
            ]);
        }

        return results;
    }

    private enumerateTermAssignments(termOptions: string[][], maxPerTerm: number): string[][] {
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

    private bestForTermGroup(
        candidatesPerCourse: MaskedCandidate[][],
        lockedMask: bigint
    ): ComponentSelections[] | null {
        const n = candidatesPerCourse.length;
        if (n === 0) return [];

        const sizes = candidatesPerCourse.map(c => c.length);
        const indices = new Array<number>(n).fill(0);

        let bestGap = Infinity;
        let bestCombo: ComponentSelections[] | null = null;

        while (true) {
            let combinedMask = lockedMask;
            let conflict = false;
            const selections: ComponentSelections[] = [];

            for (let i = 0; i < n; i++) {
                const candidate = candidatesPerCourse[i][indices[i]];
                if (masksConflict(candidate.mask, combinedMask)) {
                    conflict = true;
                    break;
                }
                combinedMask |= candidate.mask;
                selections.push(candidate.combination);
            }

            if (!conflict) {
                const gap = this.gapForSelections(selections);
                if (gap < bestGap) {
                    bestGap = gap;
                    bestCombo = selections.slice();
                }
            }

            let pos = n - 1;
            while (pos >= 0) {
                indices[pos]++;
                if (indices[pos] < sizes[pos]) break;
                indices[pos] = 0;
                pos--;
            }
            if (pos < 0) break;
        }

        return bestCombo;
    }

    private gapForSelections(selections: ComponentSelections[]): number {
        const byDay = new Map<string, { start: number; end: number }[]>();

        for (const combo of selections) {
            const sections = [combo.lecture, combo.discussion, combo.lab]
                .filter((s): s is Section => s !== null);
            for (const section of sections) {
                for (const period of section.periods) {
                    if (period.isAsync) continue;
                    for (const day of period.days) {
                        if (!byDay.has(day)) byDay.set(day, []);
                        byDay.get(day)!.push({
                            start: period.startTime.hours * 60 + period.startTime.minutes,
                            end: period.endTime.hours * 60 + period.endTime.minutes,
                        });
                    }
                }
            }
        }

        let total = 0;
        for (const slots of byDay.values()) {
            if (slots.length < 2) continue;
            slots.sort((a, b) => a.start - b.start);
            for (let i = 1; i < slots.length; i++) {
                total += Math.max(0, slots[i].start - slots[i - 1].end);
            }
        }
        return total;
    }
}
