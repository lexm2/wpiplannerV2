import {
    PublicClientApplication,
    AccountInfo,
    AuthenticationResult,
    InteractionRequiredAuthError,
    SilentRequest,
    PopupRequest,
} from '@azure/msal-browser';
import { ONEDRIVE_CONFIG } from '../../../config/onedrive.config';
import type { SyncEvent } from '../CloudSyncTypes';
import type { ICloudAuthService, AuthState, AuthResult } from '../interfaces/ICloudAuthService';

export class OneDriveAuthService implements ICloudAuthService {
    private static instance: OneDriveAuthService;
    private msalInstance: PublicClientApplication;
    private currentAccount: AccountInfo | null = null;
    private listeners: Set<(event: SyncEvent) => void> = new Set();

    private constructor() {
        this.msalInstance = new PublicClientApplication(ONEDRIVE_CONFIG.msalConfig);
    }

    static getInstance(): OneDriveAuthService {
        if (!OneDriveAuthService.instance) {
            OneDriveAuthService.instance = new OneDriveAuthService();
        }
        return OneDriveAuthService.instance;
    }

    async initialize(): Promise<void> {
        await this.msalInstance.initialize();
        await this.msalInstance.handleRedirectPromise();

        const accounts = this.msalInstance.getAllAccounts();
        if (accounts.length > 0) {
            this.currentAccount = accounts[0];
            this.notifyAuthChanged();
        }
    }

    async signIn(): Promise<AuthResult> {
        const loginRequest: PopupRequest = {
            scopes: ONEDRIVE_CONFIG.scopes,
        };

        try {
            const response = await this.msalInstance.loginPopup(loginRequest);
            this.currentAccount = response.account;
            this.notifyAuthChanged();
            return {
                account: {
                    username: response.account.username,
                    homeAccountId: response.account.homeAccountId,
                },
                accessToken: response.accessToken,
            };
        } catch (error) {
            console.error('Sign-in error:', error);
            throw error;
        }
    }

    async signOut(): Promise<void> {
        if (this.currentAccount) {
            await this.msalInstance.logoutPopup({
                account: this.currentAccount,
            });
            this.currentAccount = null;
            this.notifyAuthChanged();
        }
    }

    async getAccessToken(): Promise<string> {
        if (!this.currentAccount) {
            throw new Error('No account signed in');
        }

        const silentRequest: SilentRequest = {
            scopes: ONEDRIVE_CONFIG.scopes,
            account: this.currentAccount,
        };

        try {
            const response = await this.msalInstance.acquireTokenSilent(silentRequest);
            return response.accessToken;
        } catch (error) {
            if (error instanceof InteractionRequiredAuthError) {
                const response = await this.msalInstance.acquireTokenPopup(silentRequest);
                return response.accessToken;
            }
            throw error;
        }
    }

    getAuthState(): AuthState {
        return {
            isAuthenticated: this.currentAccount !== null,
            username: this.currentAccount?.username,
            email: this.currentAccount?.username,
            accountId: this.currentAccount?.homeAccountId,
        };
    }

    isAuthenticated(): boolean {
        return this.currentAccount !== null;
    }

    addEventListener(listener: (event: SyncEvent) => void): void {
        this.listeners.add(listener);
    }

    removeEventListener(listener: (event: SyncEvent) => void): void {
        this.listeners.delete(listener);
    }

    private notifyAuthChanged(): void {
        const event: SyncEvent = {
            type: 'auth-changed',
            timestamp: Date.now(),
            data: this.getAuthState(),
        };
        this.listeners.forEach((listener) => listener(event));
    }
}
