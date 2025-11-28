import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { CloudStatusButton } from '../../../src/ui/components/CloudStatusButton';
import type { SyncEvent, SyncEventType } from '../../../src/services/sync/types';
import type { StateChangeEvent, ProfileState } from '../../../src/core/ProfileStateManager';

// Mock SyncEventBus
const eventListeners = new Map<string | '*', Set<Function>>();
vi.mock('../../../src/services/sync/SyncEventBus', () => ({
    syncEventBus: {
        on: vi.fn((event: string | '*', listener: Function) => {
            if (!eventListeners.has(event)) {
                eventListeners.set(event, new Set());
            }
            eventListeners.get(event)!.add(listener);
            return () => eventListeners.get(event)?.delete(listener);
        }),
        emitEvent: vi.fn()
    },
    SyncEventBus: {
        getInstance: vi.fn(() => ({
            on: vi.fn(),
            emitEvent: vi.fn()
        }))
    }
}));

// Mock SyncManager
vi.mock('../../../src/services/sync/SyncManager', () => ({
    syncManager: {
        getCurrentProvider: vi.fn(() => ({
            id: 'googledrive',
            name: 'Google Drive',
            icon: 'BRAND_GOOGLE_DRIVE'
        })),
        isAuthenticated: vi.fn(() => false),
        signOut: vi.fn().mockResolvedValue(undefined),
        handleSignIn: vi.fn().mockResolvedValue(undefined)
    }
}));

// Mock ProviderRegistry
vi.mock('../../../src/services/sync/ProviderRegistry', () => ({
    providerRegistry: {}
}));

// Mock iconPaths
vi.mock('../../../src/utils/iconPaths', () => ({
    getInlineSVG: vi.fn((iconName: string, className?: string) =>
        `<svg class="${className}">${iconName}</svg>`
    )
}));

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
    logger: {
        log: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}));

// Mock ProfileStateManager
vi.mock('../../../src/core/ProfileStateManager', () => ({
    ProfileStateManager: {
        getInstance: vi.fn(() => ({
            exportData: vi.fn(() => Promise.resolve(JSON.stringify({
                version: '1.0',
                activeScheduleId: 'test-schedule',
                schedules: [],
                preferences: {}
            })))
        }))
    }
}));

