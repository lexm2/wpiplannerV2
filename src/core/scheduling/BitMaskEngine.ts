/**
 * Bitmask-based conflict detection. Each section = BigInt of 5-min time slots.
 * Conflict check: (mask1 & mask2) !== 0n - O(1)
 *
 * 900 bits per term: 180 slots/day * 5 weekdays
 * Bits 0-179: Mon, 180-359: Tue, 360-539: Wed, 540-719: Thu, 720-899: Fri
 */

import type { Section } from '../../types/types';
import type { WeeklyTimeSlot } from '../../types/schedule';

const START_HOUR = 7;          // 7:00 AM
const END_HOUR = 22;           // 10:00 PM
const SLOT_MINUTES = 5;
const SLOTS_PER_DAY = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES; // 180
const DAYS_PER_WEEK = 5;       // M, T, W, R, F

const DAY_INDEX: Record<string, number> = {
  'M': 0,
  'T': 1,
  'W': 2,
  'R': 3,
  'F': 4,
  'S': 5, // weekends not used in main calculation
  'U': 6,
};

export interface SectionMask {
  section: Section;
  mask: bigint;
  term: string;
}

export interface MaskCombination {
  lecture: SectionMask | null;
  discussion: SectionMask | null;
  lab: SectionMask | null;
  combinedMask: bigint;
}

export interface CourseMasks {
  courseId: string;
  combinations: MaskCombination[];
}

function timeToSlot(hours: number, minutes: number): number {
  const totalMinutes = hours * 60 + minutes;
  const startMinutes = START_HOUR * 60;
  return Math.floor((totalMinutes - startMinutes) / SLOT_MINUTES);
}

export function sectionToMask(section: Section): bigint {
  let mask = 0n;

  if (!section.periods || section.periods.length === 0) {
    return mask;
  }

  for (const period of section.periods) {
    if (!period.days || period.days.size === 0) continue;

    const startSlot = timeToSlot(period.startTime.hours, period.startTime.minutes);
    const endSlot = timeToSlot(period.endTime.hours, period.endTime.minutes);

    // Skip invalid time ranges
    if (startSlot >= endSlot || startSlot < 0 || endSlot > SLOTS_PER_DAY) continue;

    for (const day of period.days) {
      const dayIndex = DAY_INDEX[day];
      if (dayIndex === undefined || dayIndex >= DAYS_PER_WEEK) continue; // Skip weekends

      const dayOffset = dayIndex * SLOTS_PER_DAY;

      for (let slot = startSlot; slot < endSlot; slot++) {
        const bitIndex = dayOffset + slot;
        mask |= (1n << BigInt(bitIndex));
      }
    }
  }

  return mask;
}

export function weeklySlotToMask(slot: WeeklyTimeSlot): bigint {
  let mask = 0n;

  const dayIndex = DAY_INDEX[slot.day];
  if (dayIndex === undefined || dayIndex >= DAYS_PER_WEEK) return mask;

  const startSlot = timeToSlot(slot.startTime.hours, slot.startTime.minutes);
  const endSlot = timeToSlot(slot.endTime.hours, slot.endTime.minutes);

  if (startSlot >= endSlot || startSlot < 0 || endSlot > SLOTS_PER_DAY) return mask;

  const dayOffset = dayIndex * SLOTS_PER_DAY;

  for (let slot = startSlot; slot < endSlot; slot++) {
    const bitIndex = dayOffset + slot;
    mask |= (1n << BigInt(bitIndex));
  }

  return mask;
}

export function masksConflict(mask1: bigint, mask2: bigint): boolean {
  return (mask1 & mask2) !== 0n;
}
export class BitMaskEngine {
  private sectionMasks = new Map<number, SectionMask>();

  addSection(section: Section): SectionMask {
    const existing = this.sectionMasks.get(section.crn);
    if (existing) return existing;

    const mask = sectionToMask(section);
    const sectionMask: SectionMask = {
      section,
      mask,
      term: section.computedTerm
    };

    this.sectionMasks.set(section.crn, sectionMask);
    return sectionMask;
  }

  getMask(section: Section): SectionMask {
    const existing = this.sectionMasks.get(section.crn);
    if (existing) return existing;
    return this.addSection(section);
  }

  sectionsConflict(section1: Section, section2: Section): boolean {
    if (section1.computedTerm !== section2.computedTerm) return false;
    const mask1 = this.getMask(section1);
    const mask2 = this.getMask(section2);
    return masksConflict(mask1.mask, mask2.mask);
  }

}

/** Build conflict matrix - O(n^2) but each check is O(1) */
export function buildConflictMatrix(
  sections: Section[],
  engine: BitMaskEngine
): Map<number, Set<number>> {
  const matrix = new Map<number, Set<number>>();

  for (const section of sections) {
    matrix.set(section.crn, new Set());
  }

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (engine.sectionsConflict(sections[i], sections[j])) {
        matrix.get(sections[i].crn)!.add(sections[j].crn);
        matrix.get(sections[j].crn)!.add(sections[i].crn);
      }
    }
  }

  return matrix;
}
