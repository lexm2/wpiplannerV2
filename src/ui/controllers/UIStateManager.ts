export class UIStateManager {
    public currentView: 'list' | 'grid' = 'list';
    public currentPage: 'planner' | 'schedule' = 'planner';

    constructor() {}

    setView(view: 'list' | 'grid'): void {
        this.currentView = view;
        
        // Update button states
        const viewListBtn = document.getElementById('view-list');
        const viewGridBtn = document.getElementById('view-grid');
        
        if (viewListBtn && viewGridBtn) {
            if (view === 'list') {
                viewListBtn.classList.add('btn-primary', 'active');
                viewListBtn.classList.remove('btn-secondary');
                viewGridBtn.classList.add('btn-secondary');
                viewGridBtn.classList.remove('btn-primary', 'active');
            } else {
                viewGridBtn.classList.add('btn-primary', 'active');
                viewGridBtn.classList.remove('btn-secondary');
                viewListBtn.classList.add('btn-secondary');
                viewListBtn.classList.remove('btn-primary', 'active');
            }
        }
    }

    togglePage(): void {
        const nextPage = this.currentPage === 'planner' ? 'schedule' : 'planner';
        this.switchToPage(nextPage);
    }

    switchToPage(page: 'planner' | 'schedule'): void {
        if (page === this.currentPage) return;

        this.currentPage = page;

        // Update button text based on current page
        const scheduleButton = document.getElementById('schedule-btn');
        if (scheduleButton) {
            if (page === 'schedule') {
                scheduleButton.textContent = 'Back to Classes';
                this.showSchedulePage();
            } else {
                scheduleButton.textContent = 'Schedule';
                this.showPlannerPage();
            }
        }
    }

    private showPlannerPage(): void {
        const plannerPage = document.getElementById('planner-page');
        const schedulePage = document.getElementById('schedule-page');

        if (plannerPage) plannerPage.style.display = 'grid';
        if (schedulePage) schedulePage.style.display = 'none';
    }

    private showSchedulePage(): void {
        const plannerPage = document.getElementById('planner-page');
        const schedulePage = document.getElementById('schedule-page');

        if (plannerPage) plannerPage.style.display = 'none';
        if (schedulePage) schedulePage.style.display = 'flex';
    }

    showLoadingState(): void {
        const departmentList = document.getElementById('department-list');
        if (departmentList) {
            departmentList.innerHTML = '<div class="loading-message">Loading departments...</div>';
        }
    }

    showErrorMessage(message: string): void {
        const departmentList = document.getElementById('department-list');
        if (departmentList) {
            departmentList.innerHTML = `<div class="error-message">${message}</div>`;
        }
        
        const courseContainer = document.getElementById('course-container');
        if (courseContainer) {
            courseContainer.innerHTML = `<div class="error-message">${message}</div>`;
        }
    }

    syncHeaderHeights(): void {
        const sidebarHeader = document.querySelector('.sidebar-header') as HTMLElement;
        const contentHeader = document.querySelector('.content-header') as HTMLElement;
        const panelHeaders = document.querySelectorAll('.panel-header') as NodeListOf<HTMLElement>;

        if (!sidebarHeader || !contentHeader || !panelHeaders.length) {
            return;
        }

        // Reset heights to natural size to get accurate measurements
        document.documentElement.style.setProperty('--synced-header-height', 'auto');
        
        // Allow layout to settle
        requestAnimationFrame(() => {
            // Get natural heights of all headers
            const sidebarHeight = sidebarHeader.offsetHeight;
            const contentHeight = contentHeader.offsetHeight;
            const panelHeights = Array.from(panelHeaders).map(header => header.offsetHeight);
            
            // Find the maximum height
            const maxHeight = Math.max(sidebarHeight, contentHeight, ...panelHeights);
            
            // Set the synced height to match the tallest header
            document.documentElement.style.setProperty('--synced-header-height', `${maxHeight}px`);
        });
    }

    setupHeaderResizeObserver(): void {
        if (!window.ResizeObserver) return;

        const headers = [
            document.querySelector('.sidebar-header'),
            document.querySelector('.content-header'),
            ...document.querySelectorAll('.panel-header')
        ].filter(Boolean) as HTMLElement[];

        if (!headers.length) return;

        const resizeObserver = new ResizeObserver(() => {
            this.syncHeaderHeights();
        });

        headers.forEach(header => {
            resizeObserver.observe(header);
        });
    }
}