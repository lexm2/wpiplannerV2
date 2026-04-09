import type { ScheduleResult } from './AutoScheduler';
import type { AutoScheduleSettings } from '../../types/schedule';
import type { Section } from '../../types/types';
import { SectionScorer } from './SectionScorer';
import { AcademicTerm } from '../../types/schedule';

const TERM_EXPANSION: Partial<Record<AcademicTerm, AcademicTerm[]>> = {
    [AcademicTerm.F]: [AcademicTerm.A, AcademicTerm.B],
    [AcademicTerm.S]: [AcademicTerm.C, AcademicTerm.D],
    [AcademicTerm.ALL]: [AcademicTerm.A, AcademicTerm.B, AcademicTerm.C, AcademicTerm.D],
};

export class ScheduleScorer {
    private sectionScorer = new SectionScorer();

    score(schedule: ScheduleResult[], settings: AutoScheduleSettings): number {
        return this.termScore(schedule) * 1_000_000
            - this.gapMinutes(schedule) * 1_000
            + this.wakeScore(schedule, settings);
    }

    private termScore(schedule: ScheduleResult[]): number {
        const counts = new Map<string, number>();
        for (const result of schedule) {
            const section = result.combination.lecture
                ?? result.combination.lab
                ?? result.combination.discussion;
            if (!section) continue;
            const terms = TERM_EXPANSION[section.computedTerm] ?? [section.computedTerm];
            for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
        }
        let deviation = 0;
        for (const count of counts.values()) deviation += Math.abs(count - 3);
        return Math.max(0, 100 - deviation * 10);
    }

    private gapMinutes(schedule: ScheduleResult[]): number {
        const byTermDay = new Map<string, { start: number; end: number }[]>();
        for (const result of schedule) {
            const sections = [
                result.combination.lecture,
                result.combination.discussion,
                result.combination.lab,
            ].filter((s): s is Section => s !== null);
            for (const section of sections) {
                for (const period of section.periods) {
                    if (period.isAsync) continue;
                    for (const day of period.days) {
                        const key = `${section.computedTerm}-${day}`;
                        if (!byTermDay.has(key)) byTermDay.set(key, []);
                        byTermDay.get(key)!.push({
                            start: period.startTime.hours * 60 + period.startTime.minutes,
                            end: period.endTime.hours * 60 + period.endTime.minutes,
                        });
                    }
                }
            }
        }
        let total = 0;
        for (const slots of byTermDay.values()) {
            if (slots.length < 2) continue;
            slots.sort((a, b) => a.start - b.start);
            for (let i = 1; i < slots.length; i++) {
                total += Math.max(0, slots[i].start - slots[i - 1].end);
            }
        }
        return total;
    }

    private wakeScore(schedule: ScheduleResult[], settings: AutoScheduleSettings): number {
        if (!settings.wakeUpTime) return 500;
        let total = 0, count = 0;
        for (const result of schedule) {
            const { lecture, discussion, lab } = result.combination;
            total += this.sectionScorer.scoreCombination(lecture, discussion, lab, settings.wakeUpTime);
            count++;
        }
        return count > 0 ? Math.round(total / count) : 500;
    }
}
