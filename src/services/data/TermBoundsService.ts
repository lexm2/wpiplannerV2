import { z } from 'zod';

export interface TermBoundInfo {
    startDate: string;
    endDate: string;
    offeringPeriod: string;
    sampleSize: number;
}

export interface TermBoundsData {
    academicYear: string;
    generated: string;
    terms: {
        A: TermBoundInfo;
        B: TermBoundInfo;
        C: TermBoundInfo;
        D: TermBoundInfo;
    };
}

const TermBoundInfoSchema = z.object({
    startDate: z.string().date(),
    endDate: z.string().date(),
    offeringPeriod: z.string(),
    sampleSize: z.number().int().nonnegative(),
}) satisfies z.ZodType<TermBoundInfo>;

const TermBoundsDataSchema = z.object({
    academicYear: z.string(),
    generated: z.string().datetime(),
    terms: z.object({
        A: TermBoundInfoSchema,
        B: TermBoundInfoSchema,
        C: TermBoundInfoSchema,
        D: TermBoundInfoSchema,
    }),
}) satisfies z.ZodType<TermBoundsData>;

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
            console.log(`[TermBoundsService] Successfully loaded term bounds for ${this.termBoundsCache.academicYear}`);
        } catch (error) {
            console.warn('[TermBoundsService] Error loading term-bounds.json, services will use fallback dates:', error);
            this.termBoundsCache = null;
        }
    }

    public getTermDates(termLetter: 'A' | 'B' | 'C' | 'D'): { start: Date, end: Date } | null {
        if (!this.termBoundsCache) {
            return null;
        }

        const termInfo = this.termBoundsCache.terms[termLetter];
        return {
            start: new Date(termInfo.startDate),
            end: new Date(termInfo.endDate)
        };
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
