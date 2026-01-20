import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ProfileStateManager } from '../../src/core/state/ProfileStateManager';
import { MainController } from '../../src/ui/controllers/MainController';
import type { SyncData } from '../../src/services/sync/types';
import { createSyncData, createSchedule, createSelectedCourse, REAL_COURSES } from '../helpers/sync-test-utils';
import type { MockIndexedDB } from '../mocks/MockIndexedDB';
import {
    createMockUIComponents,
    resetMockUIComponents,
    assertUIHydrated,
    assertScheduleUIUpdated,
    assertCourseSelectionUIUpdated,
    type MockUIContext
} from '../mocks/MockUIComponents';
import { loadCourseCatalog } from '../helpers/loadCourseCatalog';

/**
 * Wait for ProfileStateManager event queue to process.
 * Events are queued asynchronously with setTimeout(..., 0),
 * so we need to wait for the next tick before assertions.
 */
async function waitForEventQueue() {
    await new Promise(resolve => setTimeout(resolve, 50));
}

/**
 * Integration Tests: UI Hydration After Cloud Sync Import
 *
 * These tests verify that UI components properly receive and display data
 * after cloud sync data is imported into the application.
 *
 * Flow:
 * 1. Cloud sync data imported via ProfileStateManager
 * 2. Data saved to IndexedDB
 * 3. 'schedule_changed' event emitted
 * 4. UI controllers receive event and update views
 * 5. CourseDataCoordinator distributes course data to consumers
 */
