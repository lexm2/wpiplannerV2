import type { SyncData, ScheduleData, SelectedCourseData, SyncEvent } from '../../src/services/sync/types';
import { checksumCalculator } from '../../src/services/sync/checksum';
import { vi } from 'vitest';

/**
 * Test Utilities for Cloud Sync Testing
 *
 * Provides factory functions, helpers, and utilities for testing the sync system.
 */

// =============================================================================
// Factory Functions - Create Test Data
// =============================================================================

/**
 * Create a test SelectedCourseData object
 */
export function createSelectedCourse(overrides?: Partial<SelectedCourseData>): SelectedCourseData {
    return {
        courseId: 'CS-1101',
        selectedSectionCrn: '12345',
        lockedSectionCrn: undefined,
        isRequired: true,
        timestamp: Date.now(),
        ...overrides,
    };
}

/**
 * Create a test ScheduleData object
 */
export function createSchedule(overrides?: Partial<ScheduleData>): ScheduleData {
    return {
        id: 'schedule-1',
        name: 'Test Schedule',
        selectedCourses: [
            createSelectedCourse({ courseId: 'CS-1101' }),
            createSelectedCourse({ courseId: 'CS-2303' }),
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
    const activeScheduleId = overrides?.activeScheduleId || schedules[0].id;
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
 * Create SyncData with multiple schedules
 */
export async function createSyncDataWithMultipleSchedules(count: number): Promise<SyncData> {
    const schedules: ScheduleData[] = [];
    for (let i = 0; i < count; i++) {
        schedules.push(
            createSchedule({
                id: `schedule-${i + 1}`,
                name: `Schedule ${i + 1}`,
                selectedCourses: [
                    createSelectedCourse({ courseId: `CS-${1000 + i}` }),
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
 * Create two different SyncData objects (conflicting data)
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
                    createSelectedCourse({ courseId: 'CS-1101' }),
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
                    createSelectedCourse({ courseId: 'CS-2303' }),
                    createSelectedCourse({ courseId: 'MA-1024' }),
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
// Time Manipulation
// =============================================================================

/**
 * Advance time and flush pending timers (for debounce testing)
 */
export async function advanceTimersByTime(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
}

/**
 * Wait for all pending promises to resolve
 */
export async function flushPromises(): Promise<void> {
    await vi.runAllTimersAsync();
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
