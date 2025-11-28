import type { CloudProvider, SyncData, ConflictInfo, ConflictResolution, SyncStatus } from './types';
import { syncEventBus } from './SyncEventBus';
import { providerRegistry } from './ProviderRegistry';

/**
 * Main orchestrator for cloud sync operations.
 * Handles the simplified sync flow: SSO conflict check → push-only sync
 */
export class SyncManager {
    private static instance: SyncManager;
    private currentProviderId: string | null = null;
    private status: SyncStatus = 'not_authenticated';
    private pushDebounceMs = 3000;
    private pushTimeout: number | null = null;
    private pendingConflict: ConflictInfo | null = null;

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
            const { ProfileStateManager } = await import('../../core/ProfileStateManager');
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
     * Handle sign-in: check for conflicts and resolve
     * Returns the conflict info if there's a conflict, null otherwise
     */
    async handleSignIn(localData: SyncData): Promise<ConflictInfo | null> {
        const provider = this.getCurrentProvider();
        if (!provider) {
            throw new Error('No provider set');
        }

        try {
            await provider.signIn();
            this.updateStatus();

            // Pull cloud data to check for conflicts
            const cloudData = await provider.pullData();
            console.log('[SyncManager] Pulled cloud data:', cloudData);

            // If no cloud file exists (first time), just push local
            if (!cloudData) {
                console.log('[SyncManager] No cloud file found, pushing local for first time');
                await provider.pushData(localData);
                syncEventBus.emitEvent('sync-pushed', { source: 'initial' });
                return null;
            }

            // Cloud file exists - always check for conflicts (even if empty)
            const conflictInfo = this.detectConflict(localData, cloudData);

            if (conflictInfo.hasConflict) {
                this.status = 'conflict';
                this.pendingConflict = conflictInfo;
                syncEventBus.emitEvent('sync-conflict', conflictInfo);
                return conflictInfo;
            }

            // No conflict - push local (merge strategy: local wins if no conflict)
            await provider.pushData(localData);
            syncEventBus.emitEvent('sync-pushed', { source: 'initial' });
            return null;

        } catch (error) {
            this.status = 'error';
            syncEventBus.emitEvent('sync-failed', undefined, error as Error);
            throw error;
        }
    }

    /**
     * Resolve a conflict with user's choice
     */
    async resolveConflict(
        resolution: ConflictResolution,
        onApplyCloudData?: (data: SyncData) => void
    ): Promise<void> {
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
                    // Apply cloud data locally, then push to confirm
                    if (onApplyCloudData) {
                        onApplyCloudData(cloudData);
                    }
                    await provider.pushData(cloudData);
                    this.status = 'idle';
                    syncEventBus.emitEvent('sync-resolved', { resolution: 'cloud' });
                    syncEventBus.emitEvent('sync-pushed', { source: 'conflict-cloud' });
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
     * Check if current provider is authenticated
     */
    isAuthenticated(): boolean {
        const provider = this.getCurrentProvider();
        return provider?.isAuthenticated() ?? false;
    }

    /**
     * Detect if there's a conflict between local and cloud data
     */
    private detectConflict(local: SyncData, cloud: SyncData): ConflictInfo {
        // Get active schedules
        const localSchedule = local.schedules.find(s => s.id === local.activeScheduleId);
        const cloudSchedule = cloud.schedules.find(s => s.id === cloud.activeScheduleId);

        // Compare course IDs in active schedules
        const localCourseIds = (localSchedule?.selectedCourses || []).map(c => c.courseId).sort();
        const cloudCourseIds = (cloudSchedule?.selectedCourses || []).map(c => c.courseId).sort();
        const coursesDiffer = !this.arraysEqual(localCourseIds, cloudCourseIds);

        // Compare selected sections (by checking if section selections differ)
        let sectionsDiffer = false;
        if (!coursesDiffer && localSchedule && cloudSchedule) {
            for (const localCourse of localSchedule.selectedCourses) {
                const cloudCourse = cloudSchedule.selectedCourses.find(c => c.courseId === localCourse.courseId);
                if (cloudCourse) {
                    // Check if sections differ
                    const localSection = localCourse.selectedSectionCrn;
                    const cloudSection = cloudCourse.selectedSectionCrn;
                    if (localSection !== cloudSection) {
                        sectionsDiffer = true;
                        break;
                    }
                }
            }
        }

        return {
            hasConflict: coursesDiffer || sectionsDiffer,
            localData: local,
            cloudData: cloud,
            differences: {
                courses: coursesDiffer,
                sections: sectionsDiffer,
            },
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
