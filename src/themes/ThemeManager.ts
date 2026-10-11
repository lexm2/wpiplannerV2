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

// Read per switch, not cached: the OS setting can change while the app is open.
function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export class ThemeManager {
  private static instance: ThemeManager;
  private currentTheme: ThemeId = 'wpi-dark';
  private themes: Map<ThemeId, ThemeDefinition> = new Map();
  private storage: ThemeStorage = new DefaultThemeStorage();
  private switchToken = 0;

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

    // Before first paint: nothing to fade from.
    this.applyTheme(this.currentTheme, false);
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

  getCurrentThemeId(): ThemeId {
    return this.currentTheme;
  }

  setTheme(themeId: ThemeId): boolean {
    if (!this.themes.has(themeId)) {
      logger.error(`Theme '${themeId}' not found`);
      return false;
    }

    const changed = themeId !== this.currentTheme;
    this.currentTheme = themeId;
    if (changed) this.applyTheme(themeId, true);
    this.saveThemePreference(themeId);
    // Notify reactive consumers (e.g. the Svelte ThemeSelector) of the new
    // visible theme - ThemeManager has no listener system of its own.
    uiState.currentThemeId = themeId;

    return true;
  }

  /**
   * Swaps the theme in one style recalc, then (where supported) crossfades the
   * old and new frames with a view transition.
   *
   * The swap used to be animated with CSS transitions, so every element on the
   * page - thousands once the course list has paged in a few hundred rows -
   * recalculated style and repainted on every frame of the fade. A view
   * transition fades two snapshots on the compositor instead, so its cost
   * doesn't grow with the DOM. `theme-switching` (reset.css) keeps CSS
   * transitions from starting while the new colors land.
   */
  private applyTheme(themeId: ThemeId, animate: boolean): void {
    const theme = this.themes.get(themeId);
    if (!theme) return;

    const root = document.documentElement;
    const token = ++this.switchToken;
    root.classList.add('theme-switching');
    // Only the latest switch clears the class, so rapid toggles can't let
    // transitions back in while a newer swap is still landing.
    const done = () => {
      if (token === this.switchToken) root.classList.remove('theme-switching');
    };
    const write = () => this.writeTheme(theme);

    if (
      animate &&
      typeof document.startViewTransition === 'function' &&
      !prefersReducedMotion()
    ) {
      const transition = document.startViewTransition(write);
      // `ready` rejects when a newer switch skips this one; that's expected.
      transition.ready.catch(() => {});
      void transition.finished.then(done, done);
      return;
    }

    write();
    // The first frame commits the new colors with transitions off; the second
    // turns them back on once there's nothing left to animate.
    requestAnimationFrame(() => requestAnimationFrame(done));
  }

  private writeTheme(theme: ThemeDefinition): void {
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

    const body = document.body.classList;
    const oldThemeClass = Array.from(body).find(cls =>
      cls.startsWith('theme-'),
    );
    if (oldThemeClass) body.remove(oldThemeClass);
    body.add(`theme-${theme.id}`);
  }

  private kebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  private saveThemePreference(themeId: ThemeId): void {
    this.storage.saveThemePreference(themeId);
  }
}
