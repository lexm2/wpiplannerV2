import { OneDriveAuthService } from '../../services/OneDriveAuthService';
import { OneDriveSyncService } from '../../services/OneDriveSyncService';
import type { AuthState, SyncEvent } from '../../services/OneDriveSyncTypes';

export class OneDriveSignIn {
    private authService: OneDriveAuthService;
    private syncService: OneDriveSyncService;
    private buttonElement: HTMLElement | null = null;
    private userInfoElement: HTMLElement | null = null;
    private currentAuthState: AuthState;

    constructor() {
        this.authService = OneDriveAuthService.getInstance();
        this.syncService = OneDriveSyncService.getInstance();
        this.currentAuthState = this.authService.getAuthState();
        this.setupEventListeners();
    }

    render(containerId: string): void {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return;
        }

        container.innerHTML = this.getHtml();
        this.buttonElement = document.getElementById('onedrive-auth-btn');
        this.userInfoElement = document.getElementById('onedrive-user-info');

        if (this.buttonElement) {
            this.buttonElement.addEventListener('click', () => this.handleAuthClick());
        }

        this.updateUI();
    }

    private getHtml(): string {
        return `
            <div class="onedrive-auth-container">
                <div id="onedrive-user-info" class="user-info"></div>
                <button id="onedrive-auth-btn" class="onedrive-btn">
                    <svg class="onedrive-icon" viewBox="0 0 24 24" width="20" height="20">
                        <path fill="currentColor" d="M19.59,12.95L17.09,10.45C17.63,9.25 18,7.95 18,6.5C18,3.46 15.54,1 12.5,1C9.46,1 7,3.46 7,6.5C7,7.95 7.37,9.25 7.91,10.45L5.41,12.95C5.15,13.21 5,13.56 5,13.91V19C5,20.1 5.9,21 7,21H18C19.1,21 20,20.1 20,19V13.91C20,13.56 19.85,13.21 19.59,12.95M12.5,3C14.43,3 16,4.57 16,6.5C16,8.43 14.43,10 12.5,10C10.57,10 9,8.43 9,6.5C9,4.57 10.57,3 12.5,3M17,19H8V14.5L10.5,12L12.5,14L14.5,12L17,14.5V19Z"/>
                    </svg>
                    <span class="btn-text">Sign in</span>
                </button>
            </div>
        `;
    }

    private setupEventListeners(): void {
        this.authService.addEventListener((event: SyncEvent) => {
            if (event.type === 'auth-changed') {
                this.currentAuthState = event.data as AuthState;
                this.updateUI();
            }
        });
    }

    private async handleAuthClick(): Promise<void> {
        if (this.currentAuthState.isAuthenticated) {
            await this.signOut();
        } else {
            await this.signIn();
        }
    }

    private async signIn(): Promise<void> {
        if (!this.buttonElement) return;

        try {
            this.setButtonLoading(true);
            await this.authService.signIn();
        } catch (error) {
            console.error('Sign-in failed:', error);
            alert('Sign-in failed. Please try again.');
        } finally {
            this.setButtonLoading(false);
        }
    }

    private async signOut(): Promise<void> {
        if (!this.buttonElement) return;

        try {
            this.setButtonLoading(true);
            await this.authService.signOut();
        } catch (error) {
            console.error('Sign-out failed:', error);
        } finally {
            this.setButtonLoading(false);
        }
    }

    private updateUI(): void {
        if (!this.buttonElement || !this.userInfoElement) return;

        if (this.currentAuthState.isAuthenticated) {
            this.buttonElement.classList.add('authenticated');
            const btnText = this.buttonElement.querySelector('.btn-text');
            if (btnText) {
                btnText.textContent = 'Sign out';
            }

            if (this.currentAuthState.username) {
                this.userInfoElement.textContent = this.getDisplayName(this.currentAuthState.username);
                this.userInfoElement.classList.add('visible');
            }
        } else {
            this.buttonElement.classList.remove('authenticated');
            const btnText = this.buttonElement.querySelector('.btn-text');
            if (btnText) {
                btnText.textContent = 'Sign in';
            }
            this.userInfoElement.textContent = '';
            this.userInfoElement.classList.remove('visible');
        }
    }

    private setButtonLoading(loading: boolean): void {
        if (!this.buttonElement) return;

        if (loading) {
            this.buttonElement.classList.add('loading');
            this.buttonElement.setAttribute('disabled', 'true');
        } else {
            this.buttonElement.classList.remove('loading');
            this.buttonElement.removeAttribute('disabled');
        }
    }

    private getDisplayName(email: string): string {
        const atIndex = email.indexOf('@');
        if (atIndex > 0) {
            return email.substring(0, atIndex);
        }
        return email;
    }
}
