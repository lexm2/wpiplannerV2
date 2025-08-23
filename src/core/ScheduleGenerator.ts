import { Section } from '../types/types'
import { SelectedCourse, ScheduleCombination, SchedulePreferences } from '../types/schedule'
import { ConflictDetector } from './ConflictDetector'

export class ScheduleGenerator {
    private conflictDetector: ConflictDetector;
    private maxCombinations = 1000; // Prevent infinite generation

    constructor() {
        this.conflictDetector = new ConflictDetector();
    }

    generateSchedules(selectedCourses: SelectedCourse[]): ScheduleCombination[] {
        const sectionCombinations = this.generateSectionCombinations(selectedCourses);
        const schedules: ScheduleCombination[] = [];

        for (let i = 0; i < sectionCombinations.length && schedules.length < this.maxCombinations; i++) {
            const sections = sectionCombinations[i];
            const conflicts = this.conflictDetector.detectConflicts(sections);
            const isValid = this.conflictDetector.isValidSchedule(sections);

            schedules.push({
                id: `schedule-${i}`,
                sections,
                conflicts,
                isValid
            });
        }

        // Sort by validity (valid schedules first)
        return schedules.sort((a, b) => {
            if (a.isValid && !b.isValid) return -1;
            if (!a.isValid && b.isValid) return 1;
            return 0;
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

    setMaxCombinations(max: number): void {
        this.maxCombinations = max;
    }
}