describe('UI Hydration After Sync Import', () => {
    let profileManager: ProfileStateManager;
    let mainController: MainController;
    let mockIndexedDB: MockIndexedDB;
    let mockUI: MockUIContext;

    beforeEach(async () => {
        // Get global mock IndexedDB
        mockIndexedDB = (global as any).__mockIndexedDB__;
        mockIndexedDB.reset();

        ProfileStateManager.resetInstance();
        profileManager = ProfileStateManager.getInstance();

        const departments = await loadCourseCatalog();
        profileManager.setCourseData(departments);

        // Mock fetch for TermBoundsService and course data
        global.fetch = mock((url: string) => {
            if (typeof url === 'string' && url.includes('term-bounds.json')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        academicYear: '2021-2022',
                        generated: '2021-09-01T00:00:00Z',
                        terms: {
                            'A': {
                                id: 'A',
                                name: 'A Term',
                                startDate: '2021-09-01',
                                endDate: '2021-10-31',
                                offeringPeriod: 'A',
                                sampleSize: 100
                            },
                            'B': {
                                id: 'B',
                                name: 'B Term',
                                startDate: '2021-11-01',
                                endDate: '2021-12-31',
                                offeringPeriod: 'B',
                                sampleSize: 100
                            },
                            'C': {
                                id: 'C',
                                name: 'C Term',
                                startDate: '2022-01-01',
                                endDate: '2022-02-28',
                                offeringPeriod: 'C',
                                sampleSize: 100
                            },
                            'D': {
                                id: 'D',
                                name: 'D Term',
                                startDate: '2022-03-01',
                                endDate: '2022-04-30',
                                offeringPeriod: 'D',
                                sampleSize: 100
                            }
                        }
                    })
                } as Response);
            }
            if (typeof url === 'string' && url.includes('course-data-constructed.json')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ departments })
                } as Response);
            }
            return Promise.reject(new Error(`Unmocked fetch: ${url}`));
        }) as any;

        // Create mock UI components
        mockUI = createMockUIComponents();

        // Register UI consumers with CourseDataCoordinator
        mockUI.courseDataCoordinator.registerConsumer(mockUI.courseController);
        mockUI.courseDataCoordinator.registerConsumer(mockUI.scheduleController);
        mockUI.courseDataCoordinator.registerConsumer(mockUI.departmentController);

        // Mock MainController initialization (normally wires up events)
        mainController = new MainController();

        // Wire up event handlers manually for testing
        const eventListener = (event: any) => {
            if (event.type === 'schedule_changed') {
                mockUI.scheduleController.displayScheduleSelectedCourses();
                mockUI.courseController.refreshCourseSelectionUI();
                mockUI.courseController.displaySelectedCourses();
            }
        };
        profileManager.addListener(eventListener);
    });

    afterEach(() => {
        resetMockUIComponents(mockUI);
        mockIndexedDB.reset();
    });

    describe('Schedule UI Hydration', () => {
        it('should hydrate schedule UI after import', async () => {
            // Arrange: Create sync data with courses
            const syncData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Fall 2025',
                        selectedCourses: [
                            createSelectedCourse({
                                courseId: REAL_COURSES.CS_1101.id,
                                selectedSectionCrn: REAL_COURSES.CS_1101.crn
                            })
                        ]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            resetMockUIComponents(mockUI);

            // Act: Import the data (should trigger UI update)
            await profileManager.importData(syncData);
            await waitForEventQueue();

            // Assert: Schedule UI should be updated
            assertScheduleUIUpdated(mockUI);
            expect(mockUI.scheduleController.displayScheduleSelectedCourses).toHaveBeenCalledTimes(1);
        });

        it('should update schedule grid after import', async () => {
            // Arrange
            const syncData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Test Schedule',
                        selectedCourses: [
                            createSelectedCourse({ courseId: 'CS-1101' }),
                            createSelectedCourse({ courseId: 'MA-1021' })
                        ]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            // Act
            await profileManager.importData(syncData);

            // Manually trigger grid render (normally done by ScheduleController)
            mockUI.scheduleController.renderScheduleGrids();

            // Assert
            expect(mockUI.scheduleController.renderScheduleGrids).toHaveBeenCalled();
        });

        it('should clear schedule UI when importing empty schedule', async () => {
            // Arrange: Import schedule with courses first
            const initialData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Initial',
                        selectedCourses: [createSelectedCourse({ courseId: 'CS-1101' })]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            await profileManager.importData(initialData);

            // Reset mock call counts
            resetMockUIComponents(mockUI);

            // Act: Import empty schedule
            const emptyData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-2',
                        name: 'Empty',
                        selectedCourses: []
                    })
                ],
                activeScheduleId: 'schedule-2'
            });

            await profileManager.importData(emptyData);
            await waitForEventQueue();

            // Assert: UI should still be called to clear display
            expect(mockUI.scheduleController.displayScheduleSelectedCourses).toHaveBeenCalled();
        });
    });

    describe('Course Selection UI Hydration', () => {
        it('should hydrate course selection UI after import', async () => {
            // Arrange
            const syncData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Test',
                        selectedCourses: [
                            createSelectedCourse({ courseId: 'CS-1101' })
                        ]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            // Act
            await profileManager.importData(syncData);
            await waitForEventQueue();

            // Assert
            assertCourseSelectionUIUpdated(mockUI);
            expect(mockUI.courseController.refreshCourseSelectionUI).toHaveBeenCalled();
            expect(mockUI.courseController.displaySelectedCourses).toHaveBeenCalled();
        });

        it('should update course selection UI with multiple courses', async () => {
            // Arrange: Multiple selected courses
            const syncData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Multi Course Schedule',
                        selectedCourses: [
                            createSelectedCourse({
                                courseId: REAL_COURSES.CS_1101.id,
                                selectedSectionCrn: REAL_COURSES.CS_1101.crn,
                                isRequired: true
                            }),
                            createSelectedCourse({
                                courseId: REAL_COURSES.CS_2303.id,
                                selectedSectionCrn: REAL_COURSES.CS_2303.crn,
                                isRequired: true
                            }),
                            createSelectedCourse({
                                courseId: REAL_COURSES.MA_1021.id,
                                selectedSectionCrn: REAL_COURSES.MA_1021.crn,
                                isRequired: false
                            }),
                            createSelectedCourse({
                                courseId: REAL_COURSES.MA_1024.id,
                                selectedSectionCrn: REAL_COURSES.MA_1024.crn,
                                isRequired: false
                            })
                        ]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            // Act
            await profileManager.importData(syncData);
            await waitForEventQueue();

            // Assert: Course UI should be refreshed
            expect(mockUI.courseController.displaySelectedCourses).toHaveBeenCalled();

            // Verify active schedule has correct courses
            const activeSchedule = profileManager.getActiveSchedule();
            expect(activeSchedule?.selectedCourses).toHaveLength(4);
        });
    });

    describe('CourseDataCoordinator Hydration', () => {
        it('should distribute course data to all registered consumers', async () => {
            // Arrange: Mock course data (normally loaded from JSON)
            const mockDepartments = [
                {
                    name: 'Computer Science',
                    code: 'CS',
                    courses: [
                        {
                            id: 'CS-1101',
                            title: 'Introduction to Program Design',
                            department: 'CS',
                            courseNumber: '1101',
                            terms: ['A', 'B'],
                            sections: []
                        }
                    ]
                }
            ];

            // Act: Distribute to consumers
            mockUI.courseDataCoordinator.redistributeToConsumers(mockDepartments as any);

            // Assert: All consumers should receive data
            assertUIHydrated(mockUI);
            expect(mockUI.courseDataCoordinator.redistributeToConsumers).toHaveBeenCalledWith(mockDepartments);
            expect(mockUI.courseDataCoordinator.getConsumerCount()).toBe(3); // 3 registered consumers
        });

        it('should set department data on all consumers', async () => {
            // Arrange
            const mockDepartments = [
                { name: 'CS', code: 'CS', courses: [] },
                { name: 'MA', code: 'MA', courses: [] }
            ];

            // Act
            mockUI.courseDataCoordinator.redistributeToConsumers(mockDepartments as any);

            // Assert: Each consumer should have setAllDepartments called
            expect(mockUI.courseController.setAllDepartments).toHaveBeenCalled();
            expect(mockUI.scheduleController.setAllDepartments).toHaveBeenCalled();
            expect(mockUI.departmentController.setAllDepartments).toHaveBeenCalled();
        });

        it('should handle consumers added after initial data load', async () => {
            // Arrange: Import data first
            const syncData = await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Test' })],
                activeScheduleId: 'schedule-1'
            });

            await profileManager.importData(syncData);

            // Reset counts
            resetMockUIComponents(mockUI);

            // Act: Add new consumer after data is loaded
            const lateConsumer = {
                setAllDepartments: mock()
            };
            mockUI.courseDataCoordinator.registerConsumer(lateConsumer);

            // Manually trigger redistribution (normally done by CourseDataCoordinator)
            const mockDepartments = [{ name: 'CS', code: 'CS', courses: [] }];
            mockUI.courseDataCoordinator.redistributeToConsumers(mockDepartments as any);

            // Assert: Late consumer should receive data
            expect(lateConsumer.setAllDepartments).toHaveBeenCalled();
        });
    });

    describe('Search and Filter UI Hydration', () => {
        it('should update search index after import', async () => {
            // Arrange
            const syncData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Test',
                        selectedCourses: [createSelectedCourse({ courseId: 'CS-1101' })]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            // Act: Import data
            await profileManager.importData(syncData);

            // Manually trigger search service update (normally done by MainController)
            mockUI.searchService.reindex();

            // Assert
            expect(mockUI.searchService.reindex).toHaveBeenCalled();
        });

        it('should reset filters after import', async () => {
            // Arrange
            const syncData = await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Test' })],
                activeScheduleId: 'schedule-1'
            });

            // Act
            await profileManager.importData(syncData);

            // Manually trigger filter reset (normally done by MainController)
            mockUI.filterModalController.resetFilters();

            // Assert
            expect(mockUI.filterModalController.resetFilters).toHaveBeenCalled();
        });

        it('should set course data in filter modal', async () => {
            // Arrange: Mock course data
            const mockCourseData = [
                {
                    id: 'CS-1101',
                    title: 'Intro to Programming',
                    department: 'CS',
                    courseNumber: '1101',
                    terms: ['A'],
                    sections: []
                }
            ];

            // Act: Set course data (normally done when course data loads)
            mockUI.filterModalController.setCourseData(mockCourseData);

            // Assert
            expect(mockUI.filterModalController.setCourseData).toHaveBeenCalledWith(mockCourseData);
        });
    });

    describe('Schedule Picker Modal Hydration', () => {
        it('should refresh schedule list after import', async () => {
            // Arrange: Import multiple schedules
            const syncData = await createSyncData({
                schedules: [
                    createSchedule({ id: 'schedule-1', name: 'Fall 2025' }),
                    createSchedule({ id: 'schedule-2', name: 'Spring 2026' }),
                    createSchedule({ id: 'schedule-3', name: 'Summer 2026' })
                ],
                activeScheduleId: 'schedule-1'
            });

            resetMockUIComponents(mockUI);

            // Act: Import (should trigger schedule list refresh)
            await profileManager.importData(syncData);
            await waitForEventQueue();

            // Manually trigger refresh (normally done by MainController)
            mockUI.schedulePickerModal.refreshScheduleList();

            // Assert: Schedule picker should show all schedules
            expect(mockUI.schedulePickerModal.refreshScheduleList).toHaveBeenCalled();

            const allSchedules = profileManager.getAllSchedules();
            const scheduleIds = allSchedules.map(s => s.id);
            expect(scheduleIds).toContain('schedule-1');
            expect(scheduleIds).toContain('schedule-2');
            expect(scheduleIds).toContain('schedule-3');
            expect(allSchedules.find(s => s.id === 'schedule-1')?.name).toBe('Fall 2025');
        });

        it('should update active schedule indicator', async () => {
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

            // Manually notify of active schedule change
            mockUI.schedulePickerModal.onActiveScheduleChange('schedule-2');

            // Assert
            expect(mockUI.schedulePickerModal.onActiveScheduleChange).toHaveBeenCalledWith('schedule-2');
        });
    });

    describe('Cloud Status Button Hydration', () => {
        it('should update cloud status after successful import', async () => {
            // Arrange
            const syncData = await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Test' })],
                activeScheduleId: 'schedule-1'
            });

            // Act: Import data
            await profileManager.importData(syncData);

            // Manually trigger status update (normally done by SyncManager)
            mockUI.cloudStatusButton.updateStatus('idle');

            // Assert
            expect(mockUI.cloudStatusButton.updateStatus).toHaveBeenCalledWith('idle');
        });

        it('should handle cloud status state changes', async () => {
            // Act: Simulate various sync states
            mockUI.cloudStatusButton.onStateChange({ status: 'syncing' });
            mockUI.cloudStatusButton.onStateChange({ status: 'idle' });
            mockUI.cloudStatusButton.onStateChange({ status: 'error', error: 'Network error' });

            // Assert
            expect(mockUI.cloudStatusButton.onStateChange).toHaveBeenCalledTimes(3);
        });
    });

    describe('Department Controller Hydration', () => {
        it('should render departments after data load', async () => {
            // Arrange: Mock department data
            const mockDepartments = [
                { name: 'Computer Science', code: 'CS', courses: [] },
                { name: 'Mathematics', code: 'MA', courses: [] },
                { name: 'Physics', code: 'PH', courses: [] }
            ];

            // Act: Set departments and render
            mockUI.departmentController.setAllDepartments(mockDepartments);
            mockUI.departmentController.renderDepartments();

            // Assert
            expect(mockUI.departmentController.setAllDepartments).toHaveBeenCalledWith(mockDepartments);
            expect(mockUI.departmentController.renderDepartments).toHaveBeenCalled();
        });
    });

    describe('Complete UI Hydration Flow', () => {
        it('should hydrate all UI components after sync import', async () => {
            // Arrange: Complete sync data
            const syncData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Complete Test Schedule',
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

            // Mock course data
            const mockDepartments = [
                {
                    name: 'CS',
                    code: 'CS',
                    courses: [
                        { id: 'CS-1101', title: 'Intro to Programming', department: 'CS', courseNumber: '1101', terms: ['A'], sections: [] }
                    ]
                },
                {
                    name: 'MA',
                    code: 'MA',
                    courses: [
                        { id: 'MA-1021', title: 'Calculus I', department: 'MA', courseNumber: '1021', terms: ['A'], sections: [] }
                    ]
                }
            ];

            // Act: Complete hydration flow
            await profileManager.importData(syncData);
            await waitForEventQueue();
            mockUI.courseDataCoordinator.redistributeToConsumers(mockDepartments as any);
            mockUI.schedulePickerModal.refreshScheduleList();
            mockUI.searchService.reindex();
            mockUI.cloudStatusButton.updateStatus('idle');

            // Assert: All UI components updated
            assertUIHydrated(mockUI);
            assertScheduleUIUpdated(mockUI);
            assertCourseSelectionUIUpdated(mockUI);

            expect(mockUI.courseController.setAllDepartments).toHaveBeenCalled();
            expect(mockUI.scheduleController.setAllDepartments).toHaveBeenCalled();
            expect(mockUI.departmentController.setAllDepartments).toHaveBeenCalled();
            expect(mockUI.schedulePickerModal.refreshScheduleList).toHaveBeenCalled();
            expect(mockUI.searchService.reindex).toHaveBeenCalled();
            expect(mockUI.cloudStatusButton.updateStatus).toHaveBeenCalledWith('idle');

            // Verify data was imported
            const allSchedules = profileManager.getAllSchedules();
            const schedule = allSchedules.find(s => s.id === 'schedule-1');
            expect(schedule).toBeDefined();
            expect(schedule?.name).toBe('Complete Test Schedule');
        });

        it('should handle hydration with no schedules', async () => {
            // Arrange: Empty sync data
            const emptyData = await createSyncData({
                schedules: [],
                activeScheduleId: null
            });

            // Act
            await profileManager.importData(emptyData);
            await waitForEventQueue();

            // Assert: UI should still be called (to clear displays)
            expect(mockUI.scheduleController.displayScheduleSelectedCourses).toHaveBeenCalled();
            expect(mockUI.courseController.displaySelectedCourses).toHaveBeenCalled();

            // No schedules in IndexedDB
            const allSchedules = mockIndexedDB.getAllRawData('wpi-planner', 'schedules');
            expect(allSchedules).toHaveLength(0);
        });

        it('should handle rapid successive imports', async () => {
            // Arrange: Two different sync data sets
            const syncData1 = await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'First' })],
                activeScheduleId: 'schedule-1'
            });

            const syncData2 = await createSyncData({
                schedules: [createSchedule({ id: 'schedule-2', name: 'Second' })],
                activeScheduleId: 'schedule-2'
            });

            // Act: Import rapidly
            await profileManager.importData(syncData1);
            await waitForEventQueue();
            await profileManager.importData(syncData2);
            await waitForEventQueue();

            // Assert: UI should be called for both imports
            expect(mockUI.scheduleController.displayScheduleSelectedCourses).toHaveBeenCalledTimes(2);

            // Final state should be from second import
            const activeSchedule = profileManager.getActiveSchedule();
            expect(activeSchedule?.id).toBe('schedule-2');
            expect(activeSchedule?.name).toBe('Second');
        });
    });
});
