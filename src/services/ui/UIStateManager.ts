export class UIStateManager {
    public currentView: 'list' | 'grid' = 'list';
    public currentPage: 'planner' | 'schedule' = 'planner';

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

    setView(view: 'list' | 'grid'): void {
        this.currentView = view;

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

    togglePage(): void {
        const nextPage = this.currentPage === 'planner' ? 'schedule' : 'planner';
        this.switchToPage(nextPage);
    }

    getCurrentPage(): 'planner' | 'schedule' {
        return this.currentPage;
    }

    switchToPage(page: 'planner' | 'schedule'): void {
        if (page === this.currentPage) return;

        this.currentPage = page;

        if (this.plannerTab && this.scheduleTab) {
            if (page === 'schedule') {
                this.plannerTab.classList.remove('active');
                this.scheduleTab.classList.add('active');
                this.showSchedulePage();
            } else {
                this.plannerTab.classList.add('active');
                this.scheduleTab.classList.remove('active');
                this.showPlannerPage();
            }
        }
    }

    private showPlannerPage(): void {
        if (this.plannerPage) this.plannerPage.style.display = 'grid';
        if (this.schedulePage) this.schedulePage.style.display = 'none';
        if (this.mobileMenuBtn) this.mobileMenuBtn.style.display = '';
        if (this.scheduleMobileMenuBtn) this.scheduleMobileMenuBtn.style.display = 'none';
    }

    private showSchedulePage(): void {
        if (this.plannerPage) this.plannerPage.style.display = 'none';
        if (this.schedulePage) this.schedulePage.style.display = 'flex';
        if (this.mobileMenuBtn) this.mobileMenuBtn.style.display = 'none';
        if (this.scheduleMobileMenuBtn) this.scheduleMobileMenuBtn.style.display = '';
    }

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
