import type { CloudProvider, SyncData, ConflictInfo, ConflictResolution, SyncStatus } from './types';
import { syncEventBus } from './SyncEventBus';
import { providerRegistry } from './ProviderRegistry';
import { ProfileStateManager } from '../../core/state/ProfileStateManager';

/**
 * Interface for state manager dependency injection.
 * Uses a minimal interface to avoid circular dependencies.
 */
interface StateManagerInterface {
    importData(data: SyncData): Promise<{ success: boolean; error?: Error }>;
}

/**
 * Main orchestrator for cloud sync operations.
 * Handles the simplified sync flow: SSO conflict check → push-only sync
 */
export class SyncManager {
    private static instance: SyncManager;
    private currentProviderId: string | null = null;
    private status: SyncStatus = 'not_authenticated';
    private pushDebounceMs = 0;
    private pushTimeout: number | null = null;
    private pendingConflict: ConflictInfo | null = null;
    private stateManager: StateManagerInterface | null = null;

    private constructor() {
        // Listen for local saves to trigger push
        syncEventBus.on('local-save-completed', () => {
            this.schedulePush();
        });
    }

    /**
     * Get current sync data from ProfileStateManager
     */
    private async getLocalSyncData(): Promise<SyncData | null> {
        try {
            const stateManager = ProfileStateManager.getInstance();
            const exportedData = await stateManager.exportData();

            if (!exportedData) return null;

            const data = JSON.parse(exportedData);
            return {
                version: data.version || '1.0',
                timestamp: Date.now(),
                checksum: data.checksum || '',
                activeScheduleId: data.activeScheduleId || null,
                schedules: data.schedules || [],
                preferences: data.preferences,
            };
        } catch (error) {
            console.error('[SyncManager] Failed to get local sync data:', error);
            return null;
        }
    }

    static getInstance(): SyncManager {
        if (!SyncManager.instance) {
            SyncManager.instance = new SyncManager();
        }
        return SyncManager.instance;
    }

    /**
     * Set the state manager for data injection.
     * This must be called before resolveConflict() with 'cloud' resolution.
     */
    setStateManager(stateManager: StateManagerInterface): void {
        this.stateManager = stateManager;
    }

    /**
     * Get current sync status
     */
    getStatus(): SyncStatus {
        return this.status;
    }

    /**
     * Get current provider
     */
    getCurrentProvider(): CloudProvider | null {
        if (!this.currentProviderId) return null;
        return providerRegistry.get(this.currentProviderId) || null;
    }

    /**
     * Set the active cloud provider
     */
    setProvider(providerId: string): void {
        const provider = providerRegistry.get(providerId);
        if (!provider) {
            throw new Error(`Provider '${providerId}' not registered`);
        }
        this.currentProviderId = providerId;
        this.updateStatus();
    }

    /**
     * Sign in to cloud provider (authentication only).
     * After signing in, call performInitialSync() to sync data.
     */
    async signIn(): Promise<void> {
        const provider = this.getCurrentProvider();
        if (!provider) {
            throw new Error('No provider set');
        }

        try {
            await provider.signIn();
            this.updateStatus();

        } catch (error) {
            this.status = 'error';
            syncEventBus.emitEvent('sync-failed', undefined, error as Error);
            throw error;
        }
    }

