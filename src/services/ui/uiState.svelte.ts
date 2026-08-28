import type { PageId, ViewMode, UIState } from '../../types/uiState';
import { wizardState } from '../../svelte/wizardState.svelte';

/**
 * Reactive UI state (Svelte 5 runes) - page/view/modal tracking - plus the
 * module-level mutator functions every caller uses directly.
 *
 * `openModals` uses `$state.raw` because mutators replace it wholesale with
 * immutable updates (and it gets copied into tutorial snapshots).
 *
 * Wizard state is NOT mirrored here - `wizardState` (src/svelte/wizardState) is
 * the single source of truth; the tutorial snapshot derives its wizard view from
 * it in {@link getUiSnapshot}.
 */

/** Error surfaced by App.svelte's ErrorBanner. */
export interface AppError {
  message: string;
  /** When set, the banner offers "Clear Data & Reload", which awaits this then reloads. */
  onClearData?: () => Promise<void>;
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
  // system, so this rune is how the Svelte ThemeSelector stays in sync).
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

// The declarative ModalLayer unmounts each component when its id leaves
// uiState.openModals (after its hide animation).
export function closeAllModals(): void {
  if (uiState.openModals.length === 0) return;
  uiState.openModals = [];
}

export function showAppError(
  message: string,
  onClearData?: () => Promise<void>,
  onExportData?: AppError['onExportData'],
): void {
  uiState.appError = { message, onClearData, onExportData };
}

/** Snapshot for the tutorial (fresh objects/arrays - safe to store as-is). */
export function getUiSnapshot(): UIState {
  return {
    currentPage: uiState.currentPage,
    currentView: uiState.currentView,
    openModals: [...uiState.openModals],
    // Derived from the live wizard store (single source of truth) so the
    // tutorial snapshot reflects whether the wizard is open at capture time.
    wizard: {
      isOpen: wizardState.isOpen,
      courseId: wizardState.config?.course.id ?? null,
      step: wizardState.isOpen ? wizardState.currentStep : null,
    },
  };
}

/** Bulk restore for the tutorial. */
export function restoreUiSnapshot(snapshot: UIState): void {
  uiState.currentPage = snapshot.currentPage;
  uiState.currentView = snapshot.currentView;
  // Only restore page/view here; modals and the wizard are reopened
  // explicitly by the caller (the wizard via componentWizardService).
  uiState.openModals = [];
}
