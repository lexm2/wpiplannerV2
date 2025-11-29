import type { ValidatedSyncData, ValidatedScheduleData } from './schemas';
import { createJSONReplacer } from '../../utils/jsonSerializer';

/**
 * Checksum Verification Result
 */
export interface ChecksumVerificationResult {
    valid: boolean;
    error?: 'INVALID_FORMAT' | 'MISMATCH';
    message?: string;
    expected?: string;
    calculated?: string;
}

/**
 * Data structure for checksum calculation
 */
export interface ChecksumData {
    version: string;
    activeScheduleId: string | null;
    schedules: ValidatedScheduleData[];
    preferences?: unknown;
}

/**
 * Unified Checksum Calculator
 *
 * Provides consistent SHA-256 checksum calculation across the entire cloud sync system.
 * Replaces the divergent checksum algorithms previously used in TransactionalStorageManager
 * and GoogleDriveProvider.
 *
 * Algorithm: SHA-256 (64-character hex string)
 *
 * Included in Checksum:
 * - version: Format version
 * - activeScheduleId: Currently active schedule
 * - schedules: All schedule data
 * - preferences: User preferences
 *
 * Excluded from Checksum:
 * - timestamp: Changes on every save, not part of data integrity
 */
export class ChecksumCalculator {
    /**
     * Calculate SHA-256 checksum for sync data
     *
     * @param data - Data to calculate checksum for
     * @returns 64-character SHA-256 hex string
     */
    async calculateChecksum(data: ChecksumData): Promise<string> {
        const checksumData: ChecksumData = {
            version: data.version,
            activeScheduleId: data.activeScheduleId,
            schedules: data.schedules,
            preferences: data.preferences,
        };

        // Use the same JSON serializer as TransactionalStorageManager
        const jsonString = JSON.stringify(checksumData, createJSONReplacer());

        return this.sha256(jsonString);
    }

    /**
     * Verify checksum matches expected value
     *
     * @param data - Data to verify
     * @param expectedChecksum - Expected checksum value
     * @returns Verification result with details
     */
    async verifyChecksum(
        data: ChecksumData,
        expectedChecksum: string
    ): Promise<ChecksumVerificationResult> {
        // Check format first (must be 64-char SHA-256)
        if (!this.isValidChecksumFormat(expectedChecksum)) {
            return {
                valid: false,
                error: 'INVALID_FORMAT',
                message: `Checksum format invalid (expected 64-char SHA-256, got ${expectedChecksum.length} chars)`,
                expected: expectedChecksum
            };
        }

        // Calculate checksum from data
        const calculated = await this.calculateChecksum(data);

        // Compare
        if (calculated !== expectedChecksum) {
            return {
                valid: false,
                error: 'MISMATCH',
                message: 'Checksum mismatch - data may be corrupted',
                expected: expectedChecksum,
                calculated
            };
        }

        return { valid: true };
    }

    /**
     * Check if checksum has valid SHA-256 format
     *
     * @param checksum - Checksum to validate
     * @returns True if 64-character hex string
     */
    isValidChecksumFormat(checksum: string): boolean {
        return /^[a-f0-9]{64}$/i.test(checksum);
    }

    /**
     * Calculate SHA-256 hash of string
     *
     * @param data - String to hash
     * @returns 64-character SHA-256 hex string
     */
    private async sha256(data: string): Promise<string> {
        if (typeof crypto === 'undefined' || !crypto.subtle) {
            throw new Error('Web Crypto API not available');
        }

        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
}

/**
 * Singleton instance for application-wide use
 */
export const checksumCalculator = new ChecksumCalculator();

/**
 * Helper: Calculate checksum for SyncData object
 *
 * Convenient wrapper for working directly with SyncData objects.
 *
 * @param syncData - SyncData object to calculate checksum for
 * @returns 64-character SHA-256 hex string
 */
export async function calculateSyncDataChecksum(syncData: ValidatedSyncData): Promise<string> {
    return checksumCalculator.calculateChecksum({
        version: syncData.version,
        activeScheduleId: syncData.activeScheduleId,
        schedules: syncData.schedules,
        preferences: syncData.preferences
    });
}

/**
 * Helper: Verify SyncData checksum
 *
 * Convenient wrapper for verifying SyncData objects.
 *
 * @param syncData - SyncData object to verify
 * @returns Verification result
 */
export async function verifySyncDataChecksum(syncData: ValidatedSyncData): Promise<ChecksumVerificationResult> {
    return checksumCalculator.verifyChecksum(
        {
            version: syncData.version,
            activeScheduleId: syncData.activeScheduleId,
            schedules: syncData.schedules,
            preferences: syncData.preferences
        },
        syncData.checksum
    );
}
