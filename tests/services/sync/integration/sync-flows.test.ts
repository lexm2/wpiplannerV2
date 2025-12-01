import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncManager } from '../../../../src/services/sync/SyncManager';
import { syncEventBus } from '../../../../src/services/sync/SyncEventBus';
import { providerRegistry } from '../../../../src/services/sync/ProviderRegistry';
import { MockCloudProvider } from '../../../mocks/MockCloudProvider';
import {
    createSyncData,
    createConflictingData,
    createEventBusSpy,
    advanceTimersByTime,
    flushPromises,
    assertSyncDataEqual,
} from '../../../helpers/sync-test-utils';
import type { SyncData } from '../../../../src/services/sync/types';

/**
 * Integration Tests for Complete Sync Flows
 *
 * These tests verify the entire sync process from start to finish,
 * testing the interaction between SyncManager, providers, and event bus.
 */
describe('Sync Integration Tests', () => {
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
        syncEventBus.on('auth-changed', eventSpy.listener);
        syncEventBus.on('sync-conflict', eventSpy.listener);
        syncEventBus.on('sync-resolved', eventSpy.listener);
        syncEventBus.on('sync-pushed', eventSpy.listener);
        syncEventBus.on('sync-failed', eventSpy.listener);
        syncEventBus.on('local-save-completed', eventSpy.listener);

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

    describe('Full Sign-In Flow', () => {
        it('should complete initial sign-in with no cloud data', async () => {
            const localData = await createSyncData();

            // User clicks sign-in button
            const conflict = await syncManager.handleSignIn(localData);

            // Verify flow
            expect(conflict).toBeNull();
            expect(mockProvider.isAuthenticated()).toBe(true);
            expect(mockProvider.getCloudData()).toBeTruthy();
            assertSyncDataEqual(mockProvider.getCloudData()!, localData);

            // Verify events
            expect(eventSpy.hasEvent('auth-changed')).toBe(true);
            expect(eventSpy.hasEvent('sync-pushed')).toBe(true);
            expect(eventSpy.getEventCount('sync-pushed')).toBe(1);

            // Verify status
            expect(syncManager.getStatus()).toBe('idle');
        });

        it('should complete sign-in with matching cloud data', async () => {
            const localData = await createSyncData();
            mockProvider.setCloudData(localData);

            // User clicks sign-in button
            const conflict = await syncManager.handleSignIn(localData);

            // Verify flow
            expect(conflict).toBeNull();
            expect(mockProvider.isAuthenticated()).toBe(true);
            expect(mockProvider.callHistory.pushData).toBe(0); // No push needed

            // Verify events
            expect(eventSpy.hasEvent('auth-changed')).toBe(true);
            expect(eventSpy.hasEvent('sync-pushed')).toBe(true); // "already-synced" event

            // Verify status
            expect(syncManager.getStatus()).toBe('idle');
        });

        it('should detect and present conflict to user', async () => {
            const { localData, cloudData } = await createConflictingData();
            mockProvider.setCloudData(cloudData);

            // User clicks sign-in button
            const conflict = await syncManager.handleSignIn(localData);

            // Verify conflict detected
            expect(conflict).not.toBeNull();
            expect(conflict?.hasConflict).toBe(true);
            expect(conflict?.localData.checksum).not.toBe(conflict?.cloudData.checksum);

            // Verify events
            expect(eventSpy.hasEvent('sync-conflict')).toBe(true);

            // Verify status
            expect(syncManager.getStatus()).toBe('conflict');

            // Verify no automatic push happened
            expect(mockProvider.callHistory.pushData).toBe(0);
        });
    });

    describe('Full Push Flow (Debounced)', () => {
        beforeEach(async () => {
            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);
            mockProvider.resetCallHistory();
            eventSpy.clear();
        });

        it('should complete full push flow after state change', async () => {
            // Simulate ProfileStateManager saving state
            syncEventBus.emitEvent('local-save-completed', {});

            // Wait for debounce (3 seconds)
            await advanceTimersByTime(3000);
            await flushPromises();

            // Verify push completed
            expect(mockProvider.callHistory.pushData).toBe(1);
            expect(eventSpy.hasEvent('sync-pushed')).toBe(true);
            expect(syncManager.getStatus()).toBe('idle');
        });

        it('should handle rapid state changes with single push', async () => {
            // Simulate multiple rapid saves
            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(1000);

            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(1000);

            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(1000);

            // Wait for debounce
            await advanceTimersByTime(3000);
            await flushPromises();

            // Should only push once
            expect(mockProvider.callHistory.pushData).toBe(1);
        });

        it('should continue pushing after multiple changes', async () => {
            // First change
            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            expect(mockProvider.callHistory.pushData).toBe(1);

            // Second change
            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            expect(mockProvider.callHistory.pushData).toBe(2);
        });
    });

    describe('Conflict Resolution Flows', () => {
        let localData: SyncData;
        let cloudData: SyncData;

        beforeEach(async () => {
            const conflictData = await createConflictingData();
            localData = conflictData.localData;
            cloudData = conflictData.cloudData;
            mockProvider.setCloudData(cloudData);
            await syncManager.handleSignIn(localData);
            eventSpy.clear();
        });

        it('should complete "keep local" resolution flow', async () => {
            // User chooses to keep local data
            await syncManager.resolveConflict('local');

            // Verify local data pushed to cloud
            expect(mockProvider.callHistory.pushData).toBe(1);
            assertSyncDataEqual(mockProvider.getCloudData()!, localData);

            // Verify events
            expect(eventSpy.hasEvent('sync-resolved')).toBe(true);
            expect(eventSpy.hasEvent('sync-pushed')).toBe(true);

            // Verify status
            expect(syncManager.getStatus()).toBe('idle');
        });

        it('should complete "keep cloud" resolution flow', async () => {
            let appliedData: SyncData | null = null;
            const applyCloudData = vi.fn(async (data: SyncData) => {
                appliedData = data;
            });

            // User chooses to keep cloud data
            await syncManager.resolveConflict('cloud', applyCloudData);

            // Verify cloud data applied locally
            expect(applyCloudData).toHaveBeenCalledWith(cloudData);
            expect(appliedData).toEqual(cloudData);

            // Verify no push (cloud already has correct data)
            expect(mockProvider.callHistory.pushData).toBe(0);

            // Verify events
            expect(eventSpy.hasEvent('sync-resolved')).toBe(true);

            // Verify status
            expect(syncManager.getStatus()).toBe('idle');
        });

        it('should complete "cancel" resolution flow', async () => {
            // User chooses to cancel
            await syncManager.resolveConflict('cancel');

            // Verify signed out
            expect(mockProvider.isAuthenticated()).toBe(false);
            expect(syncManager.getStatus()).toBe('not_authenticated');

            // Verify events
            expect(eventSpy.hasEvent('sync-resolved')).toBe(true);

            // Verify cloud data unchanged
            assertSyncDataEqual(mockProvider.getCloudData()!, cloudData);
        });

        it('should allow normal sync after resolving conflict', async () => {
            // Resolve conflict
            await syncManager.resolveConflict('local');
            eventSpy.clear();

            // Trigger new push
            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            // Should push normally
            expect(mockProvider.callHistory.pushData).toBe(2); // 1 from resolution + 1 from new push
            expect(eventSpy.hasEvent('sync-pushed')).toBe(true);
        });
    });

    describe('End-to-End User Scenarios', () => {
        it('should handle complete user session: sign-in → modify → sync → sign-out', async () => {
            // Step 1: User signs in
            const initialData = await createSyncData();
            await syncManager.handleSignIn(initialData);
            expect(syncManager.isAuthenticated()).toBe(true);

            // Step 2: User modifies schedule
            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            expect(mockProvider.callHistory.pushData).toBe(2); // Initial + modification

            // Step 3: User modifies again
            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            expect(mockProvider.callHistory.pushData).toBe(3);

            // Step 4: User signs out
            await syncManager.signOut();
            expect(mockProvider.isAuthenticated()).toBe(false);
            expect(syncManager.getStatus()).toBe('not_authenticated');
        });

        it('should handle conflict resolution workflow', async () => {
            // Step 1: User signs in with conflicting data
            const { localData, cloudData } = await createConflictingData();
            mockProvider.setCloudData(cloudData);
            const conflict = await syncManager.handleSignIn(localData);

            expect(conflict).not.toBeNull();
            expect(syncManager.getStatus()).toBe('conflict');

            // Step 2: User reviews conflict and chooses local
            await syncManager.resolveConflict('local');

            expect(syncManager.getStatus()).toBe('idle');
            assertSyncDataEqual(mockProvider.getCloudData()!, localData);

            // Step 3: User continues working
            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            expect(mockProvider.callHistory.pushData).toBe(2); // Resolution + new change
        });

        it('should handle multiple sign-in/sign-out cycles', async () => {
            const data = await createSyncData();

            // Cycle 1
            await syncManager.handleSignIn(data);
            expect(mockProvider.isAuthenticated()).toBe(true);
            await syncManager.signOut();
            expect(mockProvider.isAuthenticated()).toBe(false);

            // Cycle 2
            await syncManager.handleSignIn(data);
            expect(mockProvider.isAuthenticated()).toBe(true);
            await syncManager.signOut();
            expect(mockProvider.isAuthenticated()).toBe(false);

            // Cycle 3
            await syncManager.handleSignIn(data);
            expect(mockProvider.isAuthenticated()).toBe(true);
        });

        it('should allow push during conflict state (pushes local changes)', async () => {
            // Create conflict
            const { localData, cloudData } = await createConflictingData();
            mockProvider.setCloudData(cloudData);
            await syncManager.handleSignIn(localData);

            expect(syncManager.getStatus()).toBe('conflict');

            // Trigger push - this should work (pushes override cloud during conflict)
            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            // Push happens even during conflict (local changes are pushed)
            expect(mockProvider.callHistory.pushData).toBeGreaterThan(0);
        });
    });

    describe('Multi-Device Scenarios', () => {
        it('should handle device A → cloud → device B flow', async () => {
            // Device A signs in and pushes data
            const deviceAData = await createSyncData();
            await syncManager.handleSignIn(deviceAData);
            expect(mockProvider.getCloudData()).toBeTruthy();

            // Device B signs in (simulated by new sign-in)
            await syncManager.signOut();
            mockProvider.reset();
            mockProvider.setCloudData(deviceAData);

            await mockProvider.initialize();
            const conflict = await syncManager.handleSignIn(deviceAData);

            // Should have no conflict (same data)
            expect(conflict).toBeNull();
        });

        it('should detect conflict when devices have different data', async () => {
            // Device A pushes data
            const deviceAData = await createSyncData();
            await syncManager.handleSignIn(deviceAData);

            // Device B has different data
            const deviceBData = await createSyncData({
                schedules: [
                    {
                        id: 'different-schedule',
                        name: 'Different Schedule',
                        selectedCourses: [],
                    },
                ],
            });

            await syncManager.signOut();
            const conflict = await syncManager.handleSignIn(deviceBData);

            // Should detect conflict
            expect(conflict).not.toBeNull();
            expect(conflict?.hasConflict).toBe(true);
        });
    });

    describe('Recovery Scenarios', () => {
        it('should recover from push failure and retry', async () => {
            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);

            // Simulate push failure
            mockProvider.setConfig({ pushFails: true });
            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            expect(syncManager.getStatus()).toBe('error');

            // Recover (network back)
            mockProvider.setConfig({ pushFails: false });
            syncEventBus.emitEvent('local-save-completed', {});
            await advanceTimersByTime(3000);
            await flushPromises();

            expect(syncManager.getStatus()).toBe('idle');
        });

        it('should continue working after resolving conflict', async () => {
            // Create and resolve conflict
            const { localData, cloudData } = await createConflictingData();
            mockProvider.setCloudData(cloudData);
            await syncManager.handleSignIn(localData);
            await syncManager.resolveConflict('local');

            // Make new changes
            for (let i = 0; i < 3; i++) {
                syncEventBus.emitEvent('local-save-completed', {});
                await advanceTimersByTime(3000);
                await flushPromises();
            }

            // Should push all changes
            expect(mockProvider.callHistory.pushData).toBe(4); // Resolution + 3 new pushes
        });
    });
});
