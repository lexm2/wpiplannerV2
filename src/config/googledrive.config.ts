export interface GoogleDriveConfig {
    clientId: string;
    scopes: string[];
    discoveryDocs: string[];
    appDataFolderName: string;
    syncDebounceMs: number;
    autoSyncEnabled: boolean;
    conflictResolutionStrategy: 'last-write-wins' | 'manual' | 'newest-wins';
}

export const GOOGLE_DRIVE_CONFIG: GoogleDriveConfig = {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE',
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    appDataFolderName: 'wpi-planner-state.json',
    syncDebounceMs: 2500,
    autoSyncEnabled: true,
    conflictResolutionStrategy: 'manual',
};

export const GOOGLE_API_SCRIPT_URL = 'https://apis.google.com/js/api.js';
export const GOOGLE_GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
