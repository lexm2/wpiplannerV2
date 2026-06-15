import type { PageId, ViewMode, WizardState } from '../../types/uiState';

/**
 * Reactive UI state (Svelte 5 runes) — page/view/modal/wizard tracking that
 * {@link UIStateManager} reads and writes. Replaces the old hand-rolled
 * `subscribe`/`notify` listener system: consumers `watch` these fields (or read
 * them directly in a component) instead of registering callbacks.
 *
 * `openModals`/`wizard` use `$state.raw` because the manager replaces them
 * wholesale with immutable updates (and they get JSON-cloned for snapshots).
 */
class UiState {
    currentPage = $state<PageId>('planner');
    currentView = $state<ViewMode>('list');
    openModals = $state.raw<string[]>([]);
    wizard = $state.raw<WizardState>({ isOpen: false, courseId: null, step: null });
}

/** App-wide singleton. UIStateManager mutates this; consumers read it. */
export const uiState = new UiState();
