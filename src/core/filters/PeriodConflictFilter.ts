import { Period, Section, Course } from '../../types/types';
import { SelectedCourse } from '../../types/schedule';
import { ConflictDetector } from '../ConflictDetector';
import { CourseFilter, PeriodConflictFilterCriteria } from '../../types/filters';

export interface PeriodConflictCriteria extends PeriodConflictFilterCriteria {
    selectedCourses?: SelectedCourse[];
}

export class PeriodConflictFilter implements CourseFilter {
    readonly id = 'periodConflict';
    readonly name = 'Schedule Conflicts';
    readonly description = 'Hide periods that conflict with selected sections';
    private conflictDetector: ConflictDetector;

    constructor(conflictDetector: ConflictDetector) {
        this.conflictDetector = conflictDetector;
    }

    applyToPeriods(periods: Period[], criteria: PeriodConflictCriteria): Period[] {
        if (!criteria.avoidConflicts || !criteria.selectedCourses) {
            return periods;
        }

        // Get currently selected sections (where selectedSectionNumber is not null)
        const selectedSections: Section[] = [];
        for (const selectedCourse of criteria.selectedCourses) {
            if (selectedCourse.selectedSectionNumber) {
                const section = selectedCourse.course.sections.find(s => s.number === selectedCourse.selectedSectionNumber);
                if (section) {
                    selectedSections.push(section);
                }
            }
        }

        // If no sections are selected, show all periods (nothing to conflict with)
        if (selectedSections.length === 0) {
            return periods;
        }

        // Filter out periods that would cause conflicts
        return periods.filter(period => {
            // Create a temporary section containing just this period
            const tempSection: Section = {
                crn: Math.floor(Math.random() * 99999),
                number: 'TEMP',
                periods: [period],
                seats: 999,
                seatsAvailable: 999,
                actualWaitlist: 0,
                maxWaitlist: 0,
                description: 'Temporary section for conflict detection',
                term: 'TEMP'
            };

            // Test if this temporary section conflicts with any selected sections
            const testSections = [...selectedSections, tempSection];
            const conflicts = this.conflictDetector.detectConflicts(testSections);
            
            // Return true if no conflicts found (keep this period)
            return conflicts.length === 0;
        });
    }

    // Context-aware period filtering - only checks conflicts against OTHER courses
    applyToPeriodsWithContext(
        periodsWithContext: Array<{course: SelectedCourse, period: Period}>, 
        criteria: PeriodConflictCriteria
    ): Array<{course: SelectedCourse, period: Period}> {
        if (!criteria.avoidConflicts || !criteria.selectedCourses) {
            return periodsWithContext;
        }

        // Build map of selected sections by course ID for quick lookup
        const selectedSectionsByCourse = new Map<string, Section>();
        for (const selectedCourse of criteria.selectedCourses) {
            if (selectedCourse.selectedSectionNumber) {
                const section = selectedCourse.course.sections.find(s => s.number === selectedCourse.selectedSectionNumber);
                if (section) {
                    selectedSectionsByCourse.set(selectedCourse.course.id, section);
                }
            }
        }

        // If no sections are selected, show all periods
        if (selectedSectionsByCourse.size === 0) {
            return periodsWithContext;
        }

        // Filter out periods that conflict with selected sections from OTHER courses only
        return periodsWithContext.filter(item => {
            const currentCourse = item.course.course;
            const currentPeriod = item.period;

            // Get selected sections from OTHER courses (exclude current course)
            const otherCoursesSelectedSections: Section[] = [];
            for (const [courseId, selectedSection] of selectedSectionsByCourse.entries()) {
                if (courseId !== currentCourse.id) {
                    otherCoursesSelectedSections.push(selectedSection);
                }
            }

            // If no other courses have selected sections, no conflicts to check
            if (otherCoursesSelectedSections.length === 0) {
                return true;
            }

            // Create a temporary section containing just this period
            const tempSection: Section = {
                crn: Math.floor(Math.random() * 99999),
                number: 'TEMP',
                periods: [currentPeriod],
                seats: 999,
                seatsAvailable: 999,
                actualWaitlist: 0,
                maxWaitlist: 0,
                description: 'Temporary section for conflict detection',
                term: 'TEMP'
            };

            // Test if this temporary section conflicts with selected sections from OTHER courses only
            const testSections = [...otherCoursesSelectedSections, tempSection];
            const conflicts = this.conflictDetector.detectConflicts(testSections);
            
            // Return true if no conflicts found (keep this period)
            return conflicts.length === 0;
        });
    }

