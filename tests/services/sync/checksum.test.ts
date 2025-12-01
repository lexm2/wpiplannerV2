import { describe, it, expect, beforeEach } from 'vitest';
import { checksumCalculator } from '../../../src/services/sync/checksum';
import type { ChecksumData } from '../../../src/services/sync/checksum';
import {
    createSyncData,
    createSchedule,
    assertValidChecksum,
} from '../../helpers/sync-test-utils';

describe('Checksum Calculation', () => {
    describe('calculateChecksum', () => {
        it('should generate a valid SHA-256 checksum', async () => {
            const data = await createSyncData();
            const checksumData: ChecksumData = {
                version: data.version,
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: data.preferences,
            };

            const checksum = await checksumCalculator.calculateChecksum(checksumData);
            assertValidChecksum(checksum);
        });

        it('should produce a 64-character hex string', async () => {
            const data = await createSyncData();
            const checksumData: ChecksumData = {
                version: data.version,
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: data.preferences,
            };

            const checksum = await checksumCalculator.calculateChecksum(checksumData);
            expect(checksum).toHaveLength(64);
            expect(checksum).toMatch(/^[a-f0-9]{64}$/i);
        });

        it('should produce consistent checksums for identical data', async () => {
            const data = await createSyncData();
            const checksumData: ChecksumData = {
                version: data.version,
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: data.preferences,
            };

            const checksum1 = await checksumCalculator.calculateChecksum(checksumData);
            const checksum2 = await checksumCalculator.calculateChecksum(checksumData);

            expect(checksum1).toBe(checksum2);
        });

        it('should produce different checksums for different data', async () => {
            const data1 = await createSyncData({
                schedules: [createSchedule({ name: 'Schedule 1' })],
            });
            const data2 = await createSyncData({
                schedules: [createSchedule({ name: 'Schedule 2' })],
            });

            const checksum1 = await checksumCalculator.calculateChecksum({
                version: data1.version,
                activeScheduleId: data1.activeScheduleId,
                schedules: data1.schedules,
                preferences: data1.preferences,
            });

            const checksum2 = await checksumCalculator.calculateChecksum({
                version: data2.version,
                activeScheduleId: data2.activeScheduleId,
                schedules: data2.schedules,
                preferences: data2.preferences,
            });

            expect(checksum1).not.toBe(checksum2);
        });

        it('should change checksum when version changes', async () => {
            const data = await createSyncData({ version: '3.0' });

            const checksum1 = await checksumCalculator.calculateChecksum({
                version: '3.0',
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: data.preferences,
            });

            const checksum2 = await checksumCalculator.calculateChecksum({
                version: '4.0',
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: data.preferences,
            });

            expect(checksum1).not.toBe(checksum2);
        });

        it('should change checksum when activeScheduleId changes', async () => {
            const data = await createSyncData({
                schedules: [
                    createSchedule({ id: 'schedule-1' }),
                    createSchedule({ id: 'schedule-2' }),
                ],
            });

            const checksum1 = await checksumCalculator.calculateChecksum({
                version: data.version,
                activeScheduleId: 'schedule-1',
                schedules: data.schedules,
                preferences: data.preferences,
            });

            const checksum2 = await checksumCalculator.calculateChecksum({
                version: data.version,
                activeScheduleId: 'schedule-2',
                schedules: data.schedules,
                preferences: data.preferences,
            });

            expect(checksum1).not.toBe(checksum2);
        });

        it('should change checksum when schedules change', async () => {
            const data = await createSyncData();

            const checksum1 = await checksumCalculator.calculateChecksum({
                version: data.version,
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: data.preferences,
            });

            const modifiedSchedules = [
                ...data.schedules,
                createSchedule({ id: 'new-schedule' }),
            ];

            const checksum2 = await checksumCalculator.calculateChecksum({
                version: data.version,
                activeScheduleId: data.activeScheduleId,
                schedules: modifiedSchedules,
                preferences: data.preferences,
            });

            expect(checksum1).not.toBe(checksum2);
        });

        it('should change checksum when preferences change', async () => {
            const data = await createSyncData({ preferences: { theme: 'light' } });

            const checksum1 = await checksumCalculator.calculateChecksum({
                version: data.version,
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: { theme: 'light' },
            });

            const checksum2 = await checksumCalculator.calculateChecksum({
                version: data.version,
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: { theme: 'dark' },
            });

            expect(checksum1).not.toBe(checksum2);
        });

        it('should handle empty schedules array', async () => {
            const checksumData: ChecksumData = {
                version: '3.0',
                activeScheduleId: null,
                schedules: [],
                preferences: {},
            };

            const checksum = await checksumCalculator.calculateChecksum(checksumData);
            assertValidChecksum(checksum);
        });

        it('should handle null activeScheduleId', async () => {
            const data = await createSyncData({ activeScheduleId: null });
            const checksumData: ChecksumData = {
                version: data.version,
                activeScheduleId: null,
                schedules: data.schedules,
                preferences: data.preferences,
            };

            const checksum = await checksumCalculator.calculateChecksum(checksumData);
            assertValidChecksum(checksum);
        });

        it('should handle undefined preferences', async () => {
            const data = await createSyncData({ preferences: undefined });
            const checksumData: ChecksumData = {
                version: data.version,
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: undefined,
            };

            const checksum = await checksumCalculator.calculateChecksum(checksumData);
            assertValidChecksum(checksum);
        });
    });

    describe('verifyChecksum', () => {
        it('should verify a valid checksum', async () => {
            const data = await createSyncData();
            const checksumData: ChecksumData = {
                version: data.version,
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: data.preferences,
            };

            const result = await checksumCalculator.verifyChecksum(checksumData, data.checksum);
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should detect checksum mismatch', async () => {
            const data = await createSyncData();
            const checksumData: ChecksumData = {
                version: data.version,
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: data.preferences,
            };

            const wrongChecksum = 'a'.repeat(64);
            const result = await checksumCalculator.verifyChecksum(checksumData, wrongChecksum);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('MISMATCH');
            expect(result.message).toContain('mismatch');
            expect(result.expected).toBe(wrongChecksum);
            expect(result.calculated).toBeDefined();
        });

        it('should detect invalid checksum format', async () => {
            const data = await createSyncData();
            const checksumData: ChecksumData = {
                version: data.version,
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: data.preferences,
            };

            const invalidChecksum = 'not-a-valid-checksum';
            const result = await checksumCalculator.verifyChecksum(checksumData, invalidChecksum);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('INVALID_FORMAT');
            expect(result.message).toContain('format invalid');
        });

        it('should detect checksum with wrong length', async () => {
            const data = await createSyncData();
            const checksumData: ChecksumData = {
                version: data.version,
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: data.preferences,
            };

            const shortChecksum = 'a'.repeat(32);
            const result = await checksumCalculator.verifyChecksum(checksumData, shortChecksum);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('INVALID_FORMAT');
        });

        it('should detect data corruption (modified data)', async () => {
            const data = await createSyncData();
            const checksumData: ChecksumData = {
                version: data.version,
                activeScheduleId: data.activeScheduleId,
                schedules: data.schedules,
                preferences: data.preferences,
            };

            // Modify data after checksum calculation
            checksumData.schedules[0].name = 'Modified Name';

            const result = await checksumCalculator.verifyChecksum(checksumData, data.checksum);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('MISMATCH');
        });
    });

    describe('isValidChecksumFormat', () => {
        it('should accept valid 64-character hex string', () => {
            const validChecksum = 'a'.repeat(64);
            expect(checksumCalculator.isValidChecksumFormat(validChecksum)).toBe(true);
        });

        it('should accept lowercase hex', () => {
            const validChecksum = 'abcdef0123456789'.repeat(4);
            expect(checksumCalculator.isValidChecksumFormat(validChecksum)).toBe(true);
        });

        it('should accept uppercase hex', () => {
            const validChecksum = 'ABCDEF0123456789'.repeat(4);
            expect(checksumCalculator.isValidChecksumFormat(validChecksum)).toBe(true);
        });

        it('should accept mixed case hex', () => {
            const validChecksum = 'AbCdEf0123456789'.repeat(4);
            expect(checksumCalculator.isValidChecksumFormat(validChecksum)).toBe(true);
        });

        it('should reject non-hex characters', () => {
            const invalidChecksum = 'z'.repeat(64);
            expect(checksumCalculator.isValidChecksumFormat(invalidChecksum)).toBe(false);
        });

        it('should reject wrong length (too short)', () => {
            const invalidChecksum = 'a'.repeat(32);
            expect(checksumCalculator.isValidChecksumFormat(invalidChecksum)).toBe(false);
        });

        it('should reject wrong length (too long)', () => {
            const invalidChecksum = 'a'.repeat(128);
            expect(checksumCalculator.isValidChecksumFormat(invalidChecksum)).toBe(false);
        });

        it('should reject empty string', () => {
            expect(checksumCalculator.isValidChecksumFormat('')).toBe(false);
        });

        it('should reject strings with spaces', () => {
            const invalidChecksum = 'a'.repeat(32) + ' ' + 'a'.repeat(31);
            expect(checksumCalculator.isValidChecksumFormat(invalidChecksum)).toBe(false);
        });
    });
});
