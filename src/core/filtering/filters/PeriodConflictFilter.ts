import { Period, Section } from '../../../types/types';
import { SelectedCourse } from '../../../types/schedule';
import { ConflictDetector } from '../../scheduling/ConflictEngine';
import { PeriodConflictFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import { FilterableSection } from '../../../types/filterableUnit';
import { logger } from '../../../utils/logger';

export interface PeriodConflictCriteria extends PeriodConflictFilterCriteria {
    selectedCourses?: SelectedCourse[];
}

export class PeriodConflictFilter implements SectionBasedFilter {
    readonly id = 'periodConflict';
    readonly name = 'Schedule Conflicts';
    readonly description = 'Hide periods that conflict with selected sections';
    readonly priority = 65;
    private conflictDetector: ConflictDetector;

    constructor(conflictDetector: ConflictDetector) {
        this.conflictDetector = conflictDetector;
    }

    private createTempSection(period: Period, computedTerm: string = 'A'): Section {
        return {
            crn: Math.floor(Math.random() * 99_999),
            number: 'TEMP',
            periods: [period],
            seats: 999,
            seatsAvailable: 999,
            actualWaitlist: 0,
            maxWaitlist: 0,
            description: 'Temporary section for conflict detection',
            term: computedTerm,
            computedTerm: computedTerm
        };
    }

    apply(sections: FilterableSection[], criteria: any, _activeFilters?: Map<string, any>): FilterableSection[] {
        return this.applyToFilterableSections(sections, criteria);
    }

    private applyToFilterableSections(sections: FilterableSection[], criteria: any): FilterableSection[] {
        if (!criteria.avoidConflicts || !criteria.selectedCourses) {
            return sections;
        }

        // Get currently selected sections from lecture/discussion/lab
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

        if (selectedSections.length === 0) {
            return sections;
        }

        const term = selectedSections[0]?.computedTerm || 'A';

        return sections.filter(fs => {
            for (const currentPeriod of fs.section.periods) {
                const tempSection = this.createTempSection(currentPeriod, term);
                const testSections = [...selectedSections, tempSection];
                if (this.conflictDetector.hasConflicts(testSections)) {
                    return false;
                }
            }
            return true;
        });
    }

    applyToPeriods(periods: Period[], criteria: PeriodConflictCriteria): Period[] {
        if (!criteria.avoidConflicts || !criteria.selectedCourses) {
            return periods;
        }

        // Get currently selected sections from lecture/discussion/lab
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

        // If no sections are selected, show all periods (nothing to conflict with)
        if (selectedSections.length === 0) {
            return periods;
        }

        // Get the term from the first selected section to use for temp sections
        const term = selectedSections[0]?.computedTerm || 'A';

        // Filter out periods that would cause conflicts
        return periods.filter(period => {
            const tempSection = this.createTempSection(period, term);
            const testSections = [...selectedSections, tempSection];
            return !this.conflictDetector.hasConflicts(testSections);
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

            // Get the term from the first selected section to use for temp sections
            const term = otherCoursesSelectedSections[0]?.computedTerm || 'A';

            const tempSection = this.createTempSection(currentPeriod, term);
            const testSections = [...otherCoursesSelectedSections, tempSection];
            return !this.conflictDetector.hasConflicts(testSections);
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

        // Get the term from the first selected section to use for temp sections
        const term = selectedSections[0]?.computedTerm || 'A';

        // Filter out sections that have ANY period conflicting with selected sections
        return sections.filter(currentSection => {
            // Check if ANY period in the current section conflicts with selected sections
            for (const currentPeriod of currentSection.periods) {
                const tempSection = this.createTempSection(currentPeriod, term);
                const testSections = [...selectedSections, tempSection];
                if (this.conflictDetector.hasConflicts(testSections)) {
                    return false;
                }
            }

            return true;
        });
    }

    // Keep the context-aware version for backward compatibility
    applyToSectionsWithContext(
        sectionsWithContext: Array<{course: SelectedCourse, section: Section}>,
        criteria: PeriodConflictCriteria
    ): Array<{course: SelectedCourse, section: Section}> {
        logger.log('[PeriodConflictFilter] applyToSectionsWithContext called');
        logger.log('[PeriodConflictFilter] Criteria:', criteria);
        logger.log('[PeriodConflictFilter] avoidConflicts:', criteria.avoidConflicts);
        logger.log('[PeriodConflictFilter] selectedCourses:', criteria.selectedCourses?.length);

        if (!criteria.avoidConflicts || !criteria.selectedCourses) {
            logger.log('[PeriodConflictFilter] Early return - avoidConflicts or selectedCourses missing');
            return sectionsWithContext;
        }

        // Build map of selected sections by course ID for quick lookup
        // NOTE: A SelectedCourse can have multiple selected sections (lecture, discussion, lab)
        const selectedSectionsByCourse = new Map<string, Section[]>();
        for (const selectedCourse of criteria.selectedCourses) {
            logger.log('[PeriodConflictFilter] Processing course:', selectedCourse.course.department.abbreviation + selectedCourse.course.number);
            logger.log('[PeriodConflictFilter]   selectedLecture:', selectedCourse.selectedLecture?.number);
            logger.log('[PeriodConflictFilter]   selectedDiscussion:', selectedCourse.selectedDiscussion?.number);
            logger.log('[PeriodConflictFilter]   selectedLab:', selectedCourse.selectedLab?.number);

            const sectionsForThisCourse: Section[] = [];

            if (selectedCourse.selectedLecture) {
                sectionsForThisCourse.push(selectedCourse.selectedLecture);
                logger.log('[PeriodConflictFilter]   ✓ Added lecture to map:', selectedCourse.selectedLecture.number);
            }
            if (selectedCourse.selectedDiscussion) {
                sectionsForThisCourse.push(selectedCourse.selectedDiscussion);
                logger.log('[PeriodConflictFilter]   ✓ Added discussion to map:', selectedCourse.selectedDiscussion.number);
            }
            if (selectedCourse.selectedLab) {
                sectionsForThisCourse.push(selectedCourse.selectedLab);
                logger.log('[PeriodConflictFilter]   ✓ Added lab to map:', selectedCourse.selectedLab.number);
            }

            if (sectionsForThisCourse.length > 0) {
                selectedSectionsByCourse.set(selectedCourse.course.id, sectionsForThisCourse);
            }
        }

        // If no sections are selected, show all sections
        if (selectedSectionsByCourse.size === 0) {
            return sectionsWithContext;
        }

        // Filter out sections that have ANY period conflicting with selected sections from OTHER courses
        const result = sectionsWithContext.filter(item => {
            const currentCourse = item.course.course;
            const currentSection = item.section;

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
                } else {
                    // Different course: check against ALL selected sections
                    sectionsToCheckAgainst.push(...selectedSections);
                }
            }

            // If no sections to check against, no conflicts possible
            if (sectionsToCheckAgainst.length === 0) {
                return true;
            }

            // Get the term from the first section to check against
            const term = sectionsToCheckAgainst[0]?.computedTerm || 'A';

            // Check if ANY period in the current section conflicts
            for (const currentPeriod of currentSection.periods) {
                const tempSection = this.createTempSection(currentPeriod, term);
                const testSections = [...sectionsToCheckAgainst, tempSection];
                if (this.conflictDetector.hasConflicts(testSections)) {
                    return false;
                }
            }

            return true;
        });

        logger.log(`[PeriodConflictFilter] Filtered ${sectionsWithContext.length} sections down to ${result.length}`);
        return result;
    }


    isValidCriteria(criteria: any): boolean {
        if (!criteria || typeof criteria !== 'object') {
            return false;
        }
        return typeof (criteria as PeriodConflictFilterCriteria).avoidConflicts === 'boolean';
    }

    getDisplayValue(criteria: any): string {
        if (criteria && criteria.avoidConflicts) {
            return 'Avoiding conflicts';
        }
        return 'Conflicts allowed';
    }
}