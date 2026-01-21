import { expect } from 'bun:test';
import type { SyncData, ScheduleData, SelectedCourseData, SyncEvent } from '../../src/services/sync/types';
import { checksumCalculator } from '../../src/services/sync/checksum';
import { ApplicationState } from '../../src/types/ApplicationState';
import { ScheduleState } from '../../src/types/ScheduleState';
import type { Department } from '../../src/types/types';

/**
 * Test Utilities for Cloud Sync Testing
 *
 * Provides factory functions, helpers, and utilities for testing the sync system.
 * Uses real course IDs and CRNs from the course catalog.
 */

// =============================================================================
// Real Course Data Constants (from public/course-data-constructed.json)
// =============================================================================

/** Real course IDs and CRNs from the catalog */
export const REAL_COURSES = {
    CS_1101: { id: 'CS-1101', crn: '334067' },
    CS_2303: { id: 'CS-2303', crn: '334132' },
    MA_1024: { id: 'MA-1024', crn: '334058' },
    MA_1021: { id: 'MA-1021', crn: '334063' },
    CS_2022: { id: 'CS-2022', crn: '338840' },
    CS_2102: { id: 'CS-2102', crn: '334688' },
} as const;

// =============================================================================
// Factory Functions - Create Test Data
// =============================================================================

/**
 * Create a test SelectedCourseData object with real course/section data
 */
export function createSelectedCourse(overrides?: Partial<SelectedCourseData>): SelectedCourseData {
    return {
        courseId: REAL_COURSES.CS_1101.id,
        selectedSectionCrn: REAL_COURSES.CS_1101.crn,
        lockedSectionCrn: undefined,
        isRequired: true,
        timestamp: Date.now(),
        ...overrides,
    };
}

/**
 * Create a test ScheduleData object with real course data
 */
export function createSchedule(overrides?: Partial<ScheduleData>): ScheduleData {
    return {
        id: 'schedule-1',
        name: 'Test Schedule',
        selectedCourses: [
            createSelectedCourse({
                courseId: REAL_COURSES.CS_1101.id,
                selectedSectionCrn: REAL_COURSES.CS_1101.crn
            }),
            createSelectedCourse({
                courseId: REAL_COURSES.CS_2303.id,
                selectedSectionCrn: REAL_COURSES.CS_2303.crn
            }),
        ],
        timestamp: Date.now(),
        ...overrides,
    };
}

/**
 * Create a test SyncData object with valid checksum
 */
export async function createSyncData(overrides?: Partial<SyncData>): Promise<SyncData> {
    const schedules = overrides?.schedules || [createSchedule()];
    const activeScheduleId = overrides?.activeScheduleId !== undefined
        ? overrides.activeScheduleId
        : (schedules.length > 0 ? schedules[0].id : null);
    const version = overrides?.version || '3.0';
    const preferences = overrides?.preferences || {};

    const checksum = await checksumCalculator.calculateChecksum({
        version,
        activeScheduleId,
        schedules,
        preferences,
    });

    return {
        version,
        timestamp: Date.now(),
        checksum,
        activeScheduleId,
        schedules,
        preferences,
        ...overrides,
    };
}

/**
 * Convert SyncData to minimal format JSON string (v4)
 *
 * @param overrides - Optional overrides for SyncData
 * @param courseCatalog - Course catalog for hydration
 * @returns Minimal format JSON string
 */
export async function createMinimalSyncData(
    overrides?: Partial<SyncData>,
    courseCatalog?: Department[]
): Promise<string> {
    const syncData = await createSyncData(overrides);

    if (!courseCatalog || courseCatalog.length === 0) {
        throw new Error('Course catalog required for minimal format conversion');
    }

    const appState = ApplicationState.fromCloudFormat(syncData, courseCatalog);
    return JSON.stringify(appState.toMinimalFormat(), null, 2);
}

/**
 * Create SyncData with multiple schedules using real courses
 */
export async function createSyncDataWithMultipleSchedules(count: number): Promise<SyncData> {
    // Use an array of real courses for variety
    const realCourseList = [
        REAL_COURSES.CS_1101,
        REAL_COURSES.CS_2303,
        REAL_COURSES.MA_1024,
        REAL_COURSES.MA_1021,
        REAL_COURSES.CS_2022,
        REAL_COURSES.CS_2102,
    ];

    const schedules: ScheduleData[] = [];
    for (let i = 0; i < count; i++) {
        const courseInfo = realCourseList[i % realCourseList.length];
        schedules.push(
            createSchedule({
                id: `schedule-${i + 1}`,
                name: `Schedule ${i + 1}`,
                selectedCourses: [
                    createSelectedCourse({
                        courseId: courseInfo.id,
                        selectedSectionCrn: courseInfo.crn
                    }),
                ],
            })
        );
    }

    return createSyncData({
        schedules,
        activeScheduleId: schedules[0].id,
    });
}

/**
 * Create SyncData with corrupted checksum
 */