    // Section-based conflict detection - if ANY period in a section conflicts, filter out the ENTIRE section
    applyToSectionsWithContext(
        sectionsWithContext: Array<{course: SelectedCourse, section: Section}>, 
        criteria: PeriodConflictCriteria
    ): Array<{course: SelectedCourse, section: Section}> {
        if (!criteria.avoidConflicts || !criteria.selectedCourses) {
            return sectionsWithContext;
        }

        // Build map of selected sections by course ID for quick lookup
        const selectedSectionsByCourse = new Map<string, Section>();
        for (const selectedCourse of criteria.selectedCourses) {
            if (selectedCourse.selectedSectionNumber) {
                const section = selectedCourse.course.sections.find(s => s.number === selectedCourse.selectedSectionNumber);
                if (section) {
                    selectedSectionsByCourse.set(selectedCourse.course.id, section);
                }
            }
        }

        // If no sections are selected, show all sections
        if (selectedSectionsByCourse.size === 0) {
            return sectionsWithContext;
        }

        // Filter out sections that have ANY period conflicting with selected sections from OTHER courses
        return sectionsWithContext.filter(item => {
            const currentCourse = item.course.course;
            const currentSection = item.section;

            // Get selected sections from OTHER courses (exclude current course)
            const otherCoursesSelectedSections: Section[] = [];
            for (const [courseId, selectedSection] of selectedSectionsByCourse.entries()) {
                if (courseId !== currentCourse.id) {
                    otherCoursesSelectedSections.push(selectedSection);
                }
            }

            // If no other courses have selected sections, no conflicts to check
            if (otherCoursesSelectedSections.length === 0) {
                return true;
            }

            // Check if ANY period in the current section conflicts with selected sections from other courses
            for (const currentPeriod of currentSection.periods) {
                // Create a temporary section containing just this period
                const tempSection: Section = {
                    crn: Math.floor(Math.random() * 99999),
                    number: 'TEMP',
                    periods: [currentPeriod],
                    seats: 999,
                    seatsAvailable: 999,
                    actualWaitlist: 0,
                    maxWaitlist: 0,
                    description: 'Temporary section for conflict detection',
                    term: 'TEMP'
                };

                // Test if this period conflicts with any selected sections from OTHER courses
                const testSections = [...otherCoursesSelectedSections, tempSection];
                const conflicts = this.conflictDetector.detectConflicts(testSections);
                
                // If ANY period in this section conflicts, filter out the ENTIRE section
                if (conflicts.length > 0) {
                    return false;
                }
            }

            // No conflicts found for any period in this section
            return true;
        });
    }

    applyCriteriaToSelectedCourses(selectedCourses: SelectedCourse[], criteria: PeriodConflictCriteria): SelectedCourse[] {
        // This filter works at the period level, not course level
        return selectedCourses;
    }

    // CourseFilter interface implementation
    apply(courses: Course[], criteria: PeriodConflictFilterCriteria): Course[] {
        // This filter doesn't work at the course level, it works at the period level
        // For course-level filtering, we just return all courses since conflict detection
        // happens at the period level in the ScheduleFilterService
        return courses;
    }

    isValidCriteria(criteria: any): boolean {
        if (!criteria || typeof criteria !== 'object') {
            return false;
        }
        return typeof criteria.avoidConflicts === 'boolean';
    }

    getDisplayValue(criteria: PeriodConflictFilterCriteria): string {
        if (criteria.avoidConflicts) {
            return 'Avoiding conflicts';
        }
        return 'Conflicts allowed';
    }
}