import { Client } from '@microsoft/microsoft-graph-client';
import { OneDriveAuthService } from './OneDriveAuthService';
import { ONEDRIVE_CONFIG, ONEDRIVE_APP_FOLDER_ENDPOINT } from '../../../config/onedrive.config';
import type {
    SyncStatus,
    CloudStateData,
    SyncResult,
    ConflictData,
    SyncEvent,
    SyncEventListener,
    SyncQueueItem,
    SyncMetadata,
} from '../CloudSyncTypes';
import type { CloudSyncService } from '../interfaces/CloudSyncService';
import type { CloudAuthService } from '../interfaces/CloudAuthService';

export class OneDriveSyncService implements CloudSyncService {
    private static instance: OneDriveSyncService;
    private authService: OneDriveAuthService;
    private graphClient: Client | null = null;
    private status: SyncStatus = 'not_authenticated';
    private listeners: Set<SyncEventListener> = new Set();
    private syncDebounceTimer: number | null = null;
    private offlineQueue: SyncQueueItem[] = [];
    private deviceId: string;
    private isSyncing = false;
    private isOnline = navigator.onLine;

    private constructor() {
        this.authService = OneDriveAuthService.getInstance();
        this.deviceId = this.getOrCreateDeviceId();
        this.setupEventListeners();
        this.loadOfflineQueue();
    }

    static getInstance(): OneDriveSyncService {
        if (!OneDriveSyncService.instance) {
            OneDriveSyncService.instance = new OneDriveSyncService();
        }
        return OneDriveSyncService.instance;
    }

    async initialize(): Promise<void> {
        await this.authService.initialize();
        if (this.authService.isAuthenticated()) {
            await this.initializeGraphClient();
            this.updateStatus('idle');
        } else {
            this.updateStatus('not_authenticated');
        }
    }

    private async initializeGraphClient(): Promise<void> {
        this.graphClient = Client.init({
            authProvider: async (done) => {
                try {
                    const token = await this.authService.getAccessToken();
                    done(null, token);
                } catch (error) {
                    done(error as Error, null);
                }
            },
        });
    }

    private setupEventListeners(): void {
        this.authService.addEventListener((event) => {
            if (event.type === 'auth-changed') {
                this.handleAuthChange();
            }
        });

        window.addEventListener('online', () => {
            this.isOnline = true;
            this.notifyEvent({ type: 'online-mode', timestamp: Date.now() });
            this.processOfflineQueue();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateStatus('offline');
            this.notifyEvent({ type: 'offline-mode', timestamp: Date.now() });
        });
    }

    private async handleAuthChange(): Promise<void> {
        if (this.authService.isAuthenticated()) {
            await this.initializeGraphClient();
            this.updateStatus('idle');
        } else {
            this.cancelPendingSync();
            this.graphClient = null;
            this.updateStatus('not_authenticated');
        }
    }

    cancelPendingSync(): void {
        if (this.syncDebounceTimer !== null) {
            console.log('[OneDrive] Canceling pending sync operation');
            clearTimeout(this.syncDebounceTimer);
            this.syncDebounceTimer = null;
        }

        if (this.isSyncing) {
            console.log('[OneDrive] Sync in progress, flagging for cancellation');
            this.isSyncing = false;
        }

        this.updateStatus('not_authenticated');
    }

    async syncToCloud(data: CloudStateData, immediate = false): Promise<SyncResult> {
        if (!this.authService.isAuthenticated()) {
            return {
                success: false,
                status: 'not_authenticated',
                message: 'User not authenticated',
            };
        }

        if (!this.isOnline) {
            this.addToOfflineQueue(data);
            return {
                success: false,
                status: 'offline',
                message: 'Queued for sync when online',
            };
        }

        if (immediate) {
            return await this.performSync(data);
        }

        if (this.syncDebounceTimer !== null) {
            clearTimeout(this.syncDebounceTimer);
        }

        return new Promise((resolve) => {
            this.syncDebounceTimer = window.setTimeout(async () => {
                const result = await this.performSync(data);
                resolve(result);
            }, ONEDRIVE_CONFIG.syncDebounceMs);
        });
    }

