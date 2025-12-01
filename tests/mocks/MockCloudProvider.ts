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
        };
    }

    async initialize(): Promise<void> {
        this.callHistory.initialize++;
        await this.simulateNetworkDelay();
        this.initialized = true;
    }

    dispose(): void {
        this.authenticated = false;
        this.cloudData = null;
    }

    async signIn(): Promise<void> {
        this.callHistory.signIn++;
        await this.simulateNetworkDelay();

        if (!this.config.authSucceeds) {
            throw new Error('Mock authentication failed');
        }

        this.authenticated = true;
        syncEventBus.emitEvent('auth-changed', { authenticated: true });
    }

    async signOut(): Promise<void> {
        this.callHistory.signOut++;
        await this.simulateNetworkDelay();

        this.authenticated = false;
        syncEventBus.emitEvent('auth-changed', { authenticated: false });
    }

    isAuthenticated(): boolean {
        return this.authenticated;
    }

    async pushData(data: SyncData): Promise<void> {
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
            parseSyncData(data, 'MockCloudProvider.pushData');
        }

        // Update timestamp and recalculate checksum (like real provider)
        const pushData: SyncData = {
            ...data,
            timestamp: Date.now(),
        };

        pushData.checksum = await checksumCalculator.calculateChecksum({
            version: pushData.version,
            activeScheduleId: pushData.activeScheduleId,
            schedules: pushData.schedules,
            preferences: pushData.preferences,
        });

        // Corrupt checksum if configured
        if (this.config.corruptChecksum) {
            pushData.checksum = 'corrupted_checksum_' + pushData.checksum.substring(18);
        }

        this.cloudData = pushData;
    }

    async pullData(): Promise<SyncData | null> {
        this.callHistory.pullData++;
        await this.simulateNetworkDelay();

        if (!this.authenticated) {
            throw new Error('Not authenticated');
        }

        if (this.config.pullFails) {
            throw this.config.errorToThrow;
        }

        if (!this.cloudData) {
            return null;
        }

        // Validate data if configured
        if (this.config.validateData) {
            parseSyncData(this.cloudData, 'MockCloudProvider.pullData');
        }

        // Verify checksum if configured
        if (this.config.verifyChecksums && !this.config.corruptChecksum) {
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
        }

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
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    private async simulateNetworkDelay(): Promise<void> {
        if (this.config.networkDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.config.networkDelay));
        }
    }
}
