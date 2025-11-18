import { GoogleDriveAuthService } from './GoogleDriveAuthService';
import { GOOGLE_DRIVE_CONFIG } from '../../../config/googledrive.config';
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
import type { ICloudSyncService } from '../interfaces/ICloudSyncService';
import type { ICloudAuthService } from '../interfaces/ICloudAuthService';

declare const gapi: any;

export class GoogleDriveSyncService implements ICloudSyncService {
    private static instance: GoogleDriveSyncService;
    private authService: GoogleDriveAuthService;
    private status: SyncStatus = 'not_authenticated';
    private listeners: Set<SyncEventListener> = new Set();
    private syncDebounceTimer: number | null = null;
    private offlineQueue: SyncQueueItem[] = [];
    private deviceId: string;
    private isSyncing = false;
    private isOnline = navigator.onLine;
    private isGapiLoaded = false;
    private hasPulledOnAuth = false;

    private constructor() {
        this.authService = GoogleDriveAuthService.getInstance();
        this.deviceId = this.getOrCreateDeviceId();
        this.setupEventListeners();
        this.loadOfflineQueue();
    }

    static getInstance(): GoogleDriveSyncService {
        if (!GoogleDriveSyncService.instance) {
            GoogleDriveSyncService.instance = new GoogleDriveSyncService();
        }
        return GoogleDriveSyncService.instance;
    }

    async initialize(): Promise<void> {
        await this.authService.initialize();
        await this.loadGapiClient();

        if (this.authService.isAuthenticated()) {
            this.updateStatus('idle');
        } else {
            this.updateStatus('not_authenticated');
        }
    }

    private async loadGapiClient(): Promise<void> {
        console.log('[Google Drive] Starting to load API client...');
        return new Promise((resolve) => {
            const checkGapiLoaded = setInterval(() => {
                if (typeof gapi !== 'undefined') {
                    clearInterval(checkGapiLoaded);
                    console.log('[Google Drive] gapi found, loading client...');
                    gapi.load('client', async () => {
                        console.log('[Google Drive] Client loaded, initializing with discovery docs...');
                        await gapi.client.init({
                            discoveryDocs: GOOGLE_DRIVE_CONFIG.discoveryDocs,
                        });
                        this.isGapiLoaded = true;
                        console.log('[Google Drive] API client loaded successfully');
                        resolve();
                    });
                }
            }, 100);

            setTimeout(() => {
                clearInterval(checkGapiLoaded);
                if (!this.isGapiLoaded) {
                    console.warn('[Google Drive] API client not loaded within timeout');
                    console.warn('[Google Drive] gapi available?', typeof gapi !== 'undefined');
                }
                resolve();
            }, 10000);
        });
    }

