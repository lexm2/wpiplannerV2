import { GoogleDriveAuthService } from '../../services/sync/googledrive/GoogleDriveAuthService';
import { GoogleDriveSyncService } from '../../services/sync/googledrive/GoogleDriveSyncService';
import type { SyncEvent } from '../../services/sync/CloudSyncTypes';
import type { AuthState } from '../../services/sync/interfaces/ICloudAuthService';

export class GoogleDriveSignIn {
    private authService: GoogleDriveAuthService;
    private syncService: GoogleDriveSyncService;
    private buttonElement: HTMLElement | null = null;
    private userInfoElement: HTMLElement | null = null;
    private currentAuthState: AuthState;

    constructor() {
        this.authService = GoogleDriveAuthService.getInstance();
        this.syncService = GoogleDriveSyncService.getInstance();
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
        this.buttonElement = document.getElementById('googledrive-auth-btn');
        this.userInfoElement = document.getElementById('googledrive-user-info');

        if (this.buttonElement) {
            this.buttonElement.addEventListener('click', () => this.handleAuthClick());
        }

        this.updateUI();
    }

    private getHtml(): string {
        return `
            <div class="googledrive-auth-container">
                <div id="googledrive-user-info" class="user-info"></div>
                <button id="googledrive-auth-btn" class="googledrive-btn">
                    <svg class="googledrive-icon" viewBox="0 0 24 24" width="20" height="20">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span class="btn-text">Sign in with Google</span>
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
                btnText.textContent = 'Sign in with Google';
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
