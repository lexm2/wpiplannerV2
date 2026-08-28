import { ThemeDefinition, ThemeId } from './types';
import { uiState } from '../services/ui/uiState.svelte';

import wpiClassic from './definitions/wpi-classic.json';
import wpiDark from './definitions/wpi-dark.json';
import wpiLight from './definitions/wpi-light.json';
import highContrast from './definitions/high-contrast.json';
import { logger } from '../utils/logger';
import { STORAGE_KEYS } from '../utils/storageKeys';

/**
 * Singleton theme system with JSON-based themes and pluggable storage strategy for persistence
 */

export interface ThemeStorage {
  loadThemePreference(): string;
  saveThemePreference(themeId: string): void;
}

/**
 * Bootstrap storage, used until AppBootstrap swaps in its own adapter.
 *
 * Reads the preferences blob synchronously: ThemeManager is constructed before
 * the shell mounts, so this read decides the theme at first paint. The blob is
 * plain JSON (lz-string is only used for IndexedDB schedules), so it is cheap.
 * Same pre-paint pattern as svelte/panelWidths.ts.
 */
class DefaultThemeStorage implements ThemeStorage {
  private readonly preferencesKey = STORAGE_KEYS.PREFERENCES;

  loadThemePreference(): string {
    try {
      const raw = localStorage.getItem(this.preferencesKey);
      if (!raw) return 'wpi-dark';
      const parsed = JSON.parse(raw) as { theme?: string };
      return typeof parsed.theme === 'string' ? parsed.theme : 'wpi-dark';
    } catch (error) {
      logger.warn('Failed to load theme preference:', error);
      return 'wpi-dark';
    }
  }

  // Read-modify-write so a save through this bootstrap path can't drop the
  // other preference fields. In practice AppBootstrap's adapter has taken
  // over by the time any user-driven setTheme() runs.
  saveThemePreference(themeId: string): void {
    try {
      const raw = localStorage.getItem(this.preferencesKey);
      const existing: Record<string, unknown> = raw
        ? (JSON.parse(raw) as Record<string, unknown>)
        : {};
      localStorage.setItem(
        this.preferencesKey,
        JSON.stringify({ ...existing, theme: themeId }),
      );
    } catch (error) {
      logger.warn('Failed to save theme preference:', error);
    }
  }
}

/**
 * Object.entries has no overload for an interface without an index signature --
 * and interfaces, unlike type aliases, never get an implicit one -- so it falls
 * back to [string, any][]. This recovers the value type.
 */
function cssEntries<T extends object>(obj: T): [string, T[keyof T]][] {
  return Object.entries(obj) as [string, T[keyof T]][];
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
   * Swaps the persistence backend only. It must NOT re-derive the theme: its
   * caller runs before ProfileStateManager has loaded, so a re-read would get
   * the in-memory default and stomp what the constructor already applied.
   */
  setStorage(storage: ThemeStorage): void {
    this.storage = storage;
  }

  private initializeThemes(): void {
    this.registerTheme(wpiClassic);
    this.registerTheme(wpiDark);
    this.registerTheme(wpiLight);
    this.registerTheme(highContrast);
  }

  private loadSavedTheme(): void {
    const savedTheme = this.storage.loadThemePreference();
    if (savedTheme && this.themes.has(savedTheme)) {
      this.currentTheme = savedTheme;
    }

    this.applyTheme(this.currentTheme);
    uiState.currentThemeId = this.currentTheme;
  }

  registerTheme(theme: ThemeDefinition): void {
    if (!this.isValidTheme(theme)) {
      logger.error('Invalid theme definition:', theme);
      return;
    }

    this.themes.set(theme.id, theme);
  }

  private isValidTheme(theme: unknown): theme is ThemeDefinition {
    if (!theme || typeof theme !== 'object') return false;
    const t = theme as Record<string, unknown>;
    return (
      typeof t.name === 'string' &&
      typeof t.id === 'string' &&
      typeof t.description === 'string' &&
      !!t.colors &&
      !!t.spacing &&
      !!t.effects
    );
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
      logger.error(`Theme '${themeId}' not found`);
      return false;
    }

    this.currentTheme = themeId;
    this.applyTheme(themeId);
    this.saveThemePreference(themeId);
    // Notify reactive consumers (e.g. the Svelte ThemeSelector) of the new
    // visible theme - ThemeManager has no listener system of its own.
    uiState.currentThemeId = themeId;

    return true;
  }

  private applyTheme(themeId: ThemeId): void {
    const theme = this.themes.get(themeId);
    if (!theme) return;

    const root = document.documentElement;

    cssEntries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${this.kebabCase(key)}`, value);
    });

    cssEntries(theme.spacing).forEach(([key, value]) => {
      root.style.setProperty(`--spacing-${this.kebabCase(key)}`, value);
    });

    cssEntries(theme.effects).forEach(([key, value]) => {
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
      const theme: unknown = JSON.parse(themeJson);
      if (this.isValidTheme(theme)) {
        this.registerTheme(theme);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to import theme:', error);
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
    const builtInThemes = [
      'wpi-classic',
      'wpi-dark',
      'wpi-light',
      'high-contrast',
    ];
    if (builtInThemes.includes(themeId)) {
      logger.warn(`Cannot remove built-in theme: ${themeId}`);
      return false;
    }

    if (this.currentTheme === themeId) {
      this.setTheme('wpi-dark');
    }

    return this.themes.delete(themeId);
  }
}
