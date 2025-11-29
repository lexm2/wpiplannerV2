import type { Department } from './types';
import type { SchedulePreferences } from './schedule';
import type { SyncData } from '../services/sync/types';
import { ScheduleState } from './ScheduleState';
import { checksumCalculator } from '../services/sync/checksum';

/**
 * Application-level state containing multiple schedules and preferences
 *
 * This class:
 * - Wraps multiple ScheduleState instances
 * - Manages application-wide checksum
 * - Provides conversion to/from cloud SyncData format
 * - Represents the complete exportable/importable state
 */
export class ApplicationState {
    readonly version: string;
    readonly timestamp: number;
    readonly activeScheduleId: string | null;
    readonly schedules: ScheduleState[];
    readonly preferences?: SchedulePreferences;

    constructor(
        activeScheduleId: string | null,
        schedules: ScheduleState[],
        preferences?: SchedulePreferences,
        version: string = '3.0',
        timestamp: number = Date.now()
    ) {
        this.version = version;
        this.timestamp = timestamp;
        this.activeScheduleId = activeScheduleId;
        this.schedules = schedules;
        this.preferences = preferences;
    }

    /**
     * Calculate checksum for entire application state
     *
     * @returns 64-character SHA-256 hash
     */
    async calculateChecksum(): Promise<string> {
        return checksumCalculator.calculateChecksum({
            version: this.version,
            activeScheduleId: this.activeScheduleId,
            schedules: this.schedules.map(s => s.toCloudFormat()),
            preferences: this.preferences
        });
    }

    /**
     * Verify checksum matches expected value
     *
     * @param expectedChecksum - Expected checksum
     * @returns True if checksum matches
     */
    async verifyChecksum(expectedChecksum: string): Promise<boolean> {
        const calculated = await this.calculateChecksum();
        return calculated === expectedChecksum;
    }

    /**
     * Convert to cloud format (IDs only)
     *
     * @returns SyncData with IDs only (no checksum calculated yet)
     */
    toCloudFormat(): SyncData {
        return {
            version: this.version,
            timestamp: this.timestamp,
            checksum: '', // Caller should calculate and set using calculateChecksum()
            activeScheduleId: this.activeScheduleId,
            schedules: this.schedules.map(s => s.toCloudFormat()),
            preferences: this.preferences
        };
    }

    /**
     * Convert to cloud format with checksum calculated
     *
     * @returns SyncData with checksum
     */
    async toCloudFormatWithChecksum(): Promise<SyncData> {
        const syncData = this.toCloudFormat();
        syncData.checksum = await this.calculateChecksum();
        return syncData;
    }

    /**
     * Create from cloud format (hydrate IDs → full objects)
     *
     * @param syncData - Cloud data with IDs only
     * @param courseCatalog - Department catalog for hydration
     * @returns ApplicationState with full objects
     */
    static fromCloudFormat(
        syncData: SyncData,
        courseCatalog: Department[]
    ): ApplicationState {
        const schedules = syncData.schedules.map(scheduleData =>
            ScheduleState.fromCloudFormat(scheduleData, courseCatalog)
        );

        return new ApplicationState(
            syncData.activeScheduleId,
            schedules,
            syncData.preferences as SchedulePreferences | undefined,
            syncData.version,
            syncData.timestamp
        );
    }

    /**
     * Create a copy with updated fields (immutable update)
     *
     * @param updates - Partial updates to apply
     * @returns New ApplicationState instance
     */
    with(updates: Partial<{
        activeScheduleId: string | null;
        schedules: ScheduleState[];
        preferences: SchedulePreferences;
    }>): ApplicationState {
        return new ApplicationState(
            updates.activeScheduleId ?? this.activeScheduleId,
            updates.schedules ?? this.schedules,
            updates.preferences ?? this.preferences,
            this.version,
            Date.now() // Update timestamp
        );
    }

    /**
     * Get active schedule
     *
     * @returns Active ScheduleState or null
     */
    getActiveSchedule(): ScheduleState | null {
        if (!this.activeScheduleId) return null;
        return this.schedules.find(s => s.id === this.activeScheduleId) || null;
    }

    /**
     * Get schedule by ID
     *
     * @param scheduleId - Schedule ID
     * @returns ScheduleState or null
     */
    getSchedule(scheduleId: string): ScheduleState | null {
        return this.schedules.find(s => s.id === scheduleId) || null;
    }

    /**
     * Add or update schedule
     *
     * @param schedule - Schedule to add/update
     * @returns New ApplicationState with schedule added/updated
     */
    upsertSchedule(schedule: ScheduleState): ApplicationState {
        const existingIndex = this.schedules.findIndex(s => s.id === schedule.id);
        const newSchedules = [...this.schedules];

        if (existingIndex >= 0) {
            newSchedules[existingIndex] = schedule;
        } else {
            newSchedules.push(schedule);
        }

        return this.with({ schedules: newSchedules });
    }

    /**
     * Remove schedule
     *
     * @param scheduleId - Schedule ID to remove
     * @returns New ApplicationState without schedule
     */
    removeSchedule(scheduleId: string): ApplicationState {
        const newSchedules = this.schedules.filter(s => s.id !== scheduleId);
        const newActiveScheduleId = this.activeScheduleId === scheduleId
            ? null
            : this.activeScheduleId;

        return new ApplicationState(
            newActiveScheduleId,
            newSchedules,
            this.preferences,
            this.version,
            Date.now()
        );
    }
}
