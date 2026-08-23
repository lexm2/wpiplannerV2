import { z } from 'zod';
import type { DateRange } from '../types/common';
import { logger } from './logger';

export interface TermBoundInfo {
  startDate: string;
  endDate: string;
  offeringPeriod: string;
  sampleSize: number;
}

export interface YearTermBounds {
  A: TermBoundInfo;
  B: TermBoundInfo;
  C: TermBoundInfo;
  D: TermBoundInfo;
}

export interface TermBoundsData {
  generated: string;
  years: Record<string, YearTermBounds>;
}

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const TermBoundInfoSchema = z.object({
  startDate: z
    .string()
    .regex(isoDateRegex, 'Must be ISO date format (YYYY-MM-DD)'),
  endDate: z
    .string()
    .regex(isoDateRegex, 'Must be ISO date format (YYYY-MM-DD)'),
  offeringPeriod: z.string(),
  sampleSize: z.number().int().nonnegative(),
}) satisfies z.ZodType<TermBoundInfo>;

const YearTermBoundsSchema = z.object({
  A: TermBoundInfoSchema,
  B: TermBoundInfoSchema,
  C: TermBoundInfoSchema,
  D: TermBoundInfoSchema,
}) satisfies z.ZodType<YearTermBounds>;

const TermBoundsDataSchema = z.object({
  generated: z.string().datetime(),
  years: z.record(z.string(), YearTermBoundsSchema),
});

export class TermBoundsService {
  private static instance: TermBoundsService | null = null;
  private termBoundsCache: TermBoundsData | null = null;

  private constructor() {}

  public static getInstance(): TermBoundsService {
    if (!TermBoundsService.instance) {
      TermBoundsService.instance = new TermBoundsService();
    }
    return TermBoundsService.instance;
  }

  public async loadTermBounds(): Promise<void> {
    try {
      const response = await fetch('./term-bounds.json');
      if (!response.ok) {
        logger.warn(
          '[TermBoundsService] Failed to fetch term-bounds.json:',
          response.statusText,
        );
        return;
      }

      const data = await response.json();
      this.termBoundsCache = TermBoundsDataSchema.parse(data);
    } catch (error) {
      logger.warn(
        '[TermBoundsService] Error loading term-bounds.json, services will use fallback dates:',
        error,
      );
      this.termBoundsCache = null;
    }
  }

  public getTermDates(
    termLetter: 'A' | 'B' | 'C' | 'D',
    year?: number,
  ): DateRange | null {
    if (!this.termBoundsCache) return null;
    const fallYear =
      year ?? Math.max(...Object.keys(this.termBoundsCache.years).map(Number));
    const yearBounds = this.termBoundsCache.years[fallYear];
    if (!yearBounds) return null;
    const termInfo = yearBounds[termLetter];
    return {
      start: new Date(termInfo.startDate),
      end: new Date(termInfo.endDate),
    };
  }

  public getMostRecentYear(): number | null {
    if (!this.termBoundsCache) return null;
    return Math.max(...Object.keys(this.termBoundsCache.years).map(Number));
  }

  /**
   * Returns the current academic year (the fall year, e.g. 2026 for "2026-2027").
   * The year flips into `y` at the start of summer, i.e. right after the previous
   * year's Spring D-term ends, so summer/fall/spring all map to the same academic year.
   */
  public getCurrentAcademicYear(now: Date = new Date()): number | null {
    if (!this.termBoundsCache) return null;
    const years = Object.keys(this.termBoundsCache.years)
      .map(Number)
      .sort((a, b) => a - b);
    if (!years.length) return null;

    let current = years[0];
    for (const y of years) {
      const prev = this.termBoundsCache.years[String(y - 1)];
      const boundary = prev ? new Date(prev.D.endDate) : null; // null => earliest year, always passed
      if (boundary === null || now >= boundary) current = y;
    }
    return current;
  }

  public getTermBoundsData(): TermBoundsData | null {
    return this.termBoundsCache;
  }

  public isLoaded(): boolean {
    return this.termBoundsCache !== null;
  }

  public _resetForTesting(): void {
    this.termBoundsCache = null;
  }
}
