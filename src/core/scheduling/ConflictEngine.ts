/**
 * Unified conflict detection engine combining slot-based indexing with detailed conflict reporting.
 * Merges functionality from ConflictDetector (detailed conflicts) and TimeSlotMap (fast overlap queries).
 */
import { Section, Period, DayOfWeek } from '../../types/types';
import { DateUtils } from '../../utils/dateUtils';

export interface IConflictEngine {
    // From ConflictDetector - detailed conflict detection
    detectConflicts(sections: Section[]): Map<string, Set<string>>;
    hasConflicts(sections: Section[]): boolean;
    isValidSchedule(sections: Section[]): boolean;

    // From TimeSlotMap - fast overlap queries
    addSection(section: Section): void;
    hasOverlap(section1: Section, section2: Section): boolean;
    getAllOverlappingSections(section: Section): Set<Section>;

    // Common operations
    clear(): void;
    clearCache(): void;
}

export class ConflictEngine implements IConflictEngine {
    // TimeSlotMap internals for O(1) overlap detection
    private readonly MIN_MINUTE = 420;  // 7:00 AM
    private readonly MAX_MINUTE = 1320; // 10:00 PM
    private readonly SLOT_GRANULARITY = 5;
    private sectionsBySlot: Map<string, Set<Section>> = new Map();
    private slotsBySection: Map<string, Set<string>> = new Map();


    // ==================== TimeSlotMap API ====================

    /**
     * Add a section to the slot map for fast overlap detection
     */
    addSection(section: Section): void {
        if (!section.periods || section.periods.length === 0) {
            return;
        }

        const sectionKey = String(section.crn);
        const slotsForThisSection = new Set<string>();

        for (const period of section.periods) {
            if (!period.days || period.days.size === 0) {
                continue;
            }

            const startMinutes = DateUtils.timeToMinutes(period.startTime);
            const endMinutes = DateUtils.timeToMinutes(period.endTime);

            if (startMinutes === endMinutes) {
                continue;
            }

            const startSlot = this.roundToSlot(startMinutes);
            const endSlot = this.roundToSlot(endMinutes);

            for (const day of period.days) {
                for (let slotMinute = startSlot; slotMinute < endSlot && slotMinute < this.MAX_MINUTE; slotMinute += this.SLOT_GRANULARITY) {
                    if (slotMinute >= this.MIN_MINUTE) {
                        const slotKey = this.getSlotKey(day, slotMinute, section.computedTerm);
                        slotsForThisSection.add(slotKey);

                        if (!this.sectionsBySlot.has(slotKey)) {
                            this.sectionsBySlot.set(slotKey, new Set());
                        }
                        const slotSet = this.sectionsBySlot.get(slotKey);
                        if (slotSet) {
                            slotSet.add(section);
                        }
                    }
                }
            }
        }

        this.slotsBySection.set(sectionKey, slotsForThisSection);
    }

