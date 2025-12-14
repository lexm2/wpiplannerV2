import { z } from 'zod';
import type { SyncData, ScheduleData, SelectedCourseData } from './types';

/**
 * Cloud Sync Validation Schemas
 *
 * These Zod schemas provide runtime validation for cloud sync data types.
 * They validate the types defined in types.ts, ensuring type safety at runtime.
 *
 * IMPORTANT: These schemas validate the existing types from types.ts.
 * Do NOT create duplicate type definitions - use the schemas to validate
 * the canonical types defined in types.ts.
 *
 * Validation occurs at:
 * 1. Provider Pull - When downloading from cloud
 * 2. Before Push - Before uploading to cloud
 * 3. Import/Export - At the conversion boundary
 */

/**
 * SelectedCourseData Schema
 *
 * Validates types.SelectedCourseData - minimal representation with IDs only.
 * This is the format used throughout the entire cloud sync system.
 */
export const SelectedCourseDataSchema = z.object({
    courseId: z.string().min(1, 'Course ID required'),
    selectedSectionCrn: z.string().optional(),
    lockedSectionCrn: z.string().optional(),
    isRequired: z.boolean(),
    timestamp: z.number().optional(),
}) satisfies z.ZodType<SelectedCourseData>;

/**
 * ScheduleData Schema
 *
 * Validates types.ScheduleData - a schedule with minimal course data (IDs only).
 */
export const ScheduleDataSchema = z.object({
    id: z.string().min(1, 'Schedule ID required'),
    name: z.string().min(1, 'Schedule name required'),
    selectedCourses: z.array(SelectedCourseDataSchema),
    timestamp: z.number().optional(),
}) satisfies z.ZodType<ScheduleData>;

/**
 * SyncData Schema
 *
 * Validates types.SyncData - complete sync data structure.
 *
 * Strict validation rules:
 * - version: Must be a string (e.g., "3.0")
 * - timestamp: Must be a number (milliseconds since epoch)
 * - checksum: Must be 64-character SHA-256 hex string
 * - activeScheduleId: Schedule ID or null
 * - schedules: Array of schedule data (with IDs only)
 * - preferences: Optional user preferences (unknown type)
 */
export const SyncDataSchema = z.object({
    version: z.string(),
    timestamp: z.number(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid SHA-256 checksum'),
    activeScheduleId: z.string().nullable(),
    schedules: z.array(ScheduleDataSchema),
    preferences: z.unknown().optional(),
}) satisfies z.ZodType<SyncData>;

/**
 * Validation Error Type
 *
 * Zod returns detailed validation errors with path, message, and code.
 */
export type ValidationError = z.ZodError;

/**
 * Helper: Safe Parse with Logging
 *
 * Wraps Zod parse with detailed logging for debugging.
 * Returns the validated SyncData from types.ts.
 */
export function parseSyncData(data: unknown, source: string): SyncData {
    console.log(`[Validation] Validating SyncData from ${source}...`);

    try {
        const validated = SyncDataSchema.parse(data);
        console.log(`[Validation] ✓ ${source} validation successful`);
        console.log(`[Validation]   Version: ${validated.version}`);
        console.log(`[Validation]   Schedules: ${validated.schedules.length}`);
        console.log(`[Validation]   Checksum: ${validated.checksum.substring(0, 16)}...`);
        return validated;
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error(`[Validation] ✗ ${source} validation failed`);
            // Defensive check: error.issues should always exist, but guard against edge cases
            if (error.issues && Array.isArray(error.issues)) {
                error.issues.forEach((err: z.ZodIssue, index: number) => {
                    console.error(`[Validation]   Error ${index + 1}:`, {
                        path: err.path.join('.'),
                        message: err.message,
                        code: err.code,
                        received: 'received' in err ? err.received : undefined
                    });
                });
            } else {
                console.error('[Validation] ZodError object missing errors array:', error);
            }
        }
        throw error;
    }
}

/**
 * Helper: Safe Parse (No Throw)
 *
 * Returns success/failure result instead of throwing.
 * Returns the validated SyncData from types.ts on success.
 */
export function safeParseSyncData(data: unknown):
    { success: true; data: SyncData } |
    { success: false; error: ValidationError } {
    const result = SyncDataSchema.safeParse(data);
    return result;
}
