import { Section, Period, DayOfWeek } from '../types/types'
import { TimeConflict, ConflictType } from '../types/schedule'

export class ConflictDetector {
    private conflictCache = new Map<string, TimeConflict[]>();
    detectConflicts(sections: Section[]): TimeConflict[] {
        const conflicts: TimeConflict[] = [];
        
        for (let i = 0; i < sections.length; i++) {
            for (let j = i + 1; j < sections.length; j++) {
                const cacheKey = this.getCacheKey(sections[i], sections[j]);
                let sectionConflicts = this.conflictCache.get(cacheKey);
                
                if (!sectionConflicts) {
                    sectionConflicts = this.checkSectionConflicts(sections[i], sections[j]);
                    this.conflictCache.set(cacheKey, sectionConflicts);
                }
                
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

        if (this.hasTimeOverlap(period1, period2)) {
            return {
                section1,
                section2,
                conflictType: ConflictType.TIME_OVERLAP,
                description: `Time overlap on ${sharedDays.join(', ')}: ${period1.startTime.displayTime}-${period1.endTime.displayTime} conflicts with ${period2.startTime.displayTime}-${period2.endTime.displayTime}`
            };
        }

        return null;
    }

    private getSharedDays(days1: Set<DayOfWeek>, days2: Set<DayOfWeek>): string[] {
        return Array.from(new Set([...days1].filter(day => days2.has(day))));
    }

    private hasTimeOverlap(period1: Period, period2: Period): boolean {
        const start1 = this.timeToMinutes(period1.startTime);
        const end1 = this.timeToMinutes(period1.endTime);
        const start2 = this.timeToMinutes(period2.startTime);
        const end2 = this.timeToMinutes(period2.endTime);

        return start1 < end2 && start2 < end1;
    }

    private timeToMinutes(time: { hours: number; minutes: number }): number {
        return time.hours * 60 + time.minutes;
    }

    isValidSchedule(sections: Section[]): boolean {
        const conflicts = this.detectConflicts(sections);
        return conflicts.length === 0;
    }

    clearCache(): void {
        this.conflictCache.clear();
    }

    private getCacheKey(section1: Section, section2: Section): string {
        const key1 = `${section1.crn}-${section2.crn}`;
        const key2 = `${section2.crn}-${section1.crn}`;
        return key1 < key2 ? key1 : key2;
    }
}