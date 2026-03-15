import { z } from 'zod';
import type { DateRange } from '../types/common';

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

// ISO date format regex (YYYY-MM-DD)
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const TermBoundInfoSchema = z.object({
    startDate: z.string().regex(isoDateRegex, 'Must be ISO date format (YYYY-MM-DD)'),
    endDate: z.string().regex(isoDateRegex, 'Must be ISO date format (YYYY-MM-DD)'),
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
                console.warn('[TermBoundsService] Failed to fetch term-bounds.json:', response.statusText);
                return;
            }

            const data = await response.json();
            this.termBoundsCache = TermBoundsDataSchema.parse(data);
            const years = Object.keys(this.termBoundsCache.years).join(', ');
            console.log(`[TermBoundsService] Loaded term bounds for academic years: ${years}`);
        } catch (error) {
            console.warn('[TermBoundsService] Error loading term-bounds.json, services will use fallback dates:', error);
            this.termBoundsCache = null;
        }
    }

    public getTermDates(termLetter: 'A' | 'B' | 'C' | 'D', year?: number): DateRange | null {
        if (!this.termBoundsCache) return null;
        const fallYear = year ?? Math.max(...Object.keys(this.termBoundsCache.years).map(Number));
        const yearBounds = this.termBoundsCache.years[fallYear];
        if (!yearBounds) return null;
        const termInfo = yearBounds[termLetter];
        return { start: new Date(termInfo.startDate), end: new Date(termInfo.endDate) };
    }

    public getMostRecentYear(): number | null {
        if (!this.termBoundsCache) return null;
        return Math.max(...Object.keys(this.termBoundsCache.years).map(Number));
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
