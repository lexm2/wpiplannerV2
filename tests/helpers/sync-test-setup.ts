import { beforeEach, afterEach, spyOn, mock, jest } from 'bun:test';
import { SyncManager } from '../../src/services/sync/SyncManager';
import { syncEventBus } from '../../src/services/sync/SyncEventBus';
import { providerRegistry } from '../../src/services/sync/ProviderRegistry';
import { ProfileStateManager } from '../../src/core/state/ProfileStateManager';
import { MockCloudProvider } from '../mocks/MockCloudProvider';
import type { MockProviderConfig } from '../mocks/MockCloudProvider';
import { createSyncData, createEventBusSpy } from './sync-test-utils';
import type { SyncData } from '../../src/services/sync/types';
import type { MockIndexedDB } from '../mocks/MockIndexedDB';
import {
    createMockUIComponents,
    resetMockUIComponents,
    type MockUIContext
} from '../mocks/MockUIComponents';


/**
 * Unified Sync Test Context
 *
 * Provides a consistent test environment for all sync tests with:
 * - Configured SyncManager instance
 * - Registered MockCloudProvider
 * - Event tracking spy
 * - Fake timers for debounce testing
 * - Mocked ProfileStateManager data
 * - Optional UI component mocks
 * - Optional IndexedDB reference
 */
export interface SyncTestContext {
    syncManager: SyncManager;
    mockProvider: MockCloudProvider;
    eventSpy: ReturnType<typeof createEventBusSpy>;
    testData: SyncData;
    /** Optional ProfileStateManager (only if includeStorage=true) */
    profileManager?: ProfileStateManager;
    /** Optional IndexedDB mock reference (only if includeStorage=true) */
    mockIndexedDB?: MockIndexedDB;
    /** Optional UI component mocks (only if includeUI=true) */
    mockUI?: MockUIContext;
}

/**
 * Options for configuring the sync test environment
 */
export interface SyncTestSetupOptions {
    /** Configure mock provider behavior */
    providerConfig?: MockProviderConfig;
    /** Whether to use fake timers (default: true) */
    useFakeTimers?: boolean;
    /** Whether to sign in automatically (default: false) */
    autoSignIn?: boolean;
    /** Custom test data to use */
    customTestData?: SyncData;
    /** Include ProfileStateManager and IndexedDB mock reference (default: false) */
    includeStorage?: boolean;
    /** Include mock UI components (default: false) */
    includeUI?: boolean;
    /** Wire up UI hydration events automatically (default: false, requires includeUI=true) */
    wireUIEvents?: boolean;
}

/**
 * Setup a unified sync test environment
 *
 * Call this in beforeEach to get a consistent test context:
 *
 * @example
 * ```typescript
 * describe('My Sync Tests', () => {
 *     let ctx: SyncTestContext;
 *
 *     beforeEach(async () => {
 *         ctx = await setupSyncTest();
 *     });
 *
 *     afterEach(() => {
 *         cleanupSyncTest(ctx);
 *     });
 *
 *     it('should do something', async () => {
 *         await ctx.syncManager.handleSignIn(ctx.testData);
 *         expect(ctx.mockProvider.isAuthenticated()).toBe(true);
 *     });
 * });
 * ```
 */
export async function setupSyncTest(options: SyncTestSetupOptions = {}): Promise<SyncTestContext> {
    const {
        providerConfig = {},
        useFakeTimers = true,
        autoSignIn = false,
        customTestData,
        includeStorage = false,
        includeUI = false,
        wireUIEvents = false,
    } = options;

    // Setup fake timers if requested
    if (useFakeTimers) {
        jest.useFakeTimers();
    }

    // Create test data
    const testData = customTestData || await createSyncData();

    // Get SyncManager instance
    const syncManager = SyncManager.getInstance();

    // Create and register mock provider
    const mockProvider = new MockCloudProvider(providerConfig);
    await mockProvider.initialize();
    providerRegistry.register(mockProvider);
    syncManager.setProvider('mock');

    // Setup event spy
    const eventSpy = createEventBusSpy();
    syncEventBus.on('auth-changed', eventSpy.listener);
    syncEventBus.on('sync-conflict', eventSpy.listener);
    syncEventBus.on('sync-resolved', eventSpy.listener);
    syncEventBus.on('sync-pushed', eventSpy.listener);
    syncEventBus.on('sync-failed', eventSpy.listener);
    syncEventBus.on('sync-started', eventSpy.listener);
    syncEventBus.on('local-save-completed', eventSpy.listener);

    // Mock getLocalSyncData to return test data (needed for debounced push)
    spyOn(syncManager as any, 'getLocalSyncData').mockResolvedValue(testData);

    const context: SyncTestContext = {
        syncManager,
        mockProvider,
        eventSpy,
        testData,
    };

    // Setup storage infrastructure if requested
    if (includeStorage) {
        const profileManager = ProfileStateManager.getInstance();
        const mockIndexedDB = (global as any).__mockIndexedDB__;
        mockIndexedDB.reset();

        context.profileManager = profileManager;
        context.mockIndexedDB = mockIndexedDB;
    }

    // Setup UI mocks if requested
    if (includeUI) {
        const mockUI = createMockUIComponents();
        mockUI.courseDataCoordinator.registerConsumer(mockUI.courseController);
        mockUI.courseDataCoordinator.registerConsumer(mockUI.scheduleController);
        mockUI.courseDataCoordinator.registerConsumer(mockUI.departmentController);

        context.mockUI = mockUI;

        // Wire up UI hydration events if requested
        if (wireUIEvents && context.profileManager) {
            const eventListener = () => {
                mockUI.scheduleController.displayScheduleSelectedCourses();
                mockUI.courseController.refreshCourseSelectionUI();
                mockUI.courseController.displaySelectedCourses();
            };
            context.profileManager.addListener(eventListener);
        }
    }

    // Auto sign-in if requested
    if (autoSignIn) {
        await syncManager.handleSignIn(testData);
        mockProvider.resetCallHistory();
        eventSpy.clear();
    }

    return context;
}