describe('CloudStatusButton - State Transitions', () => {
    let button: CloudStatusButton;
    let container: HTMLElement;
    let mockSyncManager: any;

    function emitEvent(type: SyncEventType, data?: any, error?: Error): void {
        const event: SyncEvent = { type, timestamp: Date.now(), data, error };

        // Call wildcard listeners
        eventListeners.get('*')?.forEach(listener => {
            try {
                listener(event);
            } catch (e) {
                // Ignore errors in tests
            }
        });

        // Call specific listeners
        eventListeners.get(type)?.forEach(listener => {
            try {
                listener(event);
            } catch (e) {
                // Ignore errors in tests
            }
        });
    }

    function emitStateEvent(hasUnsavedChanges: boolean): void {
        const event: StateChangeEvent = {
            type: 'save_state_changed',
            data: { hasUnsavedChanges },
            timestamp: Date.now(),
            source: 'test'
        };
        const state: ProfileState = {
            activeScheduleId: null,
            schedules: [],
            selectedCourses: [],
            preferences: {} as any,
            isLoading: false,
            lastSaved: Date.now(),
            hasUnsavedChanges
        };
        button.onStateChange(event, state);
    }

    function getButtonText(): string {
        const textEl = container.querySelector('.cloud-status-text');
        return textEl?.textContent || '';
    }

    function getButtonClass(): string {
        const btn = container.querySelector('.cloud-status-button');
        return btn?.className || '';
    }

    beforeEach(async () => {
        vi.useFakeTimers();

        document.body.innerHTML = '';
        container = document.createElement('div');
        container.id = 'cloud-status-container';
        document.body.appendChild(container);

        eventListeners.clear();
        vi.clearAllMocks();

        // Import the mocked syncManager
        const { syncManager } = await import('../../../src/services/sync/SyncManager');
        mockSyncManager = syncManager;
        mockSyncManager.isAuthenticated.mockReturnValue(false);

        button = new CloudStatusButton('cloud-status-container');
    });

    afterEach(() => {
        button?.destroy();
        vi.useRealTimers();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    describe('Core State Transitions - Never Get Stuck', () => {
        it('should transition from unauthenticated to signed-in to authenticated-idle', () => {
            expect(getButtonClass()).toContain('cloud-status-signin');

            mockSyncManager.isAuthenticated.mockReturnValue(true);
            emitEvent('auth-changed', { authenticated: true });
            expect(getButtonClass()).toContain('cloud-status-signed-in');
            expect(getButtonText()).toBe('Signed in');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-connected');
        });

        it('should transition from authenticated to signed-out to unauthenticated', () => {
            mockSyncManager.isAuthenticated.mockReturnValue(true);
            emitEvent('auth-changed', { authenticated: true });
            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-connected');

            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitEvent('auth-changed', { authenticated: false });
            expect(getButtonClass()).toContain('cloud-status-signed-out');
            expect(getButtonText()).toBe('Signed out');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('should handle sign-out during cloud-uploading without getting stuck', () => {
            emitEvent('sync-started');
            // Note: sync-started doesn't change the button state in the current implementation

            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitEvent('auth-changed', { authenticated: false });
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            emitEvent('sync-pushed');
            // Should still be signed-out because auth events have higher priority
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('should handle sign-out during local-saving without getting stuck', () => {
            emitStateEvent(true);
            expect(getButtonClass()).toContain('cloud-status-saving');

            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitEvent('auth-changed', { authenticated: false });
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('should handle rapid sign-in/sign-out cycles', () => {
            mockSyncManager.isAuthenticated.mockReturnValue(true);
            emitEvent('auth-changed', { authenticated: true });
            expect(getButtonClass()).toContain('cloud-status-signed-in');

            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitEvent('auth-changed', { authenticated: false });
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            mockSyncManager.isAuthenticated.mockReturnValue(true);
            emitEvent('auth-changed', { authenticated: true });
            expect(getButtonClass()).toContain('cloud-status-signed-in');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-connected');
        });

        it('should ignore sync events during signed-out state', () => {
            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitEvent('auth-changed', { authenticated: false });
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            emitEvent('sync-started');
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            emitEvent('sync-pushed');
            expect(getButtonClass()).toContain('cloud-status-signed-out');
        });

        it('should ignore sync events during signed-in state', () => {
            mockSyncManager.isAuthenticated.mockReturnValue(true);
            emitEvent('auth-changed', { authenticated: true });
            expect(getButtonClass()).toContain('cloud-status-signed-in');

            emitEvent('sync-started');
            expect(getButtonClass()).toContain('cloud-status-signed-in');

            emitEvent('sync-pushed');
            expect(getButtonClass()).toContain('cloud-status-signed-in');
        });

        it('should recover from error state', () => {
            emitEvent('sync-failed', undefined, new Error('Test error'));
            expect(getButtonClass()).toContain('cloud-status-error');

            vi.advanceTimersByTime(3000);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('should handle cloud upload flow: start -> upload -> idle', () => {
            // sync-started doesn't change state in current implementation
            emitEvent('sync-started');

            emitEvent('sync-pushed', { source: 'manual' });
            expect(getButtonClass()).toContain('cloud-status-synced');

            vi.advanceTimersByTime(1000);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('should handle cloud download flow: complete -> idle', () => {
            emitEvent('sync-pushed', { source: 'pull' });
            expect(getButtonClass()).toContain('cloud-status-synced');

            vi.advanceTimersByTime(1000);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('should handle local save flow: saving -> saved -> idle', () => {
            emitStateEvent(true);
            expect(getButtonClass()).toContain('cloud-status-saving');

            emitStateEvent(false);
            expect(getButtonClass()).toContain('cloud-status-saved');

            vi.advanceTimersByTime(500);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });
    });

    describe('Priority Enforcement', () => {
        it('should allow error to override syncing', () => {
            emitEvent('sync-started');
            // sync-started doesn't change state

            emitEvent('sync-failed', undefined, new Error('Test error'));
            expect(getButtonClass()).toContain('cloud-status-error');
        });

        it('should not allow synced to override saving (saving has higher priority)', () => {
            emitStateEvent(true);
            expect(getButtonClass()).toContain('cloud-status-saving');

            // local-saving (70) has higher priority than cloud-uploaded (60)
            emitEvent('sync-pushed', { source: 'manual' });
            expect(getButtonClass()).toContain('cloud-status-saving');
        });

        it('should allow signed-out to override synced', () => {
            emitEvent('sync-pushed');
            expect(getButtonClass()).toContain('cloud-status-synced');

            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitEvent('auth-changed', { authenticated: false });
            expect(getButtonClass()).toContain('cloud-status-signed-out');
        });
    });

    describe('All Transient States Timeout Correctly', () => {
        it('error transitions after 3000ms', () => {
            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitEvent('sync-failed', undefined, new Error('Test error'));
            expect(getButtonClass()).toContain('cloud-status-error');

            vi.advanceTimersByTime(3000);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('signed-out transitions after 1500ms', () => {
            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitEvent('auth-changed', { authenticated: false });
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('signed-in transitions after 1500ms', () => {
            mockSyncManager.isAuthenticated.mockReturnValue(true);
            emitEvent('auth-changed', { authenticated: true });
            expect(getButtonClass()).toContain('cloud-status-signed-in');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-connected');
        });

        it('cloud-synced transitions after 1000ms', () => {
            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitEvent('sync-pushed');
            expect(getButtonClass()).toContain('cloud-status-synced');

            vi.advanceTimersByTime(1000);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('local-saved transitions after 500ms', () => {
            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitStateEvent(false);
            expect(getButtonClass()).toContain('cloud-status-saved');

            vi.advanceTimersByTime(500);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });
    });

    describe('Text Updates Correctly', () => {
        it('shows correct text for unauthenticated', () => {
            expect(getButtonText()).toBe('Sync with cloud');
        });

        it('shows correct text for signed-out', () => {
            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitEvent('auth-changed', { authenticated: false });
            expect(getButtonText()).toBe('Signed out');
        });

        it('shows correct text for signed-in', () => {
            mockSyncManager.isAuthenticated.mockReturnValue(true);
            emitEvent('auth-changed', { authenticated: true });
            expect(getButtonText()).toBe('Signed in');
        });

        it('shows correct text for authenticated-idle', () => {
            mockSyncManager.isAuthenticated.mockReturnValue(true);
            emitEvent('auth-changed', { authenticated: true });
            vi.advanceTimersByTime(1500);
            const text = getButtonText();
            expect(text === 'Cloud connected' || text === 'Connected').toBe(true);
        });

        it('shows correct text for saving', () => {
            emitStateEvent(true);
            expect(getButtonText()).toBe('Saving...');
        });

        it('shows correct text for uploaded', () => {
            emitEvent('sync-pushed');
            expect(getButtonText()).toBe('Uploaded');
        });

        it('shows correct text for error', () => {
            emitEvent('sync-failed', undefined, new Error('Test error'));
            expect(getButtonText()).toBe('Sync error');
        });
    });
});
