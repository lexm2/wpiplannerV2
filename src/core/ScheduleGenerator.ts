import { Section } from '../types/types'
import { SelectedCourse, ScheduleCombination, SchedulePreferences } from '../types/schedule'
import { ConflictDetector } from './ConflictDetector'

export class ScheduleGenerator {
    private conflictDetector: ConflictDetector;
    private maxCombinations = 1000; // Prevent infinite generation

    constructor() {
        this.conflictDetector = new ConflictDetector();
    }

    generateSchedules(selectedCourses: SelectedCourse[], preferences: SchedulePreferences): ScheduleCombination[] {
        const sectionCombinations = this.generateSectionCombinations(selectedCourses);
        const schedules: ScheduleCombination[] = [];

        for (let i = 0; i < sectionCombinations.length && schedules.length < this.maxCombinations; i++) {
            const sections = sectionCombinations[i];
            const conflicts = this.conflictDetector.detectConflicts(sections);
            const isValid = this.conflictDetector.isValidSchedule(sections);
            const score = this.calculateScheduleScore(sections, preferences);

            schedules.push({
                id: `schedule-${i}`,
                sections,
                conflicts,
                isValid,
                score
            });
        }

        // Sort by score (highest first) and validity
        return schedules.sort((a, b) => {
            if (a.isValid && !b.isValid) return -1;
            if (!a.isValid && b.isValid) return 1;
            return b.score - a.score;
        });
    }

    private generateSectionCombinations(selectedCourses: SelectedCourse[]): Section[][] {
        if (selectedCourses.length === 0) return [];

        const sectionArrays = selectedCourses.map(selectedCourse => {
            const availableSections = selectedCourse.course.sections.filter(section =>
                !selectedCourse.deniedSections.includes(section.number)
            );

            // Prioritize preferred sections
            const preferredSections = availableSections.filter(section =>
                selectedCourse.preferredSections.includes(section.number)
            );

            return preferredSections.length > 0 ? preferredSections : availableSections;
        });

        return this.cartesianProduct(sectionArrays);
    }

    private cartesianProduct<T>(arrays: T[][]): T[][] {
        if (arrays.length === 0) return [];
        if (arrays.length === 1) return arrays[0].map(item => [item]);

        const result: T[][] = [];
        const restProduct = this.cartesianProduct(arrays.slice(1));

        for (const item of arrays[0]) {
            for (const combination of restProduct) {
                result.push([item, ...combination]);
                if (result.length >= this.maxCombinations) {
                    return result;
                }
            }
        }

        return result;
    }

    private calculateScheduleScore(sections: Section[], preferences: SchedulePreferences): number {
        let score = 0;

        // Base score from conflict detection
        score += this.conflictDetector.getConflictScore(sections);

        // Time preference scoring
        score += this.scoreTimePreferences(sections, preferences);

        // Day preference scoring
        score += this.scoreDayPreferences(sections, preferences);

        // Building preference scoring
        score += this.scoreBuildingPreferences(sections, preferences);

        // Back-to-back class preference
        if (preferences.avoidBackToBackClasses) {
            score += this.scoreBackToBackClasses(sections);
        }

        return score;
    }

    private scoreTimePreferences(sections: Section[], preferences: SchedulePreferences): number {
        let score = 0;
        const preferredStart = preferences.preferredTimeRange.startTime.hours * 60 + preferences.preferredTimeRange.startTime.minutes;
        const preferredEnd = preferences.preferredTimeRange.endTime.hours * 60 + preferences.preferredTimeRange.endTime.minutes;

        for (const section of sections) {
            for (const period of section.periods) {
                const periodStart = period.startTime.hours * 60 + period.startTime.minutes;
                const periodEnd = period.endTime.hours * 60 + period.endTime.minutes;

                if (periodStart >= preferredStart && periodEnd <= preferredEnd) {
                    score += 20; // Bonus for classes within preferred time
                } else {
                    // Penalty based on how far outside preferred range
                    const startDeviation = Math.max(0, preferredStart - periodStart, periodStart - preferredEnd);
                    const endDeviation = Math.max(0, preferredStart - periodEnd, periodEnd - preferredEnd);
                    score -= (startDeviation + endDeviation) / 60 * 5; // 5 points per hour deviation
                }
            }
        }

        return score;
    }

    private scoreDayPreferences(sections: Section[], preferences: SchedulePreferences): number {
        let score = 0;

        for (const section of sections) {
            for (const period of section.periods) {
                for (const day of period.days) {
                    if (preferences.preferredDays.has(day)) {
                        score += 10; // Bonus for preferred days
                    }
                }
            }
        }

        return score;
    }

    private scoreBuildingPreferences(sections: Section[], preferences: SchedulePreferences): number {
        let score = 0;

        for (const section of sections) {
            for (const period of section.periods) {
                if (preferences.preferredBuildings.includes(period.building)) {
                    score += 5; // Small bonus for preferred buildings
                }
            }
        }

        return score;
    }

    private scoreBackToBackClasses(sections: Section[]): number {
        let score = 0;
        // Implementation would analyze class scheduling patterns
        // For now, return neutral score
        return score;
    }

    setMaxCombinations(max: number): void {
        this.maxCombinations = max;
    }
}