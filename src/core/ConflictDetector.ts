import { Section, Period, DayOfWeek } from '../types/types'
import { TimeConflict, ConflictType } from '../types/schedule'

export class ConflictDetector {
    private static readonly MIN_BREAK_MINUTES = 10;

    detectConflicts(sections: Section[]): TimeConflict[] {
        const conflicts: TimeConflict[] = [];
        
        for (let i = 0; i < sections.length; i++) {
            for (let j = i + 1; j < sections.length; j++) {
                const sectionConflicts = this.checkSectionConflicts(sections[i], sections[j]);
                conflicts.push(...sectionConflicts);
            }
        }
        
        return conflicts;
    }

    private checkSectionConflicts(section1: Section, section2: Section): TimeConflict[] {
        const conflicts: TimeConflict[] = [];
        
        for (const period1 of section1.periods) {
            for (const period2 of section2.periods) {
                const conflict = this.checkPeriodConflict(period1, period2, section1, section2);
                if (conflict) {
                    conflicts.push(conflict);
                }
            }
        }
        
        return conflicts;
    }

    private checkPeriodConflict(period1: Period, period2: Period, section1: Section, section2: Section): TimeConflict | null {
        const sharedDays = this.getSharedDays(period1.days, period2.days);
        if (sharedDays.length === 0) return null;

        const timeConflict = this.checkTimeOverlap(period1, period2);
        if (timeConflict === ConflictType.TIME_OVERLAP) {
            return {
                section1,
                section2,
                conflictType: ConflictType.TIME_OVERLAP,
                description: `Time overlap on ${sharedDays.join(', ')}: ${period1.startTime.displayTime}-${period1.endTime.displayTime} conflicts with ${period2.startTime.displayTime}-${period2.endTime.displayTime}`
            };
        }

        const breakConflict = this.checkInsufficientBreak(period1, period2);
        if (breakConflict) {
            return {
                section1,
                section2,
                conflictType: ConflictType.INSUFFICIENT_BREAK,
                description: `Insufficient break time on ${sharedDays.join(', ')}: Less than ${ConflictDetector.MIN_BREAK_MINUTES} minutes between classes`
            };
        }

        return null;
    }

    private getSharedDays(days1: Set<DayOfWeek>, days2: Set<DayOfWeek>): string[] {
        const shared: string[] = [];
        for (const day of days1) {
            if (days2.has(day)) {
                shared.push(day);
            }
        }
        return shared;
    }

    private checkTimeOverlap(period1: Period, period2: Period): ConflictType | null {
        const start1 = this.timeToMinutes(period1.startTime);
        const end1 = this.timeToMinutes(period1.endTime);
        const start2 = this.timeToMinutes(period2.startTime);
        const end2 = this.timeToMinutes(period2.endTime);

        if (start1 < end2 && start2 < end1) {
            return ConflictType.TIME_OVERLAP;
        }

        return null;
    }

    private checkInsufficientBreak(period1: Period, period2: Period): boolean {
        const end1 = this.timeToMinutes(period1.endTime);
        const start2 = this.timeToMinutes(period2.startTime);
        const end2 = this.timeToMinutes(period2.endTime);
        const start1 = this.timeToMinutes(period1.startTime);

        const gap1to2 = start2 - end1;
        const gap2to1 = start1 - end2;

        return (gap1to2 > 0 && gap1to2 < ConflictDetector.MIN_BREAK_MINUTES) ||
               (gap2to1 > 0 && gap2to1 < ConflictDetector.MIN_BREAK_MINUTES);
    }

    private timeToMinutes(time: { hours: number; minutes: number }): number {
        return time.hours * 60 + time.minutes;
    }

    isValidSchedule(sections: Section[]): boolean {
        const conflicts = this.detectConflicts(sections);
        return conflicts.filter(c => c.conflictType === ConflictType.TIME_OVERLAP).length === 0;
    }

    getConflictScore(sections: Section[]): number {
        const conflicts = this.detectConflicts(sections);
        let score = 0;
        
        conflicts.forEach(conflict => {
            switch (conflict.conflictType) {
                case ConflictType.TIME_OVERLAP:
                    score -= 100; // Major penalty
                    break;
                case ConflictType.INSUFFICIENT_BREAK:
                    score -= 10; // Minor penalty
                    break;
            }
        });
        
        return score;
    }
}