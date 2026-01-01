import type { CloudProvider, SyncData } from '../../src/services/sync/types';
import { syncEventBus } from '../../src/services/sync/SyncEventBus';
import { parseSyncData } from '../../src/services/sync/schemas';
import { checksumCalculator } from '../../src/services/sync/checksum';

/**
 * Configuration options for controlling mock provider behavior
 */
export interface MockProviderConfig {
    /** Simulate authentication success/failure */
    authSucceeds?: boolean;
    /** Simulate network delay (ms) */
    networkDelay?: number;
    /** Simulate push failures */
    pushFails?: boolean;
    /** Simulate pull failures */
    pullFails?: boolean;
    /** Error to throw on operations */
    errorToThrow?: Error;
    /** Validate data with Zod schemas */
    validateData?: boolean;
    /** Verify checksums on pull */
    verifyChecksums?: boolean;
    /** Simulate corrupted checksums */
    corruptChecksum?: boolean;
    /** Unique device identifier for multi-device simulation */
    deviceId?: string;
    /** Persist data to localStorage (for manual testing) */
    useLocalStorage?: boolean;
    /** Key prefix for localStorage keys */
    localStoragePrefix?: string;
}

/**
 * Mock Cloud Provider for testing
 *
 * Simulates a cloud storage provider without making real network calls.
 * Supports configurable scenarios: success, failures, delays, corruption, etc.
 */
export class MockCloudProvider implements CloudProvider {
    readonly id = 'mock';
    readonly displayName = 'Mock Provider';
    readonly icon = 'TEST_ICON';

    private authenticated = false;
    private initialized = false;
    private cloudData: SyncData | null = null;
    private config: Required<MockProviderConfig>;
    private deviceId: string;

    // Call tracking for assertions
    public callHistory: {
        initialize: number;
        signIn: number;
        signOut: number;
        pushData: number;
        pullData: number;
    } = {
        initialize: 0,
        signIn: 0,
        signOut: 0,
        pushData: 0,
        pullData: 0,
    };

    constructor(config: MockProviderConfig = {}) {
        this.config = {
            authSucceeds: config.authSucceeds ?? true,
            networkDelay: config.networkDelay ?? 0,
            pushFails: config.pushFails ?? false,
            pullFails: config.pullFails ?? false,
            errorToThrow: config.errorToThrow ?? new Error('Mock provider error'),
            validateData: config.validateData ?? true,
            verifyChecksums: config.verifyChecksums ?? true,
            corruptChecksum: config.corruptChecksum ?? false,
            deviceId: config.deviceId ?? 'device-a',
            useLocalStorage: config.useLocalStorage ?? false,
            localStoragePrefix: config.localStoragePrefix ?? 'mock-cloud',
        };
        this.deviceId = this.config.deviceId;

        // Load initial state from localStorage if enabled
        if (this.config.useLocalStorage) {
            this.loadFromLocalStorage();
        }
    }

    async initialize(): Promise<void> {
        this.callHistory.initialize++;
        await this.simulateNetworkDelay();
        this.initialized = true;
    }

    dispose(): void {
        this.authenticated = false;
        this.cloudData = null;

        // Save state to localStorage if enabled
        if (this.config.useLocalStorage) {
            this.saveToLocalStorage();
        }
    }

    async signIn(): Promise<void> {
        this.callHistory.signIn++;
        await this.simulateNetworkDelay();

        if (!this.config.authSucceeds) {
            throw new Error('Mock authentication failed');
        }

        this.authenticated = true;
        syncEventBus.emitEvent('auth-changed', { authenticated: true });

        // Save auth state to localStorage if enabled
        if (this.config.useLocalStorage) {
            this.saveToLocalStorage();
        }
    }

    async signOut(): Promise<void> {
        this.callHistory.signOut++;
        await this.simulateNetworkDelay();

        this.authenticated = false;
        syncEventBus.emitEvent('auth-changed', { authenticated: false });

        // Save auth state to localStorage if enabled
        if (this.config.useLocalStorage) {
            this.saveToLocalStorage();
        }
    }

    isAuthenticated(): boolean {
        return this.authenticated;
    }

