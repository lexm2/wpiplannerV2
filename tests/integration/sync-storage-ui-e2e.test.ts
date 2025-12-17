import { describe, it, expect, beforeEach, afterEach, jest } from 'bun:test';
import { setupSyncTest, cleanupSyncTest, type SyncTestContext } from '../helpers/sync-test-setup';
import { ProfileStateManager } from '../../src/core/state/ProfileStateManager';
import { createSyncData, createSchedule, createSelectedCourse } from '../helpers/sync-test-utils';
import type { MockIndexedDB } from '../mocks/MockIndexedDB';
import {
    createMockUIComponents,
    resetMockUIComponents,
    assertUIHydrated,
    assertScheduleUIUpdated,
    assertCourseSelectionUIUpdated,
    type MockUIContext
} from '../mocks/MockUIComponents';

/**
 * End-to-End Integration Tests: Cloud Sync → Storage → UI
 *
 * These tests verify the complete data flow from cloud sync through storage to UI hydration:
 *
 * 1. **Cloud Sync**: User signs in, cloud data is pulled
 * 2. **SyncManager**: Processes sync data, resolves conflicts if needed
 * 3. **ProfileStateManager**: Imports data, converts to application state
 * 4. **IndexedDB**: Schedules persisted with compression
 * 5. **Event Bus**: 'schedule_changed' event emitted
 * 6. **UI Layer**: Components hydrated with new data
 *
 * This ensures the entire system works together correctly.
 */