export async function createSyncDataWithBadChecksum(): Promise<SyncData> {
    const data = await createSyncData();
    return {
        ...data,
        checksum: 'corrupted_' + data.checksum.substring(10),
    };
}

/**
 * Create SyncData with invalid checksum format
 */
export async function createSyncDataWithInvalidChecksumFormat(): Promise<SyncData> {
    const data = await createSyncData();
    return {
        ...data,
        checksum: 'not-a-valid-sha256-checksum',
    };
}

/**
 * Create two different SyncData objects (conflicting data) with real courses
 */
export async function createConflictingData(): Promise<{
    localData: SyncData;
    cloudData: SyncData;
}> {
    const localData = await createSyncData({
        schedules: [
            createSchedule({
                id: 'schedule-1',
                name: 'Local Schedule',
                selectedCourses: [
                    createSelectedCourse({
                        courseId: REAL_COURSES.CS_1101.id,
                        selectedSectionCrn: REAL_COURSES.CS_1101.crn
                    }),
                ],
            }),
        ],
    });

    const cloudData = await createSyncData({
        schedules: [
            createSchedule({
                id: 'schedule-1',
                name: 'Cloud Schedule',
                selectedCourses: [
                    createSelectedCourse({
                        courseId: REAL_COURSES.CS_2303.id,
                        selectedSectionCrn: REAL_COURSES.CS_2303.crn
                    }),
                    createSelectedCourse({
                        courseId: REAL_COURSES.MA_1024.id,
                        selectedSectionCrn: REAL_COURSES.MA_1024.crn
                    }),
                ],
            }),
        ],
    });

    return { localData, cloudData };
}

// =============================================================================
// Event Helpers
// =============================================================================

/**
 * Create a spy for SyncEventBus to track emitted events
 */
export function createEventBusSpy() {
    const events: SyncEvent[] = [];

    const listener = (event: SyncEvent) => {
        events.push(event);
    };

    return {
        listener,
        events,
        /**
         * Get all events of a specific type
         */
        getEvents(type: string): SyncEvent[] {
            return events.filter((e) => e.type === type);
        },
        /**
         * Check if an event was emitted
         */
        hasEvent(type: string): boolean {
            return events.some((e) => e.type === type);
        },
        /**
         * Get the most recent event of a specific type
         */
        getLatestEvent(type: string): SyncEvent | undefined {
            const filtered = events.filter((e) => e.type === type);
            return filtered[filtered.length - 1];
        },
        /**
         * Clear all recorded events
         */
        clear(): void {
            events.length = 0;
        },
        /**
         * Get count of specific event type
         */
        getEventCount(type: string): number {
            return events.filter((e) => e.type === type).length;
        },
    };
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Assert that two SyncData objects have the same content (ignoring timestamp)
 */
export function assertSyncDataEqual(
    actual: SyncData,
    expected: SyncData,
    ignoreTimestamp = true
): void {
    if (ignoreTimestamp) {
        const { timestamp: actualTs, ...actualRest } = actual;
        const { timestamp: expectedTs, ...expectedRest } = expected;
        expect(actualRest).toEqual(expectedRest);
    } else {
        expect(actual).toEqual(expected);
    }
}

/**
 * Assert that a checksum is valid SHA-256 format
 */
export function assertValidChecksum(checksum: string): void {
    expect(checksum).toMatch(/^[a-f0-9]{64}$/i);
    expect(checksum).toHaveLength(64);
}

/**
 * Assert that SyncData has a valid structure
 */
export function assertValidSyncData(data: SyncData): void {
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('checksum');
    expect(data).toHaveProperty('activeScheduleId');
    expect(data).toHaveProperty('schedules');
    expect(Array.isArray(data.schedules)).toBe(true);
    assertValidChecksum(data.checksum);
}

// =============================================================================
// Mock Data Validation
// =============================================================================

/**
 * Create invalid SyncData (missing required fields)
 */
export function createInvalidSyncData(): any {
    return {
        // Missing version, timestamp, checksum
        activeScheduleId: null,
        schedules: [],
    };
}

/**
 * Create SyncData with invalid schedule structure
 */
export function createSyncDataWithInvalidSchedule(): any {
    return {
        version: '3.0',
        timestamp: Date.now(),
        checksum: 'a'.repeat(64),
        activeScheduleId: null,
        schedules: [
            {
                // Missing id and name
                selectedCourses: [],
            },
        ],
    };
}

// =============================================================================
// Performance Helpers
// =============================================================================

/**
 * Measure execution time of an async function
 */
export async function measureExecutionTime<T>(
    fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    return { result, duration };
}

// =============================================================================
// Cleanup Helpers
// =============================================================================

/**
 * Clean up after sync tests (clear localStorage, reset singletons, etc.)
 */
export function cleanupSyncTests(): void {
    // Clear localStorage items used by sync
    localStorage.removeItem('google-drive-auth');
    localStorage.removeItem('wpi-planner-device-id');
}
