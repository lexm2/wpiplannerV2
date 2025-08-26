import { ThemeDefinition, ThemeId, ThemeChangeEvent, ThemeChangeListener } from './types'
import { ProfileStateManager } from '../core/ProfileStateManager'

// Import theme definitions
import wpiClassic from './definitions/wpi-classic.json'
import wpiDark from './definitions/wpi-dark.json'
import wpiLight from './definitions/wpi-light.json'
import highContrast from './definitions/high-contrast.json'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ThemeManager - Singleton Theme System with Pluggable Storage Strategy
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ARCHITECTURE ROLE:
 * - Singleton theme management system coordinating all theme operations
 * - Theme definition registry with JSON-based theme loading
 * - CSS variable application engine for dynamic theme switching
 * - Storage abstraction layer using Strategy pattern for persistence
 * - Event broadcasting system for theme change notifications
 * 
 * DEPENDENCIES:
 * - ThemeStorage interface → Pluggable storage strategy (ProfileStateManagerThemeStorage or DefaultThemeStorage)
 * - Theme JSON definitions → wpi-classic.json, wpi-dark.json, wpi-light.json, high-contrast.json
 * - ThemeDefinition types → Type safety for theme structure validation
 * - DOM CSS Custom Properties → :root CSS variable manipulation
 * 
 * USED BY:
 * - ThemeSelector → UI component for theme selection interface
 * - MainController → Initialization and ProfileStateManager integration
 * - ProfileStateManagerThemeStorage → Implements ThemeStorage interface for unified persistence
 * - Application CSS → Consumes CSS custom properties set by theme system
 * 
 * STORAGE STRATEGY PATTERN:
 * 1. Default: Uses DefaultThemeStorage with direct localStorage access
 * 2. Injected: MainController injects ProfileStateManagerThemeStorage via setStorage()
 * 3. Strategy allows swapping between storage implementations
 * 4. Unified storage integration through ProfileStateManagerThemeStorage implementation
 * 
 * DATA FLOW:
 * Theme Loading:
 * 1. initializeThemes() loads JSON theme definitions
 * 2. loadSavedTheme() retrieves preference via storage strategy
 * 3. applyTheme() sets CSS custom properties on :root
 * 4. DOM reflects new theme variables throughout application
 * 
 * Theme Changing:
 * 1. setTheme(themeId) validates theme exists
 * 2. applyTheme() updates CSS custom properties
 * 3. saveThemePreference() persists via storage strategy
 * 4. notifyListeners() broadcasts ThemeChangeEvent
 * 5. UI components update to reflect theme change
 * 
 * KEY FEATURES:
 * - Singleton pattern ensuring single theme management instance
 * - Strategy pattern for pluggable storage (DefaultThemeStorage ↔ ProfileStateManagerThemeStorage)
 * - Observer pattern for theme change event broadcasting
 * - JSON-based theme definition system with validation
 * - CSS custom property management for dynamic styling
 * - Theme registration system for extensibility
 * - System preference detection (light/dark mode)
 * 
 * INTEGRATION POINTS:
 * - Implements dependency injection for storage strategy
 * - Coordinates with MainController for unified storage setup
 * - Provides ThemeStorage interface for ProfileStateManagerThemeStorage implementation
 * - Integrates with CSS system via custom property manipulation
 * - Event system integration for UI component notifications
 * 
 * ARCHITECTURAL PATTERNS:
 * - Singleton: Single instance across application lifetime
 * - Strategy: Pluggable storage implementation (ThemeStorage interface)
 * - Observer: Event-driven theme change notifications
 * - Registry: Theme definition registration and management
 * - Dependency Injection: Storage strategy injection via setStorage()
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export interface ThemeStorage {
    loadThemePreference(): string;
    saveThemePreference(themeId: string): void;
}

class DefaultThemeStorage implements ThemeStorage {
    private readonly storageKey = 'wpi-planner-theme';

    loadThemePreference(): string {
        try {
            const savedTheme = localStorage.getItem(this.storageKey);
            return savedTheme || 'wpi-classic';
        } catch (error) {
            console.warn('Failed to load theme preference:', error);
            return 'wpi-classic';
        }
    }

    saveThemePreference(themeId: string): void {
        try {
            localStorage.setItem(this.storageKey, themeId);
        } catch (error) {
            console.warn('Failed to save theme preference:', error);
        }
    }
}

class ProfileStateManagerThemeStorage implements ThemeStorage {
    constructor(private profileStateManager: ProfileStateManager) {}

    loadThemePreference(): string {
        const preferences = this.profileStateManager.getPreferences();
        return preferences.theme || 'wpi-classic';
    }

    saveThemePreference(themeId: string): void {
        this.profileStateManager.updatePreferences({ theme: themeId }, 'theme-manager');
    }
}

export class ThemeManager {
    private static instance: ThemeManager;
    private currentTheme: ThemeId = 'wpi-classic';
    private themes: Map<ThemeId, ThemeDefinition> = new Map();
    private listeners: Set<ThemeChangeListener> = new Set();
    private storage: ThemeStorage = new DefaultThemeStorage();

    private constructor() {
        this.initializeThemes();
        this.loadSavedTheme();
    }

    static getInstance(): ThemeManager {
        if (!ThemeManager.instance) {
            ThemeManager.instance = new ThemeManager();
        }
        return ThemeManager.instance;
    }

    static resetInstance(): void {
        ThemeManager.instance = null as any;
    }

    setStorage(storage: ThemeStorage): void {
        this.storage = storage;
        this.loadSavedTheme();
    }

    setProfileStateManager(profileStateManager: ProfileStateManager): void {
        this.storage = new ProfileStateManagerThemeStorage(profileStateManager);
        this.loadSavedTheme();
    }