    async pushData(data: SyncData): Promise<void> {
        console.log('[MockProvider] pushData() called with data:', {
            version: data.version,
            checksum: data.checksum?.substring(0, 16) + '...',
            timestamp: data.timestamp,
            schedulesCount: data.schedules?.length
        });
        this.callHistory.pushData++;
        await this.simulateNetworkDelay();

        if (!this.authenticated) {
            throw new Error('Not authenticated');
        }

        if (this.config.pushFails) {
            throw this.config.errorToThrow;
        }

        // Validate data if configured
        if (this.config.validateData) {
            console.log('[MockProvider] Validating incoming data with parseSyncData...');
            parseSyncData(data, 'MockCloudProvider.pushData');
            console.log('[MockProvider] Validation passed');
        }

        // Update timestamp and recalculate checksum (like real provider)
        const pushData: SyncData = {
            ...data,
            timestamp: Date.now(),
        };

        console.log('[MockProvider] Recalculating checksum...');
        pushData.checksum = await checksumCalculator.calculateChecksum({
            version: pushData.version,
            activeScheduleId: pushData.activeScheduleId,
            schedules: pushData.schedules,
            preferences: pushData.preferences,
        });
        console.log('[MockProvider] New checksum:', pushData.checksum);

        // Corrupt checksum if configured
        if (this.config.corruptChecksum) {
            pushData.checksum = 'corrupted_checksum_' + pushData.checksum.substring(18);
        }

        this.cloudData = pushData;

        // Save to localStorage if enabled (shared cloud storage)
        if (this.config.useLocalStorage) {
            console.log('[MockProvider] Saving to localStorage...');
            this.saveCloudDataToLocalStorage(pushData);
            console.log('[MockProvider] Data saved to localStorage');
        }

        console.log('[MockProvider] pushData() completed successfully');
    }

    async pullData(): Promise<SyncData | null> {
        console.log('[MockProvider] pullData() called');
        this.callHistory.pullData++;
        await this.simulateNetworkDelay();

        if (!this.authenticated) {
            throw new Error('Not authenticated');
        }

        if (this.config.pullFails) {
            throw this.config.errorToThrow;
        }

        // Load from localStorage if enabled (shared cloud storage)
        if (this.config.useLocalStorage) {
            console.log('[MockProvider] Loading data from localStorage...');
            this.cloudData = this.loadCloudDataFromLocalStorage();
            console.log('[MockProvider] Data loaded, cloudData is:', this.cloudData ? {
                version: this.cloudData.version,
                checksum: this.cloudData.checksum?.substring(0, 16) + '...',
                timestamp: this.cloudData.timestamp,
                schedulesCount: this.cloudData.schedules?.length
            } : null);
        }

        if (!this.cloudData) {
            console.log('[MockProvider] No cloud data available, returning null');
            return null;
        }

        // Validate data if configured
        if (this.config.validateData) {
            console.log('[MockProvider] Validating cloud data with parseSyncData...');
            parseSyncData(this.cloudData, 'MockCloudProvider.pullData');
            console.log('[MockProvider] Validation passed');
        }

        // Verify checksum if configured
        if (this.config.verifyChecksums && !this.config.corruptChecksum) {
            console.log('[MockProvider] Verifying checksum...');
            const verification = await checksumCalculator.verifyChecksum(
                {
                    version: this.cloudData.version,
                    activeScheduleId: this.cloudData.activeScheduleId,
                    schedules: this.cloudData.schedules,
                    preferences: this.cloudData.preferences,
                },
                this.cloudData.checksum
            );

            if (!verification.valid) {
                throw new Error(`Checksum verification failed: ${verification.message}`);
            }
            console.log('[MockProvider] Checksum verification passed');
        }

        console.log('[MockProvider] pullData() returning valid data');
        return this.cloudData;
    }

    // =========================================================================
    // Test Helper Methods
    // =========================================================================

    /**
     * Manually set cloud data (simulates data already in cloud)
     */
    setCloudData(data: SyncData | null): void {
        this.cloudData = data;
    }

    /**
     * Get current cloud data (for assertions)
     */
    getCloudData(): SyncData | null {
        return this.cloudData;
    }