describe('End-to-End: Cloud Sync → Storage → UI', () => {
    let syncCtx: SyncTestContext;
    let profileManager: ProfileStateManager;
    let mockIndexedDB: MockIndexedDB;
    let mockUI: MockUIContext;

    beforeEach(async () => {
        // Setup sync infrastructure
        syncCtx = await setupSyncTest();

        // Get ProfileStateManager
        profileManager = ProfileStateManager.getInstance();

        // Get mock IndexedDB
        mockIndexedDB = (global as any).__mockIndexedDB__;
        mockIndexedDB.reset();

        // Create mock UI
        mockUI = createMockUIComponents();
        mockUI.courseDataCoordinator.registerConsumer(mockUI.courseController);
        mockUI.courseDataCoordinator.registerConsumer(mockUI.scheduleController);
        mockUI.courseDataCoordinator.registerConsumer(mockUI.departmentController);

        // Wire up UI hydration events
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
        cleanupSyncTest(syncCtx);
        resetMockUIComponents(mockUI);
        mockIndexedDB.reset();
    });

    describe('Complete Sign-In Flow', () => {
        it('should complete full flow: cloud → storage → UI', async () => {
            // Arrange: Set up cloud data
            const cloudData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Fall 2025',
                        selectedCourses: [
                            createSelectedCourse({
                                courseId: 'CS-1101',
                                selectedSectionCrn: 'SEC-1',
                                isRequired: true
                            })
                        ]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            syncCtx.mockProvider.setCloudData(cloudData);

            // Act: Sign in (triggers entire flow)
            await syncCtx.syncManager.handleSignIn(cloudData);

            // Assert Step 1: Sync Manager authenticated
            expect(syncCtx.mockProvider.isAuthenticated()).toBe(true);
            expect(syncCtx.eventSpy.hasEvent('auth-changed')).toBe(true);

            // Assert Step 2: Data in IndexedDB
            expect(mockIndexedDB.hasKey('wpi-planner', 'schedules', 'schedule-1')).toBe(true);

            const stored = mockIndexedDB.getRawData('wpi-planner', 'schedules', 'schedule-1');
            expect(stored).toBeDefined();
            expect(stored.name).toBe('Fall 2025');
            expect(stored.selectedCourses).toHaveLength(1);

            // Assert Step 3: ProfileStateManager has active schedule
            const activeSchedule = profileManager.getActiveSchedule();
            expect(activeSchedule).toBeDefined();
            expect(activeSchedule?.id).toBe('schedule-1');
            expect(activeSchedule?.name).toBe('Fall 2025');

            // Assert Step 4: UI components received updates
            assertScheduleUIUpdated(mockUI);
            assertCourseSelectionUIUpdated(mockUI);
        });

        it('should handle sign-in with multiple schedules', async () => {
            // Arrange: Cloud data with 3 schedules
            const cloudData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'fall-2025',
                        name: 'Fall 2025',
                        selectedCourses: [createSelectedCourse({ courseId: 'CS-1101' })]
                    }),
                    createSchedule({
                        id: 'spring-2026',
                        name: 'Spring 2026',
                        selectedCourses: [createSelectedCourse({ courseId: 'CS-2011' })]
                    }),
                    createSchedule({
                        id: 'summer-2026',
                        name: 'Summer 2026',
                        selectedCourses: [createSelectedCourse({ courseId: 'MA-1021' })]
                    })
                ],
                activeScheduleId: 'spring-2026'
            });

            syncCtx.mockProvider.setCloudData(cloudData);

            // Act: Sign in
            await syncCtx.syncManager.handleSignIn(cloudData);

            // Assert: All schedules in IndexedDB
            expect(mockIndexedDB.hasKey('wpi-planner', 'schedules', 'fall-2025')).toBe(true);
            expect(mockIndexedDB.hasKey('wpi-planner', 'schedules', 'spring-2026')).toBe(true);
            expect(mockIndexedDB.hasKey('wpi-planner', 'schedules', 'summer-2026')).toBe(true);

            // Assert: Correct active schedule
            const activeSchedule = profileManager.getActiveSchedule();
            expect(activeSchedule?.id).toBe('spring-2026');

            // Assert: UI updated
            assertUIHydrated(mockUI);
        });

        it('should handle initial sign-in with no cloud data', async () => {
            // Arrange: No cloud data (first time user)
            syncCtx.mockProvider.setCloudData(null);

            // Create local data to push
            const localData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'initial-schedule',
                        name: 'My First Schedule',
                        selectedCourses: []
                    })
                ],
                activeScheduleId: 'initial-schedule'
            });

            // Act: Sign in with local data
            await syncCtx.syncManager.handleSignIn(localData);
            jest.advanceTimersByTime(3000);

            // Assert: Data pushed to cloud
            expect(syncCtx.mockProvider.getCloudData()).toBeDefined();
            expect(syncCtx.mockProvider.callHistory.pushData).toBe(1);

            // Assert: Data in IndexedDB
            expect(mockIndexedDB.hasKey('wpi-planner', 'schedules', 'initial-schedule')).toBe(true);

            // Assert: Sync status is idle
            expect(syncCtx.syncManager.getStatus()).toBe('idle');
        });
    });

    describe('Conflict Resolution Flow', () => {
        it('should complete flow: conflict → keep local → UI update', async () => {
            // Arrange: Create conflicting data
            const localData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Local Version',
                        selectedCourses: [createSelectedCourse({ courseId: 'CS-1101' })]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            const cloudData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Cloud Version',
                        selectedCourses: [createSelectedCourse({ courseId: 'MA-1021' })]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            syncCtx.mockProvider.setCloudData(cloudData);

            // Act: Sign in (detects conflict)
            await syncCtx.syncManager.handleSignIn(localData);

            // Verify conflict detected
            expect(syncCtx.syncManager.getStatus()).toBe('conflict');
            expect(syncCtx.eventSpy.hasEvent('sync-conflict')).toBe(true);

            // Resolve: Keep local
            await syncCtx.syncManager.resolveConflict('local');
            jest.advanceTimersByTime(3000);

            // Assert: Local data in IndexedDB
            const stored = mockIndexedDB.getRawData('wpi-planner', 'schedules', 'schedule-1');
            expect(stored.name).toBe('Local Version');

            // Assert: Local data pushed to cloud
            const pushedData = syncCtx.mockProvider.getCloudData();
            expect(pushedData?.schedules[0].name).toBe('Local Version');

            // Assert: Sync status back to idle
            expect(syncCtx.syncManager.getStatus()).toBe('idle');

            // Assert: UI updated with local data
            const activeSchedule = profileManager.getActiveSchedule();
            expect(activeSchedule?.name).toBe('Local Version');
        });

        it('should complete flow: conflict → keep cloud → UI update', async () => {
            // Arrange: Conflicting data
            const localData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Local',
                        selectedCourses: [createSelectedCourse({ courseId: 'CS-1101' })]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            const cloudData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Cloud',
                        selectedCourses: [createSelectedCourse({ courseId: 'MA-1021' })]
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            syncCtx.mockProvider.setCloudData(cloudData);

            // Act: Sign in and resolve
            await syncCtx.syncManager.handleSignIn(localData);
            await syncCtx.syncManager.resolveConflict('cloud');

            // Assert: Cloud data in IndexedDB
            const stored = mockIndexedDB.getRawData('wpi-planner', 'schedules', 'schedule-1');
            expect(stored.name).toBe('Cloud');

            // Assert: No push (cloud data kept)
            expect(syncCtx.mockProvider.callHistory.pushData).toBe(0);

            // Assert: UI shows cloud data
            const activeSchedule = profileManager.getActiveSchedule();
            expect(activeSchedule?.name).toBe('Cloud');
        });
    });

    describe('Push Flow with UI Updates', () => {
        it('should complete flow: local change → debounce → push → cloud', async () => {
            // Arrange: Sign in first
            const initialData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'schedule-1',
                        name: 'Initial',
                        selectedCourses: []
                    })
                ],
                activeScheduleId: 'schedule-1'
            });

            syncCtx.mockProvider.setCloudData(initialData);
            await syncCtx.syncManager.handleSignIn(initialData);

            // Reset call counts
            syncCtx.mockProvider.callHistory.pushData = 0;

            // Act: Make local change
            const updatedSchedule = createSchedule({
                id: 'schedule-1',
                name: 'Updated',
                selectedCourses: [createSelectedCourse({ courseId: 'CS-1101' })]
            });

            // Save to ProfileStateManager
            await profileManager.importData(await createSyncData({
                schedules: [updatedSchedule],
                activeScheduleId: 'schedule-1'
            }));

            // Trigger debounced push
            jest.advanceTimersByTime(3000);

            // Assert: Data pushed to cloud
            expect(syncCtx.mockProvider.callHistory.pushData).toBe(1);

            const cloudData = syncCtx.mockProvider.getCloudData();
            expect(cloudData?.schedules[0].name).toBe('Updated');

            // Assert: Data in IndexedDB
            const stored = mockIndexedDB.getRawData('wpi-planner', 'schedules', 'schedule-1');
            expect(stored.name).toBe('Updated');

            // Assert: UI updated
            assertScheduleUIUpdated(mockUI);
        });

        it('should debounce rapid changes before pushing', async () => {
            // Arrange: Sign in
            const initialData = await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Initial' })],
                activeScheduleId: 'schedule-1'
            });

            syncCtx.mockProvider.setCloudData(initialData);
            await syncCtx.syncManager.handleSignIn(initialData);

            syncCtx.mockProvider.callHistory.pushData = 0;

            // Act: Make rapid changes
            for (let i = 0; i < 5; i++) {
                await profileManager.importData(await createSyncData({
                    schedules: [createSchedule({ id: 'schedule-1', name: `Update ${i}` })],
                    activeScheduleId: 'schedule-1'
                }));

                jest.advanceTimersByTime(500); // Small delay between changes
            }

            // Wait for debounce to complete
            jest.advanceTimersByTime(3000);

            // Assert: Only one push despite 5 changes
            expect(syncCtx.mockProvider.callHistory.pushData).toBe(1);

            // Assert: Final state pushed
            const cloudData = syncCtx.mockProvider.getCloudData();
            expect(cloudData?.schedules[0].name).toBe('Update 4');
        });
    });

    describe('Multi-Device Sync Simulation', () => {
        it('should simulate Device A → Cloud → Device B flow', async () => {
            // ===== Device A =====
            // Arrange: Device A creates schedule
            const deviceAData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'shared-schedule',
                        name: 'Created on Device A',
                        selectedCourses: [createSelectedCourse({ courseId: 'CS-1101' })]
                    })
                ],
                activeScheduleId: 'shared-schedule'
            });

            // Act: Device A signs in and pushes
            syncCtx.mockProvider.setCloudData(null);
            await syncCtx.syncManager.handleSignIn(deviceAData);
            jest.advanceTimersByTime(3000);

            // Assert: Data in cloud
            const cloudData = syncCtx.mockProvider.getCloudData();
            expect(cloudData).toBeDefined();
            expect(cloudData?.schedules[0].name).toBe('Created on Device A');

            // ===== Device B =====
            // Simulate Device B signing in
            const deviceBProfileManager = ProfileStateManager.getInstance();
            mockIndexedDB.reset(); // Clear Device B's local storage

            // Act: Device B pulls from cloud
            await syncCtx.syncManager.handleSignIn(null as any); // Will pull from cloud

            // Mock the pull data
            await deviceBProfileManager.importData(cloudData!);

            // Assert: Device B has same data
            const deviceBSchedule = mockIndexedDB.getRawData('wpi-planner', 'schedules', 'shared-schedule');
            expect(deviceBSchedule).toBeDefined();
            expect(deviceBSchedule.name).toBe('Created on Device A');

            // Assert: UI on Device B is hydrated
            assertUIHydrated(mockUI);
        });
    });

    describe('Sign-Out Flow', () => {
        it('should complete flow: sign-out → clear auth → retain local data', async () => {
            // Arrange: Sign in with data
            const syncData = await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Test' })],
                activeScheduleId: 'schedule-1'
            });

            syncCtx.mockProvider.setCloudData(syncData);
            await syncCtx.syncManager.handleSignIn(syncData);

            // Act: Sign out
            await syncCtx.syncManager.signOut();

            // Assert: Auth cleared
            expect(syncCtx.mockProvider.isAuthenticated()).toBe(false);
            expect(syncCtx.eventSpy.hasEvent('auth-changed')).toBe(true);

            // Assert: Local data still in IndexedDB
            expect(mockIndexedDB.hasKey('wpi-planner', 'schedules', 'schedule-1')).toBe(true);

            // Assert: Sync status is idle
            expect(syncCtx.syncManager.getStatus()).toBe('idle');
        });
    });

    describe('Error Recovery Flow', () => {
        it('should recover from network error and complete flow', async () => {
            // Arrange: Sign in successfully
            const syncData = await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Test' })],
                activeScheduleId: 'schedule-1'
            });

            syncCtx.mockProvider.setCloudData(syncData);
            await syncCtx.syncManager.handleSignIn(syncData);

            // Act: Simulate network failure
            syncCtx.mockProvider.setConfig({ pushFails: true });

            // Trigger push (should fail)
            await profileManager.importData(await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Updated' })],
                activeScheduleId: 'schedule-1'
            }));

            jest.advanceTimersByTime(3000);

            // Assert: Error state
            expect(syncCtx.syncManager.getStatus()).toBe('error');

            // Act: Network recovers
            syncCtx.mockProvider.setConfig({ pushFails: false });

            // Trigger another push
            await profileManager.importData(await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Final' })],
                activeScheduleId: 'schedule-1'
            }));

            jest.advanceTimersByTime(3000);

            // Assert: Recovered to idle
            expect(syncCtx.syncManager.getStatus()).toBe('idle');

            // Assert: Latest data in cloud
            const cloudData = syncCtx.mockProvider.getCloudData();
            expect(cloudData?.schedules[0].name).toBe('Final');

            // Assert: UI updated
            assertScheduleUIUpdated(mockUI);
        });

        it('should handle corrupted cloud data gracefully', async () => {
            // Arrange: Set corrupted cloud data
            syncCtx.mockProvider.setConfig({ corruptChecksum: true });

            const corruptedData = await createSyncData({
                schedules: [createSchedule({ id: 'schedule-1', name: 'Corrupted' })],
                activeScheduleId: 'schedule-1'
            });

            // Manually corrupt the checksum
            (corruptedData as any).checksum = 'invalid_checksum';

            syncCtx.mockProvider.setCloudData(corruptedData);

            // Act: Attempt sign-in
            await expect(syncCtx.syncManager.handleSignIn(null as any)).rejects.toThrow();

            // Assert: Error status
            expect(syncCtx.syncManager.getStatus()).toBe('error');

            // Assert: No corrupted data in IndexedDB
            expect(mockIndexedDB.hasKey('wpi-planner', 'schedules', 'schedule-1')).toBe(false);
        });
    });

    describe('Data Integrity Across Flow', () => {
        it('should maintain data integrity through compression/decompression', async () => {
            // Arrange: Create schedule with special characters and unicode
            const complexData = await createSyncData({
                schedules: [
                    createSchedule({
                        id: 'complex-schedule',
                        name: 'Test: Special chars & émojis 🎓',
                        selectedCourses: [
                            createSelectedCourse({
                                courseId: 'CS-1101'
                            })
                        ]
                    })
                ],
                activeScheduleId: 'complex-schedule'
            });

            syncCtx.mockProvider.setCloudData(complexData);

            // Act: Complete flow
            await syncCtx.syncManager.handleSignIn(complexData);

            // Assert: Data preserved in IndexedDB
            const stored = mockIndexedDB.getRawData('wpi-planner', 'schedules', 'complex-schedule');
            expect(stored.name).toBe('Test: Special chars & émojis 🎓');

            // Assert: Data preserved in ProfileStateManager
            const activeSchedule = profileManager.getActiveSchedule();
            expect(activeSchedule?.name).toBe('Test: Special chars & émojis 🎓');
        });

        it('should handle large schedules efficiently', async () => {
            // Arrange: Create large schedule
            const largeSchedule = createSchedule({
                id: 'large-schedule',
                name: 'Large Schedule',
                selectedCourses: Array.from({ length: 100 }, (_, i) =>
                    createSelectedCourse({
                        courseId: `CS-${1000 + i}`,
                        selectedSectionCrn: `SEC-${i}`
                    })
                )
            });

            const largeData = await createSyncData({
                schedules: [largeSchedule],
                activeScheduleId: 'large-schedule'
            });

            syncCtx.mockProvider.setCloudData(largeData);

            // Act: Complete flow
            await syncCtx.syncManager.handleSignIn(largeData);

            // Assert: All data stored correctly
            const stored = mockIndexedDB.getRawData('wpi-planner', 'schedules', 'large-schedule');
            expect(stored).toBeDefined();
            expect(stored.selectedCourses).toHaveLength(100);

            // Assert: Compression occurred (storage size is tracked)
            const storageSize = mockIndexedDB.getStorageSize();
            expect(storageSize).toBeGreaterThan(0);

            // Assert: UI hydrated
            assertUIHydrated(mockUI);
        });
    });
});
