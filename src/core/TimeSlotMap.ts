import type { Section } from '../types/types';
import { DateUtils } from '../utils/dateUtils';

export class TimeSlotMap {
    private readonly MIN_MINUTE = 420;
    private readonly MAX_MINUTE = 1080;
    private readonly SLOT_GRANULARITY = 5;
    private sectionsBySlot: Map<string, Set<Section>>;
    private slotsBySection: Map<string, Set<string>>;

    constructor() {
        this.sectionsBySlot = new Map();
        this.slotsBySection = new Map();
    }

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
                        const slotKey = this.getSlotKey(day, slotMinute);
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

    getSectionsInSlot(day: string, minute: number): Set<Section> {
        const slotMinute = this.roundToSlot(minute);
        const slotKey = this.getSlotKey(day, slotMinute);
        return this.sectionsBySlot.get(slotKey) || new Set();
    }

    getSlotsForSection(sectionCrn: string): Set<string> {
        return this.slotsBySection.get(sectionCrn) || new Set();
    }

    hasOverlap(section1: Section, section2: Section): boolean {
        // Sections in different terms cannot conflict
        if (section1.computedTerm !== section2.computedTerm) {
            return false;
        }

        const slots1 = this.getSlotsForSection(String(section1.crn));
        const slots2 = this.getSlotsForSection(String(section2.crn));

        for (const slot of slots1) {
            if (slots2.has(slot)) {
                return true;
            }
        }

        return false;
    }

    getAllOverlappingSections(section: Section): Set<Section> {
        const overlapping = new Set<Section>();
        const slots = this.getSlotsForSection(String(section.crn));

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

    clear(): void {
        this.sectionsBySlot.clear();
        this.slotsBySection.clear();
    }

    private roundToSlot(minutes: number): number {
        return Math.floor(minutes / this.SLOT_GRANULARITY) * this.SLOT_GRANULARITY;
    }

    private getSlotKey(day: string, slotMinute: number): string {
        return `${day}-${slotMinute}`;
    }

    debugPrint(): void {
        console.log('=== TIME SLOT MAP DEBUG ===');
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
        console.log('===========================');
    }
}
