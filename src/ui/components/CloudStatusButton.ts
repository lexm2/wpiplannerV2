import { CloudProviderRegistry, type ICloudProvider } from '../../services/sync/CloudProviderRegistry';
import type { SyncEvent } from '../../services/sync/CloudSyncTypes';
import type { StateChangeEvent, ProfileState } from '../../core/ProfileStateManager';
import { getInlineSVG, type IconName } from '../../utils/iconPaths';
import { logger } from '../../utils/logger';

/**
 * Button states in priority order (highest to lowest)
 */
type ButtonState =
    | 'error'                    // Error occurred
    | 'local-saving'             // Saving to localStorage
    | 'cloud-uploading'          // Uploading to cloud
    | 'cloud-downloading'        // Downloading from cloud
    | 'signed-out'               // Just signed out (transient)
    | 'signed-in'                // Just signed in (transient)
    | 'local-saved'              // Saved to localStorage (transient)
    | 'cloud-uploaded'           // Uploaded to cloud (transient)
    | 'cloud-downloaded'         // Downloaded from cloud (transient)
    | 'authenticated-idle'       // Signed in, no operations
    | 'unauthenticated';         // Not signed in

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
    private currentState: ButtonState = 'unauthenticated';
    private provider: ICloudProvider | undefined;
    private transitionTimer: number | null = null;
    private pendingState: ButtonState | null = null;

    // Base state configurations (will be updated with provider-specific values)
    private stateConfigs: Record<ButtonState, StateConfig> = {
        'error': {
            text: 'Sync error',
            className: 'cloud-status-error',
            icon: 'ALERT_CIRCLE',
            timeout: 3000
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
            icon: 'CALENDAR_UP'
        },
        'unauthenticated': {
            text: 'Sync with cloud',
            className: 'cloud-status-signin',
            icon: 'CALENDAR_UP'
        }
    };

    constructor(containerId: string) {
        this.provider = CloudProviderRegistry.getActiveProvider();
        this.updateStateConfigsForProvider();
        this.render(containerId);
        this.setupEventListeners();
    }

    /**
     * Update state configurations with provider-specific values
     */
    private updateStateConfigsForProvider(): void {
        if (!this.provider || !this.provider.icon) return;

        // Update authenticated-idle state with provider's icon and name
        this.stateConfigs['authenticated-idle'] = {
            text: 'Connected',
            className: 'cloud-status-connected',
            icon: this.provider.icon as IconName
        };

        // Update unauthenticated state with provider's icon
        this.stateConfigs['unauthenticated'] = {
            text: 'Sync with cloud',
            className: 'cloud-status-signin',
            icon: this.provider.icon as IconName
        };
    }

    private render(containerId: string): void {
        const container = document.getElementById(containerId);
        if (!container) {
            logger.error('[CloudStatusButton] Container not found:', containerId);
            return;
        }

        this.buttonElement = document.createElement('button');
        this.buttonElement.id = 'cloud-status-button';
        this.buttonElement.className = 'cloud-status-button';
        this.buttonElement.setAttribute('aria-live', 'polite');

        this.buttonElement.addEventListener('click', () => this.handleClick());

        container.appendChild(this.buttonElement);

        this.updateUI();
    }

    private setupEventListeners(): void {
        if (!this.provider) {
            logger.warn('[CloudStatusButton] No provider registered');
            return;
        }

        this.provider.authService.addEventListener((event: SyncEvent) => {
            if (event.type === 'auth-changed') {
                logger.log('[CloudStatusButton] Auth state changed');
                const isAuthenticated = this.provider?.authService.isAuthenticated() ?? false;

                if (isAuthenticated) {
                    this.setStateImmediate('signed-in');
                } else {
                    this.setStateImmediate('signed-out');
                }
            }
        });

        this.provider.syncService.addEventListener((event: SyncEvent) => {
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
        logger.log('[CloudStatusButton] Received sync event:', event.type);

        if (this.currentState === 'signed-out' || this.currentState === 'signed-in') {
            logger.log('[CloudStatusButton] Ignoring sync event during auth transition');
            return;
        }

        switch (event.type) {
            case 'sync-started':
                this.setState('cloud-uploading');
                break;

            case 'sync-completed':
                this.setState('cloud-downloaded');
                break;

            case 'sync-uploaded':
                this.setState('cloud-uploaded');
                break;

            case 'sync-failed':
                this.setState('error');
                break;

            case 'sync-conflict':
                this.setState('error');
                break;

            case 'auth-changed':
                this.transitionToIdleState();
                break;

            case 'online-mode':
            case 'offline-mode':
                this.transitionToIdleState();
                break;
        }
    }

    private async handleClick(): Promise<void> {
        if (!this.provider) {
            logger.warn('[CloudStatusButton] No provider available');
            return;
        }

        if (this.provider.authService.isAuthenticated()) {
            try {
                await this.provider.authService.signOut();
                logger.log('[CloudStatusButton] Signed out successfully');
            } catch (error) {
                logger.error('[CloudStatusButton] Sign out failed:', error);
                this.setState('error');
            }
        } else {
            try {
                await this.provider.authService.signIn();
                logger.log('[CloudStatusButton] Signed in successfully');
            } catch (error) {
                logger.error('[CloudStatusButton] Sign in failed:', error);
                this.setState('error');
            }
        }
    }

    /**
     * Set state immediately, overriding any current state (used for auth changes)
     */
    private setStateImmediate(newState: ButtonState): void {
        logger.log('[CloudStatusButton] setStateImmediate called:', newState);

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
     * Set button state with priority handling
     */
    private setState(newState: ButtonState): void {
        logger.log('[CloudStatusButton] setState called:', newState, 'current:', this.currentState);

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
                logger.log('[CloudStatusButton] Pending state set:', newState);
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
            'cloud-uploading': 80,
            'cloud-downloading': 80,
            'local-saving': 70,
            'signed-out': 65,
            'signed-in': 65,
            'cloud-uploaded': 60,
            'cloud-downloaded': 60,
            'local-saved': 50,
            'authenticated-idle': 20,
            'unauthenticated': 10
        };
        return priorities[state];
    }

    private transitionToIdleState(): void {
        logger.log('[CloudStatusButton] transitionToIdleState called, current:', this.currentState, 'pending:', this.pendingState);

        if (this.transitionTimer !== null) {
            clearTimeout(this.transitionTimer);
            this.transitionTimer = null;
        }

        if (this.pendingState) {
            const state = this.pendingState;
            this.pendingState = null;
            logger.log('[CloudStatusButton] Processing pending state:', state);
            this.setState(state);
            return;
        }

        const isAuthenticated = this.provider?.authService.isAuthenticated() ?? false;
        this.currentState = isAuthenticated ? 'authenticated-idle' : 'unauthenticated';
        logger.log('[CloudStatusButton] Transitioning to idle:', this.currentState);
        this.updateUI();
    }

    private updateUI(): void {
        if (!this.buttonElement) return;

        const config = this.stateConfigs[this.currentState];

        const iconHtml = config.icon ? getInlineSVG(config.icon, 'cloud-status-icon') : '';
        this.buttonElement.innerHTML = `${iconHtml}<span class="cloud-status-text">${config.text}</span>`;

        this.buttonElement.className = `cloud-status-button ${config.className}`;

        if (this.currentState === 'unauthenticated') {
            this.buttonElement.setAttribute('aria-label', 'Sign in to enable cloud sync');
        } else if (this.currentState === 'authenticated-idle') {
            const email = this.provider?.authService.getAuthState().email || 'cloud service';
            this.buttonElement.setAttribute('aria-label', `Connected to ${email}. Click to sign out.`);
        } else {
            this.buttonElement.setAttribute('aria-label', config.text);
        }
    }

    /**
     * Set the active cloud provider
     */
    setProvider(provider: ICloudProvider): void {
        if (this.provider) {
            this.provider.authService.removeEventListener(this.handleSyncEvent);
            this.provider.syncService.removeEventListener(this.handleSyncEvent);
        }

        this.provider = provider;
        this.updateStateConfigsForProvider();
        this.setupEventListeners();
        this.transitionToIdleState();
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
