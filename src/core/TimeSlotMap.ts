import type { Section } from '../types/types';

export class TimeSlotMap {
    private readonly MIN_HOUR = 7;
    private readonly MAX_HOUR = 18;
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

            const startHour = period.startTime.hours;
            const endHour = period.endTime.hours;
            const hasMinutes = period.endTime.minutes > 0;

            if (startHour === endHour && !hasMinutes) {
                continue;
            }

            const actualEndHour = hasMinutes ? endHour + 1 : endHour;

            for (const day of period.days) {
                for (let hour = startHour; hour < actualEndHour && hour < this.MAX_HOUR; hour++) {
                    if (hour >= this.MIN_HOUR) {
                        const slotKey = this.getSlotKey(day, hour);
                        slotsForThisSection.add(slotKey);

                        if (!this.sectionsBySlot.has(slotKey)) {
                            this.sectionsBySlot.set(slotKey, new Set());
                        }
                        this.sectionsBySlot.get(slotKey)!.add(section);
                    }
                }
            }
        }

        this.slotsBySection.set(sectionKey, slotsForThisSection);
    }

    getSectionsInSlot(day: string, hour: number): Set<Section> {
        const slotKey = this.getSlotKey(day, hour);
        return this.sectionsBySlot.get(slotKey) || new Set();
    }

    getSlotsForSection(sectionCrn: string): Set<string> {
        return this.slotsBySection.get(sectionCrn) || new Set();
    }

    hasOverlap(section1: Section, section2: Section): boolean {
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
                    if (otherSection.crn !== section.crn) {
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

    private getSlotKey(day: string, hour: number): string {
        return `${day}-${hour}`;
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
