import { ThemeDefinition, ThemeId } from './types'
import { uiState } from '../services/ui/uiState.svelte'

import wpiClassic from './definitions/wpi-classic.json'
import wpiDark from './definitions/wpi-dark.json'
import wpiLight from './definitions/wpi-light.json'
import highContrast from './definitions/high-contrast.json'

/**
 * Singleton theme system with JSON-based themes and pluggable storage strategy for persistence
 */

export interface ThemeStorage {
    loadThemePreference(): string;
    saveThemePreference(themeId: string): void;
}

/**
 * Bootstrap storage, used only until AppBootstrap swaps in StorageService.
 *
 * Reads the SAME localStorage blob ProfileStateManager persists preferences to,
 * synchronously. That matters: the ThemeManager singleton is constructed before
 * the app shell mounts, so this read is what decides the theme at first paint.
 * It previously read a `wpi-planner-theme` key that nothing had written since
 * the runes migration, so it always fell back to wpi-dark and every non-default
 * user got a flash of the wrong theme until the async bootstrap corrected it.
 *
 * The blob is plain uncompressed JSON (lz-string is only used for IndexedDB
 * schedules), so parsing it here is cheap. Same pre-paint pattern as
 * svelte/panelWidths.ts.
 */
class DefaultThemeStorage implements ThemeStorage {
    private readonly preferencesKey = 'wpi-planner-preferences';

    loadThemePreference(): string {
        try {
            const raw = localStorage.getItem(this.preferencesKey);
            if (!raw) return 'wpi-dark';
            const parsed = JSON.parse(raw) as { theme?: string };
            return typeof parsed.theme === 'string' ? parsed.theme : 'wpi-dark';
        } catch (error) {
            console.warn('Failed to load theme preference:', error);
            return 'wpi-dark';
        }
    }

    // Read-modify-write so a save through this bootstrap path can't drop the
    // other preference fields. In practice StorageService has taken over by the
    // time any user-driven setTheme() runs.
    saveThemePreference(themeId: string): void {
        try {
            const raw = localStorage.getItem(this.preferencesKey);
            const existing = raw ? JSON.parse(raw) : {};
            localStorage.setItem(this.preferencesKey, JSON.stringify({ ...existing, theme: themeId }));
        } catch (error) {
            console.warn('Failed to save theme preference:', error);
        }
    }
}

export class ThemeManager {
    private static instance: ThemeManager;
    private currentTheme: ThemeId = 'wpi-dark';
    private themes: Map<ThemeId, ThemeDefinition> = new Map();
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
        ThemeManager.instance = null!;
    }

    /**
     * Swaps the persistence backend only — deliberately does NOT re-derive the
     * theme. Its sole caller (AppBootstrap.createServices) runs before
     * ProfileStateManager has loaded from storage, so re-reading here would get
     * the in-memory default and stomp the correct theme the constructor just
     * applied from localStorage.
     */
    setStorage(storage: ThemeStorage): void {
        this.storage = storage;
    }

    private initializeThemes(): void {
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

        this.applyTheme(this.currentTheme);
        uiState.currentThemeId = this.currentTheme;
    }

    registerTheme(theme: ThemeDefinition): void {
        if (!this.isValidTheme(theme)) {
            console.error('Invalid theme definition:', theme);
            return;
        }
        
        this.themes.set(theme.id, theme);
    }

    private isValidTheme(theme: unknown): theme is ThemeDefinition {
        if (!theme || typeof theme !== 'object') return false;
        const t = theme as Record<string, unknown>;
        return typeof t.name === 'string' &&
            typeof t.id === 'string' &&
            typeof t.description === 'string' &&
            !!t.colors &&
            !!t.typography &&
            !!t.spacing &&
            !!t.effects;
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

        this.currentTheme = themeId;
        this.applyTheme(themeId);
        this.saveThemePreference(themeId);
        // Notify reactive consumers (e.g. the Svelte ThemeSelector) of the new
        // visible theme — ThemeManager has no listener system of its own.
        uiState.currentThemeId = themeId;

        return true;
    }

    private applyTheme(themeId: ThemeId): void {
        const theme = this.themes.get(themeId);
        if (!theme) return;

        const root = document.documentElement;

        Object.entries(theme.colors).forEach(([key, value]) => {
            root.style.setProperty(`--color-${this.kebabCase(key)}`, value);
        });

        Object.entries(theme.typography).forEach(([key, value]) => {
            root.style.setProperty(`--font-${this.kebabCase(key)}`, value);
        });

        Object.entries(theme.spacing).forEach(([key, value]) => {
            root.style.setProperty(`--spacing-${this.kebabCase(key)}`, value);
        });

        Object.entries(theme.effects).forEach(([key, value]) => {
            root.style.setProperty(`--effect-${this.kebabCase(key)}`, value);
        });

        const classList = Array.from(document.body.classList);
        const oldThemeClass = classList.find(cls => cls.startsWith('theme-'));
        if (oldThemeClass) {
            document.body.classList.remove(oldThemeClass);
        }

        // Force reflow then defer class addition to enable CSS transitions
        void document.documentElement.offsetHeight;
        requestAnimationFrame(() => {
            document.body.classList.add(`theme-${themeId}`);
        });
    }

    private kebabCase(str: string): string {
        return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    }

    private saveThemePreference(themeId: ThemeId): void {
        this.storage.saveThemePreference(themeId);
    }

    detectSystemPreference(): ThemeId {
        if (typeof window !== 'undefined' && window.matchMedia) {
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'wpi-dark';
            }
            if (window.matchMedia('(prefers-contrast: high)').matches) {
                return 'high-contrast';
            }
        }
        return 'wpi-dark';
    }

    useSystemPreference(): boolean {
        const preferredTheme = this.detectSystemPreference();
        return this.setTheme(preferredTheme);
    }

    // Temporary application without saving; resetToCurrentTheme() restores on cancel
    previewTheme(themeId: ThemeId): boolean {
        if (!this.themes.has(themeId)) return false;
        this.applyTheme(themeId);
        // Reflect the visible theme; currentTheme / storage are intentionally left unchanged.
        uiState.currentThemeId = themeId;
        return true;
    }

    resetToCurrentTheme(): void {
        this.applyTheme(this.currentTheme);
        uiState.currentThemeId = this.currentTheme;
    }

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
            this.setTheme('wpi-dark'); // Fallback to default
        }

        return this.themes.delete(themeId);
    }
}