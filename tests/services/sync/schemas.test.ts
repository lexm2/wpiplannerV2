import { describe, it, expect } from 'vitest';
import {
    SyncDataSchema,
    ScheduleDataSchema,
    SelectedCourseDataSchema,
    parseSyncData,
    safeParseSyncData,
} from '../../../src/services/sync/schemas';
import {
    createSyncData,
    createSchedule,
    createSelectedCourse,
    createInvalidSyncData,
    createSyncDataWithInvalidSchedule,
} from '../../helpers/sync-test-utils';
import type { SyncData } from '../../../src/services/sync/types';

describe('Schema Validation', () => {
    describe('SelectedCourseDataSchema', () => {
        it('should validate a valid SelectedCourseData object', () => {
            const course = createSelectedCourse();
            const result = SelectedCourseDataSchema.safeParse(course);
            expect(result.success).toBe(true);
        });

        it('should reject SelectedCourseData without courseId', () => {
            const invalidCourse = {
                // Missing courseId
                isRequired: true,
            };
            const result = SelectedCourseDataSchema.safeParse(invalidCourse);
            expect(result.success).toBe(false);
        });

        it('should reject SelectedCourseData with empty courseId', () => {
            const invalidCourse = createSelectedCourse({ courseId: '' });
            const result = SelectedCourseDataSchema.safeParse(invalidCourse);
            expect(result.success).toBe(false);
        });

        it('should allow optional fields to be undefined', () => {
            const course = {
                courseId: 'CS-1101',
                isRequired: true,
                // selectedSectionCrn, lockedSectionCrn, timestamp are optional
            };
            const result = SelectedCourseDataSchema.safeParse(course);
            expect(result.success).toBe(true);
        });
    });

    describe('ScheduleDataSchema', () => {
        it('should validate a valid ScheduleData object', () => {
            const schedule = createSchedule();
            const result = ScheduleDataSchema.safeParse(schedule);
            expect(result.success).toBe(true);
        });

        it('should reject ScheduleData without id', () => {
            const invalidSchedule = {
                name: 'Test',
                selectedCourses: [],
            };
            const result = ScheduleDataSchema.safeParse(invalidSchedule);
            expect(result.success).toBe(false);
        });

        it('should reject ScheduleData with empty name', () => {
            const invalidSchedule = createSchedule({ name: '' });
            const result = ScheduleDataSchema.safeParse(invalidSchedule);
            expect(result.success).toBe(false);
        });

        it('should reject ScheduleData with invalid selectedCourses', () => {
            const invalidSchedule = {
                id: 'schedule-1',
                name: 'Test',
                selectedCourses: [{ invalid: 'course' }],
            };
            const result = ScheduleDataSchema.safeParse(invalidSchedule);
            expect(result.success).toBe(false);
        });

        it('should validate schedule with multiple courses', () => {
            const schedule = createSchedule({
                selectedCourses: [
                    createSelectedCourse({ courseId: 'CS-1101' }),
                    createSelectedCourse({ courseId: 'CS-2303' }),
                    createSelectedCourse({ courseId: 'MA-1024' }),
                ],
            });
            const result = ScheduleDataSchema.safeParse(schedule);
            expect(result.success).toBe(true);
        });
    });

    describe('SyncDataSchema', () => {
        it('should validate a valid SyncData object', async () => {
            const syncData = await createSyncData();
            const result = SyncDataSchema.safeParse(syncData);
            expect(result.success).toBe(true);
        });

        it('should reject SyncData without version', async () => {
            const syncData = await createSyncData();
            const { version, ...invalidData } = syncData as any;
            const result = SyncDataSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });

        it('should reject SyncData without timestamp', async () => {
            const syncData = await createSyncData();
            const { timestamp, ...invalidData } = syncData as any;
            const result = SyncDataSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });

        it('should reject SyncData with invalid checksum format', async () => {
            const syncData = await createSyncData();
            const invalidData = { ...syncData, checksum: 'not-a-valid-sha256' };
            const result = SyncDataSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });

        it('should accept null activeScheduleId', async () => {
            const syncData = await createSyncData({ activeScheduleId: null });
            const result = SyncDataSchema.safeParse(syncData);
            expect(result.success).toBe(true);
        });

        it('should reject SyncData with invalid schedules array', async () => {
            const syncData = await createSyncData();
            const invalidData = { ...syncData, schedules: 'not-an-array' };
            const result = SyncDataSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });

        it('should validate SyncData with multiple schedules', async () => {
            const syncData = await createSyncData({
                schedules: [
                    createSchedule({ id: 'schedule-1' }),
                    createSchedule({ id: 'schedule-2' }),
                    createSchedule({ id: 'schedule-3' }),
                ],
            });
            const result = SyncDataSchema.safeParse(syncData);
            expect(result.success).toBe(true);
        });

        it('should allow optional preferences field', async () => {
            const syncData = await createSyncData({ preferences: { theme: 'dark' } });
            const result = SyncDataSchema.safeParse(syncData);
            expect(result.success).toBe(true);
        });

        it('should accept preferences as undefined', async () => {
            const syncData = await createSyncData({ preferences: undefined });
            const result = SyncDataSchema.safeParse(syncData);
            expect(result.success).toBe(true);
        });
    });

    describe('parseSyncData', () => {
        it('should parse valid SyncData without throwing', async () => {
            const syncData = await createSyncData();
            expect(() => parseSyncData(syncData, 'test')).not.toThrow();
        });

        it('should return validated SyncData', async () => {
            const syncData = await createSyncData();
            const validated = parseSyncData(syncData, 'test');
            expect(validated).toEqual(syncData);
        });

        it('should throw ZodError for invalid data', () => {
            const invalidData = createInvalidSyncData();
            expect(() => parseSyncData(invalidData, 'test')).toThrow();
        });

        it('should log validation errors', () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const invalidData = createInvalidSyncData();

            try {
                parseSyncData(invalidData, 'test');
            } catch (error) {
                // Expected to throw
            }

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('safeParseSyncData', () => {
        it('should return success=true for valid data', async () => {
            const syncData = await createSyncData();
            const result = safeParseSyncData(syncData);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual(syncData);
            }
        });

        it('should return success=false for invalid data', () => {
            const invalidData = createInvalidSyncData();
            const result = safeParseSyncData(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBeDefined();
            }
        });

        it('should not throw for invalid data', () => {
            const invalidData = createInvalidSyncData();
            expect(() => safeParseSyncData(invalidData)).not.toThrow();
        });
    });

    describe('Checksum Format Validation', () => {
        it('should accept valid SHA-256 checksum (64 hex chars)', async () => {
            const syncData = await createSyncData();
            const result = SyncDataSchema.safeParse(syncData);
            expect(result.success).toBe(true);
        });

        it('should reject checksum with wrong length', async () => {
            const syncData = await createSyncData();
            const invalidData = { ...syncData, checksum: 'a'.repeat(32) }; // Too short
            const result = SyncDataSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });

        it('should reject checksum with non-hex characters', async () => {
            const syncData = await createSyncData();
            const invalidData = { ...syncData, checksum: 'z'.repeat(64) }; // Invalid hex
            const result = SyncDataSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
        });

        it('should accept lowercase hex checksum', async () => {
            const syncData = await createSyncData();
            const lowercaseData = { ...syncData, checksum: syncData.checksum.toLowerCase() };
            const result = SyncDataSchema.safeParse(lowercaseData);
            expect(result.success).toBe(true);
        });

        it('should accept uppercase hex checksum', async () => {
            const syncData = await createSyncData();
            const uppercaseData = { ...syncData, checksum: syncData.checksum.toUpperCase() };
            const result = SyncDataSchema.safeParse(uppercaseData);
            expect(result.success).toBe(true);
        });
    });
});