    /**
     * Update provider configuration
     */
    setConfig(config: Partial<MockProviderConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Reset call history
     */
    resetCallHistory(): void {
        this.callHistory = {
            initialize: 0,
            signIn: 0,
            signOut: 0,
            pushData: 0,
            pullData: 0,
        };
    }

    /**
     * Reset provider state completely
     */
    reset(): void {
        this.authenticated = false;
        this.initialized = false;
        this.cloudData = null;
        this.resetCallHistory();

        // Clear localStorage if enabled
        if (this.config.useLocalStorage) {
            this.clearLocalStorage();
        }
    }

    /**
     * Get cloud data from shared localStorage (simulates cloud storage)
     */
    getSharedCloudData(): SyncData | null {
        if (!this.config.useLocalStorage) {
            return this.cloudData;
        }
        return this.loadCloudDataFromLocalStorage();
    }

    /**
     * Set device ID and reload state (simulates switching devices)
     */
    setDeviceId(deviceId: string): void {
        // Save current device state
        if (this.config.useLocalStorage) {
            this.saveToLocalStorage();
        }

        // Switch to new device
        this.deviceId = deviceId;
        this.config.deviceId = deviceId;

        // Load new device state
        if (this.config.useLocalStorage) {
            this.loadFromLocalStorage();
        } else {
            // Reset state for new device in memory mode
            this.authenticated = false;
            this.initialized = false;
        }
    }

    /**
     * Clear all mock storage (all devices and cloud)
     */
    clearAllMockStorage(): void {
        if (!this.config.useLocalStorage) {
            return;
        }

        const prefix = this.config.localStoragePrefix;
        const keys: string[] = [];

        // Find all mock-related keys
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keys.push(key);
            }
        }

