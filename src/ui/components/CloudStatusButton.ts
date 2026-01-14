import { syncManager } from '../../services/sync/SyncManager';
import { providerRegistry } from '../../services/sync/ProviderRegistry';
import type { SyncEvent } from '../../services/sync/types';
import { ProfileStateManager, type StateChangeEvent, type ProfileState } from '../../core/state/ProfileStateManager';
import { getInlineSVG, type IconName } from '../../utils/iconPaths';
import { logger } from '../../utils/logger';
import { syncEventBus } from '../../services/sync/SyncEventBus';
import styles from '../../styles/components/cloud-status-button.module.css';

/**
 * Button states in priority order (highest to lowest)
 */
type ButtonState =
    | 'error'                    // Error occurred
    | 'conflict-pending'         // Conflict detected, waiting for user resolution
    | 'local-saving'             // Saving to localStorage
    | 'cloud-uploading'          // Uploading to cloud
    | 'cloud-downloading'        // Downloading from cloud
    | 'signed-out'               // Just signed out (transient)
    | 'signed-in'                // Just signed in (transient)
    | 'local-saved'              // Saved to localStorage (transient)
    | 'cloud-uploaded'           // Uploaded to cloud (transient)
    | 'cloud-downloaded'         // Downloaded from cloud (transient)
    | 'authenticated-idle'       // Signed in, no operations
    | 'unauthenticated'          // Not signed in
    | 'unavailable';             // No cloud provider configured

interface StateConfig {
    text: string;
    className: string;
    icon?: IconName;
    timeout?: number;  // Auto-transition timeout in ms
}

/**
 * CloudStatusButton Component
 *
 * Unified component that serves three purposes:
 * 1. Sign in/out button for cloud authentication
 * 2. Local save status indicator
 * 3. Cloud sync status indicator
 *
 * State Priority (highest to lowest):
 * 1. Error - Shows error state
 * 2. Active Operations - Saving/Syncing
 * 3. Transient Confirmations - Saved/Synced (auto-hide)
 * 4. Idle States - Authenticated/Unauthenticated
 */
export class CloudStatusButton {
    private buttonElement: HTMLButtonElement | null = null;
    private currentState: ButtonState;
    private transitionTimer: number | null = null;
    private pendingState: ButtonState | null = null;

    // Base state configurations
    private stateConfigs: Record<ButtonState, StateConfig> = {
        'error': {
            text: 'Sync error',
            className: 'cloud-status-error',
            icon: 'ALERT_CIRCLE',
            timeout: 3000
        },
        'conflict-pending': {
            text: 'Conflict detected',
            className: 'cloud-status-conflict',
            icon: 'ALERT_CIRCLE'
        },
        'local-saving': {
            text: 'Saving...',
            className: 'cloud-status-saving',
            icon: 'DOWNLOAD'
        },
        'cloud-uploading': {
            text: 'Uploading...',
            className: 'cloud-status-syncing',
            icon: 'CALENDAR_UP'
        },
        'cloud-downloading': {
            text: 'Downloading...',
            className: 'cloud-status-syncing',
            icon: 'CALENDAR_DOWN'
        },
        'signed-out': {
            text: 'Signed out',
            className: 'cloud-status-signed-out',
            icon: 'USER_X',
            timeout: 1500
        },
        'signed-in': {
            text: 'Signed in',
            className: 'cloud-status-signed-in',
            icon: 'USER_CHECK',
            timeout: 1500
        },
        'local-saved': {
            text: 'Saved',
            className: 'cloud-status-saved',
            icon: 'DOWNLOAD',
            timeout: 500
        },
        'cloud-uploaded': {
            text: 'Uploaded',
            className: 'cloud-status-synced',
            icon: 'CALENDAR_UP',
            timeout: 1000
        },
        'cloud-downloaded': {
            text: 'Downloaded',
            className: 'cloud-status-synced',
            icon: 'CALENDAR_DOWN',
            timeout: 1000
        },
        'authenticated-idle': {
            text: 'Cloud connected',
            className: 'cloud-status-connected',
            icon: 'BRAND_GOOGLE_DRIVE'
        },
        'unauthenticated': {
            text: 'Sync with cloud',
            className: 'cloud-status-signin',
            icon: 'CALENDAR_UP'
        },
        'unavailable': {
            text: 'Cloud sync unavailable',
            className: 'cloud-status-unavailable',
            icon: 'ALERT_CIRCLE'
        }
    };

    constructor(containerId: string) {
        // Set initial state based on actual authentication status
        this.currentState = this.getInitialState();

        this.updateStateConfigsForProvider();
        this.render(containerId);
        this.setupEventListeners();
    }

