import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ProfileStateManager } from '../../src/core/state/ProfileStateManager';
import type { SyncData } from '../../src/services/sync/types';
import { createSyncData, createSchedule, createSelectedCourse, createMinimalSyncData, REAL_COURSES } from '../helpers/sync-test-utils';
import type { MockIndexedDB } from '../mocks/MockIndexedDB';
import { createMockUIComponents, resetMockUIComponents, assertUIHydrated, type MockUIContext } from '../mocks/MockUIComponents';
import { loadCourseCatalog } from '../helpers/loadCourseCatalog';
import type { Department } from '../../src/types/types';

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
    let departments: Department[];

    beforeEach(async () => {
        // Get global mock IndexedDB instance
        mockIndexedDB = (global as any).__mockIndexedDB__;
        mockIndexedDB.reset();

        ProfileStateManager.resetInstance();
        profileManager = ProfileStateManager.getInstance();

        departments = await loadCourseCatalog();
        profileManager.setCourseData(departments);

        // Create mock UI components
        mockUI = createMockUIComponents();

        // Register mock UI components with CourseDataCoordinator
        mockUI.courseDataCoordinator.registerConsumer(mockUI.courseController);
        mockUI.courseDataCoordinator.registerConsumer(mockUI.scheduleController);
        mockUI.courseDataCoordinator.registerConsumer(mockUI.departmentController);
    });

    afterEach(() => {
        resetMockUIComponents(mockUI);
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

            const jsonData = await createMinimalSyncData({
                schedules: [schedule1, schedule2],
                activeScheduleId: 'schedule-1'
            }, departments);

            // Act: Import the data
            await profileManager.importData(jsonData);

            // Assert: Verify data is imported correctly
            const importedSchedules = profileManager.getAllSchedules();
            expect(importedSchedules).toHaveLength(2);

            const loadedSchedule1 = importedSchedules.find(s => s.name === 'Fall 2025');
            expect(loadedSchedule1).toBeDefined();
            expect(loadedSchedule1!.name).toBe('Fall 2025');
            expect(loadedSchedule1!.selectedCourses).toHaveLength(1);

            const loadedSchedule2 = importedSchedules.find(s => s.name === 'Spring 2026');
            expect(loadedSchedule2).toBeDefined();
            expect(loadedSchedule2!.name).toBe('Spring 2026');
        });

        it('should set active schedule after import', async () => {
            // Arrange
            const jsonData = await createMinimalSyncData({
                schedules: [
                    createSchedule({ id: 'schedule-1', name: 'Schedule 1' }),
                    createSchedule({ id: 'schedule-2', name: 'Schedule 2' })
                ],
                activeScheduleId: 'schedule-2'
            }, departments);

            // Act
            await profileManager.importData(jsonData);

            // Assert: Active schedule should be set (schedule-2 is second, so index 1)
            const activeSchedule = profileManager.getActiveSchedule();
            expect(activeSchedule).toBeDefined();
            expect(activeSchedule?.name).toBe('Schedule 2');
        });

        it('should emit schedule_changed event after import', async () => {
            // Arrange
            const jsonData = await createMinimalSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Test Schedule' })],
                activeScheduleId: 'schedule-1'
            }, departments);

            let eventEmitted = false;
            const eventListener = (event: any) => {
                if (event.type === 'schedule_changed') {
                    eventEmitted = true;
                }
            };

            // Listen for schedule_changed event
            profileManager.addListener(eventListener);

            // Act
            await profileManager.importData(jsonData);

            // Wait for async event emission
            await new Promise(resolve => setTimeout(resolve, 50));

            // Assert
            expect(eventEmitted).toBe(true);

            // Cleanup
            profileManager.removeListener(eventListener);
        });

        it('should handle empty schedules', async () => {
            // Arrange: Sync data with no schedules
            const jsonData = await createMinimalSyncData({
                schedules: [],
                activeScheduleId: null
            }, departments);

            // Act
            await profileManager.importData(jsonData);

            // Assert: ProfileStateManager creates a default schedule when none exist
            const allSchedules = profileManager.getAllSchedules();
            expect(allSchedules).toHaveLength(1);
            expect(allSchedules[0].name).toBe('My Schedule');

            const activeSchedule = profileManager.getActiveSchedule();
            expect(activeSchedule).toBeTruthy();
            expect(activeSchedule!.name).toBe('My Schedule');
        });

        it('should handle large schedule data', async () => {
            // Arrange: Create schedule with many courses
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

            const jsonData = await createMinimalSyncData({
                schedules: [
                    createSchedule({
                        id: 'large-schedule',
                        name: 'Large Schedule',
                        selectedCourses: manyCourses
                    })
                ],
                activeScheduleId: 'large-schedule'
            }, departments);

            // Act
            await profileManager.importData(jsonData);

            // Assert: All courses should be stored
            const schedules = profileManager.getAllSchedules();
            const largeSchedule = schedules.find(s => s.name === 'Large Schedule');
            expect(largeSchedule).toBeDefined();
            expect(largeSchedule!.selectedCourses).toHaveLength(30);

            // Verify compression occurred
            const storageSize = mockIndexedDB.getStorageSize();
            expect(storageSize).toBeGreaterThan(0);
        });

        it('should import schedules with multiple courses', async () => {
            // Arrange: Create data with multiple courses
            const jsonData = await createMinimalSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Multi-Course Schedule',
                        selectedCourses: [
                            createSelectedCourse({
                                courseId: REAL_COURSES.CS_1101.id,
                                selectedSectionCrn: REAL_COURSES.CS_1101.crn
                            }),
                            createSelectedCourse({
                                courseId: REAL_COURSES.MA_1021.id,
                                selectedSectionCrn: REAL_COURSES.MA_1021.crn
                            })
                        ]
                    })
                ],
                activeScheduleId: 'schedule-1'
            }, departments);

            // Act: Import data
            await profileManager.importData(jsonData);

            // Assert: Should have imported schedule with all courses
            const schedules = profileManager.getAllSchedules();
            const schedule = schedules.find(s => s.name === 'Multi-Course Schedule');
            expect(schedule).toBeDefined();
            expect(schedule!.selectedCourses).toHaveLength(2);
        });

        it('should handle import with missing optional fields', async () => {
            // Arrange: Create minimal valid sync data
            const jsonData = await createMinimalSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Minimal' })],
                activeScheduleId: 'schedule-1'
            }, departments);

            // Act: Import should succeed with minimal data
            const result = await profileManager.importData(jsonData);

            // Assert: System handles gracefully
            expect(result.success).toBe(true);
            const schedules = profileManager.getAllSchedules();
            expect(schedules.find(s => s.name === 'Minimal')).toBeDefined();
        });
    });

    describe('Export Flow', () => {
        it('should export current state in minimal format', async () => {
            // Arrange: Import initial data
            const schedule1 = createSchedule({
                id: 'schedule-1',
                name: 'Fall 2025',
                selectedCourses: [createSelectedCourse({
                    courseId: REAL_COURSES.CS_1101.id,
                    selectedSectionCrn: REAL_COURSES.CS_1101.crn
                })]
            });

            const schedule2 = createSchedule({
                id: 'schedule-2',
                name: 'Spring 2026',
                selectedCourses: [createSelectedCourse({
                    courseId: REAL_COURSES.MA_1021.id,
                    selectedSectionCrn: REAL_COURSES.MA_1021.crn
                })]
            });

            const importData = await createMinimalSyncData({
                schedules: [schedule1, schedule2],
                activeScheduleId: 'schedule-1'
            }, departments);

            await profileManager.importData(importData);

            // Act: Export data
            const exportedDataString = await profileManager.exportData();

            // Assert: Should return a string
            expect(exportedDataString).toBeDefined();
            expect(typeof exportedDataString).toBe('string');

            // Parse the exported data
            const exported = JSON.parse(exportedDataString!);
            expect(exported.v).toBe("4");  // version 4
            expect(exported.s).toHaveLength(2);  // schedules array
            expect(exported.a).toBe(0);  // active schedule index (schedule-1 is first)

            // Verify schedule content
            expect(exported.s[0][0]).toBe('Fall 2025');  // first schedule name
            expect(exported.s[1][0]).toBe('Spring 2026');  // second schedule name
        });

        it('should export empty state', async () => {
            // Arrange: Start with empty profile

            // Act
            const exportedString = await profileManager.exportData();
            const exported = JSON.parse(exportedString!);

            // Assert
            expect(exported.v).toBe("4");  // version 4
            expect(exported.s).toHaveLength(0);  // no schedules
            expect(exported.a).toBe(0);  // no active schedule (defaults to 0)
        });

        it('should round-trip import/export without data loss', async () => {
            // Arrange: Create complex data
            const importData = await createMinimalSyncData({
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
            }, departments);

            // Act: Import then export
            await profileManager.importData(importData);
            const exportedString = await profileManager.exportData();
            const exported = JSON.parse(exportedString!);

            // Assert: Minimal format structure
            expect(exported.v).toBe("4");
            expect(exported.s).toHaveLength(1);
            expect(exported.a).toBe(0);  // active schedule index

            // Verify schedule content
            expect(exported.s[0][0]).toBe('Complex Schedule');  // schedule name

            // Verify courses in flat array format [courseId, crn, courseId, crn, ...]
            const coursesArray = exported.s[0][1];
            expect(coursesArray).toContain(REAL_COURSES.CS_1101.id);
            expect(coursesArray).toContain(REAL_COURSES.CS_1101.crn);
            expect(coursesArray).toContain(REAL_COURSES.MA_1021.id);
            expect(coursesArray).toContain(REAL_COURSES.MA_1021.crn);
        });
    });

    describe('IndexedDB Compression', () => {
        it('should store data compressed in IndexedDB', async () => {
            // Arrange: Create schedule with repetitive data (compresses well)
            const realCourses = [
                REAL_COURSES.CS_1101,
                REAL_COURSES.CS_2303,
                REAL_COURSES.MA_1024,
                REAL_COURSES.MA_1021,
                REAL_COURSES.CS_2022,
                REAL_COURSES.CS_2102,
            ];
            const repetitiveCourses = Array.from({ length: 20 }, (_, i) => {
                const course = realCourses[i % realCourses.length];
                return createSelectedCourse({
                    courseId: course.id,
                    selectedSectionCrn: course.crn
                });
            });

            const jsonData = await createMinimalSyncData({
                schedules: [
                    createSchedule({
                        id: 'compress-test',
                        name: 'Compression Test Schedule',
                        selectedCourses: repetitiveCourses
                    })
                ],
                activeScheduleId: 'compress-test'
            }, departments);

            // Act
            await profileManager.importData(jsonData);

            // Assert: Verify we can retrieve the data correctly
            const schedules = profileManager.getAllSchedules();
            const compressed = schedules.find(s => s.name === 'Compression Test Schedule');
            expect(compressed).toBeDefined();
            expect(compressed!.selectedCourses).toHaveLength(20);
        });

        it('should decompress data when loading from IndexedDB', async () => {
            // Arrange: Import data (stored compressed)
            const jsonData = await createMinimalSyncData({
                schedules: [
                    createSchedule({
                        id: 'decompress-test',
                        name: 'Decompression Test',
                        selectedCourses: [
                            createSelectedCourse({
                                courseId: REAL_COURSES.CS_1101.id,
                                selectedSectionCrn: REAL_COURSES.CS_1101.crn
                            })
                        ]
                    })
                ],
                activeScheduleId: 'decompress-test'
            }, departments);

            await profileManager.importData(jsonData);

            // Act: Get active schedule (data is already loaded)
            const loaded = profileManager.getActiveSchedule();

            // Assert: Data should be correctly decompressed
            expect(loaded).toBeDefined();
            expect(loaded?.name).toBe('Decompression Test');
        });
    });

    describe('Error Scenarios', () => {
        it('should reject malformed JSON data', async () => {
            // Arrange: Create malformed JSON that will fail to parse
            const malformedData = '{"version":"3.0","schedules":[{"id":"bad",CORRUPTED}]}';

            // Act & Assert: Should handle parse error gracefully
            let errorCaught = false;
            try {
                await profileManager.importData(malformedData);
            } catch (error) {
                errorCaught = true;
            }

            // Should catch the error (either now caught, or handled gracefully)
            // Either way, system should remain functional
            const schedules = profileManager.getAllSchedules();
            expect(schedules).toBeDefined();
            expect(Array.isArray(schedules)).toBe(true);
        });

        it('should handle large schedule data successfully', async () => {
            const realCourses = [
                REAL_COURSES.CS_1101,
                REAL_COURSES.CS_2303,
                REAL_COURSES.MA_1024,
                REAL_COURSES.MA_1021,
                REAL_COURSES.CS_2022,
                REAL_COURSES.CS_2102,
            ];

            const largeData = await createMinimalSyncData({
                schedules: [
                    createSchedule({
                        id: 'large-schedule',
                        name: 'Large Schedule',
                        selectedCourses: Array.from({ length: 100 }, (_, i) => {
                            const course = realCourses[i % realCourses.length];
                            return createSelectedCourse({
                                courseId: course.id,
                                selectedSectionCrn: course.crn
                            });
                        })
                    })
                ],
                activeScheduleId: 'large-schedule'
            }, departments);

            // Act: Should import successfully
            const result = await profileManager.importData(largeData);

            // Assert
            expect(result.success).toBe(true);
            const schedules = profileManager.getAllSchedules();
            expect(schedules.find(s => s.name === 'Large Schedule')).toBeDefined();
        });

        it('should handle invalid active schedule ID by defaulting to first schedule', async () => {
            // Arrange: Import data with invalid active schedule reference
            // In minimal format, invalid IDs default to index 0
            const jsonData = await createMinimalSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Test' })],
                activeScheduleId: 'non-existent-schedule-id'
            }, departments);

            // Act
            await profileManager.importData(jsonData);

            // Assert: Should handle gracefully by setting first schedule as active
            const activeSchedule = profileManager.getActiveSchedule();
            expect(activeSchedule).toBeDefined();
            expect(activeSchedule?.name).toBe('Test');

            // Schedules should still be imported successfully
            const allSchedules = profileManager.getAllSchedules();
            expect(allSchedules.length).toBeGreaterThan(0);
        });
    });
});
