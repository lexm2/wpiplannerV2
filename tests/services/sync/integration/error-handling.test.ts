import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncManager } from '../../../../src/services/sync/SyncManager';
import { syncEventBus } from '../../../../src/services/sync/SyncEventBus';
import { providerRegistry } from '../../../../src/services/sync/ProviderRegistry';
import { MockCloudProvider } from '../../../mocks/MockCloudProvider';
import {
    createSyncData,
    createSyncDataWithBadChecksum,
    createInvalidSyncData,
    createEventBusSpy,
    advanceTimersByTime,
    flushPromises,
} from '../../../helpers/sync-test-utils';

/**
 * Error Handling and Edge Case Tests
 *
 * Tests error scenarios, network failures, corrupted data,
 * and other edge cases that can occur during sync operations.
 */
describe('Sync Error Handling', () => {
    let syncManager: SyncManager;
    let mockProvider: MockCloudProvider;
    let eventSpy: ReturnType<typeof createEventBusSpy>;

    beforeEach(async () => {
        vi.useFakeTimers();

        syncManager = SyncManager.getInstance();
        mockProvider = new MockCloudProvider();
        providerRegistry.register(mockProvider);
        syncManager.setProvider('mock');

        eventSpy = createEventBusSpy();
        syncEventBus.on('sync-failed', eventSpy.listener);
        syncEventBus.on('sync-pushed', eventSpy.listener);

        // Mock getLocalSyncData to return test data (needed for debounced push)
        const mockData = await createSyncData();
        vi.spyOn(syncManager as any, 'getLocalSyncData').mockResolvedValue(mockData);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        mockProvider.reset();
        eventSpy.clear();
    });

    describe('Network Failures', () => {
        it('should handle network timeout during sign-in', async () => {
            mockProvider.setConfig({
                authSucceeds: false,
                errorToThrow: new Error('Network timeout'),
            });

            const localData = await createSyncData();

            await expect(syncManager.handleSignIn(localData)).rejects.toThrow('Network timeout');
            expect(syncManager.getStatus()).toBe('error');
            expect(eventSpy.hasEvent('sync-failed')).toBe(true);
        });

        it('should handle network failure during push', async () => {
            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);

            mockProvider.setConfig({
                pushFails: true,
                errorToThrow: new Error('Network unreachable'),
            });

            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            expect(syncManager.getStatus()).toBe('error');
            expect(eventSpy.hasEvent('sync-failed')).toBe(true);
        });

        it('should handle network failure during pull', async () => {
            mockProvider.setConfig({
                pullFails: true,
                errorToThrow: new Error('Failed to fetch'),
            });

            const localData = await createSyncData();

            await expect(syncManager.handleSignIn(localData)).rejects.toThrow('Failed to fetch');
            expect(eventSpy.hasEvent('sync-failed')).toBe(true);
        });

        it('should recover after network comes back', async () => {
            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);

            // Network fails
            mockProvider.setConfig({ pushFails: true });
            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            expect(syncManager.getStatus()).toBe('error');

            // Network recovers
            mockProvider.setConfig({ pushFails: false });
            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            expect(syncManager.getStatus()).toBe('idle');
            expect(eventSpy.hasEvent('sync-pushed')).toBe(true);
        });
    });

    describe('Data Corruption', () => {
        it('should detect corrupted checksum on pull', async () => {
            const corruptedData = await createSyncDataWithBadChecksum();
            mockProvider.setCloudData(corruptedData);

            const localData = await createSyncData();

            await expect(syncManager.handleSignIn(localData)).rejects.toThrow();
            expect(eventSpy.hasEvent('sync-failed')).toBe(true);
        });

        it('should reject invalid data structure on pull', async () => {
            mockProvider.setCloudData(createInvalidSyncData());

            const localData = await createSyncData();

            await expect(syncManager.handleSignIn(localData)).rejects.toThrow();
        });

        it('should reject invalid data on push', async () => {
            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);

            const invalidData = createInvalidSyncData();

            await expect(syncManager.pushToCloud(invalidData)).rejects.toThrow();
        });

        it('should handle corrupted cloud file gracefully', async () => {
            mockProvider.setConfig({
                pullFails: true,
                errorToThrow: new Error('JSON parse error'),
            });

            const localData = await createSyncData();

            await expect(syncManager.handleSignIn(localData)).rejects.toThrow('JSON parse error');
        });
    });

    describe('Authentication Errors', () => {
        it('should handle OAuth access denied', async () => {
            mockProvider.setConfig({
                authSucceeds: false,
                errorToThrow: new Error('User denied access'),
            });

            const localData = await createSyncData();

            await expect(syncManager.handleSignIn(localData)).rejects.toThrow('User denied access');
            expect(mockProvider.isAuthenticated()).toBe(false);
        });

        it('should handle expired token during push', async () => {
            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);

            // Token expires
            mockProvider.setConfig({
                pushFails: true,
                errorToThrow: new Error('Token expired'),
            });

            await expect(syncManager.pushToCloud(localData)).rejects.toThrow('Token expired');
        });

        it('should not push when not authenticated', async () => {
            const localData = await createSyncData();

            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            expect(mockProvider.callHistory.pushData).toBe(0);
        });
    });

    describe('Quota and Limits', () => {
        it('should handle cloud storage quota exceeded', async () => {
            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);

            mockProvider.setConfig({
                pushFails: true,
                errorToThrow: new Error('Storage quota exceeded'),
            });

            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            expect(syncManager.getStatus()).toBe('error');
            expect(eventSpy.hasEvent('sync-failed')).toBe(true);
        });

        it('should handle rate limiting', async () => {
            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);

            mockProvider.setConfig({
                pushFails: true,
                errorToThrow: new Error('Rate limit exceeded'),
            });

            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            expect(eventSpy.hasEvent('sync-failed')).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty schedules array', async () => {
            const emptyData = await createSyncData({
                schedules: [],
                activeScheduleId: null,
            });

            const conflict = await syncManager.handleSignIn(emptyData);

            expect(conflict).toBeNull();
            expect(mockProvider.getCloudData()).toBeTruthy();
        });

        it('should handle very large schedule data', async () => {
            // Create data with many schedules and courses
            const largeSchedules = [];
            for (let i = 0; i < 50; i++) {
                largeSchedules.push({
                    id: `schedule-${i}`,
                    name: `Schedule ${i}`,
                    selectedCourses: Array.from({ length: 20 }, (_, j) => ({
                        courseId: `CS-${1000 + i * 20 + j}`,
                        isRequired: true,
                        selectedSectionCrn: `${10000 + i * 20 + j}`,
                    })),
                });
            }

            const largeData = await createSyncData({ schedules: largeSchedules });

            const conflict = await syncManager.handleSignIn(largeData);

            expect(conflict).toBeNull();
            expect(mockProvider.getCloudData()).toBeTruthy();
        });

        it('should handle null activeScheduleId', async () => {
            const data = await createSyncData({ activeScheduleId: null });

            const conflict = await syncManager.handleSignIn(data);

            expect(conflict).toBeNull();
            expect(mockProvider.getCloudData()?.activeScheduleId).toBeNull();
        });

        it('should handle undefined preferences', async () => {
            const data = await createSyncData({ preferences: undefined });

            const conflict = await syncManager.handleSignIn(data);

            expect(conflict).toBeNull();
        });

        it('should handle rapid sign-in attempts', async () => {
            const data = await createSyncData();

            // Multiple rapid sign-ins (only first should succeed)
            const promises = [
                syncManager.handleSignIn(data),
                syncManager.handleSignIn(data),
                syncManager.handleSignIn(data),
            ];

            // At least one should succeed
            const results = await Promise.allSettled(promises);
            const succeeded = results.filter((r) => r.status === 'fulfilled');

            expect(succeeded.length).toBeGreaterThan(0);
        });

        it('should handle push while already pushing', async () => {
            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);

            mockProvider.setConfig({ networkDelay: 100 });

            // Trigger two pushes rapidly
            const push1 = syncManager.pushToCloud(localData);
            const push2 = syncManager.pushToCloud(localData);

            await Promise.all([push1, push2]);

            // Both should complete successfully
            expect(mockProvider.callHistory.pushData).toBeGreaterThanOrEqual(1);
        });

        it('should handle sign-out during pending push', async () => {
            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);

            // Schedule push
            syncEventBus.emitEvent('local-save-completed', {});

            // Sign out before push completes
            await syncManager.signOut();

            // Advance timer
            await advanceTimersByTime(3000);
            await flushPromises();

            // Push should not happen (signed out)
            expect(mockProvider.callHistory.pushData).toBe(1); // Only initial push from sign-in
        });

        it('should throw error when resolving with cloud but no state manager', async () => {
            // Create conflict
            const localData = await createSyncData();
            const cloudData = await createSyncData({
                schedules: [
                    {
                        id: 'different',
                        name: 'Different',
                        selectedCourses: [],
                    },
                ],
            });
            mockProvider.setCloudData(cloudData);
            await syncManager.handleSignIn(localData);

            // Resolve with cloud but no state manager set - should throw
            await expect(syncManager.resolveConflict('cloud')).rejects.toThrow(
                'State manager not set'
            );
        });

        it('should handle provider not set', async () => {
            const freshManager = SyncManager.getInstance();
            const localData = await createSyncData();

            // Try to sign in without setting provider
            await expect(freshManager.handleSignIn(localData)).rejects.toThrow('No provider set');
        });
    });

    describe('Concurrency Issues', () => {
        it('should handle multiple simultaneous local-save-completed events', async () => {
            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);
            mockProvider.resetCallHistory();

            // Trigger many saves simultaneously
            for (let i = 0; i < 10; i++) {
                syncEventBus.emitEvent('local-save-completed', {});
            }

            // Wait for debounce
            await advanceTimersByTime(3000);
            await flushPromises();

            // Should only push once due to debouncing
            expect(mockProvider.callHistory.pushData).toBe(1);
        });

        it('should handle conflict resolution while push is pending', async () => {
            // Create conflict
            const localData = await createSyncData();
            const cloudData = await createSyncData({
                schedules: [{ id: 'diff', name: 'Diff', selectedCourses: [] }],
            });
            mockProvider.setCloudData(cloudData);
            await syncManager.handleSignIn(localData);

            // Trigger push (will be blocked by conflict state)
            syncEventBus.emitEvent('local-save-completed', {});

            // Resolve conflict
            await syncManager.resolveConflict('local');

            // Wait for any pending push
            await advanceTimersByTime(3000);
            await flushPromises();

            // Should have pushed during resolution
            expect(mockProvider.callHistory.pushData).toBeGreaterThan(0);
        });
    });

    describe('Provider-Specific Errors', () => {
        it('should handle provider initialization failure', async () => {
            const failingProvider = new MockCloudProvider({
                authSucceeds: false,
            });

            providerRegistry.register(failingProvider);
            syncManager.setProvider('mock');

            const localData = await createSyncData();

            await expect(syncManager.handleSignIn(localData)).rejects.toThrow();
        });

        it('should emit sync-failed event with error details', async () => {
            mockProvider.setConfig({
                pushFails: true,
                errorToThrow: new Error('Custom error message'),
            });

            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);

            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            const failedEvent = eventSpy.getLatestEvent('sync-failed');
            expect(failedEvent).toBeDefined();
            expect(failedEvent?.error).toBeInstanceOf(Error);
            expect(failedEvent?.error?.message).toContain('Custom error message');
        });
    });

    describe('Data Validation Edge Cases', () => {
        it('should handle schedules with no courses', async () => {
            const data = await createSyncData({
                schedules: [
                    {
                        id: 'empty-schedule',
                        name: 'Empty Schedule',
                        selectedCourses: [],
                    },
                ],
            });

            const conflict = await syncManager.handleSignIn(data);

            expect(conflict).toBeNull();
        });

        it('should handle very long schedule names', async () => {
            const longName = 'A'.repeat(1000);
            const data = await createSyncData({
                schedules: [
                    {
                        id: 'schedule-1',
                        name: longName,
                        selectedCourses: [],
                    },
                ],
            });

            const conflict = await syncManager.handleSignIn(data);

            expect(conflict).toBeNull();
            expect(mockProvider.getCloudData()?.schedules[0].name).toBe(longName);
        });

        it('should handle special characters in data', async () => {
            const specialChars = '!@#$%^&*()_+{}[]|\\:";\'<>?,./~`';
            const data = await createSyncData({
                schedules: [
                    {
                        id: 'schedule-1',
                        name: specialChars,
                        selectedCourses: [],
                    },
                ],
            });

            const conflict = await syncManager.handleSignIn(data);

            expect(conflict).toBeNull();
            expect(mockProvider.getCloudData()?.schedules[0].name).toBe(specialChars);
        });
    });
});