    /**
     * Update state configurations with provider-specific values
     */
    private updateStateConfigsForProvider(): void {
        const provider = syncManager.getCurrentProvider();
        if (!provider || !provider.icon) return;

        // Update authenticated-idle state with provider's icon and name
        this.stateConfigs['authenticated-idle'] = {
            text: 'Connected',
            className: 'cloud-status-connected',
            icon: provider.icon as IconName
        };

        // Update unauthenticated state with provider's icon
        this.stateConfigs['unauthenticated'] = {
            text: 'Sync with cloud',
            className: 'cloud-status-signin',
            icon: provider.icon as IconName
        };
    }

    private render(containerId: string): void {
        const container = document.getElementById(containerId);
        if (!container) {
            return;
        }

        this.buttonElement = document.createElement('button');
        this.buttonElement.id = 'cloud-status-button';
        this.buttonElement.className = styles['cloud-status-button'];
        this.buttonElement.setAttribute('aria-live', 'polite');

        this.buttonElement.addEventListener('click', () => this.handleClick());

        container.appendChild(this.buttonElement);

        this.updateUI();
    }

    private setupEventListeners(): void {
        // Use centralized SyncEventBus for all sync events

        // Explicit listeners for clarity (plus wildcard for comprehensive monitoring)
        syncEventBus.on('sync-started', () => {
            // Could show syncing indicator
        });

        syncEventBus.on('offline-mode', () => {
            // Could show offline indicator in UI
        });

        syncEventBus.on('online-mode', () => {
            // Could hide offline indicator
        });

        // Wildcard listener handles all events for state management
        syncEventBus.on('*', (event: SyncEvent) => {
            this.handleSyncEvent(event);
        });
    }

    /**
     * Handle state change events from ProfileStateManager
     */
    onStateChange(event: StateChangeEvent, state: ProfileState): void {
        if (event.type === 'save_state_changed') {
            if (state.hasUnsavedChanges) {
                this.setState('local-saving');
            } else {
                this.setState('local-saved');
            }
        }
    }

    private handleSyncEvent(event: SyncEvent): void {
        switch (event.type) {
            case 'auth-changed': {
                const data = event.data as { authenticated: boolean } | undefined;
                const isAuthenticated = data?.authenticated ?? syncManager.isAuthenticated();
                if (isAuthenticated) {
                    this.setStateImmediate('signed-in');
                } else {
                    this.setStateImmediate('signed-out');
                }
                break;
            }

            case 'sync-pushed':
                if (this.currentState !== 'signed-out' && this.currentState !== 'signed-in') {
                    this.setState('cloud-uploaded');
                }
                break;

            case 'sync-failed':
                this.setState('error');
                break;

            case 'sync-conflict':
                this.setState('conflict-pending');
                break;

            case 'sync-resolved':
                this.pendingState = null;
                this.transitionToIdleState();
                break;
        }
    }

    private async handleClick(): Promise<void> {
        const provider = syncManager.getCurrentProvider();
        if (!provider) {
            return;
        }

        if (syncManager.isAuthenticated()) {
            try {
                await syncManager.signOut();
            } catch (error) {
                this.setState('error');
            }
        } else {
            try {
                // Step 1: Authenticate only
                await syncManager.signIn();

                // Step 2: Perform initial sync (will trigger conflict modal if needed)
                await syncManager.performInitialSync();

            } catch (error) {
                this.setState('error');
            }
        }
    }

    /**
     * Set state immediately, overriding any current state (used for auth changes)
     */
    private setStateImmediate(newState: ButtonState): void {
        if (this.transitionTimer !== null) {
            clearTimeout(this.transitionTimer);
            this.transitionTimer = null;
        }

        this.pendingState = null;
        this.currentState = newState;
        this.updateUI();

        const config = this.stateConfigs[newState];
        if (config.timeout) {
            this.transitionTimer = window.setTimeout(() => {
                this.transitionToIdleState();
            }, config.timeout);
        }
    }

    /**
     * Determine initial button state based on current provider authentication
     */
    private getInitialState(): ButtonState {
        const provider = syncManager.getCurrentProvider();

        if (!provider) {
            return 'unavailable';
        }

        if (syncManager.isAuthenticated()) {
            return 'authenticated-idle';
        }

        return 'unauthenticated';
    }

