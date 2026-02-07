import { Period, Section } from '../../../types/types';
import { SelectedCourse, AcademicTerm, WeeklyTimeSlot } from '../../../types/schedule';
import { ConflictFilterCriteria, PeriodConflictFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import { FilterableSection } from '../../../types/filterableUnit';
import { logger } from '../../../utils/logger';
import { periodToWeeklySlots, sectionToWeeklySlots, slotsOverlap } from '../../../utils/timeSlotUtils';
import { weeklySlotToMask } from '../../scheduling/BitMaskEngine';

export interface ConflictCriteria extends ConflictFilterCriteria {
    selectedCourses?: SelectedCourse[];
}

export class ConflictFilter implements SectionBasedFilter {
    readonly id = 'periodConflict';
    readonly name = 'Time Conflicts';
    readonly description = 'Hide periods that conflict with selected sections or blocked times';
    readonly priority = 65;

    private blockedMasksByTerm: Map<string, bigint> = new Map();

    apply(sections: FilterableSection[], criteria: any, _activeFilters?: Map<string, any>): FilterableSection[] {
        return this.applyToFilterableSections(sections, criteria);
    }

    private applyToFilterableSections(sections: FilterableSection[], criteria: ConflictCriteria): FilterableSection[] {
        if (!criteria.avoidConflicts) {
            return sections;
        }

        const blockedSlots = this.getBlockedSlots(criteria);
        if (blockedSlots.length === 0) {
            return sections;
        }

        return sections.filter(fs => {
            for (const currentPeriod of fs.section.periods) {
                const periodSlots = periodToWeeklySlots(currentPeriod, fs.section.computedTerm || AcademicTerm.ALL);
                if (this.hasConflictWithBlockedSlots(periodSlots, blockedSlots)) {
                    return false;
                }
            }
            return true;
        });
    }

    private getBlockedSlots(criteria: ConflictCriteria): WeeklyTimeSlot[] {
        const slots: WeeklyTimeSlot[] = [];

        if (criteria.blockedSlots) {
            slots.push(...criteria.blockedSlots);
        }

        if (criteria.selectedCourses) {
            for (const sc of criteria.selectedCourses) {
                if (sc.selectedLecture) {
                    slots.push(...sectionToWeeklySlots(sc.selectedLecture));
                }
                if (sc.selectedDiscussion) {
                    slots.push(...sectionToWeeklySlots(sc.selectedDiscussion));
                }
                if (sc.selectedLab) {
                    slots.push(...sectionToWeeklySlots(sc.selectedLab));
                }
            }
        }

        return slots;
    }

    applyToPeriods(periods: Period[], criteria: ConflictCriteria): Period[] {
        if (!criteria.avoidConflicts) {
            return periods;
        }

        const blockedSlots = this.getBlockedSlots(criteria);
        if (blockedSlots.length === 0) {
            return periods;
        }

        return periods.filter(period => {
            const periodSlots = periodToWeeklySlots(period, AcademicTerm.ALL);
            return !this.hasConflictWithBlockedSlots(periodSlots, blockedSlots);
        });
    }

    applyToSections(sections: Section[], criteria: ConflictCriteria): Section[] {
        if (!criteria.avoidConflicts) {
            return sections;
        }

        const blockedSlots = this.getBlockedSlots(criteria);
        if (blockedSlots.length === 0) {
            return sections;
        }

        return sections.filter(section => {
            const sectionSlots = sectionToWeeklySlots(section);
            return !this.hasConflictWithBlockedSlots(sectionSlots, blockedSlots);
        });
    }

    applyToPeriodsWithContext(
        periodsWithContext: Array<{course: SelectedCourse, period: Period}>,
        criteria: ConflictCriteria
    ): Array<{course: SelectedCourse, period: Period}> {
        if (!criteria.avoidConflicts) {
            return periodsWithContext;
        }

        const blockedSlots = this.getBlockedSlots(criteria);
        if (blockedSlots.length === 0) {
            return periodsWithContext;
        }

        return periodsWithContext.filter(({course, period}) => {
            const periodSlots = periodToWeeklySlots(period, course.course.lectures?.[0]?.section.computedTerm || AcademicTerm.ALL);

            const relevantBlockedSlots = blockedSlots.filter(slot => {
                const courseIdFromSlot = slot.id.split('-')[0];
                return courseIdFromSlot !== course.course.id;
            });

            return !this.hasConflictWithBlockedSlots(periodSlots, relevantBlockedSlots);
        });
    }

    applyToSectionsWithContext(
        sectionsWithContext: Array<{course: SelectedCourse, section: Section}>,
        criteria: ConflictCriteria
    ): Array<{course: SelectedCourse, section: Section}> {
        logger.log('[ConflictFilter] applyToSectionsWithContext called');
        logger.log('[ConflictFilter] Criteria:', criteria);
        logger.log('[ConflictFilter] avoidConflicts:', criteria.avoidConflicts);

        if (!criteria.avoidConflicts) {
            logger.log('[ConflictFilter] Early return - avoidConflicts false');
            return sectionsWithContext;
        }

        const blockedSlots = this.getBlockedSlots(criteria);
        logger.log('[ConflictFilter] blockedSlots:', blockedSlots.length);

        if (blockedSlots.length === 0) {
            logger.log('[ConflictFilter] Early return - no blocked slots');
            return sectionsWithContext;
        }

        const result = sectionsWithContext.filter(item => {
            const currentSection = item.section;

            const relevantBlockedSlots = blockedSlots.filter(slot => {
                const slotCrn = slot.id.split('-')[0];
                return slotCrn !== String(currentSection.crn);
            });

            if (relevantBlockedSlots.length === 0) {
                return true;
            }

            for (const currentPeriod of currentSection.periods) {
                const periodSlots = periodToWeeklySlots(currentPeriod, currentSection.computedTerm || AcademicTerm.ALL);
                if (this.hasConflictWithBlockedSlots(periodSlots, relevantBlockedSlots)) {
                    return false;
                }
            }

            return true;
        });

        logger.log(`[ConflictFilter] Filtered ${sectionsWithContext.length} sections down to ${result.length}`);
        return result;
    }

    private hasConflictWithBlockedSlots(
        testSlots: WeeklyTimeSlot[],
        blockedSlots: WeeklyTimeSlot[]
    ): boolean {
        for (const testSlot of testSlots) {
            for (const blockedSlot of blockedSlots) {
                if (this.slotsConflict(testSlot, blockedSlot)) {
                    return true;
                }
            }
        }
        return false;
    }

    private slotsConflict(slot1: WeeklyTimeSlot, slot2: WeeklyTimeSlot): boolean {
        if (slot1.term !== AcademicTerm.ALL &&
            slot2.term !== AcademicTerm.ALL &&
            slot1.term !== slot2.term) {
            return false;
        }

        if (slot1.day !== slot2.day) {
            return false;
        }

        return slotsOverlap(slot1, slot2);
    }

    isValidCriteria(criteria: any): boolean {
        if (!criteria || typeof criteria !== 'object') {
            return false;
        }
        return typeof criteria.avoidConflicts === 'boolean';
    }

    getDisplayValue(criteria: any): string {
        if (criteria && criteria.avoidConflicts) {
            const blockedSlots = this.getBlockedSlots(criteria);
            if (blockedSlots.length > 0) {
                return `Avoiding conflicts (${blockedSlots.length} blocked slots)`;
            }
            return 'Avoiding conflicts';
        }
        return 'Conflicts allowed';
    }

    private precomputeBlockedMasks(blockedSlots: WeeklyTimeSlot[]): void {
        this.blockedMasksByTerm.clear();

        for (const slot of blockedSlots) {
            const mask = weeklySlotToMask(slot);
            if (mask === 0n) continue;

            let terms: string[];
            if (slot.term === AcademicTerm.ALL) {
                terms = ['A', 'B', 'C', 'D'];
            } else if (slot.term === AcademicTerm.F) {
                terms = ['A', 'B'];
            } else if (slot.term === AcademicTerm.S) {
                terms = ['C', 'D'];
            } else {
                terms = [slot.term];
            }

            for (const term of terms) {
                const existing = this.blockedMasksByTerm.get(term) || 0n;
                this.blockedMasksByTerm.set(term, existing | mask);
            }
        }
    }

    getBlockedMasksByTerm(criteria?: ConflictCriteria): Map<string, bigint> {
        if (criteria) {
            const blockedSlots = this.getBlockedSlots(criteria);
            this.precomputeBlockedMasks(blockedSlots);
        }
        return new Map(this.blockedMasksByTerm);
    }
}
