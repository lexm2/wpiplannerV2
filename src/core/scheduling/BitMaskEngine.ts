/**
 * Bitmask-based conflict detection. Each section = BigInt of 5-min time slots.
 * Conflict check: (mask1 & mask2) !== 0n - O(1)
 *
 * 900 bits per term: 180 slots/day * 5 weekdays
 * Bits 0-179: Mon, 180-359: Tue, 360-539: Wed, 540-719: Thu, 720-899: Fri
 */

import type { Section } from '../../types/types';
import type { WeeklyTimeSlot } from '../../types/schedule';

// Constants for time slot calculation
const START_HOUR = 7;          // 7:00 AM
const END_HOUR = 22;           // 10:00 PM
const SLOT_MINUTES = 5;        // 5-minute granularity
const SLOTS_PER_DAY = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES; // 180
const DAYS_PER_WEEK = 5;       // M, T, W, R, F
const SLOTS_PER_TERM = SLOTS_PER_DAY * DAYS_PER_WEEK; // 900

// Day to index mapping
const DAY_INDEX: Record<string, number> = {
  'M': 0, // Monday
  'T': 1, // Tuesday
  'W': 2, // Wednesday
  'R': 3, // Thursday
  'F': 4, // Friday
  'S': 5, // Saturday (not used in main calculation)
  'U': 6, // Sunday (not used in main calculation)
};

export interface SectionMask {
  section: Section;
  mask: bigint;
  term: string;
}

export interface CourseMasks {
  courseId: string;
  combinations: Array<{
    lecture: SectionMask | null;
    discussion: SectionMask | null;
    lab: SectionMask | null;
    combinedMask: bigint;
  }>;
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

      // Set bits for all slots in this time range on this day
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

/** @deprecated Use weeklySlotToMask instead */
export const blockedTimeToMask = weeklySlotToMask;

export function masksConflict(mask1: bigint, mask2: bigint): boolean {
  return (mask1 & mask2) !== 0n;
}

export function conflictsWithBlocked(sectionMask: bigint, blockedMask: bigint): boolean {
  return (sectionMask & blockedMask) !== 0n;
}

export function combineMasks(...masks: bigint[]): bigint {
  return masks.reduce((acc, mask) => acc | mask, 0n);
}

export class BitMaskEngine {
  private sectionMasks = new Map<number, SectionMask>();
  private blockedMasksByTerm = new Map<string, bigint>();

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

  setBlockedTimes(blockedTimes: WeeklyTimeSlot[]): void {
    this.blockedMasksByTerm.clear();

    for (const slot of blockedTimes) {
      const mask = weeklySlotToMask(slot);
      if (mask === 0n) continue;

      let terms: string[];
      if (slot.term === 'ALL') {
        terms = ['A', 'B', 'C', 'D'];
      } else if (slot.term === 'F') {
        terms = ['A', 'B'];
      } else if (slot.term === 'S') {
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

  getBlockedMask(term: string): bigint {
    if (term === 'F') {
      return (this.blockedMasksByTerm.get('A') || 0n) |
             (this.blockedMasksByTerm.get('B') || 0n);
    }
    if (term === 'S') {
      return (this.blockedMasksByTerm.get('C') || 0n) |
             (this.blockedMasksByTerm.get('D') || 0n);
    }
    return this.blockedMasksByTerm.get(term) || 0n;
  }

  sectionConflictsWithBlocked(section: Section): boolean {
    const sectionMask = this.getMask(section);
    const blockedMask = this.getBlockedMask(section.computedTerm);
    return conflictsWithBlocked(sectionMask.mask, blockedMask);
  }

  sectionsConflict(section1: Section, section2: Section): boolean {
    if (section1.computedTerm !== section2.computedTerm) return false;
    const mask1 = this.getMask(section1);
    const mask2 = this.getMask(section2);
    return masksConflict(mask1.mask, mask2.mask);
  }

  isValidSchedule(sections: Section[]): boolean {
    const byTerm = new Map<string, Section[]>();
    for (const section of sections) {
      const term = section.computedTerm;
      if (!byTerm.has(term)) byTerm.set(term, []);
      byTerm.get(term)!.push(section);
    }

    for (const [term, termSections] of byTerm) {
      let combined = 0n;
      const blockedMask = this.getBlockedMask(term);

      for (const section of termSections) {
        const mask = this.getMask(section).mask;
        if (conflictsWithBlocked(mask, blockedMask)) return false;
        if (masksConflict(combined, mask)) return false;
        combined |= mask;
      }
    }

    return true;
  }

  clear(): void {
    this.sectionMasks.clear();
    this.blockedMasksByTerm.clear();
  }

  debugPrint(): void {
    console.log('=== BITMASK ENGINE DEBUG ===');
    console.log(`Sections cached: ${this.sectionMasks.size}`);
    console.log(`Blocked terms: ${this.blockedMasksByTerm.size}`);
    console.log(`Slots per day: ${SLOTS_PER_DAY}`);
    console.log(`Slots per term: ${SLOTS_PER_TERM}`);
    console.log('============================');
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

export function filterValidCombinations(
  combinations: Array<{ combinedMask: bigint }>,
  existingMask: bigint
): number[] {
  const valid: number[] = [];

  for (let i = 0; i < combinations.length; i++) {
    if (!masksConflict(combinations[i].combinedMask, existingMask)) {
      valid.push(i);
    }
  }

  return valid;
}
