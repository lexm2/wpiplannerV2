import { GOOGLE_DRIVE_CONFIG } from '../../../../config/googledrive.config';
import type { CloudProvider, SyncData } from '../../types';
import { syncEventBus } from '../../SyncEventBus';
import { parseSyncData } from '../../schemas';
import { checksumCalculator } from '../../checksum';
import { createValidationLogger } from '../../validation-logger';
import LZString from 'lz-string';

declare const google: any;
declare const gapi: any;

/**
 * Google Drive cloud provider implementation.
 * Handles authentication and data sync with Google Drive's appDataFolder.
 */
export class GoogleDriveProvider implements CloudProvider {
    readonly id = 'googledrive';
    readonly displayName = 'Google Drive';
    readonly icon = 'BRAND_GOOGLE_DRIVE';

    private tokenClient: any = null;
    private accessToken: string | null = null;
    private authenticated = false;
    private initialized = false;
    private gapiLoaded = false;
    private deviceId: string;

    constructor() {
        this.deviceId = this.getOrCreateDeviceId();
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        await Promise.all([
            this.initializeGoogleIdentity(),
            this.loadGapiClient(),
        ]);

        this.initialized = true;
        console.log('[GoogleDriveProvider] Initialized');
    }

    dispose(): void {
        this.accessToken = null;
        this.authenticated = false;
        console.log('[GoogleDriveProvider] Disposed');
    }

    async signIn(): Promise<void> {
        if (!this.tokenClient) {
            throw new Error('Google Identity Services not initialized');
        }

        return new Promise((resolve, reject) => {
            const originalCallback = this.tokenClient.callback;

            this.tokenClient.callback = (tokenResponse: any) => {
                this.tokenClient.callback = originalCallback;

                if (tokenResponse.error) {
                    reject(new Error(tokenResponse.error));
                    return;
                }

                this.accessToken = tokenResponse.access_token;
                this.authenticated = true;
                this.saveAuthState();

                syncEventBus.emitEvent('auth-changed', { authenticated: true });
                console.log('[GoogleDriveProvider] Signed in');
                resolve();
            };

            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    async signOut(): Promise<void> {
        if (this.accessToken && typeof google !== 'undefined' && google.accounts?.oauth2) {
            google.accounts.oauth2.revoke(this.accessToken, () => {
                console.log('[GoogleDriveProvider] Token revoked');
            });
        }

        this.accessToken = null;
        this.authenticated = false;
        this.clearAuthState();

        syncEventBus.emitEvent('auth-changed', { authenticated: false });
        console.log('[GoogleDriveProvider] Signed out');
    }

    isAuthenticated(): boolean {
        return this.authenticated && this.accessToken !== null;
    }

    async pushData(data: SyncData): Promise<void> {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        if (!this.gapiLoaded) {
            throw new Error('Google API client not loaded');
        }

        const logger = createValidationLogger('GoogleDriveProvider', 'push');
        logger.logStart();

        try {
            // Validate data before push
            const validated = parseSyncData(data, 'GoogleDriveProvider.pushData');

            // Update timestamp and recalculate checksum
            validated.timestamp = Date.now();
            validated.checksum = await checksumCalculator.calculateChecksum({
                version: validated.version,
                activeScheduleId: validated.activeScheduleId,
                schedules: validated.schedules,
                preferences: validated.preferences
            });

            console.log('[GoogleDriveProvider] Pushing data to cloud:', {
                version: validated.version,
                timestamp: validated.timestamp,
                checksum: validated.checksum.substring(0, 16) + '...',
                scheduleCount: validated.schedules.length
            });

            await this.uploadToGoogleDrive(validated);
            logger.logSuccess({ schedules: validated.schedules.length });
            console.log('[GoogleDriveProvider] Data pushed to cloud');
        } catch (error) {
            logger.logFailure(error as Error);
            throw error;
        }
    }

    async pullData(): Promise<SyncData | null> {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        if (!this.gapiLoaded) {
            throw new Error('Google API client not loaded');
        }

        const logger = createValidationLogger('GoogleDriveProvider', 'pull');
        logger.logStart();

        try {
            const rawData = await this.getCloudData();

            if (!rawData) {
                logger.logInfo('No cloud data found');
                return null;
            }

            // Validate data from cloud
            const validated = parseSyncData(rawData, 'GoogleDriveProvider.pullData');

            // Verify checksum
            const verification = await checksumCalculator.verifyChecksum(
                {
                    version: validated.version,
                    activeScheduleId: validated.activeScheduleId,
                    schedules: validated.schedules,
                    preferences: validated.preferences
                },
                validated.checksum
            );

            if (!verification.valid) {
                if (verification.error === 'INVALID_FORMAT') {
                    logger.logWarning('Checksum format invalid, data may be from old version', {
                        checksum: validated.checksum,
                        length: validated.checksum.length
                    });
                } else {
                    logger.logChecksumError(
                        verification.expected!,
                        verification.calculated,
                        verification.error
                    );
                    throw new Error(verification.message);
                }
            } else {
                logger.logInfo('Checksum verified');
            }

            logger.logSuccess({
                version: validated.version,
                schedules: validated.schedules.length
            });

            return validated;
        } catch (error) {
            logger.logFailure(error as Error);
            throw error;
        }
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    private async initializeGoogleIdentity(): Promise<void> {
        return new Promise((resolve) => {
            const checkLoaded = setInterval(async () => {
                if (typeof google !== 'undefined' && google.accounts) {
                    clearInterval(checkLoaded);
                    this.initializeTokenClient();
                    await this.loadStoredAuth();
                    resolve();
                }
            }, 100);

            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(checkLoaded);
                console.warn('[GoogleDriveProvider] Google Identity Services not loaded');
                resolve();
            }, 10000);
        });
    }

    private initializeTokenClient(): void {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_DRIVE_CONFIG.clientId,
            scope: GOOGLE_DRIVE_CONFIG.scopes.join(' '),
            callback: () => {}, // Will be overridden in signIn
        });
    }

