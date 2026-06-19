import type { PageId, ViewMode } from '../../types/uiState';

/**
 * Reactive UI state (Svelte 5 runes) — page/view/modal tracking that
 * {@link UIStateManager} reads and writes. Replaces the old hand-rolled
 * `subscribe`/`notify` listener system: consumers `watch` these fields (or read
 * them directly in a component) instead of registering callbacks.
 *
 * `openModals` uses `$state.raw` because the manager replaces it wholesale with
 * immutable updates (and it gets JSON-cloned for snapshots).
 *
 * Wizard state is NOT mirrored here — `wizardState` (src/svelte/wizardState) is
 * the single source of truth; the tutorial snapshot derives its wizard view from
 * it in {@link UIStateManager.getState}.
 */
class UiState {
    currentPage = $state<PageId>('planner');
    currentView = $state<ViewMode>('list');
    // Reflects the *visible* theme. Written by ThemeManager.setTheme/previewTheme/
    // resetToCurrentTheme (ThemeManager has no listener system, so this rune is how
    // the Svelte ThemeSelector stays in sync). Default matches ThemeManager's default.
    currentThemeId = $state<string>('wpi-dark');
    openModals = $state.raw<string[]>([]);
}

/** App-wide singleton. UIStateManager mutates this; consumers read it. */
export const uiState = new UiState();