    /**
     * Perform initial sync after authentication.
     * Pulls cloud data and either:
     * - Pushes local data if cloud is empty (first-time cloud sync)
     * - Imports cloud data if local is empty (first-time device sign-in)
     * - Checks for conflicts if both have data
     * - Returns conflict info if checksums differ
     */
    async performInitialSync(): Promise<ConflictInfo | null> {
        const provider = this.getCurrentProvider();
        if (!provider?.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        try {
            const cloudData = await provider.pullData();
            console.log('[SyncManager] Pulled cloud data:', cloudData);

            // Case 1: No cloud file exists - push local data
            if (!cloudData) {
                console.log('[SyncManager] No cloud file found, pushing local for first time');
                const localData = await this.getLocalSyncData();
                if (localData) {
                    await provider.pushData(localData);
                    syncEventBus.emitEvent('sync-pushed', { source: 'initial' });
                }
                return null;
            }

            // Case 2: Cloud file exists - get local data
            const localData = await this.getLocalSyncData();
            if (!localData) {
                throw new Error('No local data available');
            }

            // Case 3: First-time sign-in on this device (no local schedules) - just import cloud data
            if (!localData.schedules || localData.schedules.length === 0) {
                console.log('[SyncManager] First-time sign-in detected, importing cloud data without conflict check');
                if (!this.stateManager) {
                    throw new Error('State manager not set');
                }
                await this.stateManager.importData(cloudData);
                this.status = 'idle';
                syncEventBus.emitEvent('sync-resolved', { resolution: 'cloud' });
                return null;
            }

            // Case 4: Both local and cloud have data - check for conflicts
            const conflictInfo = this.detectConflict(localData, cloudData);

            if (conflictInfo.hasConflict) {
                this.status = 'conflict';
                this.pendingConflict = conflictInfo;
                syncEventBus.emitEvent('sync-conflict', conflictInfo);
                return conflictInfo;
            }

            console.log('[SyncManager] Checksums match, data already synced');
            this.status = 'idle';
            return null;

        } catch (error) {
            this.status = 'error';
            syncEventBus.emitEvent('sync-failed', undefined, error as Error);
            throw error;
        }
    }

    /**
     * Handle sign-in with conflict detection (unified flow)
     * @deprecated Use signIn() followed by performInitialSync() for better separation
     */
    async handleSignIn(localData: SyncData): Promise<ConflictInfo | null> {
        // Sign in first
        await this.signIn();

        // Then perform initial sync
        return await this.performInitialSync();
    }

    /**
     * Check for conflicts between local and cloud data (pull-based workflow).
     * This pulls cloud data fresh and compares with local.
     *
     * NOTE: For sign-in flow, use performInitialSync() instead.
     * This method is for manual refresh/pull scenarios.
     *
     * Returns the conflict info if there's a conflict, null otherwise.
     */
    async checkConflicts(localData: SyncData): Promise<ConflictInfo | null> {
        const provider = this.getCurrentProvider();
        if (!provider) {
            throw new Error('No provider set');
        }

        if (!provider.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        try {
            // Pull cloud data to check for conflicts
            const cloudData = await provider.pullData();
            console.log('[SyncManager] Pulled cloud data:', cloudData);

            // If no cloud file exists, no conflict
            if (!cloudData) {
                console.log('[SyncManager] No cloud file found');
                return null;
            }

            // Cloud file exists - check if checksums differ
            const conflictInfo = this.detectConflict(localData, cloudData);

            if (conflictInfo.hasConflict) {
                // Checksums differ - show conflict modal
                this.status = 'conflict';
                this.pendingConflict = conflictInfo;
                syncEventBus.emitEvent('sync-conflict', conflictInfo);
                return conflictInfo;
            }

            // Checksums match - data is identical, already synced
            console.log('[SyncManager] Checksums match, data already synced');
            this.status = 'idle';
            return null;

        } catch (error) {
            this.status = 'error';
            syncEventBus.emitEvent('sync-failed', undefined, error as Error);
            throw error;
        }
    }

    /**
     * Resolve a conflict with user's choice.
     * For 'cloud' resolution, the state manager must be set via setStateManager().
     */
    async resolveConflict(resolution: ConflictResolution): Promise<void> {
        const provider = this.getCurrentProvider();
        if (!provider) {
            throw new Error('No provider set');
        }

        if (!this.pendingConflict) {
            throw new Error('No pending conflict to resolve');
        }

        const { localData, cloudData } = this.pendingConflict;

        try {
            switch (resolution) {
                case 'cancel':
                    // Sign out and cancel
                    await provider.signOut();
                    this.status = 'not_authenticated';
                    syncEventBus.emitEvent('sync-resolved', { resolution: 'cancel' });
                    break;

                case 'local':
                    // Push local data to cloud (overwrite)
                    await provider.pushData(localData);
                    this.status = 'idle';
                    syncEventBus.emitEvent('sync-resolved', { resolution: 'local' });
                    syncEventBus.emitEvent('sync-pushed', { source: 'conflict-local' });
                    break;

                case 'cloud':
                    // Apply cloud data locally - no push needed, cloud already has correct data
                    if (!this.stateManager) {
                        throw new Error('State manager not set - call setStateManager() before resolving with cloud');
                    }
                    await this.stateManager.importData(cloudData);
                    this.status = 'idle';
                    syncEventBus.emitEvent('sync-resolved', { resolution: 'cloud' });
                    break;
            }

            this.pendingConflict = null;

        } catch (error) {
            this.status = 'error';
            syncEventBus.emitEvent('sync-failed', undefined, error as Error);
            throw error;
        }
    }

    /**
     * Sign out of current provider
     */
    async signOut(): Promise<void> {
        const provider = this.getCurrentProvider();
        if (provider) {
            await provider.signOut();
        }
        this.status = 'not_authenticated';
        this.pendingConflict = null;
        if (this.pushTimeout) {
            clearTimeout(this.pushTimeout);
            this.pushTimeout = null;
        }
        syncEventBus.emitEvent('auth-changed', { authenticated: false });
    }

    /**
     * Schedule a debounced push to cloud
     */
    schedulePush(): void {
        if (!this.isAuthenticated()) {
            console.log('[SyncManager] Not authenticated, skipping push');
            return;
        }

        if (this.pushTimeout) {
            clearTimeout(this.pushTimeout);
        }

        console.log('[SyncManager] Scheduling push in', this.pushDebounceMs, 'ms');

        this.pushTimeout = window.setTimeout(async () => {
            this.pushTimeout = null;

            const data = await this.getLocalSyncData();
            if (data) {
                try {
                    await this.pushToCloud(data);
                    console.log('[SyncManager] Push completed');
                } catch (error) {
                    console.error('[SyncManager] Push failed:', error);
                }
            }
        }, this.pushDebounceMs);
    }

    /**
     * Push data to cloud immediately
     */
    async pushToCloud(data: SyncData): Promise<void> {
        const provider = this.getCurrentProvider();
        if (!provider) {
            throw new Error('No provider set');
        }

        if (!provider.isAuthenticated()) {
            console.warn('[SyncManager] Cannot push: not authenticated');
            return;
        }

        // Cancel any pending debounced push
        if (this.pushTimeout) {
            clearTimeout(this.pushTimeout);
            this.pushTimeout = null;
        }

        try {
            this.status = 'syncing';
            await provider.pushData(data);
            this.status = 'idle';
            syncEventBus.emitEvent('sync-pushed', { source: 'manual' });
        } catch (error) {
            this.status = 'error';
            syncEventBus.emitEvent('sync-failed', undefined, error as Error);
            throw error;
        }
    }

    /**
     * Push local data to cloud immediately (no debounce)
     * Convenience method for manual/UI-triggered pushes
     */
    async pushLocalDataImmediately(): Promise<void> {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        const data = await this.getLocalSyncData();
        if (!data) {
            throw new Error('No local data to push');
        }

        await this.pushToCloud(data);
    }

    /**
     * Check if current provider is authenticated
     */
    isAuthenticated(): boolean {
        const provider = this.getCurrentProvider();
        return provider?.isAuthenticated() ?? false;
    }

    /**
     * Detect if there's a conflict between local and cloud data
     * Simple checksum comparison - if checksums differ, data is different
     */
    private detectConflict(local: SyncData, cloud: SyncData): ConflictInfo {
        console.log('[SyncManager] Conflict detection:');
        console.log('  Local checksum:', local.checksum);
        console.log('  Cloud checksum:', cloud.checksum);
        console.log('  Local timestamp:', local.timestamp);
        console.log('  Cloud timestamp:', cloud.timestamp);
        console.log('  Local schedules:', local.schedules.length);
        console.log('  Cloud schedules:', cloud.schedules.length);

        const hasConflict = local.checksum !== cloud.checksum;

        if (hasConflict) {
            console.log('[SyncManager] ❌ CONFLICT DETECTED - checksums differ');
        } else {
            console.log('[SyncManager] ✅ No conflict - checksums match');
        }

        return {
            hasConflict,
            localData: local,
            cloudData: cloud,
        };
    }

    /**
     * Compare two arrays for equality
     */
    private arraysEqual<T>(a: T[], b: T[]): boolean {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    /**
     * Update status based on provider state
     */
    private updateStatus(): void {
        const provider = this.getCurrentProvider();
        if (!provider) {
            this.status = 'not_authenticated';
        } else if (!provider.isAuthenticated()) {
            this.status = 'not_authenticated';
        } else if (this.status === 'not_authenticated') {
            this.status = 'idle';
        }
    }

    /**
     * Set debounce time for push operations (in ms)
     */
    setDebounceMs(ms: number): void {
        this.pushDebounceMs = ms;
    }
}

// Export singleton instance
export const syncManager = SyncManager.getInstance();
