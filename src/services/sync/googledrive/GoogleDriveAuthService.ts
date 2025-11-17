import { GOOGLE_DRIVE_CONFIG } from '../../../config/googledrive.config';
import type { SyncEvent } from '../CloudSyncTypes';
import type { ICloudAuthService, AuthState, AuthResult } from '../interfaces/ICloudAuthService';

declare const google: any;

export class GoogleDriveAuthService implements ICloudAuthService {
    private static instance: GoogleDriveAuthService;
    private tokenClient: any = null;
    private accessToken: string | null = null;
    private currentUser: AuthState = { isAuthenticated: false };
    private listeners: Set<(event: SyncEvent) => void> = new Set();
    private isInitialized = false;

    private constructor() {}

    static getInstance(): GoogleDriveAuthService {
        if (!GoogleDriveAuthService.instance) {
            GoogleDriveAuthService.instance = new GoogleDriveAuthService();
        }
        return GoogleDriveAuthService.instance;
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        return new Promise((resolve) => {
            const checkGoogleLoaded = setInterval(() => {
                if (typeof google !== 'undefined' && google.accounts) {
                    clearInterval(checkGoogleLoaded);
                    this.initializeTokenClient();
                    this.loadStoredAuth();
                    this.isInitialized = true;
                    resolve();
                }
            }, 100);

            setTimeout(() => {
                clearInterval(checkGoogleLoaded);
                if (!this.isInitialized) {
                    console.warn('Google Identity Services not loaded');
                    resolve();
                }
            }, 10000);
        });
    }

    private initializeTokenClient(): void {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_DRIVE_CONFIG.clientId,
            scope: GOOGLE_DRIVE_CONFIG.scopes.join(' '),
            callback: (tokenResponse: any) => {
                if (tokenResponse.error) {
                    console.error('Token error:', tokenResponse.error);
                    return;
                }
                this.accessToken = tokenResponse.access_token;
                this.updateUserState(tokenResponse);
                this.saveAuthState();
                this.notifyAuthChanged();
            },
        });
    }

    async signIn(): Promise<AuthResult> {
        return new Promise((resolve, reject) => {
            if (!this.tokenClient) {
                reject(new Error('Token client not initialized'));
                return;
            }

            const originalCallback = this.tokenClient.callback;
            this.tokenClient.callback = (tokenResponse: any) => {
                this.tokenClient.callback = originalCallback;

                if (tokenResponse.error) {
                    reject(new Error(tokenResponse.error));
                    return;
                }

                this.accessToken = tokenResponse.access_token;
                this.updateUserState(tokenResponse);
                this.saveAuthState();
                this.notifyAuthChanged();

                resolve({
                    account: {
                        username: this.currentUser.email || 'Google User',
                        homeAccountId: this.currentUser.accountId || 'google-user',
                    },
                    accessToken: tokenResponse.access_token,
                });

                originalCallback(tokenResponse);
            };

            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    async signOut(): Promise<void> {
        if (this.accessToken && typeof google !== 'undefined' && google.accounts?.oauth2) {
            google.accounts.oauth2.revoke(this.accessToken, () => {
                console.log('Access token revoked');
            });
        }

        this.accessToken = null;
        this.currentUser = { isAuthenticated: false };
        this.clearAuthState();
        this.notifyAuthChanged();
    }

    async getAccessToken(): Promise<string> {
        if (!this.accessToken) {
            throw new Error('No access token available. Please sign in.');
        }

        return this.accessToken;
    }

    getAuthState(): AuthState {
        return { ...this.currentUser };
    }

    isAuthenticated(): boolean {
        return this.currentUser.isAuthenticated && this.accessToken !== null;
    }

    addEventListener(listener: (event: SyncEvent) => void): void {
        this.listeners.add(listener);
    }

    removeEventListener(listener: (event: SyncEvent) => void): void {
        this.listeners.delete(listener);
    }

    private updateUserState(tokenResponse: any): void {
        this.currentUser = {
            isAuthenticated: true,
            email: tokenResponse.email || undefined,
            username: tokenResponse.email || undefined,
            accountId: tokenResponse.sub || 'google-user',
        };
    }

    private notifyAuthChanged(): void {
        const event: SyncEvent = {
            type: 'auth-changed',
            timestamp: Date.now(),
            data: this.getAuthState(),
        };
        this.listeners.forEach((listener) => listener(event));
    }

    private saveAuthState(): void {
        if (this.currentUser.isAuthenticated) {
            localStorage.setItem('google-drive-auth', JSON.stringify({
                user: this.currentUser,
                wasAuthenticated: true,
                timestamp: Date.now(),
            }));
        }
    }

    private loadStoredAuth(): void {
        const stored = localStorage.getItem('google-drive-auth');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                if (data.wasAuthenticated) {
                    console.log('[Google Drive] User was previously authenticated, will attempt silent sign-in on user interaction');
                }
            } catch (error) {
                console.error('[Google Drive] Failed to load stored auth:', error);
                this.clearAuthState();
            }
        }
    }

    async attemptSilentSignIn(): Promise<boolean> {
        if (!this.tokenClient) {
            return false;
        }

        return new Promise((resolve) => {
            const originalCallback = this.tokenClient.callback;
            this.tokenClient.callback = (tokenResponse: any) => {
                this.tokenClient.callback = originalCallback;

                if (tokenResponse.error) {
                    console.log('[Google Drive] Silent sign-in failed:', tokenResponse.error);
                    resolve(false);
                    return;
                }

                this.accessToken = tokenResponse.access_token;
                this.updateUserState(tokenResponse);
                this.saveAuthState();
                this.notifyAuthChanged();
                console.log('[Google Drive] Silent sign-in successful');
                resolve(true);

                originalCallback(tokenResponse);
            };

            this.tokenClient.requestAccessToken({ prompt: '' });
        });
    }

    private clearAuthState(): void {
        localStorage.removeItem('google-drive-auth');
    }

    refreshAccessToken(): void {
        if (this.tokenClient && this.currentUser.isAuthenticated) {
            this.tokenClient.requestAccessToken({ prompt: '' });
        }
    }
}
