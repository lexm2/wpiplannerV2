export type SyncStatus =
    | 'idle'
    | 'syncing'
    | 'synced'
    | 'conflict'
    | 'error'
    | 'offline'
    | 'not_authenticated';

export interface SyncMetadata {
    deviceId: string;
    lastSyncTimestamp: number;
    syncVersion: string;
    deviceName?: string;
}

export interface CloudStateData {
    version: string;
    timestamp: string;
    checksum: string;
    state: any;
    schedules: any[];
    preferences: any;
    syncMetadata: SyncMetadata;
}

export interface ConflictData {
    local: CloudStateData;
    cloud: CloudStateData;
    conflictType: 'timestamp' | 'checksum' | 'device';
}

export interface SyncResult {
    success: boolean;
    status: SyncStatus;
    message?: string;
    conflict?: ConflictData;
    error?: Error;
    data?: CloudStateData;
}

export interface OneDriveFile {
    id: string;
    name: string;
    size: number;
    lastModifiedDateTime: string;
    '@microsoft.graph.downloadUrl'?: string;
}

export interface AuthState {
    isAuthenticated: boolean;
    username?: string;
    email?: string;
    accountId?: string;
}

export interface SyncQueueItem {
    timestamp: number;
    data: CloudStateData;
    retryCount: number;
}

export interface SyncConfig {
    autoSyncEnabled: boolean;
    syncDebounceMs: number;
    maxRetries: number;
    offlineQueueSize: number;
}

// Re-export from canonical types file (single source of truth)
export type { SyncEventType, SyncEvent, SyncEventListener } from '../types';
