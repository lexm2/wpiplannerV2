/**
 * Unified conflict detection engine combining slot-based indexing with detailed conflict reporting.
 * Merges functionality from ConflictDetector (detailed conflicts) and TimeSlotMap (fast overlap queries).
 */
import { Section, Period, DayOfWeek } from '../../types/types';
import { TimeConflict } from '../../types/schedule';
import { DateUtils } from '../../utils/dateUtils';

export interface IConflictEngine {
    // From ConflictDetector - detailed conflict detection
    detectConflicts(sections: Section[]): TimeConflict[];
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

    // ConflictDetector internals for detailed conflict caching
    private static readonly MAX_CACHE_SIZE = 1000;
    private conflictCache = new Map<string, TimeConflict[]>();
    private cacheAccessOrder: string[] = [];

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
     * Detect all time conflicts between sections with detailed descriptions
     */
    detectConflicts(sections: Section[]): TimeConflict[] {
        const conflicts: TimeConflict[] = [];

        for (let i = 0; i < sections.length; i++) {
            for (let j = i + 1; j < sections.length; j++) {
                const cacheKey = this.getCacheKey(sections[i], sections[j]);
                let sectionConflicts = this.conflictCache.get(cacheKey);

                if (!sectionConflicts) {
                    sectionConflicts = this.checkSectionConflicts(sections[i], sections[j]);
                    this.addToCache(cacheKey, sectionConflicts);
                } else {
                    this.updateCacheAccess(cacheKey);
                }

                conflicts.push(...sectionConflicts);
            }
        }

        return conflicts;
    }

    /**
     * Check if a schedule (set of sections) has no conflicts
     */
    isValidSchedule(sections: Section[]): boolean {
        const conflicts = this.detectConflicts(sections);
        return conflicts.length === 0;
    }

    // ==================== Common Operations ====================

    /**
     * Clear all slot mappings and caches
     */
    clear(): void {
        this.sectionsBySlot.clear();
        this.slotsBySection.clear();
        this.clearCache();
    }

    /**
     * Clear only the conflict detail cache
     */
    clearCache(): void {
        this.conflictCache.clear();
        this.cacheAccessOrder = [];
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

    private checkSectionConflicts(section1: Section, section2: Section): TimeConflict[] {
        // Sections in different terms cannot conflict
        if (section1.computedTerm !== section2.computedTerm) {
            return [];
        }

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
                description: `Time overlap on ${sharedDays.join(', ')}: ${period1.startTime.displayTime}-${period1.endTime.displayTime} conflicts with ${period2.startTime.displayTime}-${period2.endTime.displayTime}`
            };
        }

        return null;
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

    private getCacheKey(section1: Section, section2: Section): string {
        const key1 = `${section1.crn}-${section2.crn}`;
        const key2 = `${section2.crn}-${section1.crn}`;
        return key1 < key2 ? key1 : key2;
    }

    private addToCache(key: string, value: TimeConflict[]): void {
        if (this.conflictCache.size >= ConflictEngine.MAX_CACHE_SIZE) {
            const lruKey = this.cacheAccessOrder.shift();
            if (lruKey) {
                this.conflictCache.delete(lruKey);
            }
        }
        this.conflictCache.set(key, value);
        this.cacheAccessOrder.push(key);
    }

    private updateCacheAccess(key: string): void {
        const index = this.cacheAccessOrder.indexOf(key);
        if (index > -1) {
            this.cacheAccessOrder.splice(index, 1);
            this.cacheAccessOrder.push(key);
        }
    }

    // ==================== Debug Methods ====================

    debugPrint(): void {
        console.log('=== CONFLICT ENGINE DEBUG ===');
        console.log(`Total unique slots: ${this.sectionsBySlot.size}`);
        console.log(`Total sections mapped: ${this.slotsBySection.size}`);
        console.log(`Conflict cache size: ${this.conflictCache.size}`);

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
