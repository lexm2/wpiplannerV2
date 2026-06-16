import type { UIState, PageId, ViewMode, WizardStep } from '../../types/uiState';
import { uiState } from './uiState.svelte';

export class UIStateManager {
    // Reactive state lives in the `uiState` rune store; this manager applies the
    // DOM side-effects and exposes imperative setters over it.

    // Cached DOM elements for applying effects. The tab `.active` state is now
    // owned by the PageTabs Svelte component (reading uiState.currentPage), so
    // no tab elements are cached here — only the still-vanilla page regions.
    private plannerPage: HTMLElement | null;
    private schedulePage: HTMLElement | null;
    private departmentList: HTMLElement | null;
    private courseContainer: HTMLElement | null;

    constructor() {
        this.plannerPage = document.getElementById('planner-page');
        this.schedulePage = document.getElementById('schedule-page');
        this.departmentList = document.getElementById('department-list');
        this.courseContainer = document.getElementById('course-container');
    }

    // --- State access ---

    getState(): Readonly<UIState> {
        return {
            currentPage: uiState.currentPage,
            currentView: uiState.currentView,
            openModals: uiState.openModals,
            wizard: uiState.wizard,
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
        this.applyPageEffects();
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

    // --- Wizard tracking ---

    wizardOpened(courseId: string, step: WizardStep): void {
        uiState.wizard = { isOpen: true, courseId, step };
    }

    wizardStepChanged(step: WizardStep): void {
        if (!uiState.wizard.isOpen) return;
        uiState.wizard = { ...uiState.wizard, step };
    }

    wizardClosed(): void {
        if (!uiState.wizard.isOpen) return;
        uiState.wizard = { isOpen: false, courseId: null, step: null };
    }

    // --- Bulk restore (for tutorial) ---

    restoreState(snapshot: UIState): void {
        uiState.currentPage = snapshot.currentPage;
        uiState.currentView = snapshot.currentView;
        // Only restore page/view here; modals and wizard are reopened
        // explicitly by the caller.
        uiState.openModals = [];
        uiState.wizard = { isOpen: false, courseId: null, step: null };
        this.applyPageEffects();
        // currentView is reflected by the ViewToggle Svelte component reactively.
    }

    // --- DOM effects (private) ---

    private applyPageEffects(): void {
        // The tab `.active` state is owned by the PageTabs Svelte component
        // (reactive on uiState.currentPage). This only toggles the still-vanilla
        // #planner-page / #schedule-page region display.
        const page = uiState.currentPage;
        if (page === 'planner') {
            if (this.plannerPage) this.plannerPage.style.display = 'grid';
            if (this.schedulePage) this.schedulePage.style.display = 'none';
        } else {
            if (this.plannerPage) this.plannerPage.style.display = 'none';
            if (this.schedulePage) this.schedulePage.style.display = 'flex';
        }
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

        if (this.departmentList) {
            this.departmentList.innerHTML = content;
        }

        if (this.courseContainer) {
            this.courseContainer.innerHTML = content;
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