    /**
     * Set button state with priority handling
     */
    private setState(newState: ButtonState): void {
        if (this.transitionTimer !== null) {
            clearTimeout(this.transitionTimer);
            this.transitionTimer = null;
        }

        // Allow state transitions within the same operation category
        const canTransition = this.canTransitionDirectly(this.currentState, newState);

        if (canTransition) {
            this.currentState = newState;
            this.updateUI();

            const config = this.stateConfigs[newState];
            if (config.timeout) {
                this.transitionTimer = window.setTimeout(() => {
                    this.transitionToIdleState();
                }, config.timeout);
            }
        } else {
            const statePriority = this.getStatePriority(newState);
            const currentPriority = this.getStatePriority(this.currentState);

            if (statePriority > currentPriority) {
                this.currentState = newState;
                this.updateUI();

                const config = this.stateConfigs[newState];
                if (config.timeout) {
                    this.transitionTimer = window.setTimeout(() => {
                        this.transitionToIdleState();
                    }, config.timeout);
                }
            } else {
                this.pendingState = newState;
            }
        }
    }

    /**
     * Check if we can transition directly between states (same operation flow)
     */
    private canTransitionDirectly(from: ButtonState, to: ButtonState): boolean {
        // Cloud upload flow: uploading -> uploaded
        if (from === 'cloud-uploading' && to === 'cloud-uploaded') return true;

        // Cloud download flow: downloading -> downloaded
        if (from === 'cloud-downloading' && to === 'cloud-downloaded') return true;

        // Local operation flow: saving -> saved
        if (from === 'local-saving' && to === 'local-saved') return true;

        // Same priority levels
        const fromPriority = this.getStatePriority(from);
        const toPriority = this.getStatePriority(to);
        if (fromPriority === toPriority) return true;

        return false;
    }

    private getStatePriority(state: ButtonState): number {
        const priorities: Record<ButtonState, number> = {
            'error': 100,
            'conflict-pending': 90,
            'cloud-uploading': 80,
            'cloud-downloading': 80,
            'local-saving': 70,
            'signed-out': 65,
            'signed-in': 65,
            'cloud-uploaded': 60,
            'cloud-downloaded': 60,
            'local-saved': 50,
            'authenticated-idle': 20,
            'unauthenticated': 10,
            'unavailable': 5
        };
        return priorities[state];
    }

    private transitionToIdleState(): void {
        if (this.transitionTimer !== null) {
            clearTimeout(this.transitionTimer);
            this.transitionTimer = null;
        }

        if (this.pendingState) {
            const state = this.pendingState;
            this.pendingState = null;
            this.setState(state);
            return;
        }

        const provider = syncManager.getCurrentProvider();
        if (!provider) {
            this.currentState = 'unavailable';
            this.updateUI();
            return;
        }

        const isAuthenticated = syncManager.isAuthenticated();
        this.currentState = isAuthenticated ? 'authenticated-idle' : 'unauthenticated';
        this.updateUI();
    }

    private updateUI(): void {
        if (!this.buttonElement) return;

        const config = this.stateConfigs[this.currentState];

        const iconHtml = config.icon ? getInlineSVG(config.icon, styles['cloud-status-icon']) : '';
        this.buttonElement.innerHTML = `${iconHtml}<span class="${styles['cloud-status-text']}">${config.text}</span>`;

        this.buttonElement.className = `${styles['cloud-status-button']} ${styles[config.className]}`;

        if (this.currentState === 'unavailable') {
            this.buttonElement.setAttribute('aria-label', 'Cloud sync is currently unavailable');
            this.buttonElement.disabled = true;
        } else {
            this.buttonElement.disabled = false;
            if (this.currentState === 'unauthenticated') {
                this.buttonElement.setAttribute('aria-label', 'Sign in to enable cloud sync');
            } else if (this.currentState === 'authenticated-idle') {
                this.buttonElement.setAttribute('aria-label', 'Connected to cloud. Click to sign out.');
            } else {
                this.buttonElement.setAttribute('aria-label', config.text);
            }
        }
    }

    /**
     * Get the current button text
     */
    getCurrentText(): string {
        const config = this.stateConfigs[this.currentState];
        return config.text;
    }

    /**
     * Get the current button icon
     */
    getCurrentIcon(): IconName | undefined {
        const config = this.stateConfigs[this.currentState];
        return config.icon;
    }

    /**
     * Trigger the button click action (for external use)
     */
    async triggerClick(): Promise<void> {
        await this.handleClick();
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        if (this.transitionTimer !== null) {
            clearTimeout(this.transitionTimer);
        }

        if (this.buttonElement) {
            this.buttonElement.remove();
            this.buttonElement = null;
        }
    }
}