    private async performSync(data: CloudStateData): Promise<SyncResult> {
        if (!this.authService.isAuthenticated()) {
            console.log('[OneDrive] User not authenticated, aborting sync');
            return {
                success: false,
                status: 'not_authenticated',
                message: 'User not authenticated',
            };
        }

        if (this.isSyncing) {
            return {
                success: false,
                status: 'syncing',
                message: 'Sync already in progress',
            };
        }

        this.isSyncing = true;
        this.updateStatus('syncing');
        this.notifyEvent({ type: 'sync-started', timestamp: Date.now(), data });

        try {
            const enrichedData = this.enrichWithSyncMetadata(data);
            const cloudData = await this.getCloudData();

            if (cloudData) {
                const conflict = this.detectConflict(enrichedData, cloudData);
                if (conflict) {
                    this.updateStatus('conflict');
                    const conflictData: ConflictData = {
                        local: enrichedData,
                        cloud: cloudData,
                        conflictType: 'timestamp',
                    };
                    this.notifyEvent({
                        type: 'sync-conflict',
                        timestamp: Date.now(),
                        data: conflictData,
                    });
                    return {
                        success: false,
                        status: 'conflict',
                        message: 'Conflict detected',
                        conflict: conflictData,
                    };
                }
            }

            await this.uploadToOneDrive(enrichedData);

            if (!this.authService.isAuthenticated()) {
                console.log('[OneDrive] User signed out during sync, not emitting success event');
                this.isSyncing = false;
                return {
                    success: false,
                    status: 'not_authenticated',
                    message: 'User signed out during sync',
                };
            }

            this.updateStatus('synced');
            this.notifyEvent({ type: 'sync-pushed', timestamp: Date.now(), data: enrichedData });

            setTimeout(() => {
                if (this.status === 'synced') {
                    this.updateStatus('idle');
                }
            }, 1500);

            return {
                success: true,
                status: 'synced',
                message: 'Sync completed successfully',
            };
        } catch (error) {
            this.updateStatus('error');
            this.notifyEvent({ type: 'sync-failed', timestamp: Date.now(), error: error as Error });
            return {
                success: false,
                status: 'error',
                message: (error as Error).message,
                error: error as Error,
            };
        } finally {
            this.isSyncing = false;
        }
    }

    async pullFromCloud(): Promise<SyncResult> {
        if (!this.authService.isAuthenticated()) {
            return {
                success: false,
                status: 'not_authenticated',
                message: 'User not authenticated',
            };
        }

        if (!this.isOnline) {
            return {
                success: false,
                status: 'offline',
                message: 'Cannot pull while offline',
            };
        }

        try {
            const cloudData = await this.getCloudData();
            if (!cloudData) {
                return {
                    success: false,
                    status: 'error',
                    message: 'No cloud data found',
                };
            }

            return {
                success: true,
                status: 'synced',
                data: cloudData,
            };
        } catch (error) {
            return {
                success: false,
                status: 'error',
                message: (error as Error).message,
                error: error as Error,
            };
        }
    }

    async resolveConflict(
        resolution: 'keep-local' | 'keep-cloud',
        localData: CloudStateData,
        cloudData: CloudStateData
    ): Promise<SyncResult> {
        const dataToSync = resolution === 'keep-local' ? localData : cloudData;
        const enrichedData = this.enrichWithSyncMetadata(dataToSync);

        try {
            await this.uploadToOneDrive(enrichedData);
            this.updateStatus('synced');

            setTimeout(() => {
                if (this.status === 'synced') {
                    this.updateStatus('idle');
                }
            }, 1500);

            return {
                success: true,
                status: 'synced',
                message: 'Conflict resolved',
                data: enrichedData,
            };
        } catch (error) {
            this.updateStatus('error');
            return {
                success: false,
                status: 'error',
                message: (error as Error).message,
                error: error as Error,
            };
        }
    }