/**
 * Cleanup after sync tests
 *
 * Call this in afterEach to clean up the test environment:
 *
 * @example
 * ```typescript
 * afterEach(() => {
 *     cleanupSyncTest(ctx);
 * });
 * ```
 */
export function cleanupSyncTest(ctx: SyncTestContext): void {
    // Restore real timers
    jest.useRealTimers();

    // Reset mock provider
    ctx.mockProvider.reset();

    // Clear event spy
    ctx.eventSpy.clear();

    // Clean up UI mocks if present
    if (ctx.mockUI) {
        resetMockUIComponents(ctx.mockUI);
    }

    // Clean up storage if present
    if (ctx.mockIndexedDB) {
        ctx.mockIndexedDB.reset();
    }

    // Clear localStorage items used by sync
    localStorage.removeItem('google-drive-auth');
    localStorage.removeItem('wpi-planner-device-id');
}

/**
 * Setup sync test with auto sign-in
 *
 * Convenience function for tests that need to start authenticated.
 * Equivalent to setupSyncTest({ autoSignIn: true })
 */
export async function setupSyncTestWithAuth(options: Omit<SyncTestSetupOptions, 'autoSignIn'> = {}): Promise<SyncTestContext> {
    return setupSyncTest({ ...options, autoSignIn: true });
}

/**
 * Setup sync test without fake timers
 *
 * Use this for tests that need real timers (e.g., testing actual async operations)
 */
export async function setupSyncTestRealTimers(options: Omit<SyncTestSetupOptions, 'useFakeTimers'> = {}): Promise<SyncTestContext> {
    return setupSyncTest({ ...options, useFakeTimers: false });
}

/**
 * Setup sync test with storage (ProfileStateManager + IndexedDB)
 *
 * Convenience function for tests that need storage infrastructure.
 * Equivalent to setupSyncTest({ includeStorage: true })
 */
export async function setupSyncTestWithStorage(options: Omit<SyncTestSetupOptions, 'includeStorage'> = {}): Promise<SyncTestContext> {
    return setupSyncTest({ ...options, includeStorage: true });
}

/**
 * Setup complete E2E test environment (Sync + Storage + UI)
 *
 * Convenience function for full integration tests.
 * Includes sync manager, storage, UI mocks, and wired events.
 * Equivalent to setupSyncTest({ includeStorage: true, includeUI: true, wireUIEvents: true })
 */
export async function setupSyncTestE2E(options: Omit<SyncTestSetupOptions, 'includeStorage' | 'includeUI' | 'wireUIEvents'> = {}): Promise<SyncTestContext> {
    return setupSyncTest({
        ...options,
        includeStorage: true,
        includeUI: true,
        wireUIEvents: true
    });
}

/**
 * Create a fresh test context with a new provider configuration
 *
 * Useful for testing different provider behaviors in the same test.
 * Note: This will sign out from the current provider and create a new one.
 */
export async function recreateProviderWithConfig(
    ctx: SyncTestContext,
    config: MockProviderConfig
): Promise<void> {
    // Sign out from old provider
    if (ctx.mockProvider.isAuthenticated()) {
        await ctx.syncManager.signOut();
    }

    // Dispose old provider
    ctx.mockProvider.dispose();

    // Create new provider with new config
    const newProvider = new MockCloudProvider(config);
    await newProvider.initialize();

    // Replace in context
    ctx.mockProvider = newProvider;

    // Re-register
    providerRegistry.register(newProvider);
    ctx.syncManager.setProvider('mock');

    // Re-mock getLocalSyncData with new provider context
    spyOn(ctx.syncManager as any, 'getLocalSyncData').mockResolvedValue(ctx.testData);
}
