import { describe, it, expect, beforeEach, afterEach, mock, jest, spyOn } from 'bun:test';
import { syncEventBus } from '../../../src/services/sync/SyncEventBus';
import {
    setupSyncTest,
    setupSyncTestWithAuth,
    setupSyncTestWithStorage,
    cleanupSyncTest,
    recreateProviderWithConfig,
    type SyncTestContext,
} from '../../helpers/sync-test-setup';
import {
    createSyncData,
    createConflictingData,
    createSchedule,
} from '../../helpers/sync-test-utils';

describe('SyncManager (Unified)', () => {
    let ctx: SyncTestContext;

    describe('Sign-in Flow', () => {
        beforeEach(async () => {
            ctx = await setupSyncTest();
        });

        afterEach(() => {
            cleanupSyncTest(ctx);
        });

        it('should sign in successfully with no cloud data (initial push)', async () => {
            const conflict = await ctx.syncManager.handleSignIn(ctx.testData);

            expect(conflict).toBeNull();
            expect(ctx.mockProvider.isAuthenticated()).toBe(true);
            expect(ctx.mockProvider.callHistory.signIn).toBe(1);
            expect(ctx.mockProvider.callHistory.pullData).toBe(1);
            expect(ctx.mockProvider.callHistory.pushData).toBe(1);
            expect(ctx.eventSpy.hasEvent('auth-changed')).toBe(true);
            expect(ctx.eventSpy.hasEvent('sync-pushed')).toBe(true);
        });

        it('should detect no conflict when checksums match', async () => {
            ctx.mockProvider.setCloudData(ctx.testData);

            const conflict = await ctx.syncManager.handleSignIn(ctx.testData);

            expect(conflict).toBeNull();
            expect(ctx.mockProvider.callHistory.pushData).toBe(0); // No push needed
            expect(ctx.syncManager.getStatus()).toBe('idle');
        });

        it('should detect conflict when checksums differ', async () => {
            const { localData, cloudData } = await createConflictingData();
            ctx.mockProvider.setCloudData(cloudData);

            const conflict = await ctx.syncManager.handleSignIn(localData);

            expect(conflict).not.toBeNull();
            expect(conflict?.hasConflict).toBe(true);
            expect(conflict?.localData.checksum).not.toBe(conflict?.cloudData.checksum);
            expect(ctx.syncManager.getStatus()).toBe('conflict');
            expect(ctx.eventSpy.hasEvent('sync-conflict')).toBe(true);
        });

        it('should handle authentication failure', async () => {
            await recreateProviderWithConfig(ctx, { authSucceeds: false });

            await expect(ctx.syncManager.handleSignIn(ctx.testData)).rejects.toThrow(
                'Mock authentication failed'
            );
            expect(ctx.mockProvider.isAuthenticated()).toBe(false);
        });

        it('should update status to error on sign-in failure', async () => {
            await recreateProviderWithConfig(ctx, { pullFails: true });

            await expect(ctx.syncManager.handleSignIn(ctx.testData)).rejects.toThrow();
            expect(ctx.syncManager.getStatus()).toBe('error');
            expect(ctx.eventSpy.hasEvent('sync-failed')).toBe(true);
        });
    });

    describe('Conflict Resolution', () => {
        beforeEach(async () => {
            ctx = await setupSyncTest();
        });

        afterEach(() => {
            cleanupSyncTest(ctx);
        });

        it('should resolve conflict with "local" choice', async () => {
            const { localData, cloudData } = await createConflictingData();
            ctx.mockProvider.setCloudData(cloudData);
            await ctx.syncManager.handleSignIn(localData);
            ctx.eventSpy.clear();

            await ctx.syncManager.resolveConflict('local');

            expect(ctx.syncManager.getStatus()).toBe('idle');
            expect(ctx.mockProvider.callHistory.pushData).toBe(1);
            expect(ctx.eventSpy.hasEvent('sync-resolved')).toBe(true);
            expect(ctx.eventSpy.hasEvent('sync-pushed')).toBe(true);
        });

        it('should resolve conflict with "cloud" choice', async () => {
            const { localData, cloudData } = await createConflictingData();
            ctx.mockProvider.setCloudData(cloudData);
            await ctx.syncManager.handleSignIn(localData);
            ctx.eventSpy.clear();

            // Set up mock state manager
            const mockStateManager = {
                importData: mock().mockResolvedValue({ success: true }),
            };
            ctx.syncManager.setStateManager(mockStateManager);

            await ctx.syncManager.resolveConflict('cloud');

            expect(ctx.syncManager.getStatus()).toBe('idle');
            expect(mockStateManager.importData).toHaveBeenCalledWith(cloudData);
            expect(ctx.mockProvider.callHistory.pushData).toBe(0);
            expect(ctx.eventSpy.hasEvent('sync-resolved')).toBe(true);
        });

        it('should resolve conflict with "cancel" choice', async () => {
            const { localData, cloudData } = await createConflictingData();
            ctx.mockProvider.setCloudData(cloudData);
            await ctx.syncManager.handleSignIn(localData);

            await ctx.syncManager.resolveConflict('cancel');

            expect(ctx.syncManager.getStatus()).toBe('not_authenticated');
            expect(ctx.mockProvider.isAuthenticated()).toBe(false);
            expect(ctx.eventSpy.hasEvent('sync-resolved')).toBe(true);
        });
    });

    describe('Push Flow (Debounced)', () => {
        beforeEach(async () => {
            ctx = await setupSyncTestWithAuth();
        });

        afterEach(() => {
            cleanupSyncTest(ctx);
        });

        it('should schedule a push after 3 seconds', async () => {
            syncEventBus.emitEvent('local-save-completed', {});

            // Before 3 seconds - shouldn't push yet
            jest.advanceTimersByTime(2000);
            expect(ctx.mockProvider.callHistory.pushData).toBe(0);

            // After 3 seconds - should push
            jest.advanceTimersByTime(1000);
            expect(ctx.mockProvider.callHistory.pushData).toBe(1);
        });

        it('should debounce multiple rapid changes into single push', async () => {
            syncEventBus.emitEvent('local-save-completed', {});
            jest.advanceTimersByTime(1000);
            syncEventBus.emitEvent('local-save-completed', {});
            jest.advanceTimersByTime(1000);
            syncEventBus.emitEvent('local-save-completed', {});

            jest.advanceTimersByTime(3000);
            jest.runAllTimers();

            expect(ctx.mockProvider.callHistory.pushData).toBe(1);
        });

        it('should not push if not authenticated', async () => {
            await ctx.syncManager.signOut();
            ctx.mockProvider.resetCallHistory();

            syncEventBus.emitEvent('local-save-completed', {});
            jest.advanceTimersByTime(3000);
            jest.runAllTimers();

            expect(ctx.mockProvider.callHistory.pushData).toBe(0);
        });

        it('should emit sync-pushed event on successful push', async () => {
            syncEventBus.emitEvent('local-save-completed', {});
            jest.advanceTimersByTime(3000);
            jest.runAllTimers();

            expect(ctx.eventSpy.hasEvent('sync-pushed')).toBe(true);
        });

        it('should handle push failure gracefully', async () => {
            // Change provider config to fail pushes
            ctx.mockProvider.setConfig({ pushFails: true });

            syncEventBus.emitEvent('local-save-completed', {});
            jest.advanceTimersByTime(3000);
            jest.runAllTimers();

            expect(ctx.syncManager.getStatus()).toBe('error');
            expect(ctx.eventSpy.hasEvent('sync-failed')).toBe(true);
        });

        it('should allow custom debounce time', async () => {
            ctx.syncManager.setDebounceMs(1000);

            syncEventBus.emitEvent('local-save-completed', {});
            jest.advanceTimersByTime(1000);
            jest.runAllTimers();

            expect(ctx.mockProvider.callHistory.pushData).toBe(1);
        });
    });

    describe('pushToCloud (Immediate Push)', () => {
        beforeEach(async () => {
            ctx = await setupSyncTestWithAuth();
        });

        afterEach(() => {
            cleanupSyncTest(ctx);
        });

        it('should push data immediately without debounce', async () => {
            const data = await createSyncData();

            await ctx.syncManager.pushToCloud(data);

            expect(ctx.mockProvider.callHistory.pushData).toBe(1);
            expect(ctx.mockProvider.getCloudData()?.checksum).toBe(data.checksum);
        });

        it('should update status during push', async () => {
            const data = await createSyncData();

            const pushPromise = ctx.syncManager.pushToCloud(data);
            expect(ctx.syncManager.getStatus()).toBe('syncing');

            await pushPromise;
            expect(ctx.syncManager.getStatus()).toBe('idle');
        });

        it('should cancel pending debounced push', async () => {
            const data = await createSyncData();

            syncEventBus.emitEvent('local-save-completed', {});
            await ctx.syncManager.pushToCloud(data);

            jest.advanceTimersByTime(3000);
            jest.runAllTimers();

            expect(ctx.mockProvider.callHistory.pushData).toBe(1);
        });
    });

    describe('Sign Out', () => {
        beforeEach(async () => {
            ctx = await setupSyncTestWithAuth();
        });

        afterEach(() => {
            cleanupSyncTest(ctx);
        });

        it('should sign out successfully', async () => {
            await ctx.syncManager.signOut();

            expect(ctx.mockProvider.isAuthenticated()).toBe(false);
            expect(ctx.syncManager.getStatus()).toBe('not_authenticated');
            expect(ctx.eventSpy.hasEvent('auth-changed')).toBe(true);
        });

        it('should cancel pending push on sign out', async () => {
            syncEventBus.emitEvent('local-save-completed', {});

            await ctx.syncManager.signOut();
            ctx.mockProvider.resetCallHistory();

            jest.advanceTimersByTime(3000);
            jest.runAllTimers();

            expect(ctx.mockProvider.callHistory.pushData).toBe(0);
        });
    });

    describe('Status Management', () => {
        beforeEach(async () => {
            ctx = await setupSyncTest();
        });

        afterEach(() => {
            cleanupSyncTest(ctx);
        });

        it('should update status to idle after successful sign-in', async () => {
            await ctx.syncManager.handleSignIn(ctx.testData);
            expect(ctx.syncManager.getStatus()).toBe('idle');
        });

        it('should update status to conflict on conflict detection', async () => {
            const { localData, cloudData } = await createConflictingData();
            ctx.mockProvider.setCloudData(cloudData);
            await ctx.syncManager.handleSignIn(localData);
            expect(ctx.syncManager.getStatus()).toBe('conflict');
        });

        it('should update status to syncing during push', async () => {
            await ctx.syncManager.handleSignIn(ctx.testData);

            const pushPromise = ctx.syncManager.pushToCloud(ctx.testData);
            expect(ctx.syncManager.getStatus()).toBe('syncing');
            await pushPromise;
        });

        it('should update status to error on failure', async () => {
            await recreateProviderWithConfig(ctx, { pushFails: true });

            try {
                await ctx.syncManager.handleSignIn(ctx.testData);
            } catch {
                // Expected
            }

            expect(ctx.syncManager.getStatus()).toBe('error');
        });
    });

    describe('Provider Management', () => {
        beforeEach(async () => {
            ctx = await setupSyncTest();
        });

        afterEach(() => {
            cleanupSyncTest(ctx);
        });

        it('should get current provider', () => {
            const provider = ctx.syncManager.getCurrentProvider();
            expect(provider).toBe(ctx.mockProvider);
        });

        it('should check authentication status', async () => {
            expect(ctx.syncManager.isAuthenticated()).toBe(false);

            await ctx.syncManager.handleSignIn(ctx.testData);

            expect(ctx.syncManager.isAuthenticated()).toBe(true);
        });
    });

    describe('performInitialSync() - New Sign-In Flow', () => {
        describe('Authentication Separation', () => {
            beforeEach(async () => {
                ctx = await setupSyncTest();
            });

            afterEach(() => {
                cleanupSyncTest(ctx);
            });

            it('should only authenticate without data operations', async () => {
                const cloudData = await createSyncData();
                ctx.mockProvider.setCloudData(cloudData);

                await ctx.syncManager.signIn();

                expect(ctx.mockProvider.isAuthenticated()).toBe(true);
                expect(ctx.mockProvider.callHistory.signIn).toBe(1);
                expect(ctx.mockProvider.callHistory.pullData).toBe(0);
                expect(ctx.mockProvider.callHistory.pushData).toBe(0);
                expect(ctx.syncManager.isAuthenticated()).toBe(true);
            });
        });

        describe('First-Time Cloud Sync', () => {
            beforeEach(async () => {
                ctx = await setupSyncTest();
                await ctx.syncManager.signIn();
            });

            afterEach(() => {
                cleanupSyncTest(ctx);
            });

            it('should push local data when cloud is empty', async () => {
                const result = await ctx.syncManager.performInitialSync();

                expect(result).toBeNull();
                expect(ctx.mockProvider.callHistory.pullData).toBe(1);
                expect(ctx.mockProvider.callHistory.pushData).toBe(1);
                expect(ctx.eventSpy.hasEvent('sync-pushed')).toBe(true);

                const cloudData = ctx.mockProvider.getCloudData();
                expect(cloudData).not.toBeNull();
                expect(cloudData?.checksum).toBe(ctx.testData.checksum);
            });
        });

        describe('First-Time Device Sign-In', () => {
            beforeEach(async () => {
                ctx = await setupSyncTestWithStorage();
                await ctx.syncManager.signIn();
            });

            afterEach(() => {
                cleanupSyncTest(ctx);
            });

            it('should auto-import cloud data when local has no schedules', async () => {
                const cloudData = await createSyncData({
                    schedules: [createSchedule({ name: 'Cloud Schedule' })]
                });
                ctx.mockProvider.setCloudData(cloudData);

                const emptyLocalData = await createSyncData({ schedules: [] });
                const getLocalSpy = mock(() => Promise.resolve(emptyLocalData));
                ctx.syncManager['getLocalSyncData'] = getLocalSpy;

                ctx.syncManager.setStateManager(ctx.profileManager!);

                const result = await ctx.syncManager.performInitialSync();

                expect(result).toBeNull();
                expect(ctx.eventSpy.hasEvent('sync-resolved')).toBe(true);
                expect(ctx.eventSpy.getLatestEvent('sync-resolved')?.data).toEqual({
                    resolution: 'cloud'
                });
                expect(ctx.syncManager.getStatus()).toBe('idle');
                expect(ctx.mockProvider.callHistory.pushData).toBe(0);
            });
        });

        describe('Conflict Detection', () => {
            beforeEach(async () => {
                ctx = await setupSyncTest();
                await ctx.syncManager.signIn();
            });

            afterEach(() => {
                cleanupSyncTest(ctx);
            });

            it('should detect conflicts when both have different data', async () => {
                const { localData, cloudData } = await createConflictingData();
                ctx.mockProvider.setCloudData(cloudData);

                const getLocalSpy = mock(() => Promise.resolve(localData));
                ctx.syncManager['getLocalSyncData'] = getLocalSpy;

                const result = await ctx.syncManager.performInitialSync();

                expect(result).not.toBeNull();
                expect(result?.hasConflict).toBe(true);
                expect(ctx.eventSpy.hasEvent('sync-conflict')).toBe(true);
                expect(ctx.syncManager.getStatus()).toBe('conflict');
                expect(ctx.mockProvider.callHistory.pushData).toBe(0);
            });

            it('should not show conflict when checksums match', async () => {
                const matchingData = await createSyncData();
                ctx.mockProvider.setCloudData(matchingData);

                const getLocalSpy = mock(() => Promise.resolve(matchingData));
                ctx.syncManager['getLocalSyncData'] = getLocalSpy;

                const result = await ctx.syncManager.performInitialSync();

                expect(result).toBeNull();
                expect(ctx.eventSpy.hasEvent('sync-conflict')).toBe(false);
                expect(ctx.syncManager.getStatus()).toBe('idle');
            });
        });

        describe('Error Handling', () => {
            beforeEach(async () => {
                ctx = await setupSyncTest({ mockLocalSyncData: false });
            });

            afterEach(() => {
                cleanupSyncTest(ctx);
            });

            it('should throw error if called without authentication', async () => {
                await expect(ctx.syncManager.performInitialSync()).rejects.toThrow(
                    'Not authenticated'
                );
            });

            it('should throw error if state manager not set for first-time import', async () => {
                await ctx.syncManager.signIn();

                // Ensure state manager is explicitly not set
                (ctx.syncManager as any).stateManager = null;

                const cloudData = await createSyncData({
                    schedules: [createSchedule()]
                });
                ctx.mockProvider.setCloudData(cloudData);

                const emptyLocalData = await createSyncData({ schedules: [] });
                spyOn(ctx.syncManager as any, 'getLocalSyncData').mockResolvedValue(emptyLocalData);

                await expect(ctx.syncManager.performInitialSync()).rejects.toThrow(
                    'State manager not set'
                );
            });
        });

        describe('Silent Auth Integration', () => {
            beforeEach(async () => {
                ctx = await setupSyncTest();
                await ctx.syncManager.signIn();
            });

            afterEach(() => {
                cleanupSyncTest(ctx);
            });

            it('should be callable after silent-auth-completed event', async () => {
                const cloudData = await createSyncData();
                ctx.mockProvider.setCloudData(cloudData);

                const getLocalSpy = mock(() => Promise.resolve(ctx.testData));
                ctx.syncManager['getLocalSyncData'] = getLocalSpy;

                syncEventBus.emitEvent('silent-auth-completed', {});

                await ctx.syncManager.performInitialSync();

                expect(ctx.mockProvider.callHistory.pullData).toBe(1);
            });
        });
    });
});
