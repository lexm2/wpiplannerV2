import type { MockProviderConfig } from '../mocks/MockCloudProvider';

/**
 * Pre-configured scenarios for common testing needs
 *
 * These presets provide common configurations for the MockCloudProvider
 * to make it easier to set up specific testing scenarios.
 *
 * @example
 * ```typescript
 * // Use a preset in a test
 * const mockProvider = new MockCloudProvider(MockProviderPresets.DEVICE_A);
 *
 * // Or in manual testing
 * const mockProvider = new MockCloudProvider(MockProviderPresets.MANUAL_TESTING);
 * ```
 */
export const MockProviderPresets: Record<string, MockProviderConfig> = {
    /**
     * Default configuration for manual testing
     *
     * - Persists to localStorage
     * - Device A
     * - 300ms network delay
     * - All validations enabled
     */
    MANUAL_TESTING: {
        useLocalStorage: true,
        deviceId: 'device-a',
        networkDelay: 300,
        authSucceeds: true,
        validateData: true,
        verifyChecksums: true,
    },

    /**
     * Multi-device scenario - Device A
     *
     * Use this preset when simulating Device A in a multi-device test.
     * Pair with DEVICE_B or DEVICE_C to test conflicts.
     */
    DEVICE_A: {
        useLocalStorage: true,
        deviceId: 'device-a',
        networkDelay: 300,
        authSucceeds: true,
        validateData: true,
        verifyChecksums: true,
    },

    /**
     * Multi-device scenario - Device B
     *
     * Use this preset when simulating Device B in a multi-device test.
     * Pair with DEVICE_A or DEVICE_C to test conflicts.
     */
    DEVICE_B: {
        useLocalStorage: true,
        deviceId: 'device-b',
        networkDelay: 300,
        authSucceeds: true,
        validateData: true,
        verifyChecksums: true,
    },

    /**
     * Multi-device scenario - Device C
     *
     * Use this preset when simulating Device C in a multi-device test.
     * Pair with DEVICE_A or DEVICE_B to test conflicts.
     */
    DEVICE_C: {
        useLocalStorage: true,
        deviceId: 'device-c',
        networkDelay: 300,
        authSucceeds: true,
        validateData: true,
        verifyChecksums: true,
    },

    /**
     * Slow network simulation
     *
     * Simulates a slow network connection with 3-second delays.
     * Useful for testing loading states and user patience.
     */
    SLOW_NETWORK: {
        useLocalStorage: true,
        networkDelay: 3000,
        authSucceeds: true,
        validateData: true,
        verifyChecksums: true,
    },

    /**
     * Very slow network simulation
     *
     * Simulates an extremely slow network (10 seconds).
     * Useful for testing timeout handling and edge cases.
     */
    VERY_SLOW_NETWORK: {
        useLocalStorage: true,
        networkDelay: 10000,
        authSucceeds: true,
        validateData: true,
        verifyChecksums: true,
    },

    /**
     * Fast network (no delay)
     *
     * Instant operations for testing synchronous-like behavior.
     */
    FAST_NETWORK: {
        useLocalStorage: true,
        networkDelay: 0,
        authSucceeds: true,
        validateData: true,
        verifyChecksums: true,
    },

    /**
     * Authentication failure scenario
     *
     * All authentication attempts will fail.
     * Useful for testing auth error handling.
     */
    AUTH_FAILURE: {
        useLocalStorage: false,
        authSucceeds: false,
        networkDelay: 300,
        validateData: true,
        verifyChecksums: true,
    },

    /**
     * Push operation failures
     *
     * All push operations will fail.
     * Useful for testing error recovery and retry logic.
     */
    PUSH_FAILURE: {
        useLocalStorage: false,
        pushFails: true,
        networkDelay: 300,
        authSucceeds: true,
        validateData: true,
        verifyChecksums: true,
    },

    /**
     * Pull operation failures
     *
     * All pull operations will fail.
     * Useful for testing sync failure scenarios.
     */
    PULL_FAILURE: {
        useLocalStorage: false,
        pullFails: true,
        networkDelay: 300,
        authSucceeds: true,
        validateData: true,
        verifyChecksums: true,
    },

    /**
     * Corrupted checksum scenario
     *
     * Simulates data corruption by corrupting checksums.
     * Useful for testing checksum validation and error handling.
     */
    CORRUPTED_DATA: {
        useLocalStorage: false,
        corruptChecksum: true,
        networkDelay: 300,
        authSucceeds: true,
        validateData: true,
        verifyChecksums: true,
    },

    /**
     * Default for automated tests (no persistence)
     *
     * Fast, in-memory only, suitable for unit/integration tests.
     * No localStorage persistence for test isolation.
     */
    AUTOMATED_TEST: {
        useLocalStorage: false,
        networkDelay: 0,
        authSucceeds: true,
        validateData: true,
        verifyChecksums: true,
    },

    /**
     * Minimal validation (fast tests)
     *
     * Disables validation for faster test execution.
     * Only use when you trust the test data.
     */
    FAST_TEST: {
        useLocalStorage: false,
        networkDelay: 0,
        authSucceeds: true,
        validateData: false,
        verifyChecksums: false,
    },

    /**
     * Strict validation
     *
     * Maximum validation for thorough testing.
     * Validates data and verifies checksums.
     */
    STRICT_VALIDATION: {
        useLocalStorage: false,
        networkDelay: 0,
        authSucceeds: true,
        validateData: true,
        verifyChecksums: true,
    },
};

/**
 * Helper function to create a custom preset by merging with a base preset
 *
 * @example
 * ```typescript
 * const myPreset = createCustomPreset(MockProviderPresets.DEVICE_A, {
 *     networkDelay: 1000,
 *     authSucceeds: false
 * });
 * ```
 */
export function createCustomPreset(
    base: MockProviderConfig,
    overrides: Partial<MockProviderConfig>
): MockProviderConfig {
    return { ...base, ...overrides };
}

/**
 * Get a preset by name with TypeScript autocomplete
 */
export function getPreset(name: keyof typeof MockProviderPresets): MockProviderConfig {
    return MockProviderPresets[name];
}
