import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { IndexedDBStorageManager } from '../../src/core/storage/IndexedDBStorageManager';
import type { Schedule } from '../../src/types/schedule';
import { createMockSelectedCourse, createMockCourse } from '../helpers/mockData';
import type { MockIndexedDB } from '../mocks/MockIndexedDB';

/**
 * Unit Tests: IndexedDBStorageManager
 *
 * Tests the IndexedDB storage backend for schedules including:
 * - Initialization and compatibility checks
 * - CRUD operations (Create, Read, Update, Delete)
 * - LZString compression/decompression
 * - Error handling and recovery
 * - Storage stats calculation
 * - Batch operations
 */

// Helper to create a proper Schedule object for testing
function createMockSchedule(overrides?: Partial<Schedule>): Schedule {
    return {
        id: 'schedule-1',
        name: 'Test Schedule',
        selectedCourses: [],
        generatedSchedules: [],
        timestamp: Date.now(),
        ...overrides,
    };
}

describe('IndexedDBStorageManager', () => {
    let storageManager: IndexedDBStorageManager;
    let mockIndexedDB: MockIndexedDB;

    beforeEach(async () => {
        // Get global mock IndexedDB instance
        mockIndexedDB = (global as any).__mockIndexedDB__;
        mockIndexedDB.reset();

        // Create fresh storage manager
        storageManager = new IndexedDBStorageManager();
        await storageManager.initialize();
    });

    afterEach(async () => {
        await storageManager.close();
        mockIndexedDB.reset();
    });

    describe('Initialization', () => {
        it('should initialize successfully', async () => {
            const compatible = await storageManager.checkCompatibility();
            expect(compatible).toBe(true);
        });

        it('should handle multiple initialization calls', async () => {
            // Initialize multiple times (should use cached promise)
            await storageManager.initialize();
            await storageManager.initialize();
            await storageManager.initialize();

            // Should only call open once
            expect(mockIndexedDB.operations.open).toBe(1);
        });

        it('should create object stores on first run', async () => {
            const newManager = new IndexedDBStorageManager();
            await newManager.initialize();

            // Verify stores were created (implicit in mock, just check initialization works)
            const compatible = await newManager.checkCompatibility();
            expect(compatible).toBe(true);

            await newManager.close();
        });
    });

    describe('Save Schedule', () => {
        it('should save a schedule with compression', async () => {
            // Arrange
            const course = createMockCourse({ id: 'CS-1101' });
            const schedule = createMockSchedule({
                id: 'test-schedule-1',
                name: 'Test Schedule',
                selectedCourses: [
                    createMockSelectedCourse({ course })
                ]
            });

            // Act
            const result = await storageManager.saveSchedule(schedule);

            // Assert
            expect(result.success).toBe(true);
            expect(mockIndexedDB.hasKey('wpi-planner-db', 'schedules', 'test-schedule-1')).toBe(true);

            // Verify data was stored with compression
            const stored = mockIndexedDB.getRawData('wpi-planner-db', 'schedules', 'test-schedule-1');
            expect(stored).toBeDefined();
            expect(stored.id).toBe('test-schedule-1');
            expect(stored.serializedData).toBeDefined();
            expect(stored.compressed).toBe(true);
            expect(stored.timestamp).toBeDefined();
        });

        it('should update existing schedule', async () => {
            // Arrange: Save initial schedule
            const schedule = createMockSchedule({
                id: 'update-test',
                name: 'Original Name',
                selectedCourses: []
            });

            await storageManager.saveSchedule(schedule);

            // Act: Update schedule
            const course = createMockCourse({ id: 'CS-1101' });
            const updatedSchedule = createMockSchedule({
                id: 'update-test',
                name: 'Updated Name',
                selectedCourses: [createMockSelectedCourse({ course })]
            });

            const result = await storageManager.saveSchedule(updatedSchedule);

            // Assert
            expect(result.success).toBe(true);

            const loaded = await storageManager.loadSchedule('update-test');
            expect(loaded.success).toBe(true);
            expect(loaded.data?.name).toBe('Updated Name');
            expect(loaded.data?.selectedCourses).toHaveLength(1);
        });

        it('should save multiple schedules', async () => {
            // Arrange
            const schedules = [
                createMockSchedule({ id: 'schedule-1', name: 'Schedule 1' }),
                createMockSchedule({ id: 'schedule-2', name: 'Schedule 2' }),
                createMockSchedule({ id: 'schedule-3', name: 'Schedule 3' })
            ];

            // Act
            for (const schedule of schedules) {
                const result = await storageManager.saveSchedule(schedule);
                expect(result.success).toBe(true);
            }

            // Assert
            const allSchedules = await storageManager.loadAllSchedules();
            expect(allSchedules.success).toBe(true);
            expect(allSchedules.data).toHaveLength(3);
        });

        it('should add timestamp when saving', async () => {
            // Arrange
            const schedule = createMockSchedule({
                id: 'timestamp-test',
                name: 'Test'
            });

            // Act
            await storageManager.saveSchedule(schedule);

            // Assert: Stored data should have timestamp
            const stored = mockIndexedDB.getRawData('wpi-planner-db', 'schedules', 'timestamp-test');
            expect(stored.timestamp).toBeDefined();
            expect(stored.timestamp).toBeGreaterThan(0);
        });
    });

    describe('Load Schedule', () => {
        it('should load a saved schedule', async () => {
            // Arrange
            const course = createMockCourse({ id: 'CS-1101' });
            const section = { crn: 12345, number: 'SEC-1' } as any;
            const schedule = createMockSchedule({
                id: 'load-test',
                name: 'Load Test Schedule',
                selectedCourses: [
                    createMockSelectedCourse({
                        course,
                        selectedLecture: section,
                        isRequired: true
                    })
                ]
            });

            await storageManager.saveSchedule(schedule);

            // Act
            const result = await storageManager.loadSchedule('load-test');

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data?.id).toBe('load-test');
            expect(result.data?.name).toBe('Load Test Schedule');
            expect(result.data?.selectedCourses).toHaveLength(1);
            expect(result.data?.selectedCourses[0].course.id).toBe('CS-1101');
            expect(result.data?.selectedCourses[0].isRequired).toBe(true);
        });

        it('should return error for non-existent schedule', async () => {
            // Act
            const result = await storageManager.loadSchedule('non-existent-id');

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Schedule not found');
            expect(result.data).toBeUndefined();
        });

        it('should decompress stored data correctly', async () => {
            // Arrange: Save schedule (will be compressed)
            const schedule = createMockSchedule({
                id: 'decompress-test',
                name: 'Compression Test',
                selectedCourses: Array.from({ length: 10 }, (_: any, i: number) =>
                    createMockSelectedCourse({
                        course: createMockCourse({ id: `CS-${1000 + i}` })
                    })
                )
            });

            await storageManager.saveSchedule(schedule);

            // Act: Load (should decompress)
            const result = await storageManager.loadSchedule('decompress-test');

            // Assert: Data should be decompressed correctly
            expect(result.success).toBe(true);
            expect(result.data?.selectedCourses).toHaveLength(10);
        });

        it('should preserve special characters and unicode', async () => {
            // Arrange
            const schedule = createMockSchedule({
                id: 'unicode-test',
                name: 'Test: Special chars & émojis 🎓',
                selectedCourses: [
                    createMockSelectedCourse({
                        course: createMockCourse({ id: 'CS-1101' })
                    })
                ]
            });

            await storageManager.saveSchedule(schedule);

            // Act
            const result = await storageManager.loadSchedule('unicode-test');

            // Assert
            expect(result.success).toBe(true);
            expect(result.data?.name).toBe('Test: Special chars & émojis 🎓');
        });
    });

    describe('Load All Schedules', () => {
        it('should load all saved schedules', async () => {
            // Arrange: Save multiple schedules
            const schedules = [
                createMockSchedule({ id: 'sched-1', name: 'Schedule 1' }),
                createMockSchedule({ id: 'sched-2', name: 'Schedule 2' }),
                createMockSchedule({ id: 'sched-3', name: 'Schedule 3' })
            ];

            for (const schedule of schedules) {
                await storageManager.saveSchedule(schedule);
            }

            // Act
            const result = await storageManager.loadAllSchedules();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(3);

            const ids = result.data?.map((s: any) => s.id).sort();
            expect(ids).toEqual(['sched-1', 'sched-2', 'sched-3']);
        });

        it('should return empty array when no schedules exist', async () => {
            // Act
            const result = await storageManager.loadAllSchedules();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toEqual([]);
        });

        it('should decompress all schedules', async () => {
            // Arrange: Save schedules with data
            const schedules = Array.from({ length: 5 }, (_: any, i: number) =>
                createMockSchedule({
                    id: `schedule-${i}`,
                    name: `Schedule ${i}`,
                    selectedCourses: [createMockSelectedCourse({ course: createMockCourse({ id: `CS-${i}` }) })]
                })
            );

            for (const schedule of schedules) {
                await storageManager.saveSchedule(schedule);
            }

            // Act
            const result = await storageManager.loadAllSchedules();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(5);

            // Verify all schedules have their data intact
            result.data?.forEach((schedule: any, i: number) => {
                expect(schedule.name).toBe(`Schedule ${i}`);
                expect(schedule.selectedCourses).toHaveLength(1);
            });
        });
    });

    describe('Delete Schedule', () => {
        it('should delete a schedule', async () => {
            // Arrange
            const schedule = createMockSchedule({ id: 'delete-test', name: 'To Be Deleted' });
            await storageManager.saveSchedule(schedule);

            // Verify it exists
            expect(mockIndexedDB.hasKey('wpi-planner-db', 'schedules', 'delete-test')).toBe(true);

            // Act
            const result = await storageManager.deleteSchedule('delete-test');

            // Assert
            expect(result.success).toBe(true);
            expect(mockIndexedDB.hasKey('wpi-planner-db', 'schedules', 'delete-test')).toBe(false);

            // Verify it can't be loaded
            const loadResult = await storageManager.loadSchedule('delete-test');
            expect(loadResult.success).toBe(false);
        });

        it('should succeed when deleting non-existent schedule', async () => {
            // Act
            const result = await storageManager.deleteSchedule('non-existent-id');

            // Assert: IndexedDB delete succeeds even if key doesn't exist
            expect(result.success).toBe(true);
        });

        it('should only delete specified schedule', async () => {
            // Arrange: Save multiple schedules
            await storageManager.saveSchedule(createMockSchedule({ id: 'keep-1', name: 'Keep 1' }));
            await storageManager.saveSchedule(createMockSchedule({ id: 'delete-me', name: 'Delete' }));
            await storageManager.saveSchedule(createMockSchedule({ id: 'keep-2', name: 'Keep 2' }));

            // Act
            await storageManager.deleteSchedule('delete-me');

            // Assert
            const remaining = await storageManager.loadAllSchedules();
            expect(remaining.data).toHaveLength(2);

            const ids = remaining.data?.map((s: any) => s.id);
            expect(ids).toContain('keep-1');
            expect(ids).toContain('keep-2');
            expect(ids).not.toContain('delete-me');
        });
    });

    describe('Clear All Schedules', () => {
        it('should clear all schedules', async () => {
            // Arrange: Save multiple schedules
            for (let i = 0; i < 10; i++) {
                await storageManager.saveSchedule(
                    createMockSchedule({ id: `schedule-${i}`, name: `Schedule ${i}` })
                );
            }

            // Verify they exist
            const before = await storageManager.loadAllSchedules();
            expect(before.data).toHaveLength(10);

            // Act
            const result = await storageManager.clearAllSchedules();

            // Assert
            expect(result.success).toBe(true);

            const after = await storageManager.loadAllSchedules();
            expect(after.data).toHaveLength(0);
        });

        it('should succeed when clearing empty storage', async () => {
            // Act
            const result = await storageManager.clearAllSchedules();

            // Assert
            expect(result.success).toBe(true);

            const schedules = await storageManager.loadAllSchedules();
            expect(schedules.data).toHaveLength(0);
        });
    });

    describe('Storage Stats', () => {
        it('should calculate storage stats', async () => {
            // Arrange: Save schedules of various sizes
            await storageManager.saveSchedule(createMockSchedule({
                id: 'small',
                name: 'Small',
                selectedCourses: []
            }));

            await storageManager.saveSchedule(createMockSchedule({
                id: 'large',
                name: 'Large',
                selectedCourses: Array.from({ length: 20 }, (_: any, i: number) =>
                    createMockSelectedCourse({ course: createMockCourse({ id: `CS-${i}` }) })
                )
            }));

            // Act
            const result = await storageManager.getStorageStats();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data?.totalSchedules).toBe(2);
            expect(result.data?.estimatedSize).toBeGreaterThan(0);
            expect(result.data?.schedulesSizes).toBeDefined();
            expect(result.data?.schedulesSizes.has('small')).toBe(true);
            expect(result.data?.schedulesSizes.has('large')).toBe(true);

            // Large schedule should be bigger
            const smallSize = result.data?.schedulesSizes.get('small') || 0;
            const largeSize = result.data?.schedulesSizes.get('large') || 0;
            expect(largeSize).toBeGreaterThan(smallSize);
        });

        it('should return zero stats for empty storage', async () => {
            // Act
            const result = await storageManager.getStorageStats();

            // Assert
            expect(result.success).toBe(true);
            expect(result.data?.totalSchedules).toBe(0);
            expect(result.data?.estimatedSize).toBe(0);
            expect(result.data?.schedulesSizes.size).toBe(0);
        });
    });

    describe('Compression Efficiency', () => {
        it('should compress large schedules efficiently', async () => {
            // Arrange: Create schedule with repetitive data (compresses well)
            const largeSchedule = createMockSchedule({
                id: 'compression-test',
                name: 'Large Schedule',
                selectedCourses: Array.from({ length: 50 }, (_: any, i: number) =>
                    createMockSelectedCourse({
                        course: createMockCourse({ id: `CS-${1000 + i}` })
                    })
                )
            });

            // Act: Save (will compress)
            await storageManager.saveSchedule(largeSchedule);

            // Assert: Should be stored and loadable
            const result = await storageManager.loadSchedule('compression-test');
            expect(result.success).toBe(true);
            expect(result.data?.selectedCourses).toHaveLength(50);

            // Verify compression occurred (check stored format)
            const stored = mockIndexedDB.getRawData('wpi-planner-db', 'schedules', 'compression-test');
            expect(stored.compressed).toBe(true);
            expect(stored.serializedData).toBeDefined();
        });

        it('should handle large data sets without errors', async () => {
            // Arrange: Very large schedule
            const veryLargeSchedule = createMockSchedule({
                id: 'very-large',
                name: 'Very Large Schedule',
                selectedCourses: Array.from({ length: 200 }, (_: any, i: number) =>
                    createMockSelectedCourse({
                        course: createMockCourse({ id: `COURSE-${i}` })
                    })
                )
            });

            // Act
            const saveResult = await storageManager.saveSchedule(veryLargeSchedule);
            const loadResult = await storageManager.loadSchedule('very-large');

            // Assert: Should handle without errors
            expect(saveResult.success).toBe(true);
            expect(loadResult.success).toBe(true);
            expect(loadResult.data?.selectedCourses).toHaveLength(200);
        });
    });

    describe('Error Handling', () => {
        it('should handle transaction failures gracefully', async () => {
            // Arrange: Configure mock to fail
            mockIndexedDB.setConfig({ transactionFails: true });

            const schedule = createMockSchedule({ id: 'fail-test', name: 'Test' });

            // Act
            const saveResult = await storageManager.saveSchedule(schedule);

            // Assert
            expect(saveResult.success).toBe(false);
            expect(saveResult.error).toBeDefined();
        });

        it('should handle corrupted compressed data', async () => {
            // Arrange: Manually insert corrupted data using the mock API
            const db = await new Promise<IDBDatabase>((resolve: any, reject: any) => {
                const request = mockIndexedDB.open('wpi-planner-db', 1);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            await new Promise<void>((resolve: any, reject: any) => {
                const tx = db.transaction('schedules', 'readwrite');
                const store = tx.objectStore('schedules');

                const corruptedData = {
                    id: 'corrupted',
                    serializedData: 'INVALID_COMPRESSED_DATA',
                    compressed: true,
                    timestamp: Date.now()
                };

                const request = store.put(corruptedData);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            // Act: Try to load
            const result = await storageManager.loadSchedule('corrupted');

            // Assert: Should fail gracefully
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('Concurrent Operations', () => {
        it('should handle concurrent saves', async () => {
            // Arrange: Multiple schedules
            const schedules = Array.from({ length: 5 }, (_: any, i: number) =>
                createMockSchedule({ id: `concurrent-${i}`, name: `Concurrent ${i}` })
            );

            // Act: Save all concurrently
            const results = await Promise.all(
                schedules.map((s: any) => storageManager.saveSchedule(s))
            );

            // Assert: All should succeed
            results.forEach((result: any) => {
                expect(result.success).toBe(true);
            });

            // Verify all were saved
            const allSchedules = await storageManager.loadAllSchedules();
            expect(allSchedules.data).toHaveLength(5);
        });

        it('should handle save while loading', async () => {
            // Arrange: Save initial schedule
            const schedule = createMockSchedule({ id: 'concurrent-test', name: 'Test' });
            await storageManager.saveSchedule(schedule);

            // Act: Load and save concurrently
            const [loadResult, saveResult] = await Promise.all([
                storageManager.loadSchedule('concurrent-test'),
                storageManager.saveSchedule(createMockSchedule({ id: 'new-schedule', name: 'New' }))
            ]);

            // Assert: Both should succeed
            expect(loadResult.success).toBe(true);
            expect(saveResult.success).toBe(true);
        });
    });

    describe('Data Integrity', () => {
        it('should preserve exact schedule structure after save/load', async () => {
            // Arrange: Complex schedule
            const originalSchedule = createMockSchedule({
                id: 'integrity-test',
                name: 'Integrity Test',
                selectedCourses: [
                    createMockSelectedCourse({
                        course: createMockCourse({ id: 'CS-1101' }),
                        isRequired: true
                    }),
                    createMockSelectedCourse({
                        course: createMockCourse({ id: 'MA-1021' }),
                        isRequired: false
                    })
                ]
            });

            // Act: Save and load
            await storageManager.saveSchedule(originalSchedule);
            const loadResult = await storageManager.loadSchedule('integrity-test');

            // Assert: Structure should match (ignoring timestamp)
            expect(loadResult.success).toBe(true);
            const loaded = loadResult.data!;

            expect(loaded.id).toBe(originalSchedule.id);
            expect(loaded.name).toBe(originalSchedule.name);
            expect(loaded.selectedCourses).toHaveLength(originalSchedule.selectedCourses.length);

            // Check first course
            expect(loaded.selectedCourses[0].course.id).toBe('CS-1101');
            expect(loaded.selectedCourses[0].isRequired).toBe(true);

            // Check second course
            expect(loaded.selectedCourses[1].course.id).toBe('MA-1021');
            expect(loaded.selectedCourses[1].isRequired).toBe(false);
        });
    });
});
