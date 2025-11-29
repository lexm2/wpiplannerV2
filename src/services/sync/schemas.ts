import { z } from 'zod';

/**
 * Cloud Sync Validation Schemas
 *
 * These Zod schemas provide runtime validation for all cloud sync data.
 * They ensure type safety at the boundaries between cloud storage and application logic.
 *
 * Validation occurs at:
 * 1. Provider Pull - When downloading from cloud
 * 2. Before Import - Before writing to local storage
 * 3. After Export - Before uploading to cloud
 */

/**
 * SelectedCourseData Schema (Cloud Format)
 *
 * Minimal representation storing only IDs and CRNs.
 * This is what gets synced to cloud storage.
 */
export const SelectedCourseDataSchema = z.object({
    courseId: z.string().min(1, 'Course ID required'),
    selectedSectionCrn: z.string().optional(),
    lockedSectionCrn: z.string().optional(),
    isRequired: z.boolean(),
    timestamp: z.number().optional(),
});

/**
 * ScheduleData Schema (Cloud Format)
 *
 * Represents a single schedule with minimal course data.
 */
export const ScheduleDataSchema = z.object({
    id: z.string().min(1, 'Schedule ID required'),
    name: z.string().min(1, 'Schedule name required'),
    selectedCourses: z.array(SelectedCourseDataSchema),
    timestamp: z.number().optional(),
});

/**
 * SyncData Schema (Cloud Format)
 *
 * Complete sync data structure with strict validation:
 * - version: Must be a string (e.g., "3.0")
 * - timestamp: Must be a number (milliseconds since epoch)
 * - checksum: Must be 64-character SHA-256 hex string
 * - activeScheduleId: Schedule ID or null
 * - schedules: Array of schedule data
 * - preferences: Optional user preferences (unknown type)
 */
export const SyncDataSchema = z.object({
    version: z.string(),
    timestamp: z.number(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid SHA-256 checksum'),
    activeScheduleId: z.string().nullable(),
    schedules: z.array(ScheduleDataSchema),
    preferences: z.unknown().optional(),
});

/**
 * Type Inference from Schemas
 *
 * These types are inferred from the Zod schemas, ensuring perfect alignment
 * between runtime validation and compile-time types.
 */
export type ValidatedSyncData = z.infer<typeof SyncDataSchema>;
export type ValidatedScheduleData = z.infer<typeof ScheduleDataSchema>;
export type ValidatedSelectedCourseData = z.infer<typeof SelectedCourseDataSchema>;

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
 */
export function parseSyncData(data: unknown, source: string): ValidatedSyncData {
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
            error.errors.forEach((err, index) => {
                console.error(`[Validation]   Error ${index + 1}:`, {
                    path: err.path.join('.'),
                    message: err.message,
                    code: err.code,
                    received: 'received' in err ? err.received : undefined
                });
            });
        }
        throw error;
    }
}

/**
 * Helper: Safe Parse (No Throw)
 *
 * Returns success/failure result instead of throwing.
 */
export function safeParseSyncData(data: unknown):
    { success: true; data: ValidatedSyncData } |
    { success: false; error: ValidationError } {
    const result = SyncDataSchema.safeParse(data);
    return result;
}
