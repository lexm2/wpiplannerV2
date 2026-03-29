import type { UIState, PageId, ViewMode, WizardStep } from '../../types/uiState';

export type UIStateListener = (state: Readonly<UIState>, prevState: Readonly<UIState>) => void;

export class UIStateManager {
    private state: UIState = {
        currentPage: 'planner',
        currentView: 'list',
        openModals: [],
        wizard: { isOpen: false, courseId: null, step: null },
    };

    private listeners = new Set<UIStateListener>();

    // Cached DOM elements for applying effects
    private viewListBtn: HTMLElement | null;
    private viewGridBtn: HTMLElement | null;
    private plannerTab: HTMLElement | null;
    private scheduleTab: HTMLElement | null;
    private plannerPage: HTMLElement | null;
    private schedulePage: HTMLElement | null;
    private mobileMenuBtn: HTMLElement | null;
    private scheduleMobileMenuBtn: HTMLElement | null;
    private departmentList: HTMLElement | null;
    private courseContainer: HTMLElement | null;

    constructor() {
        this.viewListBtn = document.getElementById('view-list');
        this.viewGridBtn = document.getElementById('view-grid');
        this.plannerTab = document.getElementById('planner-tab');
        this.scheduleTab = document.getElementById('schedule-tab');
        this.plannerPage = document.getElementById('planner-page');
        this.schedulePage = document.getElementById('schedule-page');
        this.mobileMenuBtn = document.getElementById('mobile-menu-btn');
        this.scheduleMobileMenuBtn = document.getElementById('schedule-mobile-menu-btn');
        this.departmentList = document.getElementById('department-list');
        this.courseContainer = document.getElementById('course-container');
    }

    // --- State access ---

    getState(): Readonly<UIState> {
        return this.state;
    }

    getSnapshot(): UIState {
        return JSON.parse(JSON.stringify(this.state));
    }

    // Backward-compat getters
    get currentPage(): PageId { return this.state.currentPage; }
    get currentView(): ViewMode { return this.state.currentView; }

    getCurrentPage(): PageId {
        return this.state.currentPage;
    }

    // --- Subscriptions ---

    subscribe(listener: UIStateListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify(prevState: UIState): void {
        for (const listener of this.listeners) {
            try { listener(this.state, prevState); } catch (e) { console.error('UIState listener error:', e); }
        }
    }

    // --- Page ---

    setPage(page: PageId): void {
        if (page === this.state.currentPage) return;
        const prev = this.getSnapshot();
        this.state.currentPage = page;
        this.applyPageEffects();
        this.notify(prev);
    }

    /** @deprecated Use setPage */
    switchToPage(page: PageId): void {
        this.setPage(page);
    }

    togglePage(): void {
        this.setPage(this.state.currentPage === 'planner' ? 'schedule' : 'planner');
    }

    // --- View mode ---

    setView(view: ViewMode): void {
        if (view === this.state.currentView) return;
        const prev = this.getSnapshot();
        this.state.currentView = view;
        this.applyViewEffects();
        this.notify(prev);
    }

    // --- Modal tracking ---

    modalOpened(typeId: string): void {
        if (this.state.openModals.includes(typeId)) return;
        const prev = this.getSnapshot();
        this.state.openModals = [...this.state.openModals, typeId];
        this.notify(prev);
    }

    modalClosed(typeId: string): void {
        if (!this.state.openModals.includes(typeId)) return;
        const prev = this.getSnapshot();
        this.state.openModals = this.state.openModals.filter(id => id !== typeId);
        this.notify(prev);
    }

    // --- Wizard tracking ---

    wizardOpened(courseId: string, step: WizardStep): void {
        const prev = this.getSnapshot();
        this.state.wizard = { isOpen: true, courseId, step };
        this.notify(prev);
    }

    wizardStepChanged(step: WizardStep): void {
        if (!this.state.wizard.isOpen) return;
        const prev = this.getSnapshot();
        this.state.wizard = { ...this.state.wizard, step };
        this.notify(prev);
    }

    wizardClosed(): void {
        if (!this.state.wizard.isOpen) return;
        const prev = this.getSnapshot();
        this.state.wizard = { isOpen: false, courseId: null, step: null };
        this.notify(prev);
    }

    // --- Bulk restore (for tutorial) ---

    restoreState(snapshot: UIState): void {
        const prev = this.getSnapshot();
        this.state = JSON.parse(JSON.stringify(snapshot));
        // Only apply page/view DOM effects here.
        // Modals and wizard are reopened explicitly by the caller.
        this.state.openModals = [];
        this.state.wizard = { isOpen: false, courseId: null, step: null };
        this.applyPageEffects();
        this.applyViewEffects();
        this.notify(prev);
    }

    // --- DOM effects (private) ---

    private applyPageEffects(): void {
        const page = this.state.currentPage;
        if (this.plannerTab && this.scheduleTab) {
            if (page === 'schedule') {
                this.plannerTab.classList.remove('active');
                this.scheduleTab.classList.add('active');
            } else {
                this.plannerTab.classList.add('active');
                this.scheduleTab.classList.remove('active');
            }
        }
        if (page === 'planner') {
            if (this.plannerPage) this.plannerPage.style.display = 'grid';
            if (this.schedulePage) this.schedulePage.style.display = 'none';
            if (this.mobileMenuBtn) this.mobileMenuBtn.style.display = '';
            if (this.scheduleMobileMenuBtn) this.scheduleMobileMenuBtn.style.display = 'none';
        } else {
            if (this.plannerPage) this.plannerPage.style.display = 'none';
            if (this.schedulePage) this.schedulePage.style.display = 'flex';
            if (this.mobileMenuBtn) this.mobileMenuBtn.style.display = 'none';
            if (this.scheduleMobileMenuBtn) this.scheduleMobileMenuBtn.style.display = '';
        }
    }

    private applyViewEffects(): void {
        const view = this.state.currentView;
        if (this.viewListBtn && this.viewGridBtn) {
            if (view === 'list') {
                this.viewListBtn.classList.add('btn-primary', 'active');
                this.viewListBtn.classList.remove('btn-secondary');
                this.viewGridBtn.classList.add('btn-secondary');
                this.viewGridBtn.classList.remove('btn-primary', 'active');
            } else {
                this.viewGridBtn.classList.add('btn-primary', 'active');
                this.viewGridBtn.classList.remove('btn-secondary');
                this.viewListBtn.classList.add('btn-secondary');
                this.viewListBtn.classList.remove('btn-primary', 'active');
            }
        }
    }

    // --- Legacy methods ---

    showLoadingState(): void {
        if (this.departmentList) {
            this.departmentList.innerHTML = '<div class="loading-message">Loading departments...</div>';
        }
    }

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