    /**
     * Check if two sections have overlapping time slots (O(n) where n is slots)
     */
    hasOverlap(section1: Section, section2: Section): boolean {
        // Sections in different terms cannot conflict
        if (section1.computedTerm !== section2.computedTerm) {
            return false;
        }

        const slots1 = this.slotsBySection.get(String(section1.crn));
        const slots2 = this.slotsBySection.get(String(section2.crn));

        if (!slots1 || !slots2) {
            // Fallback to direct comparison if sections not in map
            return this.hasDirectOverlap(section1, section2);
        }

        for (const slot of slots1) {
            if (slots2.has(slot)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get all sections that overlap with the given section
     */
    getAllOverlappingSections(section: Section): Set<Section> {
        const overlapping = new Set<Section>();
        const slots = this.slotsBySection.get(String(section.crn));

        if (!slots) {
            return overlapping;
        }

        for (const slotKey of slots) {
            const sectionsInSlot = this.sectionsBySlot.get(slotKey);
            if (sectionsInSlot) {
                for (const otherSection of sectionsInSlot) {
                    if (otherSection.crn !== section.crn &&
                        otherSection.computedTerm === section.computedTerm) {
                        overlapping.add(otherSection);
                    }
                }
            }
        }

        return overlapping;
    }

    // ==================== ConflictDetector API ====================

    /**
     * Detect all time conflicts and return a map of CRN -> Set of conflicting CRNs
     */
    detectConflicts(sections: Section[]): Map<string, Set<string>> {
        this.clear();
        for (const section of sections) {
            this.addSection(section);
        }

        const conflictMap = new Map<string, Set<string>>();

        for (let i = 0; i < sections.length; i++) {
            for (let j = i + 1; j < sections.length; j++) {
                if (this.hasOverlap(sections[i], sections[j])) {
                    const crn1 = sections[i].crn.toString();
                    const crn2 = sections[j].crn.toString();

                    if (!conflictMap.has(crn1)) conflictMap.set(crn1, new Set());
                    if (!conflictMap.has(crn2)) conflictMap.set(crn2, new Set());

                    conflictMap.get(crn1)!.add(crn2);
                    conflictMap.get(crn2)!.add(crn1);
                }
            }
        }

        return conflictMap;
    }

    /**
     * Check if any conflicts exist between sections
     */
    hasConflicts(sections: Section[]): boolean {
        this.clear();
        for (const section of sections) {
            this.addSection(section);
        }

        for (let i = 0; i < sections.length; i++) {
            for (let j = i + 1; j < sections.length; j++) {
                if (this.hasOverlap(sections[i], sections[j])) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Check if a schedule (set of sections) has no conflicts
     */
    isValidSchedule(sections: Section[]): boolean {
        return !this.hasConflicts(sections);
    }

    // ==================== Common Operations ====================

    /**
     * Clear all slot mappings
     */
    clear(): void {
        this.sectionsBySlot.clear();
        this.slotsBySection.clear();
    }

    /**
     * No-op for compatibility
     */
    clearCache(): void {
        // No cache to clear
    }

    // ==================== Private Helpers ====================

    private roundToSlot(minutes: number): number {
        return Math.floor(minutes / this.SLOT_GRANULARITY) * this.SLOT_GRANULARITY;
    }

    private getSlotKey(day: string, slotMinute: number, term: string): string {
        return `${term}-${day}-${slotMinute}`;
    }

    private hasDirectOverlap(section1: Section, section2: Section): boolean {
        if (section1.computedTerm !== section2.computedTerm) {
            return false;
        }

        for (const period1 of section1.periods) {
            for (const period2 of section2.periods) {
                const sharedDays = this.getSharedDays(period1.days, period2.days);
                if (sharedDays.length > 0 && this.hasTimeOverlap(period1, period2)) {
                    return true;
                }
            }
        }
        return false;
    }

    private getSharedDays(days1: Set<DayOfWeek>, days2: Set<DayOfWeek>): string[] {
        return Array.from(new Set([...days1].filter(day => days2.has(day))));
    }

    private hasTimeOverlap(period1: Period, period2: Period): boolean {
        const start1 = DateUtils.timeToMinutes(period1.startTime);
        const end1 = DateUtils.timeToMinutes(period1.endTime);
        const start2 = DateUtils.timeToMinutes(period2.startTime);
        const end2 = DateUtils.timeToMinutes(period2.endTime);

        return start1 < end2 && start2 < end1;
    }

    // ==================== Debug Methods ====================

    debugPrint(): void {
        console.log('=== CONFLICT ENGINE DEBUG ===');
        console.log(`Total unique slots: ${this.sectionsBySlot.size}`);
        console.log(`Total sections mapped: ${this.slotsBySection.size}`);

        const slotCounts: Array<[string, number]> = [];
        for (const [slot, sections] of this.sectionsBySlot.entries()) {
            slotCounts.push([slot, sections.size]);
        }
        slotCounts.sort((a, b) => b[1] - a[1]);

        console.log('Top 10 busiest time slots:');
        for (let i = 0; i < Math.min(10, slotCounts.length); i++) {
            console.log(`  ${slotCounts[i][0]}: ${slotCounts[i][1]} sections`);
        }
        console.log('=============================');
    }
}

// Backward compatibility aliases
export { ConflictEngine as ConflictDetector };
export { ConflictEngine as TimeSlotMap };
