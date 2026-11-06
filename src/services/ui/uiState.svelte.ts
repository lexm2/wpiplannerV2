import type { PageId, ViewMode } from '../../types/uiState';

/**
 * Reactive UI state (Svelte 5 runes) - page/view/modal tracking - plus the
 * module-level mutator functions every caller uses directly.
 *
 * `openModals` uses `$state.raw` because mutators replace it wholesale with
 * immutable updates.
 *
 * Wizard state is NOT mirrored here - `wizardState` (src/svelte/wizardState) is
 * the single source of truth.
 */

/** Error surfaced by App.svelte's ErrorBanner. */
export interface AppError {
  message: string;
  /** When set, the banner offers "Clear Data & Reload", after a confirmation. */
  onClearData?: () => Promise<void>;
  /** When set, the banner offers "Retry"; a resolved retry dismisses the banner. */
  onRetry?: () => Promise<void>;
  /**
   * When set, the banner offers "Export Data" so a backup can be downloaded
   * before the clear destroys it. Shaped as
   * ScheduleManagementService.exportAllSchedules' result so the one caller can
   * pass that method straight through.
   */
  onExportData?: () => Promise<{
    success: boolean;
    data?: string;
    error?: string;
  }>;
}

class UiState {
  currentPage = $state<PageId>('planner');
  currentView = $state<ViewMode>('list');
  // Reflects the *visible* theme. Written by ThemeManager (which has no listener
  // system, so this rune is how ThemeSelector stays in sync).
  currentThemeId = $state<string>('wpi-dark');
  openModals = $state.raw<string[]>([]);
  appError = $state<AppError | null>(null);
}

/** App-wide singleton. Mutate via the functions below; consumers read it. */
export const uiState = new UiState();

export function setPage(page: PageId): void {
  uiState.currentPage = page;
}

export function setView(view: ViewMode): void {
  uiState.currentView = view;
}

export function openModal(typeId: string): void {
  if (uiState.openModals.includes(typeId)) return;
  uiState.openModals = [...uiState.openModals, typeId];
}

export function closeModal(typeId: string): void {
  if (!uiState.openModals.includes(typeId)) return;
  uiState.openModals = uiState.openModals.filter(id => id !== typeId);
}

// ModalLayer unmounts each component when its id leaves
// uiState.openModals (after its hide animation).
export function closeAllModals(): void {
  if (uiState.openModals.length === 0) return;
  uiState.openModals = [];
}

export function showAppError(
  message: string,
  actions: Omit<AppError, 'message'> = {},
): void {
  uiState.appError = { message, ...actions };
}