    private async uploadToOneDrive(data: CloudStateData): Promise<void> {
        if (!this.graphClient) {
            throw new Error('Graph client not initialized');
        }

        const fileName = ONEDRIVE_CONFIG.appFolderPath;
        const content = JSON.stringify(data, null, 2);

        await this.graphClient
            .api(`${ONEDRIVE_APP_FOLDER_ENDPOINT}:/${fileName}:/content`)
            .put(content);
    }

    private async getCloudData(): Promise<CloudStateData | null> {
        if (!this.graphClient) {
            return null;
        }

        try {
            const fileName = ONEDRIVE_CONFIG.appFolderPath;
            const fileResponse = await this.graphClient
                .api(`${ONEDRIVE_APP_FOLDER_ENDPOINT}:/${fileName}`)
                .get();

            const downloadUrl = fileResponse['@microsoft.graph.downloadUrl'];
            if (!downloadUrl) {
                return null;
            }

            const response = await fetch(downloadUrl);
            const data = await response.json();
            return data as CloudStateData;
        } catch (error: any) {
            if (error?.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    private detectConflict(localData: CloudStateData, cloudData: CloudStateData): boolean {
        if (ONEDRIVE_CONFIG.conflictResolutionStrategy === 'last-write-wins') {
            return false;
        }

        const localTimestamp = localData.syncMetadata.lastSyncTimestamp;
        const cloudTimestamp = cloudData.syncMetadata.lastSyncTimestamp;
        const localDevice = localData.syncMetadata.deviceId;
        const cloudDevice = cloudData.syncMetadata.deviceId;

        if (localDevice === cloudDevice) {
            return false;
        }

        const timeDiff = Math.abs(localTimestamp - cloudTimestamp);
        if (timeDiff < 5000) {
            return true;
        }

        return localTimestamp < cloudTimestamp;
    }

    private enrichWithSyncMetadata(data: CloudStateData): CloudStateData {
        const syncMetadata: SyncMetadata = {
            deviceId: this.deviceId,
            lastSyncTimestamp: Date.now(),
            syncVersion: '1.0',
            deviceName: navigator.userAgent,
        };

        return {
            ...data,
            syncMetadata,
        };
    }

    private addToOfflineQueue(data: CloudStateData): void {
        const item: SyncQueueItem = {
            timestamp: Date.now(),
            data,
            retryCount: 0,
        };

        this.offlineQueue.push(item);
        this.saveOfflineQueue();
    }

    private async processOfflineQueue(): Promise<void> {
        if (this.offlineQueue.length === 0) {
            return;
        }

        const items = [...this.offlineQueue];
        this.offlineQueue = [];
        this.saveOfflineQueue();

        for (const item of items) {
            if (item.retryCount >= 3) {
                continue;
            }

            const result = await this.performSync(item.data);
            if (!result.success) {
                item.retryCount++;
                this.offlineQueue.push(item);
            }
        }

        this.saveOfflineQueue();
    }

    private saveOfflineQueue(): void {
        localStorage.setItem('wpi-planner-sync-queue', JSON.stringify(this.offlineQueue));
    }

    private loadOfflineQueue(): void {
        const saved = localStorage.getItem('wpi-planner-sync-queue');
        if (saved) {
            try {
                this.offlineQueue = JSON.parse(saved);
            } catch {
                this.offlineQueue = [];
            }
        }
    }

    private getOrCreateDeviceId(): string {
        let deviceId = localStorage.getItem('wpi-planner-device-id');
        if (!deviceId) {
            deviceId = `device-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            localStorage.setItem('wpi-planner-device-id', deviceId);
        }
        return deviceId;
    }

    getDeviceId(): string {
        return this.deviceId;
    }

    getStatus(): SyncStatus {
        return this.status;
    }

    private updateStatus(status: SyncStatus): void {
        this.status = status;
    }

    addEventListener(listener: SyncEventListener): void {
        this.listeners.add(listener);
    }

    removeEventListener(listener: SyncEventListener): void {
        this.listeners.delete(listener);
    }

    private notifyEvent(event: SyncEvent): void {
        this.listeners.forEach((listener) => listener(event));
    }

    isAuthenticated(): boolean {
        return this.authService.isAuthenticated();
    }

    getAuthService(): CloudAuthService {
        return this.authService;
    }
}
