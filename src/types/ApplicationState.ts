import type { Department } from './types';
import type { SchedulePreferences } from './schedule';
import type { SyncData, MinimalSyncData } from '../services/sync/types';
import { ScheduleState, findCourseById, findSectionByCRN } from './ScheduleState';
import { checksumCalculator } from '../services/sync/checksum';
import LZString from 'lz-string';
import { dayToNumber, numberToDay, minutesToTime } from '../services/sync/utils';
import type { SelectedCourse } from './schedule';

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
            lastModified: new Date().toISOString(),
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
     * Convert to minimal format for export
     *
     * @returns MinimalSyncData
     */
    toMinimalFormat(): MinimalSyncData {
        return {
            v: "4",
            a: this.getActiveScheduleIndex(),
            s: this.schedules.map(schedule => [
                schedule.name,
                schedule.selectedCourses.flatMap(course => [
                    course.course.id,
                    course.selectedSection?.crn.toString() ?? null
                ])
            ]),
            p: this.preferences ? {
                t: [
                    this.preferences.preferredTimeRange.startTime.hours * 60 +
                        this.preferences.preferredTimeRange.startTime.minutes,
                    this.preferences.preferredTimeRange.endTime.hours * 60 +
                        this.preferences.preferredTimeRange.endTime.minutes
                ],
                d: Array.from(this.preferences.preferredDays).map(dayToNumber),
                th: this.preferences.theme
            } : undefined
        };
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
     * Create from minimal format
     *
     * @param data - Minimal sync data
     * @param courseCatalog - Department catalog for hydration
     * @returns ApplicationState with full objects
     */
    static fromMinimalFormat(
        data: MinimalSyncData,
        courseCatalog: Department[]
    ): ApplicationState {
        const schedules = data.s.map(([name, coursesArray]) => {
            const selectedCourses: SelectedCourse[] = [];

            for (let i = 0; i < coursesArray.length; i += 2) {
                const courseId = coursesArray[i];
                const crn = coursesArray[i + 1];

                if (!courseId) continue;

                const course = findCourseById(courseId, courseCatalog);
                if (!course) {
                    throw new Error(`Course ${courseId} not found in catalog`);
                }

                const section = crn ? findSectionByCRN(course, crn) : null;

                selectedCourses.push({
                    course,
                    selectedLecture: null,
                    selectedDiscussion: null,
                    selectedLab: null,
                    selectedSection: section,
                    selectedSectionNumber: section?.number || null,
                    isRequired: false,
                    lockedSections: new Set()
                });
            }

            return new ScheduleState(
                `schedule_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                name,
                selectedCourses,
                []
            );
        });

        const activeScheduleId = schedules[data.a]?.id ?? null;

        const preferences: SchedulePreferences | undefined = data.p ? {
            preferredTimeRange: {
                startTime: minutesToTime(data.p.t?.[0] ?? 480),
                endTime: minutesToTime(data.p.t?.[1] ?? 1200)
            },
            preferredDays: new Set(data.p.d?.map(numberToDay) ?? ['mon', 'tue', 'wed', 'thu', 'fri']),
            avoidBackToBackClasses: false,
            theme: data.p.th,
            bookmarkedCourseIds: []
        } : undefined;

        return new ApplicationState(
            activeScheduleId,
            schedules,
            preferences,
            data.v,
            Date.now()
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
     * Get active schedule index
     *
     * @returns Active schedule index or 0 if no active schedule
     */
    getActiveScheduleIndex(): number {
        if (!this.activeScheduleId) return 0;
        const index = this.schedules.findIndex(s => s.id === this.activeScheduleId);
        return index >= 0 ? index : 0;
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

    // =========================================================================
    // Schedule Query Methods
    // =========================================================================

    /**
     * Get total number of schedules
     *
     * @returns Schedule count
     */
    getScheduleCount(): number {
        return this.schedules.length;
    }

    /**
     * Check if schedule exists
     *
     * @param scheduleId - Schedule ID to check
     * @returns True if schedule exists
     */
    hasSchedule(scheduleId: string): boolean {
        return this.schedules.some(s => s.id === scheduleId);
    }

    /**
     * Find schedule by name
     *
     * @param name - Schedule name to find
     * @returns Schedule or null if not found
     */
    findScheduleByName(name: string): ScheduleState | null {
        return this.schedules.find(s => s.name === name) || null;
    }

    /**
     * Get all schedule names
     *
     * @returns Array of schedule names
     */
    getAllScheduleNames(): string[]  {
        return this.schedules.map(s => s.name);
    }

    // =========================================================================
    // Validation & Naming Utilities
    // =========================================================================

    /**
     * Check if a schedule name is unique
     *
     * @param name - Name to check
     * @param excludeId - Optional schedule ID to exclude from check (for renames)
     * @returns True if name is unique
     */
    hasUniqueScheduleName(name: string, excludeId?: string): boolean {
        return !this.schedules.some(s => s.name === name && s.id !== excludeId);
    }

    /**
     * Generate a unique schedule name by appending numbers
     *
     * @param baseName - Base name to start with
     * @returns Unique name (e.g., "My Schedule (1)" if "My Schedule" exists)
     */
    generateUniqueScheduleName(baseName: string): string {
        if (this.hasUniqueScheduleName(baseName)) {
            return baseName;
        }

        let counter = 1;
        let candidateName: string;
        do {
            candidateName = `${baseName} (${counter})`;
            counter++;
        } while (!this.hasUniqueScheduleName(candidateName));

        return candidateName;
    }

    // =========================================================================
    // Statistics & Analytics
    // =========================================================================

    /**
     * Get total number of courses across all schedules
     *
     * @returns Total course count
     */
    getTotalCourseCount(): number {
        return this.schedules.reduce((sum, schedule) => sum + schedule.getCourseCount(), 0);
    }

    /**
     * Get schedules sorted by name (alphabetically)
     *
     * @returns Sorted array of schedules
     */
    getSchedulesSortedByName(): ScheduleState[] {
        return [...this.schedules].sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get schedules sorted by timestamp (most recent first)
     *
     * @returns Sorted array of schedules
     */
    getSchedulesSortedByTimestamp(): ScheduleState[] {
        return [...this.schedules].sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get schedules that are empty (no courses)
     *
     * @returns Array of empty schedules
     */
    getEmptySchedules(): ScheduleState[] {
        return this.schedules.filter(s => s.isEmpty());
    }

    // =========================================================================
    // Compression & Storage Optimization
    // =========================================================================

    /**
     * Serialize to compressed JSON string for efficient storage
     *
     * Uses LZ-String compression to reduce storage size by ~70%
     *
     * @returns Compressed string suitable for IndexedDB storage
     */
    toCompressedJSON(): string {
        const syncData = this.toCloudFormat();
        const json = JSON.stringify(syncData);
        return LZString.compress(json);
    }

    /**
     * Serialize to compressed JSON string with checksum
     *
     * @returns Compressed string with checksum included
     */
    async toCompressedJSONWithChecksum(): Promise<string> {
        const syncData = await this.toCloudFormatWithChecksum();
        const json = JSON.stringify(syncData);
        return LZString.compress(json);
    }

    /**
     * Deserialize from compressed JSON string
     *
     * Handles both compressed and uncompressed formats for backward compatibility
     *
     * @param compressedData - Compressed or uncompressed JSON string
     * @param courseCatalog - Department catalog for hydration
     * @returns ApplicationState instance
     */
    static fromCompressedJSON(
        compressedData: string,
        courseCatalog: Department[]
    ): ApplicationState {
        // Try to decompress (will return null if not LZ-compressed)
        const decompressed = LZString.decompress(compressedData);

        // If decompression returns null, assume it's uncompressed JSON
        const json = decompressed || compressedData;

        const syncData: SyncData = JSON.parse(json);
        return ApplicationState.fromCloudFormat(syncData, courseCatalog);
    }

    /**
     * Calculate compression ratio for monitoring
     *
     * @returns Object with original size, compressed size, and ratio
     */
    getCompressionStats(): { originalBytes: number; compressedBytes: number; ratio: number } {
        const syncData = this.toCloudFormat();
        const json = JSON.stringify(syncData);
        const compressed = LZString.compress(json);

        const originalBytes = new Blob([json]).size;
        const compressedBytes = new Blob([compressed]).size;
        const ratio = compressedBytes / originalBytes;

        return {
            originalBytes,
            compressedBytes,
            ratio
        };
    }
}
