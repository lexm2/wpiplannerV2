import { Period, Section } from '../../types/types';
import { SelectedCourse } from '../../types/schedule';
import { ConflictDetector } from '../ConflictDetector';
import { SectionFilter, PeriodConflictFilterCriteria } from '../../types/filters';

export interface PeriodConflictCriteria extends PeriodConflictFilterCriteria {
    selectedCourses?: SelectedCourse[];
}

export class PeriodConflictFilter implements SectionFilter {
    readonly id = 'periodConflict';
    readonly name = 'Schedule Conflicts';
    readonly description = 'Hide periods that conflict with selected sections';
    readonly priority = 65;
    private conflictDetector: ConflictDetector;

    constructor(conflictDetector: ConflictDetector) {
        this.conflictDetector = conflictDetector;
    }

    apply(sections: any[], criteria: any, _activeFilters?: Map<string, any>): any[] {
        return this.applyToSections(sections, criteria);
    }

    applyToPeriods(periods: Period[], criteria: PeriodConflictCriteria): Period[] {
        if (!criteria.avoidConflicts || !criteria.selectedCourses) {
            return periods;
        }

        // Get currently selected sections (where selectedSectionNumber is not null)
        const selectedSections: Section[] = [];
        for (const selectedCourse of criteria.selectedCourses) {
            if (selectedCourse.selectedSectionNumber) {
                const section = selectedCourse.course.sections?.find(s => s.number === selectedCourse.selectedSectionNumber);
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
                term: 'TEMP',
                computedTerm: 'TEMP'
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
        // NOTE: A SelectedCourse can have multiple selected sections (lecture, discussion, lab)
        const selectedSectionsByCourse = new Map<string, Section[]>();
        for (const selectedCourse of criteria.selectedCourses) {
            const sectionsForThisCourse: Section[] = [];

            if (selectedCourse.selectedLecture) {
                sectionsForThisCourse.push(selectedCourse.selectedLecture);
            }
            if (selectedCourse.selectedDiscussion) {
                sectionsForThisCourse.push(selectedCourse.selectedDiscussion);
            }
            if (selectedCourse.selectedLab) {
                sectionsForThisCourse.push(selectedCourse.selectedLab);
            }

            if (sectionsForThisCourse.length > 0) {
                selectedSectionsByCourse.set(selectedCourse.course.id, sectionsForThisCourse);
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
            for (const [courseId, selectedSections] of selectedSectionsByCourse.entries()) {
                if (courseId !== currentCourse.id) {
                    otherCoursesSelectedSections.push(...selectedSections);
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
                term: 'TEMP',
                computedTerm: 'TEMP'
            };

            // Test if this temporary section conflicts with selected sections from OTHER courses only
            const testSections = [...otherCoursesSelectedSections, tempSection];
            const conflicts = this.conflictDetector.detectConflicts(testSections);
            
            // Return true if no conflicts found (keep this period)
            return conflicts.length === 0;
        });
    }

    // Section-based conflict detection - if ANY period in a section conflicts, filter out the ENTIRE section
    applyToSections(
        sections: Section[],
        criteria: PeriodConflictCriteria
    ): Section[] {
        if (!criteria.avoidConflicts || !criteria.selectedCourses) {
            return sections;
        }

        // Get currently selected sections from all courses
        // NOTE: Each SelectedCourse can have lecture, discussion, and lab selected
        const selectedSections: Section[] = [];
        for (const selectedCourse of criteria.selectedCourses) {
            if (selectedCourse.selectedLecture) {
                selectedSections.push(selectedCourse.selectedLecture);
            }
            if (selectedCourse.selectedDiscussion) {
                selectedSections.push(selectedCourse.selectedDiscussion);
            }
            if (selectedCourse.selectedLab) {
                selectedSections.push(selectedCourse.selectedLab);
            }
        }

        // If no sections are selected, show all sections
        if (selectedSections.length === 0) {
            return sections;
        }

        // Filter out sections that have ANY period conflicting with selected sections
        return sections.filter(currentSection => {
            // Check if ANY period in the current section conflicts with selected sections
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
                    term: 'TEMP',
                    computedTerm: 'TEMP'
                };

                // Test if this period conflicts with any selected sections
                const testSections = [...selectedSections, tempSection];
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

    // Keep the context-aware version for backward compatibility
    applyToSectionsWithContext(
        sectionsWithContext: Array<{course: SelectedCourse, section: Section}>,
        criteria: PeriodConflictCriteria
    ): Array<{course: SelectedCourse, section: Section}> {
        console.log('[PeriodConflictFilter] applyToSectionsWithContext called');
        console.log('[PeriodConflictFilter] Criteria:', criteria);
        console.log('[PeriodConflictFilter] avoidConflicts:', criteria.avoidConflicts);
        console.log('[PeriodConflictFilter] selectedCourses:', criteria.selectedCourses?.length);

        if (!criteria.avoidConflicts || !criteria.selectedCourses) {
            console.log('[PeriodConflictFilter] Early return - avoidConflicts or selectedCourses missing');
            return sectionsWithContext;
        }

        // Build map of selected sections by course ID for quick lookup
        // NOTE: A SelectedCourse can have multiple selected sections (lecture, discussion, lab)
        const selectedSectionsByCourse = new Map<string, Section[]>();
        for (const selectedCourse of criteria.selectedCourses) {
            console.log('[PeriodConflictFilter] Processing course:', selectedCourse.course.department.abbreviation + selectedCourse.course.number);
            console.log('[PeriodConflictFilter]   selectedLecture:', selectedCourse.selectedLecture?.number);
            console.log('[PeriodConflictFilter]   selectedDiscussion:', selectedCourse.selectedDiscussion?.number);
            console.log('[PeriodConflictFilter]   selectedLab:', selectedCourse.selectedLab?.number);

            const sectionsForThisCourse: Section[] = [];

            if (selectedCourse.selectedLecture) {
                sectionsForThisCourse.push(selectedCourse.selectedLecture);
                console.log('[PeriodConflictFilter]   ✓ Added lecture to map:', selectedCourse.selectedLecture.number);
            }
            if (selectedCourse.selectedDiscussion) {
                sectionsForThisCourse.push(selectedCourse.selectedDiscussion);
                console.log('[PeriodConflictFilter]   ✓ Added discussion to map:', selectedCourse.selectedDiscussion.number);
            }
            if (selectedCourse.selectedLab) {
                sectionsForThisCourse.push(selectedCourse.selectedLab);
                console.log('[PeriodConflictFilter]   ✓ Added lab to map:', selectedCourse.selectedLab.number);
            }

            if (sectionsForThisCourse.length > 0) {
                selectedSectionsByCourse.set(selectedCourse.course.id, sectionsForThisCourse);
            }
        }

        console.log('[PeriodConflictFilter] Total selected sections in map:', selectedSectionsByCourse.size);

        // If no sections are selected, show all sections
        if (selectedSectionsByCourse.size === 0) {
            console.log('[PeriodConflictFilter] No selected sections - returning all');
            return sectionsWithContext;
        }

        // Filter out sections that have ANY period conflicting with selected sections from OTHER courses
        const result = sectionsWithContext.filter(item => {
            const currentCourse = item.course.course;
            const currentSection = item.section;

            console.log(`[PeriodConflictFilter] Testing section ${currentSection.number} from ${currentCourse.department.abbreviation}${currentCourse.number}`);

            // Build list of sections to check against:
            // 1. Same course: selected components EXCEPT the section being tested (to check lecture vs discussion, etc.)
            // 2. Other courses: ALL selected sections (to check cross-course conflicts)
            const sectionsToCheckAgainst: Section[] = [];

            for (const [courseId, selectedSections] of selectedSectionsByCourse.entries()) {
                if (courseId === currentCourse.id) {
                    // Same course: check against other components (exclude current section being tested)
                    // This allows checking discussion against lecture, lab against lecture, etc.
                    const otherComponents = selectedSections.filter(s => s.crn !== currentSection.crn);
                    sectionsToCheckAgainst.push(...otherComponents);

                    if (otherComponents.length > 0) {
                        console.log(`[PeriodConflictFilter]   Checking against ${otherComponents.length} other components from same course`);
                        otherComponents.forEach(s => {
                            console.log(`[PeriodConflictFilter]     - ${s.number} (${s.periods.length} periods)`);
                        });
                    }
                } else {
                    // Different course: check against ALL selected sections
                    sectionsToCheckAgainst.push(...selectedSections);
                    console.log(`[PeriodConflictFilter]   Checking against ${selectedSections.length} sections from other course ${courseId}`);
                    selectedSections.forEach(s => {
                        console.log(`[PeriodConflictFilter]     - ${s.number} (${s.periods.length} periods)`);
                    });
                }
            }

            // If no sections to check against, no conflicts possible
            if (sectionsToCheckAgainst.length === 0) {
                console.log(`[PeriodConflictFilter]   ✓ PASS - No selected sections to check against`);
                return true;
            }

            // Check if ANY period in the current section conflicts
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
                    term: 'TEMP',
                    computedTerm: 'TEMP'
                };

                // Test if this period conflicts with any selected sections
                const testSections = [...sectionsToCheckAgainst, tempSection];
                const conflicts = this.conflictDetector.detectConflicts(testSections);

                // If ANY period in this section conflicts, filter out the ENTIRE section
                if (conflicts.length > 0) {
                    console.log(`[PeriodConflictFilter]   ✗ FAIL - Period conflicts detected:`, conflicts.length);
                    const daysStr = Array.isArray(currentPeriod.days) ? currentPeriod.days.join('') : currentPeriod.days;
                    console.log(`[PeriodConflictFilter]     Period: ${currentPeriod.type} ${daysStr} ${currentPeriod.startTime.hours}:${currentPeriod.startTime.minutes}-${currentPeriod.endTime.hours}:${currentPeriod.endTime.minutes}`);
                    return false;
                }
            }

            // No conflicts found for any period in this section
            console.log(`[PeriodConflictFilter]   ✓ PASS - No conflicts found`);
            return true;
        });

        console.log(`[PeriodConflictFilter] Filtered ${sectionsWithContext.length} sections down to ${result.length}`);
        return result;
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