        // Remove them all
        keys.forEach(key => localStorage.removeItem(key));
    }

    /**
     * Get list of all mock devices that have data
     */
    getAllMockDevices(): string[] {
        if (!this.config.useLocalStorage) {
            return [this.deviceId];
        }

        const prefix = `${this.config.localStoragePrefix}-device-`;
        const devices: string[] = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                const deviceId = key.substring(prefix.length);
                devices.push(deviceId);
            }
        }

        return devices;
    }

    /**
     * Get current device ID
     */
    getDeviceId(): string {
        return this.deviceId;
    }

    /**
     * Clear invalid or corrupted cloud data from localStorage
     * Useful for recovering from data corruption issues
     */
    public clearCorruptedCloudData(): void {
        if (!this.config.useLocalStorage) {
            return;
        }

        console.warn('[MockProvider] Clearing potentially corrupted cloud data');
        localStorage.removeItem(this.getCloudStorageKey());
        this.cloudData = null;
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    private async simulateNetworkDelay(): Promise<void> {
        if (this.config.networkDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.config.networkDelay));
        }
    }

    /**
     * Get localStorage key for device-specific data
     */
    private getDeviceStorageKey(): string {
        return `${this.config.localStoragePrefix}-device-${this.deviceId}`;
    }

    /**
     * Get localStorage key for shared cloud data
     */
    private getCloudStorageKey(): string {
        return `${this.config.localStoragePrefix}-cloud`;
    }

    /**
     * Save device state to localStorage
     */
    private saveToLocalStorage(): void {
        if (!this.config.useLocalStorage) {
            return;
        }

        const deviceState = {
            authenticated: this.authenticated,
            initialized: this.initialized,
            deviceId: this.deviceId,
        };

        localStorage.setItem(this.getDeviceStorageKey(), JSON.stringify(deviceState));
    }

    /**
     * Load device state from localStorage
     */
    private loadFromLocalStorage(): void {
        if (!this.config.useLocalStorage) {
            return;
        }

        const stored = localStorage.getItem(this.getDeviceStorageKey());
        if (stored) {
            try {
                const deviceState = JSON.parse(stored);
                this.authenticated = deviceState.authenticated ?? false;
                this.initialized = deviceState.initialized ?? false;
            } catch (e) {
                console.error('Failed to load device state from localStorage:', e);
            }
        }
    }

    /**
     * Save cloud data to shared localStorage
     */
    private saveCloudDataToLocalStorage(data: SyncData): void {
        if (!this.config.useLocalStorage) {
            return;
        }

        const cloudState = {
            data,
            lastUpdatedBy: this.deviceId,
            lastUpdatedAt: Date.now(),
        };

        const jsonString = JSON.stringify(cloudState);
        console.log('[MockProvider] Saving cloud state to localStorage:', {
            key: this.getCloudStorageKey(),
            dataVersion: data.version,
            dataChecksum: data.checksum,
            dataTimestamp: data.timestamp,
            schedulesCount: data.schedules?.length,
            jsonLength: jsonString.length,
            jsonPreview: jsonString.substring(0, 150) + '...'
        });

        localStorage.setItem(this.getCloudStorageKey(), jsonString);
        console.log('[MockProvider] Cloud state saved successfully');
    }

    /**
     * Load cloud data from shared localStorage
     */
    private loadCloudDataFromLocalStorage(): SyncData | null {
        if (!this.config.useLocalStorage) {
            return null;
        }

        const stored = localStorage.getItem(this.getCloudStorageKey());
        if (!stored) {
            console.log('[MockProvider] No data in localStorage');
            return null;
        }

        try {
            console.log('[MockProvider] Loading from localStorage, raw (first 200 chars):', stored.substring(0, 200));
            const cloudState = JSON.parse(stored);
            const data = cloudState.data;

            console.log('[MockProvider] Parsed cloudState.data:', {
                hasData: !!data,
                hasVersion: !!data?.version,
                versionValue: data?.version,
                hasChecksum: !!data?.checksum,
                checksumValue: data?.checksum,
                checksumType: typeof data?.checksum,
                hasTimestamp: typeof data?.timestamp === 'number',
                timestampValue: data?.timestamp,
                hasSchedules: Array.isArray(data?.schedules),
                schedulesLength: data?.schedules?.length
            });

            // Validate that data has required fields
            if (!data || typeof data !== 'object') {
                console.warn('[MockProvider] Invalid cloud data structure in localStorage');
                console.warn('[MockProvider] Clearing corrupted data');
                localStorage.removeItem(this.getCloudStorageKey());
                return null;
            }

            // Check for required fields
            if (!data.version || !data.checksum || typeof data.timestamp !== 'number' || !Array.isArray(data.schedules)) {
                console.warn('[MockProvider] Cloud data missing required fields:', {
                    hasVersion: !!data.version,
                    versionValue: data.version,
                    hasChecksum: !!data.checksum,
                    checksumValue: data.checksum,
                    checksumType: typeof data.checksum,
                    hasTimestamp: typeof data.timestamp === 'number',
                    timestampValue: data.timestamp,
                    hasSchedules: Array.isArray(data.schedules)
                });
                console.warn('[MockProvider] Clearing corrupted data and returning null');
                localStorage.removeItem(this.getCloudStorageKey());
                return null;
            }

            // Additional validation: checksum format must be 64-character SHA-256 hex string
            if (typeof data.checksum !== 'string' || data.checksum.length !== 64) {
                console.warn('[MockProvider] Invalid checksum format:', {
                    checksum: data.checksum,
                    type: typeof data.checksum,
                    length: data.checksum?.length
                });
                console.warn('[MockProvider] Clearing data with invalid checksum');
                localStorage.removeItem(this.getCloudStorageKey());
                return null;
            }

            // Verify checksum is hex string
            if (!/^[0-9a-f]{64}$/i.test(data.checksum)) {
                console.warn('[MockProvider] Checksum is not valid hex string:', data.checksum);
                console.warn('[MockProvider] Clearing data with malformed checksum');
                localStorage.removeItem(this.getCloudStorageKey());
                return null;
            }

            console.log('[MockProvider] Successfully loaded valid data from localStorage');
            return data;
        } catch (e) {
            console.error('[MockProvider] Failed to load cloud data from localStorage:', e);
            console.warn('[MockProvider] Clearing corrupted data due to parse error');
            localStorage.removeItem(this.getCloudStorageKey());
            return null;
        }
    }

    /**
     * Clear localStorage for this device
     */
    private clearLocalStorage(): void {
        if (!this.config.useLocalStorage) {
            return;
        }

        localStorage.removeItem(this.getDeviceStorageKey());
    }
}