    private initializeThemes(): void {
        // Register built-in themes
        this.registerTheme(wpiClassic as ThemeDefinition);
        this.registerTheme(wpiDark as ThemeDefinition);
        this.registerTheme(wpiLight as ThemeDefinition);
        this.registerTheme(highContrast as ThemeDefinition);
    }

    private loadSavedTheme(): void {
        const savedTheme = this.storage.loadThemePreference();
        if (savedTheme && this.themes.has(savedTheme as ThemeId)) {
            this.currentTheme = savedTheme as ThemeId;
        }
        
        // Apply the current theme
        this.applyTheme(this.currentTheme);
    }

    registerTheme(theme: ThemeDefinition): void {
        if (!this.isValidTheme(theme)) {
            console.error('Invalid theme definition:', theme);
            return;
        }
        
        this.themes.set(theme.id, theme);
    }

    private isValidTheme(theme: any): theme is ThemeDefinition {
        return theme &&
            typeof theme.name === 'string' &&
            typeof theme.id === 'string' &&
            typeof theme.description === 'string' &&
            theme.colors &&
            theme.typography &&
            theme.spacing &&
            theme.effects;
    }

    getAvailableThemes(): ThemeDefinition[] {
        return Array.from(this.themes.values());
    }

    getCurrentTheme(): ThemeDefinition | null {
        return this.themes.get(this.currentTheme) || null;
    }

    getCurrentThemeId(): ThemeId {
        return this.currentTheme;
    }

    setTheme(themeId: ThemeId): boolean {
        if (!this.themes.has(themeId)) {
            console.error(`Theme '${themeId}' not found`);
            return false;
        }

        const oldTheme = this.currentTheme;
        const newTheme = themeId;
        const themeDefinition = this.themes.get(themeId)!;

        this.currentTheme = themeId;
        this.applyTheme(themeId);
        this.saveThemePreference(themeId);

        // Notify listeners
        const event: ThemeChangeEvent = {
            oldTheme,
            newTheme,
            themeDefinition
        };
        this.notifyListeners(event);

        return true;
    }

    private applyTheme(themeId: ThemeId): void {
        const theme = this.themes.get(themeId);
        if (!theme) return;

        const root = document.documentElement;

        // Apply color variables
        Object.entries(theme.colors).forEach(([key, value]) => {
            root.style.setProperty(`--color-${this.kebabCase(key)}`, value);
        });

        // Apply typography variables
        Object.entries(theme.typography).forEach(([key, value]) => {
            root.style.setProperty(`--font-${this.kebabCase(key)}`, value);
        });

        // Apply spacing variables
        Object.entries(theme.spacing).forEach(([key, value]) => {
            root.style.setProperty(`--spacing-${this.kebabCase(key)}`, value);
        });

        // Apply effect variables
        Object.entries(theme.effects).forEach(([key, value]) => {
            root.style.setProperty(`--effect-${this.kebabCase(key)}`, value);
        });

        // Add theme class to body for theme-specific styling
        document.body.className = document.body.className
            .replace(/theme-[\w-]+/g, '')
            .trim();
        document.body.classList.add(`theme-${themeId}`);
    }

    private kebabCase(str: string): string {
        return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    }

    private saveThemePreference(themeId: ThemeId): void {
        this.storage.saveThemePreference(themeId);
    }

    // System preference detection
    detectSystemPreference(): ThemeId {
        if (typeof window !== 'undefined' && window.matchMedia) {
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'wpi-dark';
            }
            if (window.matchMedia('(prefers-contrast: high)').matches) {
                return 'high-contrast';
            }
        }
        return 'wpi-classic';
    }

    useSystemPreference(): boolean {
        const preferredTheme = this.detectSystemPreference();
        return this.setTheme(preferredTheme);
    }

    // Event listeners
    onThemeChange(listener: ThemeChangeListener): void {
        this.listeners.add(listener);
    }

    offThemeChange(listener: ThemeChangeListener): void {
        this.listeners.delete(listener);
    }

    private notifyListeners(event: ThemeChangeEvent): void {
        this.listeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error('Error in theme change listener:', error);
            }
        });
    }

    // Theme preview (temporary application without saving)
    previewTheme(themeId: ThemeId): boolean {
        if (!this.themes.has(themeId)) return false;
        this.applyTheme(themeId);
        return true;
    }

    // Reset to current theme (cancel preview)
    resetToCurrentTheme(): void {
        this.applyTheme(this.currentTheme);
    }

    // Export/Import functionality
    exportCurrentTheme(): string {
        const theme = this.getCurrentTheme();
        if (!theme) throw new Error('No current theme to export');
        return JSON.stringify(theme, null, 2);
    }

    importTheme(themeJson: string): boolean {
        try {
            const theme = JSON.parse(themeJson);
            if (this.isValidTheme(theme)) {
                this.registerTheme(theme);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to import theme:', error);
            return false;
        }
    }

    // Theme utilities
    getThemeById(themeId: ThemeId): ThemeDefinition | null {
        return this.themes.get(themeId) || null;
    }

    hasTheme(themeId: ThemeId): boolean {
        return this.themes.has(themeId);
    }

    removeTheme(themeId: ThemeId): boolean {
        // Don't allow removal of built-in themes
        const builtInThemes = ['wpi-classic', 'wpi-dark', 'wpi-light', 'high-contrast'];
        if (builtInThemes.includes(themeId)) {
            console.warn(`Cannot remove built-in theme: ${themeId}`);
            return false;
        }

        if (this.currentTheme === themeId) {
            this.setTheme('wpi-classic'); // Fallback to default
        }

        return this.themes.delete(themeId);
    }
}