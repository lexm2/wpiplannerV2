import type { SectionsByKind } from '../../types/types';
import { sectionsOf } from '../../utils/courseUtils';
import { isUncapped } from '../../utils/seats';
import { getDisplayTerms } from '../../utils/typeGuards';
import {
  IMPORTANCE_WEIGHT,
  type RankingPreferences,
} from './rankingPreferences';

export interface ScoredSelection {
  combination: SectionsByKind;
  term: string;
  /** Best Rate My Professor rating of the course's instructors, if known. */
  rating?: number | null;
}

interface Slot {
  start: number;
  end: number;
}

// Penalty minutes (or points) per unit of each criterion, before weighting.
const FEWER_DAYS_PENALTY = 90;
const FREE_DAY_PENALTY = 120;
const TERM_BALANCE_PENALTY = 200;
const FULL_SECTION_PENALTY = 120;
const RATING_PENALTY = 40;
const UNRATED = 3.5;
const TARGET_PER_TERM = 3;

function clockMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

const isFull = (s: { seats: number; seatsAvailable: number; status: string }) =>
  (!isUncapped(s) && s.seatsAvailable <= 0) ||
  s.status === 'Closed' ||
  s.status === 'Waitlist';

/**
 * The one scoring implementation: a schedule's cost is the weighted sum of
 * the penalties of the enabled criteria, so lower is better and never
 * negative. A semester section (F, S) counts in both of its quarters.
 */
export class ScheduleScorer {
  private readonly w: Record<keyof RankingPreferences, number>;
  private readonly before: number;
  private readonly after: number;
  private readonly gapMin: number;
  private readonly gapMax: number;
  private readonly lunchFrom: number;
  private readonly lunchTo: number;
  private readonly lunchMinutes: number;
  private readonly freeDays: ReadonlySet<string>;
  private readonly needsSlots: boolean;

  constructor(prefs: RankingPreferences) {
    const w = {} as Record<keyof RankingPreferences, number>;
    for (const key of Object.keys(prefs) as (keyof RankingPreferences)[]) {
      w[key] = IMPORTANCE_WEIGHT[prefs[key].importance];
    }
    this.w = w;
    this.before = clockMinutes(prefs.earlyClasses.before);
    this.after = clockMinutes(prefs.lateClasses.after);
    this.gapMin = prefs.gaps.min;
    this.gapMax = Math.max(prefs.gaps.min, prefs.gaps.max);
    this.lunchFrom = clockMinutes(prefs.lunch.from);
    this.lunchTo = clockMinutes(prefs.lunch.to);
    this.lunchMinutes = prefs.lunch.minutes;
    this.freeDays = new Set(prefs.freeDays.days);
    this.needsSlots =
      w.earlyClasses +
        w.lateClasses +
        w.gaps +
        w.lunch +
        w.fewerDays +
        w.freeDays >
      0;
  }

  /** Cost of the chosen sections of one group of courses, term balance aside. */
  groupCost(selections: ScoredSelection[]): number {
    const { w } = this;
    let cost = this.needsSlots ? this.dayCost(selections) : 0;

    if (w.openSeats > 0) {
      let full = 0;
      for (const { combination } of selections) {
        for (const section of sectionsOf(combination)) {
          if (isFull(section)) full++;
        }
      }
      cost += w.openSeats * FULL_SECTION_PENALTY * full;
    }

    if (w.instructorRating > 0) {
      for (const { rating } of selections) {
        cost += w.instructorRating * RATING_PENALTY * (5 - (rating ?? UNRATED));
      }
    }
    return cost;
  }

  /** Cost of how unevenly the courses (one term each) fill the quarters. */
  termBalanceCost(terms: string[]): number {
    if (this.w.termBalance === 0) return 0;
    const counts = new Map<string, number>();
    for (const term of terms) {
      for (const quarter of getDisplayTerms(term)) {
        counts.set(quarter, (counts.get(quarter) ?? 0) + 1);
      }
    }
    let deviation = 0;
    for (const count of counts.values()) {
      deviation += Math.abs(count - TARGET_PER_TERM);
    }
    return this.w.termBalance * TERM_BALANCE_PENALTY * deviation;
  }

  /** Per-day criteria, summed over every (quarter, weekday) with a class. */
  private dayCost(selections: ScoredSelection[]): number {
    const byQuarterDay = new Map<string, { day: string; slots: Slot[] }>();
    for (const { combination, term } of selections) {
      for (const section of sectionsOf(combination)) {
        for (const period of section.periods) {
          if (period.isAsync) continue;
          const slot = {
            start: period.startTime.hours * 60 + period.startTime.minutes,
            end: period.endTime.hours * 60 + period.endTime.minutes,
          };
          for (const quarter of getDisplayTerms(term)) {
            for (const day of period.days) {
              const key = `${quarter}-${day}`;
              let entry = byQuarterDay.get(key);
              if (!entry) {
                entry = { day, slots: [] };
                byQuarterDay.set(key, entry);
              }
              entry.slots.push(slot);
            }
          }
        }
      }
    }

    const { w } = this;
    let cost = 0;
    for (const { day, slots } of byQuarterDay.values()) {
      slots.sort((a, b) => a.start - b.start);
      cost += w.fewerDays * FEWER_DAYS_PENALTY;
      if (this.freeDays.has(day)) cost += w.freeDays * FREE_DAY_PENALTY;
      if (w.earlyClasses > 0) {
        cost += w.earlyClasses * Math.max(0, this.before - slots[0].start);
      }
      if (w.lateClasses > 0) {
        const latest = Math.max(...slots.map(s => s.end));
        cost += w.lateClasses * Math.max(0, latest - this.after);
      }
      if (w.gaps > 0) {
        let penalty = 0;
        for (let i = 1; i < slots.length; i++) {
          const gap = Math.max(0, slots[i].start - slots[i - 1].end);
          penalty +=
            Math.max(0, gap - this.gapMax) + Math.max(0, this.gapMin - gap);
        }
        cost += w.gaps * penalty;
      }
      if (w.lunch > 0) {
        cost +=
          w.lunch * Math.max(0, this.lunchMinutes - this.freeLunch(slots));
      }
    }
    return cost;
  }

  /** The longest free stretch inside the lunch window; slots sorted by start. */
  private freeLunch(slots: Slot[]): number {
    let longest = 0;
    let cursor = this.lunchFrom;
    for (const { start, end } of slots) {
      if (end <= cursor) continue;
      if (start >= this.lunchTo) break;
      longest = Math.max(longest, start - cursor);
      cursor = end;
    }
    return Math.max(longest, this.lunchTo - cursor);
  }
}
