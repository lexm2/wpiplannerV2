import type { ScheduleData, SelectedCourseData } from './types';
import { checksumCalculator } from './checksum';
import { createJSONReplacer } from '../../utils/jsonSerializer';

/**
 * Abstract SyncData Class
 *
 * Universal data class for schedule data throughout the application.
 * Used everywhere: IndexedDB, cloud storage, memory, exports.
 *
 * This class stores only IDs (not full Course/Section objects) for efficiency.
 * Full objects are hydrated only when needed by the UI.
 *
 * Benefits:
 * - Single format throughout app (consistency)
 * - Checksum methods built-in (object-oriented)
 * - Efficient storage (IDs only)
 * - Type-safe validation
 */
export abstract class SyncData {
    version: string;
    timestamp: number;
    checksum: string;
    activeScheduleId: string | null;
    schedules: ScheduleData[];
    preferences?: unknown;

    constructor(
        version: string,
        timestamp: number,
        checksum: string,
        activeScheduleId: string | null,
        schedules: ScheduleData[],
        preferences?: unknown
    ) {
        this.version = version;
        this.timestamp = timestamp;
        this.checksum = checksum;
        this.activeScheduleId = activeScheduleId;
        this.schedules = schedules;
        this.preferences = preferences;
    }

    /**
     * Calculate checksum for this data
     *
     * @returns 64-character SHA-256 hex string
     */
    async calculateChecksum(): Promise<string> {
        const checksumData = {
            version: this.version,
            activeScheduleId: this.activeScheduleId,
            schedules: this.schedules,
            preferences: this.preferences
        };

        const jsonString = JSON.stringify(checksumData, createJSONReplacer());
        return this.sha256(jsonString);
    }

    /**
     * Verify checksum matches expected value
     *
     * @returns True if checksum is valid
     */
    async verifyChecksum(): Promise<boolean> {
        const calculated = await this.calculateChecksum();
        return calculated === this.checksum;
    }

    /**
     * Update checksum to current value
     */
    async updateChecksum(): Promise<void> {
        this.checksum = await this.calculateChecksum();
    }

    /**
     * Update timestamp to current time
     */
    updateTimestamp(): void {
        this.timestamp = Date.now();
    }

    /**
     * Serialize to JSON
     *
     * @returns JSON string representation
     */
    toJSON(): string {
        return JSON.stringify({
            version: this.version,
            timestamp: this.timestamp,
            checksum: this.checksum,
            activeScheduleId: this.activeScheduleId,
            schedules: this.schedules,
            preferences: this.preferences
        }, createJSONReplacer(), 2);
    }

    /**
     * Get plain object representation (for APIs that need plain objects)
     *
     * @returns Plain object
     */
    toObject(): {
        version: string;
        timestamp: number;
        checksum: string;
        activeScheduleId: string | null;
        schedules: ScheduleData[];
        preferences?: unknown;
    } {
        return {
            version: this.version,
            timestamp: this.timestamp,
            checksum: this.checksum,
            activeScheduleId: this.activeScheduleId,
            schedules: this.schedules,
            preferences: this.preferences
        };
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

    /**
     * Create SyncData from plain object
     *
     * @param obj - Plain object with sync data
     * @returns SyncData instance
     */
    static fromObject(obj: {
        version: string;
        timestamp: number;
        checksum: string;
        activeScheduleId: string | null;
        schedules: ScheduleData[];
        preferences?: unknown;
    }): SyncDataImpl {
        return new SyncDataImpl(
            obj.version,
            obj.timestamp,
            obj.checksum,
            obj.activeScheduleId,
            obj.schedules,
            obj.preferences
        );
    }

    /**
     * Create SyncData from JSON string
     *
     * @param json - JSON string
     * @returns SyncData instance
     */
    static fromJSON(json: string): SyncDataImpl {
        const obj = JSON.parse(json);
        return SyncData.fromObject(obj);
    }
}

/**
 * Concrete implementation of SyncData
 */
class SyncDataImpl extends SyncData {
    constructor(
        version: string,
        timestamp: number,
        checksum: string,
        activeScheduleId: string | null,
        schedules: ScheduleData[],
        preferences?: unknown
    ) {
        super(version, timestamp, checksum, activeScheduleId, schedules, preferences);
    }
}

/**
 * Create new SyncData instance
 *
 * @param version - Format version
 * @param schedules - Schedule data (IDs only)
 * @param activeScheduleId - Active schedule ID
 * @param preferences - User preferences
 * @returns SyncData instance with calculated checksum
 */
export async function createSyncData(
    version: string,
    schedules: ScheduleData[],
    activeScheduleId: string | null,
    preferences?: unknown
): Promise<SyncData> {
    const syncData = new SyncDataImpl(
        version,
        Date.now(),
        '', // Will be calculated
        activeScheduleId,
        schedules,
        preferences
    );

    await syncData.updateChecksum();
    return syncData;
}