    private async waitForGapiLoad(): Promise<void> {
        const maxWaitTime = 5000;
        const checkInterval = 100;
        const startTime = Date.now();

        return new Promise((resolve) => {
            const checkLoaded = setInterval(() => {
                if (this.isGapiLoaded) {
                    clearInterval(checkLoaded);
                    console.log('[Google Drive] API client is ready');
                    resolve();
                } else if (Date.now() - startTime > maxWaitTime) {
                    clearInterval(checkLoaded);
                    console.error('[Google Drive] API client wait timeout exceeded');
                    resolve();
                }
            }, checkInterval);
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
            this.updateStatus('idle');

            if (this.hasPulledOnAuth) {
                console.log('[Google Drive] Already pulled data on auth, skipping duplicate pull');
                return;
            }

            this.hasPulledOnAuth = true;
            console.log('[Google Drive] Authentication successful, pulling data from cloud...');
            const result = await this.pullFromCloud();
            if (result.success && result.data) {
                console.log('[Google Drive] Cloud data retrieved successfully');
                console.log('[Google Drive] Pulled data:', result.data);
                this.notifyEvent({
                    type: 'sync-completed',
                    timestamp: Date.now(),
                    data: result.data,
                });
            } else if (result.status === 'error' && result.message === 'No cloud data found') {
                console.log('[Google Drive] No existing cloud data found (first time setup)');
            }
        } else {
            this.updateStatus('not_authenticated');
            this.hasPulledOnAuth = false;
        }
    }

    async syncToCloud(data: CloudStateData, immediate = false): Promise<SyncResult> {
        if (!this.authService.isAuthenticated()) {
            return {
                success: false,
                status: 'not_authenticated',
                message: 'User not authenticated',
            };
        }

        if (!this.isGapiLoaded) {
            console.log('[Google Drive] API not loaded yet, waiting for initialization...');
            await this.waitForGapiLoad();
            if (!this.isGapiLoaded) {
                return {
                    success: false,
                    status: 'error',
                    message: 'Google API client failed to load',
                };
            }
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
            }, GOOGLE_DRIVE_CONFIG.syncDebounceMs);
        });
    }

    private async performSync(data: CloudStateData): Promise<SyncResult> {
        if (this.isSyncing) {
            console.log('[Google Drive] Sync already in progress');
            return {
                success: false,
                status: 'syncing',
                message: 'Sync already in progress',
            };
        }

        console.log('[Google Drive] Sync started');
        this.isSyncing = true;
        this.updateStatus('syncing');
        this.notifyEvent({ type: 'sync-started', timestamp: Date.now(), data });

        try {
            const enrichedData = this.enrichWithSyncMetadata(data);
            const cloudData = await this.getCloudData();

            if (cloudData) {
                console.log('[Google Drive] Found existing data in cloud');
                const conflict = this.detectConflict(enrichedData, cloudData);
                if (conflict) {
                    console.warn('[Google Drive] Conflict detected between local and cloud data');
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
            } else {
                console.log('[Google Drive] No existing data found (first sync)');
            }

            console.log('[Google Drive] Uploading data...');
            await this.uploadToGoogleDrive(enrichedData);
            console.log('[Google Drive] Upload successful');

            this.updateStatus('synced');
            this.notifyEvent({ type: 'sync-uploaded', timestamp: Date.now(), data: enrichedData });

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
        } catch (error: any) {
            if (error.status === 401) {
                console.log('[Google Drive] Token expired, refreshing...');
                this.authService.refreshAccessToken();
                return this.performSync(data);
            }

            console.error('[Google Drive] Sync failed:', error);
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

        if (!this.isGapiLoaded) {
            await this.waitForGapiLoad();
            if (!this.isGapiLoaded) {
                return {
                    success: false,
                    status: 'error',
                    message: 'Google API client failed to load',
                };
            }
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
        } catch (error: any) {
            if (error.status === 401) {
                this.authService.refreshAccessToken();
                return this.pullFromCloud();
            }

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
            await this.uploadToGoogleDrive(enrichedData);
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

    private async uploadToGoogleDrive(data: CloudStateData): Promise<void> {
        if (!this.isGapiLoaded) {
            throw new Error('Google API client not loaded');
        }

        const accessToken = await this.authService.getAccessToken();
        gapi.client.setToken({ access_token: accessToken });

        const fileName = GOOGLE_DRIVE_CONFIG.appDataFolderName;
        const content = JSON.stringify(data, null, 2);

        const fileId = await this.findFileInAppDataFolder(fileName);

        if (fileId) {
            await gapi.client.request({
                path: `/upload/drive/v3/files/${fileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: content,
            });
        } else {
            const metadata = {
                name: fileName,
                parents: ['appDataFolder'],
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([content], { type: 'application/json' }));

            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: form,
            });
        }
    }

    private async getCloudData(): Promise<CloudStateData | null> {
        if (!this.isGapiLoaded) {
            return null;
        }

        try {
            const accessToken = await this.authService.getAccessToken();
            gapi.client.setToken({ access_token: accessToken });

            const fileName = GOOGLE_DRIVE_CONFIG.appDataFolderName;
            const fileId = await this.findFileInAppDataFolder(fileName);

            if (!fileId) {
                return null;
            }

            const response = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media',
            });

            return response.result as CloudStateData;
        } catch (error: any) {
            if (error.status === 404) {
                return null;
            }
            throw error;
        }
    }

    private async findFileInAppDataFolder(fileName: string): Promise<string | null> {
        const response = await gapi.client.drive.files.list({
            spaces: 'appDataFolder',
            fields: 'files(id, name)',
            q: `name='${fileName}'`,
        });

        const files = response.result.files;
        return files && files.length > 0 ? files[0].id : null;
    }

    private detectConflict(localData: CloudStateData, cloudData: CloudStateData): boolean {
        if (GOOGLE_DRIVE_CONFIG.conflictResolutionStrategy === 'last-write-wins') {
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
        localStorage.setItem('wpi-planner-google-sync-queue', JSON.stringify(this.offlineQueue));
    }

    private loadOfflineQueue(): void {
        const saved = localStorage.getItem('wpi-planner-google-sync-queue');
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

    getAuthService(): ICloudAuthService {
        return this.authService;
    }
}
