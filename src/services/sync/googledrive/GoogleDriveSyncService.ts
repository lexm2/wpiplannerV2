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
import type { CloudSyncService } from '../interfaces/CloudSyncService';
import type { CloudAuthService } from '../interfaces/CloudAuthService';
import { syncEventBus } from '../SyncEventBus';
import { ProfileStateManager } from '../../../core/state/ProfileStateManager';

declare const gapi: any;

export class GoogleDriveSyncService implements CloudSyncService {
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

        // Listen for local save events to push to cloud (no conflict detection)
        syncEventBus.on('local-save-completed', async () => {
            if (GOOGLE_DRIVE_CONFIG.autoSyncEnabled && this.isAuthenticated()) {
                // Get data from ProfileStateManager and push directly
                const stateManager = ProfileStateManager.getInstance();
                const exportedData = await stateManager.exportData();
                if (exportedData) {
                    const cloudData: CloudStateData = JSON.parse(exportedData);
                    await this.pushToCloud(cloudData);
                }
            }
        });
    }

    /**
     * Push data to cloud without conflict detection.
     * Use this after local changes when we know local is authoritative.
     */
    async pushToCloud(data: CloudStateData): Promise<SyncResult> {
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
            this.addToOfflineQueue(data);
            return {
                success: false,
                status: 'offline',
                message: 'Queued for sync when online',
            };
        }

        console.log('[Google Drive] Pushing data to cloud (no conflict check)');
        this.updateStatus('syncing');
        this.notifyEvent({ type: 'sync-started', timestamp: Date.now(), data });

        try {
            const enrichedData = this.enrichWithSyncMetadata(data);
            await this.uploadToGoogleDrive(enrichedData);
            console.log('[Google Drive] Push successful');

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
                message: 'Push completed successfully',
            };
        } catch (error: any) {
            console.error('[Google Drive] Push failed:', error);
            this.updateStatus('error');
            this.notifyEvent({
                type: 'sync-failed',
                timestamp: Date.now(),
                error: error as Error,
            });

            return {
                success: false,
                status: 'error',
                message: (error as Error).message,
                error: error as Error,
            };
        }
    }

    private async handleAuthChange(): Promise<void> {
        if (this.authService.isAuthenticated()) {
            this.updateStatus('idle');
            // Trigger initial sync after sign-in to check for conflicts
            const stateManager = ProfileStateManager.getInstance();
            const exportedData = await stateManager.exportData();

            if (!exportedData) {
                console.warn('[Google Drive] No local data to sync');
                return;
            }

            const localData: CloudStateData = JSON.parse(exportedData);
            console.log('[Google Drive] Local data for sync:', localData);

            // Sync local data to cloud (this will detect conflicts if any)
            await this.syncToCloud(localData, true);
        } else {
            this.cancelPendingSync();
            this.updateStatus('not_authenticated');
        }
    }

    cancelPendingSync(): void {
        if (this.syncDebounceTimer !== null) {
            console.log('[Google Drive] Canceling pending sync operation');
            clearTimeout(this.syncDebounceTimer);
            this.syncDebounceTimer = null;
        }

        if (this.isSyncing) {
            console.log('[Google Drive] Sync in progress, flagging for cancellation');
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
        if (!this.authService.isAuthenticated()) {
            console.log('[Google Drive] User not authenticated, aborting sync');
            return {
                success: false,
                status: 'not_authenticated',
                message: 'User not authenticated',
            };
        }

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
                const conflict = this.detectConflict(enrichedData, cloudData);
                if (conflict) {
                    console.warn('[Google Drive] Conflict detected, triggering merge flow');
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

            if (!this.authService.isAuthenticated()) {
                console.log('[Google Drive] User signed out during sync, not emitting success event');
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
        } catch (error: any) {
            if (error.status === 401) {
                console.error('[Google Drive] Authentication expired, please sign in again');
                this.updateStatus('not_authenticated');
                return {
                    success: false,
                    status: 'not_authenticated',
                    message: 'Authentication expired, please sign in again',
                };
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
                console.error('[Google Drive] Authentication expired, please sign in again');
                this.updateStatus('not_authenticated');
                return {
                    success: false,
                    status: 'not_authenticated',
                    message: 'Authentication expired, please sign in again',
                };
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
        console.log(`[Google Drive] Resolving conflict with: ${resolution}`);
        const dataToSync = resolution === 'keep-local' ? localData : cloudData;
        const enrichedData = this.enrichWithSyncMetadata(dataToSync);

        try {
            console.log('[Google Drive] Uploading resolved data to cloud...');
            await this.uploadToGoogleDrive(enrichedData);
            console.log('[Google Drive] Conflict resolution upload successful');
            this.updateStatus('synced');

            this.notifyEvent({
                type: 'sync-pushed',
                timestamp: Date.now(),
                data: enrichedData,
            });

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
            console.error('[Google Drive] Conflict resolution upload failed:', error);
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
        console.log('[Google Drive] detectConflict called');
        console.log('[Google Drive] Conflict resolution strategy:', GOOGLE_DRIVE_CONFIG.conflictResolutionStrategy);

        if (GOOGLE_DRIVE_CONFIG.conflictResolutionStrategy === 'last-write-wins') {
            console.log('[Google Drive] Using last-write-wins strategy, no conflict');
            return false;
        }

        // Compare content hashes (checksum field or compute from content)
        const localHash = localData.checksum || this.computeContentHash(localData);
        const cloudHash = cloudData.checksum || this.computeContentHash(cloudData);

        if (localHash !== cloudHash) {
            return true;
        }

        return false;
    }

    private computeContentHash(data: CloudStateData): string {
        const content = {
            schedules: data.schedules,
            state: data.state,
        };
        // Simple hash for comparison - not cryptographic
        const str = JSON.stringify(content);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
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
        // Notify local listeners
        this.listeners.forEach((listener) => listener(event));
        // Also emit to centralized event bus
        syncEventBus.emit(event);
    }

    isAuthenticated(): boolean {
        return this.authService.isAuthenticated();
    }

    getAuthService(): CloudAuthService {
        return this.authService;
    }
}
