import * as z from 'zod';
import type { DateRange } from '../types/common';
import { logger } from './logger';
import { parseLocalDate } from './localDate';

interface TermBoundInfo {
  startDate: string;
  endDate: string;
  offeringPeriod: string;
  sampleSize: number;
}

interface YearTermBounds {
  A: TermBoundInfo;
  B: TermBoundInfo;
  C: TermBoundInfo;
  D: TermBoundInfo;
}

interface TermBoundsData {
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

/**
 * The web app shares one instance (getInstance); the course API builds one
 * per catalog, so a reload swaps term dates with the courses.
 */
export class TermBoundsService {
  private static instance: TermBoundsService | null = null;
  private termBoundsCache: TermBoundsData | null = null;

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

      this.loadFromData(await response.json());
    } catch (error) {
      logger.warn(
        '[TermBoundsService] Error loading term-bounds.json, services will use fallback dates:',
        error,
      );
      this.termBoundsCache = null;
    }
  }

  /**
   * Replaces the bounds with already-fetched term-bounds.json content, e.g.
   * read from disk by the course API server. Throws if it does not match the
   * schema, leaving the previous bounds in place.
   */
  public loadFromData(json: unknown): void {
    this.termBoundsCache = TermBoundsDataSchema.parse(json);
  }

  /** Every loaded year's A-D bounds, keyed by fall year; null before a load. */
  public getAllBounds(): TermBoundsData['years'] | null {
    return this.termBoundsCache?.years ?? null;
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
    const termInfo = yearBounds[termLetter] as TermBoundInfo | undefined;
    if (!termInfo) return null;
    return {
      start: parseLocalDate(termInfo.startDate),
      end: parseLocalDate(termInfo.endDate),
    };
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
      const boundary = prev ? parseLocalDate(prev.D.endDate) : null; // null => earliest year, always passed
      if (boundary === null || now >= boundary) current = y;
    }
    return current;
  }
}
