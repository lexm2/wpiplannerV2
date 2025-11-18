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

export type SyncEventType =
    | 'sync-started'
    | 'sync-completed'
    | 'sync-uploaded'
    | 'sync-failed'
    | 'sync-conflict'
    | 'auth-changed'
    | 'offline-mode'
    | 'online-mode';

export interface SyncEvent {
    type: SyncEventType;
    timestamp: number;
    data?: any;
    error?: Error;
}

export type SyncEventListener = (event: SyncEvent) => void;

export type CloudProvider = 'onedrive' | 'googledrive' | 'none';
