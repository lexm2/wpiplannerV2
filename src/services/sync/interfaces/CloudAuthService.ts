import type { SyncEvent } from '../CloudSyncTypes';

export interface AuthState {
    isAuthenticated: boolean;
    username?: string;
    email?: string;
    accountId?: string;
}

export interface AuthResult {
    account: {
        username: string;
        homeAccountId: string;
    };
    accessToken: string;
}

export interface CloudAuthService {
    initialize(): Promise<void>;
    signIn(): Promise<AuthResult>;
    signOut(): Promise<void>;
    getAccessToken(): Promise<string>;
    getAuthState(): AuthState;
    isAuthenticated(): boolean;
    addEventListener(listener: (event: SyncEvent) => void): void;
    removeEventListener(listener: (event: SyncEvent) => void): void;
}
