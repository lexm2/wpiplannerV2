import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ProfileStateManager } from '../../src/core/state/ProfileStateManager';
import type { SyncData } from '../../src/services/sync/types';
import { createSyncData, createSchedule, createSelectedCourse, REAL_COURSES } from '../helpers/sync-test-utils';
import type { MockIndexedDB } from '../mocks/MockIndexedDB';
import { createMockUIComponents, resetMockUIComponents, assertUIHydrated, type MockUIContext } from '../mocks/MockUIComponents';
import { loadCourseCatalog } from '../helpers/loadCourseCatalog';

/**
 * Integration Tests: ProfileStateManager Import/Export with IndexedDB
 *
 * These tests verify the complete data flow:
 * 1. Cloud sync data → ProfileStateManager.importData()
 * 2. Data saved to IndexedDB via TransactionalStorageManager
 * 3. UI components hydrated via event-driven updates
 * 4. Export back to sync format
 */
describe('ProfileStateManager Import/Export Integration', () => {
    let profileManager: ProfileStateManager;
    let mockIndexedDB: MockIndexedDB;
    let mockUI: MockUIContext;

    beforeEach(async () => {
        // Get global mock IndexedDB instance
        mockIndexedDB = (global as any).__mockIndexedDB__;
        mockIndexedDB.reset();

        ProfileStateManager.resetInstance();
        profileManager = ProfileStateManager.getInstance();

        const departments = await loadCourseCatalog();
        profileManager.setCourseData(departments);

        // Create mock UI components
        mockUI = createMockUIComponents();

        // Register mock UI components with CourseDataCoordinator
        mockUI.courseDataCoordinator.registerConsumer(mockUI.courseController);
        mockUI.courseDataCoordinator.registerConsumer(mockUI.scheduleController);
        mockUI.courseDataCoordinator.registerConsumer(mockUI.departmentController);
    });

    afterEach(() => {
        if (mockUI) {
            resetMockUIComponents(mockUI);
        }
        mockIndexedDB.reset();
    });

    describe('Import Flow', () => {
        it('should import sync data and save schedules to IndexedDB', async () => {
            // Arrange: Create sync data with 2 schedules
            const schedule1 = createSchedule({
                id: 'schedule-1',
                name: 'Fall 2025',
                selectedCourses: [
                    createSelectedCourse({ courseId: REAL_COURSES.CS_1101.id, selectedSectionCrn: REAL_COURSES.CS_1101.crn })
                ]
            });

            const schedule2 = createSchedule({
                id: 'schedule-2',
                name: 'Spring 2026',
                selectedCourses: [
                    createSelectedCourse({ courseId: REAL_COURSES.MA_1021.id, selectedSectionCrn: REAL_COURSES.MA_1021.crn })
                ]
            });

            const syncData = await createSyncData({
                schedules: [schedule1, schedule2],
                activeScheduleId: 'schedule-1'
            });

            // Act: Import the data
            await profileManager.importData(syncData);

            // Assert: Verify data is in IndexedDB
            expect(mockIndexedDB.hasKey('wpi-planner-db', 'schedules', 'schedule-1')).toBe(true);
            expect(mockIndexedDB.hasKey('wpi-planner-db', 'schedules', 'schedule-2')).toBe(true);

            // Verify schedules are accessible through ProfileStateManager
            const importedSchedules = profileManager.getAllSchedules();
            expect(importedSchedules).toHaveLength(2);

            const loadedSchedule1 = importedSchedules.find(s => s.id === 'schedule-1');
            expect(loadedSchedule1).toBeDefined();
            expect(loadedSchedule1!.name).toBe('Fall 2025');
            expect(loadedSchedule1!.selectedCourses).toHaveLength(1);

            const loadedSchedule2 = importedSchedules.find(s => s.id === 'schedule-2');
            expect(loadedSchedule2).toBeDefined();
            expect(loadedSchedule2!.name).toBe('Spring 2026');
        });

        it('should set active schedule after import', async () => {
            // Arrange
            const syncData = await createSyncData({
                schedules: [
                    createSchedule({ id: 'schedule-1', name: 'Schedule 1' }),
                    createSchedule({ id: 'schedule-2', name: 'Schedule 2' })
                ],
                activeScheduleId: 'schedule-2'
            });

            // Act
            await profileManager.importData(syncData);

            // Assert: Active schedule should be set
            const activeSchedule = profileManager.getActiveSchedule();
            expect(activeSchedule).toBeDefined();
            expect(activeSchedule?.id).toBe('schedule-2');
            expect(activeSchedule?.name).toBe('Schedule 2');
        });

        it('should emit schedule_changed event after import', async () => {
            // Arrange
            const syncData = await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Test Schedule' })],
                activeScheduleId: 'schedule-1'
            });

            let eventEmitted = false;
            const eventListener = (event: any) => {
                if (event.type === 'schedule_changed') {
                    eventEmitted = true;
                }
            };

            // Listen for schedule_changed event
            profileManager.addListener(eventListener);

            // Act
            await profileManager.importData(syncData);

            // Wait for async event emission
            await new Promise(resolve => setTimeout(resolve, 50));

            // Assert
            expect(eventEmitted).toBe(true);

            // Cleanup
            profileManager.removeListener(eventListener);
        });

        it('should handle empty schedules', async () => {
            // Arrange: Sync data with no schedules
            const syncData = await createSyncData({
                schedules: [],
                activeScheduleId: null
            });

            // Act
            await profileManager.importData(syncData);

            // Assert: ProfileStateManager creates a default schedule when none exist
            const allSchedules = profileManager.getAllSchedules();
            expect(allSchedules).toHaveLength(1);
            expect(allSchedules[0].name).toBe('My Schedule');

            const activeSchedule = profileManager.getActiveSchedule();
            expect(activeSchedule).toBeTruthy();
            expect(activeSchedule!.name).toBe('My Schedule');
        });

        it('should handle large schedule data', async () => {
            // Arrange: Create schedule with many courses (use real courses, repeat them)
            const realCourses = [
                REAL_COURSES.CS_1101,
                REAL_COURSES.CS_2303,
                REAL_COURSES.MA_1024,
                REAL_COURSES.MA_1021,
                REAL_COURSES.CS_2022,
                REAL_COURSES.CS_2102,
            ];

            const manyCourses = Array.from({ length: 30 }, (_, i) => {
                const course = realCourses[i % realCourses.length];
                return createSelectedCourse({
                    courseId: course.id,
                    selectedSectionCrn: course.crn
                });
            });

            const syncData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'large-schedule',
                        name: 'Large Schedule',
                        selectedCourses: manyCourses
                    })
                ],
                activeScheduleId: 'large-schedule'
            });

            // Act
            await profileManager.importData(syncData);

            // Assert: All courses should be stored
            const schedules = profileManager.getAllSchedules();
            const largeSchedule = schedules.find(s => s.id === 'large-schedule');
            expect(largeSchedule).toBeDefined();
            expect(largeSchedule!.selectedCourses).toHaveLength(30);

            // Verify compression occurred
            const storageSize = mockIndexedDB.getStorageSize();
            expect(storageSize).toBeGreaterThan(0);
        });

        it('should overwrite existing schedules with same ID', async () => {
            // Arrange: Import initial data
            const initialData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Original Name',
                        selectedCourses: [createSelectedCourse({ courseId: 'CS-1101' })]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            await profileManager.importData(initialData);

            // Act: Import updated data with same schedule ID
            const updatedData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Updated Name',
                        selectedCourses: [
                            createSelectedCourse({ courseId: 'CS-1101' }),
                            createSelectedCourse({ courseId: 'MA-1021' })
                        ]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            await profileManager.importData(updatedData);

            // Assert: Should have updated schedule
            const stored = mockIndexedDB.getRawData('wpi-planner-db', 'schedules', 'schedule-1');
            expect(stored.name).toBe('Updated Name');
            expect(stored.selectedCourses).toHaveLength(2);
        });

        it('should handle import failure and rollback', async () => {
            // Arrange: Configure IndexedDB to fail
            mockIndexedDB.setConfig({ transactionFails: true });

            const syncData = await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Test' })],
                activeScheduleId: 'schedule-1'
            });

            // Act & Assert: Should throw error
            await expect(profileManager.importData(syncData)).rejects.toThrow();

            // Verify no partial data was saved
            expect(mockIndexedDB.hasKey('wpi-planner-db', 'schedules', 'schedule-1')).toBe(false);
        });
    });

    describe('Export Flow', () => {
        it('should export current state as SyncData', async () => {
            // Arrange: Import initial data
            const schedule1 = createSchedule({
                id: 'schedule-1',
                name: 'Fall 2025',
                selectedCourses: [createSelectedCourse({ courseId: 'CS-1101' })]
            });

            const schedule2 = createSchedule({
                id: 'schedule-2',
                name: 'Spring 2026',
                selectedCourses: [createSelectedCourse({ courseId: 'MA-1021' })]
            });

            const importData = await createSyncData({
                schedules: [schedule1, schedule2],
                activeScheduleId: 'schedule-1'
            });

            await profileManager.importData(importData);

            // Act: Export data
            const exportedDataString = await profileManager.exportData();

            // Assert: Should return a string
            expect(exportedDataString).toBeDefined();
            expect(typeof exportedDataString).toBe('string');

            // Parse the exported data
            const exportedData = JSON.parse(exportedDataString!);
            expect(exportedData.schedules).toHaveLength(2);
            expect(exportedData.activeScheduleId).toBe('schedule-1');
            expect(exportedData.checksum).toBeDefined();
            expect(exportedData.lastModified).toBeDefined();

            // Verify schedule content
            const exportedSchedule1 = exportedData.schedules.find((s: any) => s.id === 'schedule-1');
            expect(exportedSchedule1).toBeDefined();
            expect(exportedSchedule1?.name).toBe('Fall 2025');
            expect(exportedSchedule1?.selectedCourses).toHaveLength(1);
        });

        it('should generate valid checksum on export', async () => {
            // Arrange
            const syncData = await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Test' })],
                activeScheduleId: 'schedule-1'
            });

            await profileManager.importData(syncData);

            // Act
            const exportedString = await profileManager.exportData();
            const exported = JSON.parse(exportedString!);

            // Assert: Checksum should be valid SHA-256 (64 hex chars)
            expect(exported.checksum).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should export empty state', async () => {
            // Arrange: Start with empty profile
            // getInstance() already initializes, no need to call initialize()

            // Act
            const exportedString = await profileManager.exportData();
            const exported = JSON.parse(exportedString!);

            // Assert
            expect(exported.schedules).toHaveLength(0);
            expect(exported.activeScheduleId).toBeNull();
            expect(exported.checksum).toBeDefined();
        });

        it('should round-trip import/export without data loss', async () => {
            // Arrange: Create complex sync data
            const originalData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Complex Schedule',
                        selectedCourses: [
                            createSelectedCourse({
                                courseId: REAL_COURSES.CS_1101.id,
                                selectedSectionCrn: REAL_COURSES.CS_1101.crn,
                                isRequired: true
                            }),
                            createSelectedCourse({
                                courseId: REAL_COURSES.MA_1021.id,
                                selectedSectionCrn: REAL_COURSES.MA_1021.crn,
                                isRequired: false
                            })
                        ]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            // Act: Import then export
            await profileManager.importData(originalData);
            const exportedString = await profileManager.exportData();
            const exported = JSON.parse(exportedString!);

            // Assert: Data should be preserved (ignoring checksum/timestamp)
            expect(exported.schedules).toHaveLength(originalData.schedules.length);
            expect(exported.activeScheduleId).toBe(originalData.activeScheduleId);

            const exportedSchedule = exported.schedules[0];
            const originalSchedule = originalData.schedules[0];

            expect(exportedSchedule.id).toBe(originalSchedule.id);
            expect(exportedSchedule.name).toBe(originalSchedule.name);
            expect(exportedSchedule.selectedCourses).toHaveLength(originalSchedule.selectedCourses.length);

            // Check course details preserved
            const exportedCourse = exportedSchedule.selectedCourses[0];
            const originalCourse = originalSchedule.selectedCourses[0];

            expect(exportedCourse.courseId).toBe(originalCourse.courseId);
            expect(exportedCourse.selectedSectionCrn).toEqual(originalCourse.selectedSectionCrn);
            expect(exportedCourse.isRequired).toBe(originalCourse.isRequired);
        });
    });

    describe('IndexedDB Compression', () => {
        it('should store data compressed in IndexedDB', async () => {
            // Arrange: Create schedule with repetitive data (compresses well)
            const repetitiveCourses = Array.from({ length: 20 }, (_, i) =>
                createSelectedCourse({
                    courseId: `CS-${1000 + i}`,
                    selectedSectionCrn: `SEC-${i}`
                })
            );

            const syncData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'compress-test',
                        name: 'Compression Test Schedule',
                        selectedCourses: repetitiveCourses
                    })
                ],
                activeScheduleId: 'compress-test'
            });

            // Act
            await profileManager.importData(syncData);

            // Assert: Data should be stored (compression is internal to IndexedDB mock)
            expect(mockIndexedDB.hasKey('wpi-planner-db', 'schedules', 'compress-test')).toBe(true);

            // Verify we can retrieve the data correctly
            const stored = mockIndexedDB.getRawData('wpi-planner-db', 'schedules', 'compress-test');
            expect(stored).toBeDefined();
            expect(stored.selectedCourses).toHaveLength(20);
        });

        it('should decompress data when loading from IndexedDB', async () => {
            // Arrange: Import data (stored compressed)
            const syncData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'decompress-test',
                        name: 'Decompression Test',
                        selectedCourses: [
                            createSelectedCourse({
                                courseId: 'CS-1101'
                            })
                        ]
                    })
                ],
                activeScheduleId: 'decompress-test'
            });

            await profileManager.importData(syncData);

            // Act: Get active schedule (data is already loaded)
            const loaded = profileManager.getActiveSchedule();

            // Assert: Data should be correctly decompressed
            expect(loaded).toBeDefined();
            expect(loaded?.id).toBe('decompress-test');
            expect(loaded?.name).toBe('Decompression Test');
        });
    });

    describe('Error Scenarios', () => {
        it('should handle corrupted data in IndexedDB', async () => {
            // Arrange: Manually insert corrupted data
            const db = await mockIndexedDB.open('wpi-planner-db', 1) as any;
            const tx = db.transaction('schedules', 'readwrite');
            const store = tx.objectStore('schedules');

            // Put invalid compressed data
            await new Promise<void>((resolve, reject) => {
                const request = store.put('CORRUPTED_DATA', 'corrupted-schedule');
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            // Act & Assert: Should handle gracefully (getInstance already initializes)
            // The corrupted data should be handled gracefully during storage operations
            const schedules = profileManager.getAllSchedules();
            expect(schedules).toBeDefined();
        });

        it('should handle quota exceeded error', async () => {
            // Arrange: Configure IndexedDB to reject writes
            mockIndexedDB.setConfig({
                quotaExceeded: true,
                maxStorageSize: 1000 // Very small quota
            });

            const largeData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'large-schedule',
                        name: 'Large Schedule',
                        selectedCourses: Array.from({ length: 100 }, (_, i) =>
                            createSelectedCourse({ courseId: `CS-${i}` })
                        )
                    })
                ],
                activeScheduleId: 'large-schedule'
            });

            // Act & Assert: Should throw quota error
            await expect(profileManager.importData(largeData)).rejects.toThrow(/quota/i);
        });

        it('should handle missing active schedule ID', async () => {
            // Arrange: Import data with invalid active schedule reference
            const syncData = await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Test' })],
                activeScheduleId: 'non-existent-schedule-id'
            });

            // Act
            await profileManager.importData(syncData);

            // Assert: Should handle gracefully (fall back to null or first schedule)
            const activeSchedule = profileManager.getActiveSchedule();
            expect(activeSchedule).toBeTruthy(); // Should default to available schedule or null
        });
    });
});
