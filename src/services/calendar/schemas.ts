import { z } from 'zod';
import type { TermBoundsData, TermBoundInfo } from './types';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TermBoundInfoSchema = z.object({
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    offeringPeriod: z.string(),
    sampleSize: z.number().int().nonnegative(),
}) satisfies z.ZodType<TermBoundInfo>;

export const TermBoundsDataSchema = z.object({
    academicYear: z.string(),
    generated: z.string().datetime(),
    terms: z.object({
        A: TermBoundInfoSchema,
        B: TermBoundInfoSchema,
        C: TermBoundInfoSchema,
        D: TermBoundInfoSchema,
    }),
}) satisfies z.ZodType<TermBoundsData>;