    private async loadGapiClient(): Promise<void> {
        return new Promise((resolve) => {
            const checkLoaded = setInterval(() => {
                if (typeof gapi !== 'undefined') {
                    clearInterval(checkLoaded);
                    gapi.load('client', async () => {
                        await gapi.client.init({
                            discoveryDocs: GOOGLE_DRIVE_CONFIG.discoveryDocs,
                        });
                        this.gapiLoaded = true;
                        console.log('[GoogleDriveProvider] GAPI client loaded');
                        resolve();
                    });
                }
            }, 100);

            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(checkLoaded);
                if (!this.gapiLoaded) {
                    console.warn('[GoogleDriveProvider] GAPI client not loaded');
                }
                resolve();
            }, 10000);
        });
    }

    private async uploadToGoogleDrive(data: SyncData): Promise<void> {
        const accessToken = this.accessToken!;
        gapi.client.setToken({ access_token: accessToken });

        const fileName = GOOGLE_DRIVE_CONFIG.appDataFolderName;

        // Compress data before upload (60-70% size reduction)
        const json = JSON.stringify(data);
        const compressed = LZString.compress(json);

        // Log compression stats
        const originalBytes = new Blob([json]).size;
        const compressedBytes = new Blob([compressed]).size;
        const savings = ((1 - compressedBytes / originalBytes) * 100).toFixed(1);
        console.log(`[GoogleDriveProvider] Compressing upload: ${originalBytes} → ${compressedBytes} bytes (${savings}% savings)`);

        const fileId = await this.findFileInAppDataFolder(fileName);

        if (fileId) {
            // Update existing file
            await gapi.client.request({
                path: `/upload/drive/v3/files/${fileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: compressed,
            });
        } else {
            // Create new file
            const metadata = {
                name: fileName,
                parents: ['appDataFolder'],
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([compressed], { type: 'text/plain' })); // Changed from application/json

            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: form,
            });
        }
    }

    private async getCloudData(): Promise<SyncData | null> {
        const accessToken = this.accessToken!;
        gapi.client.setToken({ access_token: accessToken });

        const fileName = GOOGLE_DRIVE_CONFIG.appDataFolderName;
        const fileId = await this.findFileInAppDataFolder(fileName);

        if (!fileId) {
            return null;
        }

        try {
            const response = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media',
            });

            let data = response.result;

            // Handle compressed data (backward compatible)
            if (typeof data === 'string') {
                // Try to decompress (returns null if not LZ-compressed)
                const decompressed = LZString.decompress(data);

                if (decompressed) {
                    // Successfully decompressed
                    console.log('[GoogleDriveProvider] Decompressed cloud data');
                    data = JSON.parse(decompressed);
                } else {
                    // Not compressed, try parsing as JSON
                    try {
                        data = JSON.parse(data);
                    } catch {
                        console.warn('[GoogleDriveProvider] Invalid cloud data format');
                        return null;
                    }
                }
            }

            // Validate the data structure
            if (!data || typeof data !== 'object') {
                console.warn('[GoogleDriveProvider] Invalid cloud data format');
                return null;
            }

            // Ensure required fields exist
            return {
                version: data.version || '1.0',
                timestamp: data.timestamp || 0,
                checksum: data.checksum || '',
                activeScheduleId: data.activeScheduleId || null,
                schedules: Array.isArray(data.schedules) ? data.schedules : [],
                preferences: data.preferences,
            };
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


    private getOrCreateDeviceId(): string {
        const key = 'wpi-planner-device-id';
        let deviceId = localStorage.getItem(key);
        if (!deviceId) {
            deviceId = `device-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            localStorage.setItem(key, deviceId);
        }
        return deviceId;
    }

    private saveAuthState(): void {
        localStorage.setItem('google-drive-auth', JSON.stringify({
            wasAuthenticated: true,
            timestamp: Date.now(),
        }));
    }

    private async loadStoredAuth(): Promise<void> {
        const stored = localStorage.getItem('google-drive-auth');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                if (data.wasAuthenticated) {
                    console.log('[GoogleDriveProvider] Previous auth detected, attempting silent sign-in');
                    await this.attemptSilentSignIn();
                }
            } catch {
                this.clearAuthState();
            }
        }
    }

    private clearAuthState(): void {
        localStorage.removeItem('google-drive-auth');
    }

    private async attemptSilentSignIn(): Promise<boolean> {
        if (!this.tokenClient) return false;

        return new Promise((resolve) => {
            const originalCallback = this.tokenClient.callback;

            this.tokenClient.callback = (tokenResponse: any) => {
                this.tokenClient.callback = originalCallback;

                if (tokenResponse.error) {
                    console.log('[GoogleDriveProvider] Silent sign-in failed:', tokenResponse.error);
                    this.clearAuthState();
                    resolve(false);
                    return;
                }

                this.accessToken = tokenResponse.access_token;
                this.authenticated = true;
                syncEventBus.emitEvent('auth-changed', { authenticated: true });
                console.log('[GoogleDriveProvider] Silent sign-in successful');
                resolve(true);
            };

            this.tokenClient.requestAccessToken({ prompt: '' });
        });
    }
}
