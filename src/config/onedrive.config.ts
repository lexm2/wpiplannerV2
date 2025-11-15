import { Configuration } from '@azure/msal-browser';

export interface OneDriveConfig {
    msalConfig: Configuration;
    scopes: string[];
    appFolderPath: string;
    syncDebounceMs: number;
    autoSyncEnabled: boolean;
    conflictResolutionStrategy: 'last-write-wins' | 'manual' | 'newest-wins';
}

export const ONEDRIVE_CONFIG: OneDriveConfig = {
    msalConfig: {
        auth: {
            clientId: import.meta.env.VITE_ONEDRIVE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE',
            authority: 'https://login.microsoftonline.com/common',
            redirectUri: window.location.origin,
        },
        cache: {
            cacheLocation: 'localStorage',
            storeAuthStateInCookie: false,
        },
    },
    scopes: ['Files.ReadWrite.AppFolder', 'offline_access', 'User.Read'],
    appFolderPath: 'wpi-planner-state.json',
    syncDebounceMs: 2500,
    autoSyncEnabled: true,
    conflictResolutionStrategy: 'manual',
};

export const GRAPH_API_ENDPOINT = 'https://graph.microsoft.com/v1.0';
export const ONEDRIVE_APP_FOLDER_ENDPOINT = `${GRAPH_API_ENDPOINT}/me/drive/special/approot`;
