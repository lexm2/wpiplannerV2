import { describe, it, expect, beforeEach, afterEach, spyOn, mock, vi, jest } from 'bun:test';
import { SyncManager } from '../../../src/services/sync/SyncManager';
import { syncEventBus } from '../../../src/services/sync/SyncEventBus';
import { providerRegistry } from '../../../src/services/sync/ProviderRegistry';
import { MockCloudProvider } from '../../mocks/MockCloudProvider';
import {
    createSyncData,
    createConflictingData,
    createEventBusSpy,
} from '../../helpers/sync-test-utils';
import type { SyncData } from '../../../src/services/sync/types';

describe('SyncManager', () => {
    let syncManager: SyncManager;
    let mockProvider: MockCloudProvider;
    let eventSpy: ReturnType<typeof createEventBusSpy>;

    beforeEach(() => {
        // Use fake timers for debounce testing
        vi.useFakeTimers();

        // Create fresh SyncManager instance for each test
        syncManager = SyncManager.getInstance();

        // Create mock provider
        mockProvider = new MockCloudProvider();

        // Register mock provider
        providerRegistry.register(mockProvider);
        syncManager.setProvider('mock');

        // Setup event spy
        eventSpy = createEventBusSpy();
        syncEventBus.on('auth-changed', eventSpy.listener);
        syncEventBus.on('sync-conflict', eventSpy.listener);
        syncEventBus.on('sync-resolved', eventSpy.listener);
        syncEventBus.on('sync-pushed', eventSpy.listener);
        syncEventBus.on('sync-failed', eventSpy.listener);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        mockProvider.reset();
        eventSpy.clear();
    });

    describe('Sign-in Flow', () => {
        it('should sign in successfully with no cloud data (initial push)', async () => {
            const localData = await createSyncData();

            const conflict = await syncManager.handleSignIn(localData);

            expect(conflict).toBeNull();
            expect(mockProvider.isAuthenticated()).toBe(true);
            expect(mockProvider.callHistory.signIn).toBe(1);
            expect(mockProvider.callHistory.pullData).toBe(1);
            expect(mockProvider.callHistory.pushData).toBe(1);
            expect(eventSpy.hasEvent('auth-changed')).toBe(true);
            expect(eventSpy.hasEvent('sync-pushed')).toBe(true);
        });

        it('should detect no conflict when checksums match', async () => {
            const localData = await createSyncData();
            mockProvider.setCloudData(localData);

            const conflict = await syncManager.handleSignIn(localData);

            expect(conflict).toBeNull();
            expect(mockProvider.callHistory.pushData).toBe(0); // No push needed
            expect(syncManager.getStatus()).toBe('idle');
        });

        it('should detect conflict when checksums differ', async () => {
            const { localData, cloudData } = await createConflictingData();
            mockProvider.setCloudData(cloudData);

            const conflict = await syncManager.handleSignIn(localData);

            expect(conflict).not.toBeNull();
            expect(conflict?.hasConflict).toBe(true);
            expect(conflict?.localData.checksum).not.toBe(conflict?.cloudData.checksum);
            expect(syncManager.getStatus()).toBe('conflict');
            expect(eventSpy.hasEvent('sync-conflict')).toBe(true);
        });

        it('should emit sync-conflict event with conflict info', async () => {
            const { localData, cloudData } = await createConflictingData();
            mockProvider.setCloudData(cloudData);

            await syncManager.handleSignIn(localData);

            const conflictEvent = eventSpy.getLatestEvent('sync-conflict');
            expect(conflictEvent).toBeDefined();
            expect(conflictEvent?.data).toHaveProperty('hasConflict', true);
        });

        it('should handle authentication failure', async () => {
            mockProvider.setConfig({ authSucceeds: false });
            const localData = await createSyncData();

            await expect(syncManager.handleSignIn(localData)).rejects.toThrow(
                'Mock authentication failed'
            );
            expect(mockProvider.isAuthenticated()).toBe(false);
        });

        it('should update status to error on sign-in failure', async () => {
            mockProvider.setConfig({ pullFails: true });
            const localData = await createSyncData();

            await expect(syncManager.handleSignIn(localData)).rejects.toThrow();
            expect(syncManager.getStatus()).toBe('error');
            expect(eventSpy.hasEvent('sync-failed')).toBe(true);
        });
    });

    describe('Conflict Resolution', () => {
        let localData: SyncData;
        let cloudData: SyncData;

        beforeEach(async () => {
            const conflictData = await createConflictingData();
            localData = conflictData.localData;
            cloudData = conflictData.cloudData;
            mockProvider.setCloudData(cloudData);
            await syncManager.handleSignIn(localData);
        });

        it('should resolve conflict with "local" choice', async () => {
            await syncManager.resolveConflict('local');

            expect(syncManager.getStatus()).toBe('idle');
            expect(mockProvider.callHistory.pushData).toBe(1);
            expect(eventSpy.hasEvent('sync-resolved')).toBe(true);
            expect(eventSpy.hasEvent('sync-pushed')).toBe(true);

            const resolvedEvent = eventSpy.getLatestEvent('sync-resolved');
            expect(resolvedEvent?.data).toHaveProperty('resolution', 'local');
        });

        it('should resolve conflict with "cloud" choice', async () => {
            const applyCloudData = mock().mockResolvedValue(undefined);

            await syncManager.resolveConflict('cloud');

            expect(syncManager.getStatus()).toBe('idle');
            expect(applyCloudData).toHaveBeenCalledWith(cloudData);
            expect(mockProvider.callHistory.pushData).toBe(0); // No push for cloud resolution
            expect(eventSpy.hasEvent('sync-resolved')).toBe(true);

            const resolvedEvent = eventSpy.getLatestEvent('sync-resolved');
            expect(resolvedEvent?.data).toHaveProperty('resolution', 'cloud');
        });

        it('should resolve conflict with "cancel" choice', async () => {
            await syncManager.resolveConflict('cancel');

            expect(syncManager.getStatus()).toBe('not_authenticated');
            expect(mockProvider.isAuthenticated()).toBe(false);
            expect(eventSpy.hasEvent('sync-resolved')).toBe(true);

            const resolvedEvent = eventSpy.getLatestEvent('sync-resolved');
            expect(resolvedEvent?.data).toHaveProperty('resolution', 'cancel');
        });

        it('should throw error if no pending conflict', async () => {
            // Resolve first
            await syncManager.resolveConflict('local');

            // Try to resolve again
            await expect(syncManager.resolveConflict('local')).rejects.toThrow(
                'No pending conflict to resolve'
            );
        });

        it('should handle resolution failure', async () => {
            mockProvider.setConfig({ pushFails: true });

            await expect(syncManager.resolveConflict('local')).rejects.toThrow();
            expect(syncManager.getStatus()).toBe('error');
            expect(eventSpy.hasEvent('sync-failed')).toBe(true);
        });
    });

    describe('Push Flow (Debounced)', () => {
        let testData: SyncData;

        beforeEach(async () => {
            // Sign in first
            testData = await createSyncData();
            await syncManager.handleSignIn(testData);
            mockProvider.resetCallHistory();
            eventSpy.clear();

            // Mock getLocalSyncData to return test data
            spyOn(syncManager as any, 'getLocalSyncData').mockResolvedValue(testData);
        });

        it('should schedule a push after 3 seconds', async () => {
            syncEventBus.emitEvent('local-save-completed', {});

            // Before 3 seconds
            jest.advanceTimersByTime(2000);
            jest.runAllTimers();
            expect(mockProvider.callHistory.pushData).toBe(0);

            // After 3 seconds
            jest.advanceTimersByTime(1000);
            jest.runAllTimers();
            expect(mockProvider.callHistory.pushData).toBe(1);
        });

        it('should debounce multiple rapid changes into single push', async () => {
            // Trigger multiple saves rapidly
            syncEventBus.emitEvent('local-save-completed', {});
            jest.advanceTimersByTime(1000);
            syncEventBus.emitEvent('local-save-completed', {});
            jest.advanceTimersByTime(1000);
            syncEventBus.emitEvent('local-save-completed', {});

            // Wait for debounce
            jest.advanceTimersByTime(3000);
            jest.runAllTimers();

            // Should only push once
            expect(mockProvider.callHistory.pushData).toBe(1);
        });

        it('should not push if not authenticated', async () => {
            await syncManager.signOut();
            mockProvider.resetCallHistory();

            syncEventBus.emitEvent('local-save-completed', {});
            jest.advanceTimersByTime(3000);
            jest.runAllTimers();

            expect(mockProvider.callHistory.pushData).toBe(0);
        });

        it('should emit sync-pushed event on successful push', async () => {
            syncEventBus.emitEvent('local-save-completed', {});
            jest.advanceTimersByTime(3000);
            jest.runAllTimers();

            expect(eventSpy.hasEvent('sync-pushed')).toBe(true);
        });

        it('should handle push failure gracefully', async () => {
            mockProvider.setConfig({ pushFails: true });

            syncEventBus.emitEvent('local-save-completed', {});
            jest.advanceTimersByTime(3000);
            jest.runAllTimers();

            expect(syncManager.getStatus()).toBe('error');
            expect(eventSpy.hasEvent('sync-failed')).toBe(true);
        });

        it('should allow custom debounce time', async () => {
            syncManager.setDebounceMs(1000); // 1 second

            syncEventBus.emitEvent('local-save-completed', {});

            // Should push after 1 second now
            jest.advanceTimersByTime(1000);
            jest.runAllTimers();

            expect(mockProvider.callHistory.pushData).toBe(1);
        });
    });

    describe('pushToCloud (Immediate Push)', () => {
        let testData: SyncData;

        beforeEach(async () => {
            testData = await createSyncData();
            await syncManager.handleSignIn(testData);
            mockProvider.resetCallHistory();
            eventSpy.clear();

            // Mock getLocalSyncData to return test data
            spyOn(syncManager as any, 'getLocalSyncData').mockResolvedValue(testData);
        });

        it('should push data immediately without debounce', async () => {
            const data = await createSyncData();

            await syncManager.pushToCloud(data);

            expect(mockProvider.callHistory.pushData).toBe(1);
            expect(mockProvider.getCloudData()?.checksum).toBe(data.checksum);
        });

        it('should update status during push', async () => {
            const data = await createSyncData();

            const pushPromise = syncManager.pushToCloud(data);
            expect(syncManager.getStatus()).toBe('syncing');

            await pushPromise;
            expect(syncManager.getStatus()).toBe('idle');
        });

        it('should cancel pending debounced push', async () => {
            const data = await createSyncData();

            // Schedule debounced push
            syncEventBus.emitEvent('local-save-completed', {});

            // Immediately push
            await syncManager.pushToCloud(data);

            // Advance timer - debounced push should not happen
            jest.advanceTimersByTime(3000);
            jest.runAllTimers();

            // Should only have 1 push (the immediate one)
            expect(mockProvider.callHistory.pushData).toBe(1);
        });

        it('should throw error if not authenticated', async () => {
            await syncManager.signOut();
            const data = await createSyncData();

            // Should not throw, but should warn and return
            await syncManager.pushToCloud(data);
            expect(mockProvider.callHistory.pushData).toBe(0);
        });
    });

    describe('Sign Out', () => {
        let testData: SyncData;

        beforeEach(async () => {
            testData = await createSyncData();
            await syncManager.handleSignIn(testData);
            eventSpy.clear();

            // Mock getLocalSyncData to return test data
            spyOn(syncManager as any, 'getLocalSyncData').mockResolvedValue(testData);
        });

        it('should sign out successfully', async () => {
            await syncManager.signOut();

            expect(mockProvider.isAuthenticated()).toBe(false);
            expect(syncManager.getStatus()).toBe('not_authenticated');
            expect(eventSpy.hasEvent('auth-changed')).toBe(true);
        });

        it('should cancel pending push on sign out', async () => {
            syncEventBus.emitEvent('local-save-completed', {});

            await syncManager.signOut();
            mockProvider.resetCallHistory();

            // Advance timer
            jest.advanceTimersByTime(3000);
            jest.runAllTimers();

            // Push should not happen
            expect(mockProvider.callHistory.pushData).toBe(0);
        });

        it('should clear pending conflict on sign out', async () => {
            // Create conflict
            const { localData, cloudData } = await createConflictingData();
            mockProvider.setCloudData(cloudData);
            const newManager = SyncManager.getInstance();
            newManager.setProvider('mock');
            await newManager.handleSignIn(localData);

            // Sign out
            await newManager.signOut();

            // Try to resolve - should fail
            await expect(newManager.resolveConflict('local')).rejects.toThrow(
                'No pending conflict'
            );
        });
    });

    describe('Status Management', () => {
        it('should start with not_authenticated status', () => {
            const freshManager = SyncManager.getInstance();
            expect(freshManager.getStatus()).toBe('not_authenticated');
        });

        it('should update status to idle after successful sign-in', async () => {
            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);
            expect(syncManager.getStatus()).toBe('idle');
        });

        it('should update status to conflict on conflict detection', async () => {
            const { localData, cloudData } = await createConflictingData();
            mockProvider.setCloudData(cloudData);
            await syncManager.handleSignIn(localData);
            expect(syncManager.getStatus()).toBe('conflict');
        });

        it('should update status to syncing during push', async () => {
            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);

            const pushPromise = syncManager.pushToCloud(localData);
            expect(syncManager.getStatus()).toBe('syncing');
            await pushPromise;
        });

        it('should update status to error on failure', async () => {
            mockProvider.setConfig({ pushFails: true });
            const localData = await createSyncData();

            try {
                await syncManager.handleSignIn(localData);
            } catch {
                // Expected
            }

            expect(syncManager.getStatus()).toBe('error');
        });
    });

    describe('Provider Management', () => {
        it('should get current provider', () => {
            const provider = syncManager.getCurrentProvider();
            expect(provider).toBe(mockProvider);
        });

        it('should set provider by ID', () => {
            syncManager.setProvider('mock');
            const provider = syncManager.getCurrentProvider();
            expect(provider?.id).toBe('mock');
        });

        it('should throw error if provider not registered', () => {
            expect(() => syncManager.setProvider('nonexistent')).toThrow(
                "Provider 'nonexistent' not registered"
            );
        });

        it('should check authentication status', async () => {
            expect(syncManager.isAuthenticated()).toBe(false);

            const localData = await createSyncData();
            await syncManager.handleSignIn(localData);

            expect(syncManager.isAuthenticated()).toBe(true);
        });
    });
});
