import type { ICloudSyncService } from './interfaces/ICloudSyncService';
import type { ICloudAuthService } from './interfaces/ICloudAuthService';

/**
 * Cloud Provider Configuration
 *
 * Represents a cloud storage provider that can be used for syncing application data.
 * Each provider must implement both authentication and sync services.
 */
export interface ICloudProvider {
    /** Unique identifier for the provider (e.g., 'googledrive', 'onedrive', 'dropbox') */
    id: string;

    /** Display name shown to users (e.g., 'Google Drive', 'OneDrive') */
    name: string;

    /** Authentication service implementing ICloudAuthService */
    authService: ICloudAuthService;

    /** Sync service implementing ICloudSyncService */
    syncService: ICloudSyncService;

    /** Icon identifier or inline SVG for UI display */
    icon?: string;

    /** Primary brand color for UI theming (e.g., '#4285F4' for Google) */
    brandColor?: string;
}

/**
 * Cloud Provider Registry
 *
 * Centralized registry for managing multiple cloud storage providers.
 * Enables easy addition of new providers and switching between them.
 *
 * ## Usage Example
 *
 * ### 1. Register a provider during app initialization:
 * ```typescript
 * import { CloudProviderRegistry } from './services/sync/CloudProviderRegistry';
 * import { GoogleDriveSyncService } from './services/sync/googledrive/GoogleDriveSyncService';
 * import { GoogleDriveAuthService } from './services/sync/googledrive/GoogleDriveAuthService';
 *
 * CloudProviderRegistry.register({
 *     id: 'googledrive',
 *     name: 'Google Drive',
 *     authService: GoogleDriveAuthService.getInstance(),
 *     syncService: GoogleDriveSyncService.getInstance(),
 *     icon: 'cloud',
 *     brandColor: '#4285F4'
 * });
 * ```
 *
 * ### 2. Retrieve and use a provider:
 * ```typescript
 * const provider = CloudProviderRegistry.getProvider('googledrive');
 * if (provider) {
 *     await provider.authService.signIn();
 *     await provider.syncService.syncToCloud(data);
 * }
 * ```
 *
 * ### 3. Get all available providers (for UI selection):
 * ```typescript
 * const providers = CloudProviderRegistry.getAllProviders();
 * // Display provider buttons/options to user
 * ```
 *
 * ## Adding a New Cloud Provider
 *
 * To add support for a new cloud storage service (e.g., Dropbox):
 *
 * ### Step 1: Create Auth Service
 * ```typescript
 * // src/services/sync/dropbox/DropboxAuthService.ts
 * export class DropboxAuthService implements ICloudAuthService {
 *     // Implement all ICloudAuthService methods:
 *     // - initialize()
 *     // - signIn()
 *     // - signOut()
 *     // - getAccessToken()
 *     // - getAuthState()
 *     // - isAuthenticated()
 *     // - addEventListener()
 *     // - removeEventListener()
 * }
 * ```
 *
 * ### Step 2: Create Sync Service
 * ```typescript
 * // src/services/sync/dropbox/DropboxSyncService.ts
 * export class DropboxSyncService implements ICloudSyncService {
 *     // Implement all ICloudSyncService methods:
 *     // - initialize()
 *     // - syncToCloud()
 *     // - pullFromCloud()
 *     // - resolveConflict()
 *     // - getStatus()
 *     // - getDeviceId()
 *     // - isAuthenticated()
 *     // - getAuthService()
 *     // - addEventListener()
 *     // - removeEventListener()
 * }
 * ```
 *
 * ### Step 3: Register the Provider
 * ```typescript
 * // In main.ts or app initialization
 * import { CloudProviderRegistry } from './services/sync/CloudProviderRegistry';
 * import { DropboxAuthService } from './services/sync/dropbox/DropboxAuthService';
 * import { DropboxSyncService } from './services/sync/dropbox/DropboxSyncService';
 *
 * CloudProviderRegistry.register({
 *     id: 'dropbox',
 *     name: 'Dropbox',
 *     authService: DropboxAuthService.getInstance(),
 *     syncService: DropboxSyncService.getInstance(),
 *     icon: 'dropbox-icon',
 *     brandColor: '#0061FF'
 * });
 * ```
 *
 * ### Step 4: Create Configuration (Optional)
 * ```typescript
 * // src/config/dropbox.config.ts
 * export const DROPBOX_CONFIG = {
 *     clientId: 'your-dropbox-app-client-id',
 *     redirectUri: window.location.origin,
 *     scopes: ['files.content.write', 'files.content.read'],
 *     autoSyncEnabled: true,
 *     syncDebounceMs: 3000,
 *     maxRetries: 3,
 *     offlineQueueSize: 10
 * };
 * ```
 *
 * ### Step 5: Update UI (if needed)
 * The CloudStatusButton component automatically detects registered providers
 * and displays the active one. No UI changes needed for basic functionality.
 *
 * ## Architecture Notes
 *
 * - **Singleton Pattern**: Each provider service should be a singleton
 * - **Event-Driven**: Providers communicate via events (auth-changed, sync-started, etc.)
 * - **Async Operations**: All auth and sync operations are asynchronous
 * - **Error Handling**: Providers must handle errors gracefully and emit appropriate events
 * - **State Management**: Auth state and sync status are managed by individual services
 */
export class CloudProviderRegistry {
    private static providers: Map<string, ICloudProvider> = new Map();
    private static activeProviderId: string | null = null;

    /**
     * Register a new cloud provider
     * @param provider The cloud provider configuration
     */
    static register(provider: ICloudProvider): void {
        this.providers.set(provider.id, provider);
    }

    /**
     * Get a specific provider by ID
     * @param id The provider ID (e.g., 'googledrive', 'onedrive')
     * @returns The provider configuration or undefined if not found
     */
    static getProvider(id: string): ICloudProvider | undefined {
        return this.providers.get(id);
    }

    /**
     * Get all registered providers
     * @returns Array of all registered providers
     */
    static getAllProviders(): ICloudProvider[] {
        return Array.from(this.providers.values());
    }

    /**
     * Set the active provider
     * @param id The provider ID to activate
     */
    static setActiveProvider(id: string): void {
        if (this.providers.has(id)) {
            this.activeProviderId = id;
        }
    }

    /**
     * Get the currently active provider
     * @returns The active provider or undefined if none set
     */
    static getActiveProvider(): ICloudProvider | undefined {
        if (this.activeProviderId) {
            return this.providers.get(this.activeProviderId);
        }

        const providers = Array.from(this.providers.values());
        if (providers.length > 0) {
            this.activeProviderId = providers[0].id;
            return providers[0];
        }

        return undefined;
    }

    /**
     * Check if any provider is authenticated
     * @returns True if at least one provider is authenticated
     */
    static hasAuthenticatedProvider(): boolean {
        return Array.from(this.providers.values()).some(
            provider => provider.authService.isAuthenticated()
        );
    }

    /**
     * Get the first authenticated provider
     * @returns The first authenticated provider or undefined
     */
    static getAuthenticatedProvider(): ICloudProvider | undefined {
        return Array.from(this.providers.values()).find(
            provider => provider.authService.isAuthenticated()
        );
    }

    /**
     * Unregister a provider (for testing or dynamic provider management)
     * @param id The provider ID to remove
     */
    static unregister(id: string): void {
        this.providers.delete(id);
        if (this.activeProviderId === id) {
            this.activeProviderId = null;
        }
    }

    /**
     * Clear all registered providers (for testing)
     */
    static clear(): void {
        this.providers.clear();
        this.activeProviderId = null;
    }
}
