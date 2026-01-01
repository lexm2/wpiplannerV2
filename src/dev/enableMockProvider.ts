import { MockCloudProvider } from '../../tests/mocks/MockCloudProvider';
import { MockCloudProviderUI } from './MockCloudProviderUI';
import { providerRegistry } from '../services/sync/ProviderRegistry';
import { SyncManager } from '../services/sync/SyncManager';

// Import CSS styles
import './mock-provider-ui.css';

/**
 * Enable Mock Cloud Provider for manual testing
 *
 * This function initializes a MockCloudProvider with localStorage persistence
 * and creates a UI control panel for easy testing of cloud sync functionality.
 *
 * Features:
 * - Persists mock data to localStorage (survives page reloads)
 * - Supports multi-device simulation
 * - UI control panel for manual operations
 * - Keyboard shortcut (Ctrl+Shift+M) to toggle UI
 *
 * @example
 * // Enable by adding ?mock to URL or setting localStorage
 * http://localhost:3000/wpiplannerV2/?mock
 *
 * // Or programmatically
 * localStorage.setItem('use-mock-provider', 'true');
 */
export async function enableMockProvider(): Promise<void> {
    console.log('%c[Mock Provider] Initializing...', 'color: #667eea; font-weight: bold');

    // Get or create device ID
    let deviceId = localStorage.getItem('mock-device-id');
    if (!deviceId) {
        deviceId = 'device-a';
        localStorage.setItem('mock-device-id', deviceId);
    }

    // Get network delay from localStorage or use default
    const networkDelayStr = localStorage.getItem('mock-network-delay');
    const networkDelay = networkDelayStr ? parseInt(networkDelayStr, 10) : 500;

    // Create mock provider with localStorage persistence
    const mockProvider = new MockCloudProvider({
        useLocalStorage: true,
        deviceId,
        networkDelay,
        authSucceeds: true,
        validateData: true,
        verifyChecksums: true,
    });

    await mockProvider.initialize();

    // Register the provider
    providerRegistry.register(mockProvider);

    // Get SyncManager instance
    const syncManager = SyncManager.getInstance();

    // Set mock provider as active
    syncManager.setProvider('mock');

    console.log(
        `%c[Mock Provider] Enabled as device "${deviceId}"`,
        'color: #667eea; font-weight: bold'
    );
    console.log(
        '%c[Mock Provider] Press Ctrl+Shift+M to toggle control panel',
        'color: #667eea; font-style: italic'
    );

    // Create UI control panel
    const ui = new MockCloudProviderUI(mockProvider, syncManager);
    document.body.appendChild(ui.getContainer());

    // Add keyboard shortcut to toggle UI (Ctrl+Shift+M)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'M') {
            e.preventDefault();
            ui.toggle();
        }
    });

    // Expose to window for debugging
    (window as any).__mockProvider = mockProvider;
    (window as any).__mockProviderUI = ui;

    console.log(
        '%c[Mock Provider] Available on window.__mockProvider and window.__mockProviderUI',
        'color: #667eea; font-style: italic'
    );

    // Add visual indicator in console
    console.log(
        '%c╔════════════════════════════════════════╗\n' +
        '║   Mock Cloud Provider Active 🧪        ║\n' +
        '║                                        ║\n' +
        '║   • Device: %-26s ║\n' +
        '║   • Storage: localStorage              ║\n' +
        '║   • Network delay: %-19s ║\n' +
        '║                                        ║\n' +
        '║   Press Ctrl+Shift+M for controls      ║\n' +
        '╚════════════════════════════════════════╝',
        'color: #667eea; font-family: monospace;',
        deviceId,
        `${networkDelay}ms`
    );
}

/**
 * Check if mock provider should be enabled
 *
 * Checks URL parameters and localStorage to determine if mock mode
 * should be activated.
 */
export function shouldEnableMockProvider(): boolean {
    // Check URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('mock')) {
        return true;
    }

    // Check localStorage
    if (localStorage.getItem('use-mock-provider') === 'true') {
        return true;
    }

    return false;
}

/**
 * Disable mock provider
 *
 * Removes the mock provider and cleans up resources.
 */
export function disableMockProvider(): void {
    localStorage.removeItem('use-mock-provider');
    console.log('%c[Mock Provider] Disabled. Reload page to apply changes.', 'color: #dc3545');
}

/**
 * Toggle mock provider
 *
 * Convenience function to enable/disable mock provider.
 */
export function toggleMockProvider(): void {
    const isEnabled = localStorage.getItem('use-mock-provider') === 'true';

    if (isEnabled) {
        disableMockProvider();
    } else {
        localStorage.setItem('use-mock-provider', 'true');
        console.log('%c[Mock Provider] Enabled. Reload page to apply changes.', 'color: #28a745');
    }
}

// Expose toggle function to window for easy access in console
(window as any).toggleMockProvider = toggleMockProvider;

console.log(
    '%c[Mock Provider] Run toggleMockProvider() in console to enable/disable',
    'color: #667eea; font-style: italic'
);
