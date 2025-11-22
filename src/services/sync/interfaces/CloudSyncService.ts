import type { CloudStateData, SyncResult, SyncStatus, SyncEvent } from '../CloudSyncTypes';
import type { CloudAuthService } from './ICloudAuthService';

export interface CloudSyncService {
    initialize(): Promise<void>;
    syncToCloud(data: CloudStateData, immediate?: boolean): Promise<SyncResult>;
    pullFromCloud(): Promise<SyncResult>;
    resolveConflict(
        resolution: 'keep-local' | 'keep-cloud',
        localData: CloudStateData,
        cloudData: CloudStateData
    ): Promise<SyncResult>;
    getStatus(): SyncStatus;
    getDeviceId(): string;
    isAuthenticated(): boolean;
    getAuthService(): CloudAuthService;
    addEventListener(listener: (event: SyncEvent) => void): void;
    removeEventListener(listener: (event: SyncEvent) => void): void;
}
