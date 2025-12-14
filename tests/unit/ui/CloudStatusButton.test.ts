import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { CloudStatusButton } from '../../../src/ui/components/CloudStatusButton';
import type { SyncEvent, SyncEventType } from '../../../src/services/sync/types';
import type { StateChangeEvent, ProfileState } from '../../../src/core/state/ProfileStateManager';

// Note: These tests require Vitest's vi.mock() for module mocking which Bun doesn't support.
// The tests are skipped until Bun adds module mocking support or tests are refactored.

// TODO: These tests require fake timers and module mocking which Bun doesn't support yet.
// Consider using a timer mock library or rewriting tests to use real timers.
describe.skip('CloudStatusButton - State Transitions', () => {
    let button: CloudStatusButton;
    let container: HTMLElement;
    let mockSyncManager: any;
    const eventListeners = new Map<string | '*', Set<Function>>();

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
        document.body.innerHTML = '';
        container = document.createElement('div');
        container.id = 'cloud-status-container';
        document.body.appendChild(container);

        eventListeners.clear();

        // Note: Without vi.mock(), we can't mock the imported modules
        // These tests will fail without proper module mocking
        button = new CloudStatusButton('cloud-status-container');
    });

    afterEach(() => {
        button?.destroy();
        document.body.innerHTML = '';
    });

    describe('Core State Transitions - Never Get Stuck', () => {
        it('should transition from unauthenticated to signed-in to authenticated-idle', () => {
            expect(getButtonClass()).toContain('cloud-status-signin');

            mockSyncManager.isAuthenticated.mockReturnValue(true);
            emitEvent('auth-changed', { authenticated: true });
            expect(getButtonClass()).toContain('cloud-status-signed-in');
            expect(getButtonText()).toBe('Signed in');
        });

        it('should transition from authenticated to signed-out to unauthenticated', () => {
            mockSyncManager.isAuthenticated.mockReturnValue(true);
            emitEvent('auth-changed', { authenticated: true });
            expect(getButtonClass()).toContain('cloud-status-connected');

            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitEvent('auth-changed', { authenticated: false });
            expect(getButtonClass()).toContain('cloud-status-signed-out');
            expect(getButtonText()).toBe('Signed out');
        });

        it('should handle sign-out during cloud-uploading without getting stuck', () => {
            emitEvent('sync-started');

            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitEvent('auth-changed', { authenticated: false });
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            emitEvent('sync-pushed');
            expect(getButtonClass()).toContain('cloud-status-signed-out');
        });

        it('should handle sign-out during local-saving without getting stuck', () => {
            emitStateEvent(true);
            expect(getButtonClass()).toContain('cloud-status-saving');

            mockSyncManager.isAuthenticated.mockReturnValue(false);
            emitEvent('auth-changed', { authenticated: false });
            expect(getButtonClass()).toContain('cloud-status-signed-out');
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
        });

        it('should handle cloud upload flow: start -> upload -> idle', () => {
            emitEvent('sync-started');

            emitEvent('sync-pushed', { source: 'manual' });
            expect(getButtonClass()).toContain('cloud-status-synced');
        });

        it('should handle cloud download flow: complete -> idle', () => {
            emitEvent('sync-pushed', { source: 'pull' });
            expect(getButtonClass()).toContain('cloud-status-synced');
        });

        it('should handle local save flow: saving -> saved -> idle', () => {
            emitStateEvent(true);
            expect(getButtonClass()).toContain('cloud-status-saving');

            emitStateEvent(false);
            expect(getButtonClass()).toContain('cloud-status-saved');
        });
    });

    describe('Priority Enforcement', () => {
        it('should allow error to override syncing', () => {
            emitEvent('sync-started');

            emitEvent('sync-failed', undefined, new Error('Test error'));
            expect(getButtonClass()).toContain('cloud-status-error');
        });

        it('should not allow synced to override saving (saving has higher priority)', () => {
            emitStateEvent(true);
            expect(getButtonClass()).toContain('cloud-status-saving');

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
