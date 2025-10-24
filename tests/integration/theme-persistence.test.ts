import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThemeManager } from '../../src/themes/ThemeManager';
import { ProfileStateManager } from '../../src/core/ProfileStateManager';
import { StorageService } from '../../src/services/StorageService';
import { ThemeSelector } from '../../src/ui/components/ThemeSelector';

/**
 * Integration test to verify that theme persistence works correctly
 * after fixing the ThemeSelector to use shared ProfileStateManager
 */

describe('Theme Persistence Integration', () => {
    let profileStateManager: ProfileStateManager;
    let storageService: StorageService;
    let themeManager: ThemeManager;
    let themeSelector: ThemeSelector;

    beforeEach(async () => {
        // Reset singletons
        ThemeManager.resetInstance();
        StorageService.resetInstance();

        // Create shared ProfileStateManager
        profileStateManager = new ProfileStateManager();

        // Create StorageService with shared ProfileStateManager
        storageService = StorageService.getInstance(profileStateManager);

        // Initialize ThemeManager with StorageService
        themeManager = ThemeManager.getInstance();
        themeManager.setStorage(storageService);

        // Initialize ThemeSelector with shared ProfileStateManager (the fix!)
        themeSelector = new ThemeSelector(profileStateManager);

        // Initialize storage
        await storageService.initialize();

        // Initialize theme (simulating MainController flow)
        themeSelector.initializeTheme();
    });

    it('should persist theme selection through the unified storage system', async () => {
        // Initial state should be default theme
        expect(themeManager.getCurrentThemeId()).toBe('wpi-classic');

        // Change theme using ThemeManager directly
        const success = themeManager.setTheme('wpi-dark');
        expect(success).toBe(true);
        expect(themeManager.getCurrentThemeId()).toBe('wpi-dark');

        // Verify it's saved in ProfileStateManager
        const preferences = profileStateManager.getPreferences();
        expect(preferences.theme).toBe('wpi-dark');

        // Simulate reload by creating new instances with same storage
        ThemeManager.resetInstance();
        const newThemeManager = ThemeManager.getInstance();
        newThemeManager.setStorage(storageService);

        const newThemeSelector = new ThemeSelector(profileStateManager);
        newThemeSelector.initializeTheme();

        // Theme should be persisted
        expect(newThemeManager.getCurrentThemeId()).toBe('wpi-dark');
    });

    it('should not have conflicting storage calls between ThemeSelector and ThemeManager', () => {
        // Mock the ProfileStateManager to track calls
        const updatePreferencesSpy = vi.spyOn(profileStateManager, 'updatePreferences');

        // Change theme - should only call storage once (through ThemeManager -> StorageService)
        themeManager.setTheme('wpi-light');

        // Verify ThemeManager saved the preference
        expect(updatePreferencesSpy).toHaveBeenCalledWith(
            { theme: 'wpi-light' },
            'storage-service'
        );

        // ThemeSelector should not make additional storage calls since we removed the duplicate call
        expect(updatePreferencesSpy).toHaveBeenCalledTimes(1);
    });

    it('should load saved theme correctly on initialization', async () => {
        // Set up a saved theme preference
        profileStateManager.updatePreferences({ theme: 'high-contrast' }, 'test');
        await profileStateManager.save();

        // Create new ThemeSelector and initialize (simulating app startup)
        const newThemeSelector = new ThemeSelector(profileStateManager);
        newThemeSelector.initializeTheme();

        // Should load the saved theme
        expect(themeManager.getCurrentThemeId()).toBe('high-contrast');
    });

    it('should render dropdown with correct active theme after initialization', () => {
        // Set a specific theme
        themeManager.setTheme('wpi-dark');

        // Create DOM elements for testing
        document.body.innerHTML = `
            <div id="theme-dropdown">
                <div id="current-theme-name"></div>
                <div id="theme-options"></div>
            </div>
        `;

        // Create new ThemeSelector and initialize
        const testThemeSelector = new ThemeSelector(profileStateManager);
        testThemeSelector.initializeTheme();

        // Check that the dropdown options show the correct active theme
        const activeOption = document.querySelector('.theme-option.active');
        expect(activeOption).toBeTruthy();
        expect(activeOption?.getAttribute('data-theme-id')).toBe('wpi-dark');

        // Verify current theme display is also updated
        const currentThemeDisplay = document.getElementById('current-theme-name');
        expect(currentThemeDisplay?.textContent).toBe('WPI Dark');
    });
});