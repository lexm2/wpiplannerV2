import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CloudStatusButton } from '../../../src/ui/components/CloudStatusButton';
import { CloudProviderRegistry, type ICloudProvider } from '../../../src/services/sync/CloudProviderRegistry';
import type { ICloudAuthService } from '../../../src/services/sync/interfaces/ICloudAuthService';
import type { ICloudSyncService } from '../../../src/services/sync/interfaces/ICloudSyncService';
import type { SyncEvent, SyncEventType } from '../../../src/services/sync/CloudSyncTypes';
import type { StateChangeEvent, ProfileState } from '../../../src/core/ProfileStateManager';
import type { IconName } from '../../../src/utils/iconPaths';

describe('CloudStatusButton - State Transitions', () => {
    let button: CloudStatusButton;
    let container: HTMLElement;
    let mockAuthService: jest.Mocked<ICloudAuthService>;
    let mockSyncService: jest.Mocked<ICloudSyncService>;
    let mockProvider: ICloudProvider;
    let authListeners: Array<(event: SyncEvent) => void> = [];
    let syncListeners: Array<(event: SyncEvent) => void> = [];

    beforeEach(() => {
        vi.useFakeTimers();

        document.body.innerHTML = '';
        container = document.createElement('div');
        container.id = 'cloud-status-container';
        document.body.appendChild(container);

        authListeners = [];
        syncListeners = [];

        mockAuthService = {
            initialize: vi.fn().mockResolvedValue(undefined),
            signIn: vi.fn().mockResolvedValue({
                account: { username: 'test', homeAccountId: 'test-id' },
                accessToken: 'token'
            }),
            signOut: vi.fn().mockResolvedValue(undefined),
            getAccessToken: vi.fn().mockResolvedValue('token'),
            getAuthState: vi.fn(() => ({ isAuthenticated: false })),
            isAuthenticated: vi.fn(() => false),
            addEventListener: vi.fn((listener) => authListeners.push(listener)),
            removeEventListener: vi.fn((listener) => {
                const index = authListeners.indexOf(listener);
                if (index > -1) authListeners.splice(index, 1);
            })
        } as any;

        mockSyncService = {
            initialize: vi.fn().mockResolvedValue(undefined),
            syncToCloud: vi.fn().mockResolvedValue({ success: true, status: 'synced' }),
            pullFromCloud: vi.fn().mockResolvedValue({ success: true, status: 'synced' }),
            resolveConflict: vi.fn().mockResolvedValue({ success: true, status: 'synced' }),
            getStatus: vi.fn(() => 'idle'),
            getDeviceId: vi.fn(() => 'device-123'),
            isAuthenticated: vi.fn(() => false),
            getAuthService: vi.fn(() => mockAuthService),
            addEventListener: vi.fn((listener) => syncListeners.push(listener)),
            removeEventListener: vi.fn((listener) => {
                const index = syncListeners.indexOf(listener);
                if (index > -1) syncListeners.splice(index, 1);
            })
        } as any;

        mockProvider = {
            id: 'test-provider',
            name: 'Test Provider',
            icon: 'CALENDAR_UP' as IconName,
            authService: mockAuthService,
            syncService: mockSyncService
        };

        vi.spyOn(CloudProviderRegistry, 'getActiveProvider').mockReturnValue(mockProvider);

        button = new CloudStatusButton('cloud-status-container');
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    function emitAuthEvent(isAuthenticated: boolean): void {
        mockAuthService.isAuthenticated.mockReturnValue(isAuthenticated);
        authListeners.forEach(listener => {
            listener({
                type: 'auth-changed',
                timestamp: Date.now(),
                data: { isAuthenticated }
            });
        });
    }

    function emitSyncEvent(type: SyncEventType, data?: any): void {
        syncListeners.forEach(listener => {
            listener({
                type,
                timestamp: Date.now(),
                data
            });
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

    describe('Core State Transitions - Never Get Stuck', () => {
        it('should transition from unauthenticated to signed-in to authenticated-idle', () => {
            expect(getButtonClass()).toContain('cloud-status-signin');

            emitAuthEvent(true);
            expect(getButtonClass()).toContain('cloud-status-signed-in');
            expect(getButtonText()).toBe('Signed in');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-connected');
        });

        it('should transition from authenticated to signed-out to unauthenticated', () => {
            mockAuthService.isAuthenticated.mockReturnValue(true);
            emitAuthEvent(true);
            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-connected');

            mockAuthService.isAuthenticated.mockReturnValue(false);
            emitAuthEvent(false);
            expect(getButtonClass()).toContain('cloud-status-signed-out');
            expect(getButtonText()).toBe('Signed out');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('should handle sign-out during cloud-uploading without getting stuck', () => {
            emitSyncEvent('sync-started');
            expect(getButtonClass()).toContain('cloud-status-syncing');

            mockAuthService.isAuthenticated.mockReturnValue(false);
            emitAuthEvent(false);
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            emitSyncEvent('sync-uploaded');
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('should handle sign-out during local-saving without getting stuck', () => {
            emitStateEvent(true);
            expect(getButtonClass()).toContain('cloud-status-saving');

            mockAuthService.isAuthenticated.mockReturnValue(false);
            emitAuthEvent(false);
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('should handle rapid sign-in/sign-out cycles', () => {
            emitAuthEvent(true);
            expect(getButtonClass()).toContain('cloud-status-signed-in');

            mockAuthService.isAuthenticated.mockReturnValue(false);
            emitAuthEvent(false);
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            mockAuthService.isAuthenticated.mockReturnValue(true);
            emitAuthEvent(true);
            expect(getButtonClass()).toContain('cloud-status-signed-in');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-connected');
        });

        it('should ignore sync events during signed-out state', () => {
            emitAuthEvent(false);
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            emitSyncEvent('sync-started');
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            emitSyncEvent('sync-uploaded');
            expect(getButtonClass()).toContain('cloud-status-signed-out');
        });

        it('should ignore sync events during signed-in state', () => {
            emitAuthEvent(true);
            expect(getButtonClass()).toContain('cloud-status-signed-in');

            emitSyncEvent('sync-started');
            expect(getButtonClass()).toContain('cloud-status-signed-in');

            emitSyncEvent('sync-uploaded');
            expect(getButtonClass()).toContain('cloud-status-signed-in');
        });

        it('should recover from error state', () => {
            emitSyncEvent('sync-failed');
            expect(getButtonClass()).toContain('cloud-status-error');

            vi.advanceTimersByTime(3000);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('should handle cloud upload flow: start -> upload -> idle', () => {
            emitSyncEvent('sync-started');
            expect(getButtonClass()).toContain('cloud-status-syncing');

            emitSyncEvent('sync-uploaded');
            expect(getButtonClass()).toContain('cloud-status-synced');

            vi.advanceTimersByTime(1000);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('should handle cloud download flow: complete -> idle', () => {
            emitSyncEvent('sync-completed');
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
            emitSyncEvent('sync-started');
            expect(getButtonClass()).toContain('cloud-status-syncing');

            emitSyncEvent('sync-failed');
            expect(getButtonClass()).toContain('cloud-status-error');
        });

        it('should allow syncing to override saving', () => {
            emitStateEvent(true);
            expect(getButtonClass()).toContain('cloud-status-saving');

            emitSyncEvent('sync-started');
            expect(getButtonClass()).toContain('cloud-status-syncing');
        });

        it('should allow signed-out to override synced', () => {
            emitSyncEvent('sync-uploaded');
            expect(getButtonClass()).toContain('cloud-status-synced');

            mockAuthService.isAuthenticated.mockReturnValue(false);
            emitAuthEvent(false);
            expect(getButtonClass()).toContain('cloud-status-signed-out');
        });
    });

    describe('All Transient States Timeout Correctly', () => {
        it('error transitions after 3000ms', () => {
            mockAuthService.isAuthenticated.mockReturnValue(false);
            emitSyncEvent('sync-failed');
            expect(getButtonClass()).toContain('cloud-status-error');

            vi.advanceTimersByTime(3000);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('signed-out transitions after 1500ms', () => {
            mockAuthService.isAuthenticated.mockReturnValue(false);
            emitAuthEvent(false);
            expect(getButtonClass()).toContain('cloud-status-signed-out');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('signed-in transitions after 1500ms', () => {
            mockAuthService.isAuthenticated.mockReturnValue(true);
            emitAuthEvent(true);
            expect(getButtonClass()).toContain('cloud-status-signed-in');

            vi.advanceTimersByTime(1500);
            expect(getButtonClass()).toContain('cloud-status-connected');
        });

        it('cloud-synced transitions after 1000ms', () => {
            mockAuthService.isAuthenticated.mockReturnValue(false);
            emitSyncEvent('sync-uploaded');
            expect(getButtonClass()).toContain('cloud-status-synced');

            vi.advanceTimersByTime(1000);
            expect(getButtonClass()).toContain('cloud-status-signin');
        });

        it('local-saved transitions after 500ms', () => {
            mockAuthService.isAuthenticated.mockReturnValue(false);
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
            emitAuthEvent(false);
            expect(getButtonText()).toBe('Signed out');
        });

        it('shows correct text for signed-in', () => {
            emitAuthEvent(true);
            expect(getButtonText()).toBe('Signed in');
        });

        it('shows correct text for authenticated-idle', () => {
            mockAuthService.isAuthenticated.mockReturnValue(true);
            emitAuthEvent(true);
            vi.advanceTimersByTime(1500);
            const text = getButtonText();
            expect(text === 'Cloud connected' || text === 'Connected').toBe(true);
        });

        it('shows correct text for uploading', () => {
            emitSyncEvent('sync-started');
            expect(getButtonText()).toBe('Uploading...');
        });

        it('shows correct text for downloading', () => {
            emitSyncEvent('sync-completed');
            expect(getButtonText()).toBe('Downloaded');
        });

        it('shows correct text for saving', () => {
            emitStateEvent(true);
            expect(getButtonText()).toBe('Saving...');
        });

        it('shows correct text for error', () => {
            emitSyncEvent('sync-failed');
            expect(getButtonText()).toBe('Sync error');
        });
    });
});
