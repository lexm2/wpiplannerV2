import type { CloudProvider } from './CloudSyncTypes';
import type { ICloudAuthService } from './interfaces/ICloudAuthService';
import type { ICloudSyncService } from './interfaces/ICloudSyncService';
import { OneDriveAuthService } from './onedrive/OneDriveAuthService';
import { OneDriveSyncService } from './onedrive/OneDriveSyncService';
import { GoogleDriveAuthService } from './googledrive/GoogleDriveAuthService';
import { GoogleDriveSyncService } from './googledrive/GoogleDriveSyncService';

const PROVIDER_STORAGE_KEY = 'wpi-planner-cloud-provider';

export class CloudSyncFactory {
    private static instance: CloudSyncFactory;
    private currentProvider: CloudProvider;
    private authServiceCache: Map<CloudProvider, ICloudAuthService> = new Map();
    private syncServiceCache: Map<CloudProvider, ICloudSyncService> = new Map();

    private constructor() {
        this.currentProvider = this.loadProviderPreference();
    }

    static getInstance(): CloudSyncFactory {
        if (!CloudSyncFactory.instance) {
            CloudSyncFactory.instance = new CloudSyncFactory();
        }
        return CloudSyncFactory.instance;
    }

    getAuthService(provider?: CloudProvider): ICloudAuthService | null {
        const targetProvider = provider || this.currentProvider;

        if (targetProvider === 'none') {
            return null;
        }

        if (this.authServiceCache.has(targetProvider)) {
            return this.authServiceCache.get(targetProvider)!;
        }

        const service = this.createAuthService(targetProvider);
        if (service) {
            this.authServiceCache.set(targetProvider, service);
        }
        return service;
    }

    getSyncService(provider?: CloudProvider): ICloudSyncService | null {
        const targetProvider = provider || this.currentProvider;

        if (targetProvider === 'none') {
            return null;
        }

        if (this.syncServiceCache.has(targetProvider)) {
            return this.syncServiceCache.get(targetProvider)!;
        }

        const service = this.createSyncService(targetProvider);
        if (service) {
            this.syncServiceCache.set(targetProvider, service);
        }
        return service;
    }

    getCurrentProvider(): CloudProvider {
        return this.currentProvider;
    }

    setProvider(provider: CloudProvider): void {
        this.currentProvider = provider;
        this.saveProviderPreference(provider);
    }

    private createAuthService(provider: CloudProvider): ICloudAuthService | null {
        switch (provider) {
            case 'onedrive':
                return OneDriveAuthService.getInstance();
            case 'googledrive':
                return GoogleDriveAuthService.getInstance();
            case 'none':
                return null;
            default:
                return null;
        }
    }

    private createSyncService(provider: CloudProvider): ICloudSyncService | null {
        switch (provider) {
            case 'onedrive':
                return OneDriveSyncService.getInstance();
            case 'googledrive':
                return GoogleDriveSyncService.getInstance();
            case 'none':
                return null;
            default:
                return null;
        }
    }

    private loadProviderPreference(): CloudProvider {
        const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
        if (stored && (stored === 'onedrive' || stored === 'googledrive' || stored === 'none')) {
            return stored as CloudProvider;
        }
        return 'none';
    }

    private saveProviderPreference(provider: CloudProvider): void {
        localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
    }
}
