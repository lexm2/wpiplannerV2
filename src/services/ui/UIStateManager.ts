import type { UIState, PageId, ViewMode } from '../../types/uiState';
import { uiState } from './uiState.svelte';
import { wizardState } from '../../svelte/wizardState.svelte';

export class UIStateManager {
    // Reactive state lives in the `uiState` rune store; this manager exposes
    // imperative setters over it. The page-region display toggle is now reactive
    // (App.svelte binds #planner-page/#schedule-page display to
    // uiState.currentPage), so this manager no longer applies any DOM effect —
    // the only remaining DOM touch is the fatal-error fallback (showErrorMessage),
    // which queries its targets lazily (they're rendered by App.svelte, which
    // mounts after this manager is constructed).

    // --- State access ---

    getState(): Readonly<UIState> {
        return {
            currentPage: uiState.currentPage,
            currentView: uiState.currentView,
            openModals: uiState.openModals,
            // Derived from the live wizard store (single source of truth) so the
            // tutorial snapshot reflects whether the wizard is open at capture time.
            wizard: {
                isOpen: wizardState.isOpen,
                courseId: wizardState.config?.course.id ?? null,
                step: wizardState.isOpen ? wizardState.currentStep : null,
            },
        };
    }

    getSnapshot(): UIState {
        return JSON.parse(JSON.stringify(this.getState()));
    }

    // Backward-compat getters
    get currentPage(): PageId { return uiState.currentPage; }
    get currentView(): ViewMode { return uiState.currentView; }

    getCurrentPage(): PageId {
        return uiState.currentPage;
    }

    // --- Page ---

    setPage(page: PageId): void {
        if (page === uiState.currentPage) return;
        uiState.currentPage = page;
        // App.svelte toggles the #planner-page/#schedule-page display reactively
        // off this rune — no imperative DOM effect needed.
    }

    /** @deprecated Use setPage */
    switchToPage(page: PageId): void {
        this.setPage(page);
    }

    togglePage(): void {
        this.setPage(uiState.currentPage === 'planner' ? 'schedule' : 'planner');
    }

    // --- View mode ---

    setView(view: ViewMode): void {
        if (view === uiState.currentView) return;
        uiState.currentView = view;
        // The ViewToggle Svelte component reads uiState.currentView and updates
        // its own classes reactively — no imperative DOM effect needed here.
    }

    // --- Modal tracking ---

    modalOpened(typeId: string): void {
        if (uiState.openModals.includes(typeId)) return;
        uiState.openModals = [...uiState.openModals, typeId];
    }

    modalClosed(typeId: string): void {
        if (!uiState.openModals.includes(typeId)) return;
        uiState.openModals = uiState.openModals.filter(id => id !== typeId);
    }

    // Close every open modal at once. The declarative ModalLayer unmounts each
    // component when its id leaves uiState.openModals (after its hide animation).
    // Replaces the old ModalService.hideAllModals() the tutorial used to call.
    closeAllModals(): void {
        if (uiState.openModals.length === 0) return;
        uiState.openModals = [];
    }

    // --- Bulk restore (for tutorial) ---

    restoreState(snapshot: UIState): void {
        uiState.currentPage = snapshot.currentPage;
        uiState.currentView = snapshot.currentView;
        // Only restore page/view here; modals and the wizard are reopened
        // explicitly by the caller (the wizard via componentWizardService).
        uiState.openModals = [];
        // Page display + currentView are reflected by App.svelte / the ViewToggle
        // Svelte component reactively off the runes set above.
    }

    // --- Legacy methods ---

    showErrorMessage(message: string, onClearData?: () => Promise<void>): void {
        const content = onClearData
            ? `<div class="error-message">
                <p>${message}</p>
                <p>Your saved data may be outdated or deprecated. Clearing it will reset the app to a fresh state.</p>
                <button class="btn btn-danger" id="error-clear-data-btn">Clear Data &amp; Reload</button>
               </div>`
            : `<div class="error-message">${message}</div>`;

        // Queried lazily: App.svelte renders these regions and mounts after this
        // manager is constructed, so caching them in the ctor would capture null.
        const departmentList = document.getElementById('department-list');
        const courseContainer = document.getElementById('course-container');

        if (departmentList) {
            departmentList.innerHTML = content;
        }

        if (courseContainer) {
            courseContainer.innerHTML = content;
        }

        if (onClearData) {
            document.querySelectorAll('#error-clear-data-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    await onClearData();
                    location.reload();
                });
            });
        }
    }
}
