import { Course, Department } from '../../types/types'
import { CourseDataService } from '../../services/courseDataService'
import { ThemeSelector } from '../components/ThemeSelector'
import { DataRefreshService } from '../../services/DataRefreshService'
import { CourseSelectionService } from '../../services/CourseSelectionService'

export class MainController {
    private courseDataService: CourseDataService;
    private themeSelector: ThemeSelector;
    private dataRefreshService: DataRefreshService;
    private courseSelectionService: CourseSelectionService;
    private allDepartments: Department[] = [];
    private selectedDepartment: Department | null = null;
    private selectedCourse: Course | null = null;
    private currentView: 'list' | 'grid' = 'list';
    private currentPage: 'planner' | 'schedule' = 'planner';

    // Department categories based on WPI structure
    private departmentCategories: { [key: string]: string } = {
        // Science
        'BB': 'Science',
        'BCB': 'Science', 
        'CH': 'Science',
        'CS': 'Science',
        'DS': 'Science',
        'GE': 'Science',
        'IMGD': 'Science',
        'MA': 'Science',
        'MTE': 'Science',
        'PTE': 'Science',
        'NE': 'Science',
        'PH': 'Science',
        
        // Engineering
        'AE': 'Engineering',
        'AR': 'Engineering',
        'ARE': 'Engineering',
        'BME': 'Engineering',
        'CE': 'Engineering',
        'CHE': 'Engineering',
        'ECE': 'Engineering',
        'ES': 'Engineering',
        'FP': 'Engineering',
        'ME': 'Engineering',
        'MFE': 'Engineering',
        'MSE': 'Engineering',
        'NUE': 'Engineering',
        'RBE': 'Engineering',
        'SYE': 'Engineering',
        
        // Business & Management
        'BUS': 'Business & Management',
        'ECON': 'Business & Management',
        'MIS': 'Business & Management',
        'OIE': 'Business & Management',
        
        // Humanities & Arts
        'EN': 'Humanities & Arts',
        'HI': 'Humanities & Arts',
        'HU': 'Humanities & Arts',
        'MU': 'Humanities & Arts',
        'RE': 'Humanities & Arts',
        'SP': 'Humanities & Arts',
        'TH': 'Humanities & Arts',
        'WR': 'Humanities & Arts',
        
        // Social Sciences
        'GOV': 'Social Sciences',
        'PSY': 'Social Sciences',
        'SOC': 'Social Sciences',
        'SS': 'Social Sciences'
    };

    constructor() {
        this.courseDataService = new CourseDataService();
        this.themeSelector = new ThemeSelector();
        this.dataRefreshService = new DataRefreshService();
        this.courseSelectionService = new CourseSelectionService();
        this.init();
    }

    private async init(): Promise<void> {
        this.showLoadingState();
        await this.loadCourseData();
        this.displayDepartments();
        this.setupEventListeners();
        this.setupDataRefreshListener();
        this.setupCourseSelectionListener();
        this.displaySelectedCourses();
        this.syncHeaderHeights();
        this.setupHeaderResizeObserver();
    }

    private async loadCourseData(): Promise<void> {
        try {
            console.log('Loading course data...');
            const scheduleDB = await this.courseDataService.loadCourseData();
            this.allDepartments = scheduleDB.departments;
            console.log(`Loaded ${this.allDepartments.length} departments`);
        } catch (error) {
            console.error('Failed to load course data:', error);
            this.showErrorMessage('Failed to load course data. Please try refreshing the page.');
        }
    }

    private displayDepartments(): void {
        const departmentList = document.getElementById('department-list');
        if (!departmentList) return;

        // Group departments by category
        const categories = this.groupDepartmentsByCategory();
        
        let html = '';
        Object.entries(categories).forEach(([categoryName, departments]) => {
            if (departments.length === 0) return;
            
            html += `
                <div class="department-category">
                    <div class="category-header">${categoryName}</div>
                    <div class="department-list">
            `;
            
            departments.forEach(dept => {
                const courseCount = dept.courses.length;
                html += `
                    <div class="department-item" data-dept-id="${dept.abbreviation}">
                        ${dept.name} (${courseCount})
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        });

        departmentList.innerHTML = html;
    }

    private groupDepartmentsByCategory(): { [key: string]: Department[] } {
        const categories: { [key: string]: Department[] } = {
            'Science': [],
            'Engineering': [],
            'Business & Management': [],
            'Humanities & Arts': [],
            'Social Sciences': [],
            'Other': []
        };

        this.allDepartments.forEach(dept => {
            const category = this.departmentCategories[dept.abbreviation] || 'Other';
            categories[category].push(dept);
        });

        // Sort departments within each category
        Object.keys(categories).forEach(category => {
            categories[category].sort((a, b) => a.name.localeCompare(b.name));
        });

        return categories;
    }

    private setupEventListeners(): void {
        // Department selection
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            
            if (target.classList.contains('department-item')) {
                const deptId = target.dataset.deptId;
                if (deptId) {
                    this.selectDepartment(deptId);
                    
                    // Update active state
                    document.querySelectorAll('.department-item').forEach(item => {
                        item.classList.remove('active');
                    });
                    target.classList.add('active');
                }
            }
            
            if (target.classList.contains('section-badge')) {
                target.classList.toggle('selected');
            }
            
            if (target.classList.contains('course-select-btn')) {
                const courseId = target.dataset.courseId;
                if (courseId) {
                    this.toggleCourseSelection(courseId);
                }
            }

            if (target.classList.contains('course-remove-btn')) {
                const courseId = target.dataset.courseId;
                if (courseId) {
                    this.courseSelectionService.unselectCourse(courseId);
                }
            }

            if (target.closest('.course-item') && !target.classList.contains('course-select-btn') && !target.classList.contains('section-badge')) {
                const courseItem = target.closest('.course-item') as HTMLElement;
                const courseId = courseItem.dataset.courseId;
                if (courseId) {
                    this.selectCourse(courseId);
                }
            }
        });

        // Search functionality
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.handleSearch(searchInput.value);
            });
        }

        // Clear selection
        const clearButton = document.getElementById('clear-selection');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                this.clearSelection();
            });
        }

        // Schedule navigation
        const scheduleButton = document.getElementById('schedule-btn');
        if (scheduleButton) {
            scheduleButton.addEventListener('click', () => {
                this.switchToPage('schedule');
            });
        }

        // View toggle buttons
        const viewListBtn = document.getElementById('view-list');
        const viewGridBtn = document.getElementById('view-grid');
        
        if (viewListBtn) {
            viewListBtn.addEventListener('click', () => {
                this.setView('list');
            });
        }
        
        if (viewGridBtn) {
            viewGridBtn.addEventListener('click', () => {
                this.setView('grid');
            });
        }
    }

    private selectDepartment(deptId: string): void {
        const department = this.allDepartments.find(d => d.abbreviation === deptId);
        if (!department) return;

        this.selectedDepartment = department;
        this.displayCourses(department.courses);
        
        // Update content header
        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            contentHeader.textContent = `${department.name} Courses`;
        }
    }

    private displayCourses(courses: Course[]): void {
        if (this.currentView === 'grid') {
            this.displayCoursesGrid(courses);
        } else {
            this.displayCoursesList(courses);
        }
    }

    private displayCoursesList(courses: Course[]): void {
        const courseContainer = document.getElementById('course-container');
        if (!courseContainer) return;

        if (courses.length === 0) {
            courseContainer.innerHTML = '<div class="empty-state">No courses found in this department.</div>';
            return;
        }

        // Sort courses by course number
        const sortedCourses = courses.sort((a, b) => a.number.localeCompare(b.number));

        let html = '<div class="course-list">';
        
        sortedCourses.forEach(course => {
            const hasWarning = this.courseHasWarning(course);
            const sections = course.sections.map(s => s.number).filter(Boolean);
            const isSelected = this.courseSelectionService.isCourseSelected(course.id);
            
            html += `
                <div class="course-item ${isSelected ? 'selected' : ''}" data-course-id="${course.id}">
                    <div class="course-header">
                        <button class="course-select-btn ${isSelected ? 'selected' : ''}" data-course-id="${course.id}" title="${isSelected ? 'Remove from selection' : 'Add to selection'}">
                            ${isSelected ? '✓' : '+'}
                        </button>
                        <div class="course-code">${course.department.abbreviation}${course.number}</div>
                        <div class="course-details">
                            <div class="course-name">
                                ${course.name}
                                ${hasWarning ? '<span class="warning-icon">⚠</span>' : ''}
                            </div>
                            <div class="course-sections">
                                ${sections.map(section => 
                                    `<span class="section-badge" data-section="${section}">${section}</span>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        courseContainer.innerHTML = html;
    }

    private displayCoursesGrid(courses: Course[]): void {
        const courseContainer = document.getElementById('course-container');
        if (!courseContainer) return;

        if (courses.length === 0) {
            courseContainer.innerHTML = '<div class="empty-state">No courses found in this department.</div>';
            return;
        }

        // Sort courses by course number
        const sortedCourses = courses.sort((a, b) => a.number.localeCompare(b.number));

        let html = '<div class="course-grid">';
        
        sortedCourses.forEach(course => {
            const hasWarning = this.courseHasWarning(course);
            const isSelected = this.courseSelectionService.isCourseSelected(course.id);
            const credits = course.minCredits === course.maxCredits ? course.minCredits : `${course.minCredits}-${course.maxCredits}`;
            
            html += `
                <div class="course-card ${isSelected ? 'selected' : ''}" data-course-id="${course.id}">
                    <div class="course-card-header">
                        <div class="course-code">${course.department.abbreviation}${course.number}</div>
                        <button class="course-select-btn ${isSelected ? 'selected' : ''}" data-course-id="${course.id}" title="${isSelected ? 'Remove from selection' : 'Add to selection'}">
                            ${isSelected ? '✓' : '+'}
                        </button>
                    </div>
                    <div class="course-title">
                        ${course.name}
                        ${hasWarning ? '<span class="warning-icon">⚠</span>' : ''}
                    </div>
                    <div class="course-info">
                        <span class="course-credits">${credits} credits</span>
                        <span class="course-sections-count">${course.sections.length} section${course.sections.length !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        courseContainer.innerHTML = html;
    }

    private courseHasWarning(course: Course): boolean {
        // Add logic to determine if a course has warnings
        // For now, randomly add warnings to some courses for demo
        return Math.random() > 0.7;
    }

    private handleSearch(query: string): void {
        if (!query.trim()) {
            if (this.selectedDepartment) {
                this.displayCourses(this.selectedDepartment.courses);
            }
            return;
        }

        const allCourses: Course[] = [];
        this.allDepartments.forEach(dept => {
            allCourses.push(...dept.courses);
        });

        const filteredCourses = allCourses.filter(course => 
            course.name.toLowerCase().includes(query.toLowerCase()) ||
            course.number.toLowerCase().includes(query.toLowerCase()) ||
            course.id.toLowerCase().includes(query.toLowerCase())
        );

        this.displayCourses(filteredCourses);
        
        // Update header for search results
        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            contentHeader.textContent = `Search Results (${filteredCourses.length})`;
        }
    }

    private clearSelection(): void {
        // Clear selected sections
        document.querySelectorAll('.section-badge.selected').forEach(badge => {
            badge.classList.remove('selected');
        });

        // Clear search
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        if (searchInput) {
            searchInput.value = '';
        }

        // Reset to default state
        const courseContainer = document.getElementById('course-container');
        if (courseContainer) {
            courseContainer.innerHTML = '<div class="loading-message">Select a department to view courses...</div>';
        }

        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            contentHeader.textContent = 'Course Listings';
        }

        // Clear active department
        document.querySelectorAll('.department-item').forEach(item => {
            item.classList.remove('active');
        });
        this.selectedDepartment = null;
        this.selectedCourse = null;
        this.clearCourseDescription();
        this.displaySelectedCourses();
    }

    private selectCourse(courseId: string): void {
        // Find the course in all departments
        let course: Course | null = null;
        for (const dept of this.allDepartments) {
            course = dept.courses.find(c => c.id === courseId) || null;
            if (course) break;
        }

        if (!course) return;

        this.selectedCourse = course;
        this.displayCourseDescription(course);
        
        // Update active state for course items
        document.querySelectorAll('.course-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const selectedCourseElement = document.querySelector(`[data-course-id="${courseId}"]`);
        if (selectedCourseElement) {
            selectedCourseElement.classList.add('active');
        }
    }

    private displayCourseDescription(course: Course): void {
        const descriptionContainer = document.getElementById('course-description');
        if (!descriptionContainer) return;

        const html = `
            <div class="course-info">
                <div class="course-title">${course.name}</div>
                <div class="course-code">${course.department.abbreviation}${course.number} (${course.minCredits === course.maxCredits ? course.minCredits : `${course.minCredits}-${course.maxCredits}`} credits)</div>
            </div>
            <div class="course-description-text">${course.description}</div>
        `;

        descriptionContainer.innerHTML = html;
    }

    private clearCourseDescription(): void {
        const descriptionContainer = document.getElementById('course-description');
        if (descriptionContainer) {
            descriptionContainer.innerHTML = '<div class="empty-state">Select a course to view description</div>';
        }
    }

    private displaySelectedCourses(): void {
        const selectedCoursesContainer = document.getElementById('selected-courses-list');
        const countElement = document.getElementById('selected-count');
        
        if (!selectedCoursesContainer || !countElement) return;

        const selectedCourses = this.courseSelectionService.getSelectedCourses();
        
        // Update count
        countElement.textContent = `(${selectedCourses.length})`;

        if (selectedCourses.length === 0) {
            selectedCoursesContainer.innerHTML = '<div class="empty-state">No courses selected yet</div>';
            return;
        }

        // Sort selected courses by department and number
        const sortedCourses = selectedCourses.sort((a, b) => {
            const deptCompare = a.course.department.abbreviation.localeCompare(b.course.department.abbreviation);
            if (deptCompare !== 0) return deptCompare;
            return a.course.number.localeCompare(b.course.number);
        });

        let html = '';
        sortedCourses.forEach(selectedCourse => {
            const course = selectedCourse.course;
            const credits = course.minCredits === course.maxCredits 
                ? `${course.minCredits} credits` 
                : `${course.minCredits}-${course.maxCredits} credits`;

            html += `
                <div class="selected-course-item" data-course-id="${course.id}">
                    <div class="selected-course-info">
                        <div class="selected-course-code">${course.department.abbreviation}${course.number}</div>
                        <div class="selected-course-name">${course.name}</div>
                        <div class="selected-course-credits">${credits}</div>
                    </div>
                    <button class="course-remove-btn" data-course-id="${course.id}" title="Remove from selection">
                        ×
                    </button>
                </div>
            `;
        });

        selectedCoursesContainer.innerHTML = html;
    }

    private toggleCourseSelection(courseId: string): void {
        // Find the course in all departments
        let course: Course | null = null;
        for (const dept of this.allDepartments) {
            course = dept.courses.find(c => c.id === courseId) || null;
            if (course) break;
        }

        if (!course) return;

        const wasSelected = this.courseSelectionService.toggleCourseSelection(course);
        this.updateCourseSelectionUI(courseId, wasSelected);
    }

    private updateCourseSelectionUI(courseId: string, isSelected: boolean): void {
        const courseElement = document.querySelector(`[data-course-id="${courseId}"]`);
        const selectBtn = courseElement?.querySelector('.course-select-btn');
        
        if (courseElement && selectBtn) {
            if (isSelected) {
                courseElement.classList.add('selected');
                selectBtn.textContent = '✓';
                selectBtn.classList.add('selected');
            } else {
                courseElement.classList.remove('selected');
                selectBtn.textContent = '+';
                selectBtn.classList.remove('selected');
            }
        }
    }

    private setupCourseSelectionListener(): void {
        this.courseSelectionService.onSelectionChange((selectedCourses) => {
            console.log(`Selected courses updated: ${selectedCourses.length} courses selected`);
            // Update UI to reflect changes
            this.refreshCourseSelectionUI();
            this.displaySelectedCourses();
        });
    }

    private refreshCourseSelectionUI(): void {
        // Update all course items to reflect current selection state
        document.querySelectorAll('.course-item').forEach(item => {
            const courseId = (item as HTMLElement).dataset.courseId;
            if (courseId) {
                const isSelected = this.courseSelectionService.isCourseSelected(courseId);
                this.updateCourseSelectionUI(courseId, isSelected);
            }
        });
    }

    private setupDataRefreshListener(): void {
        window.addEventListener('data-refreshed', async () => {
            console.log('Data refresh detected, reloading course data...');
            this.showLoadingState();
            await this.loadCourseData();
            this.displayDepartments();
            
            // If we have a selected department, refresh its courses too
            if (this.selectedDepartment) {
                const updatedDept = this.allDepartments.find(d => d.abbreviation === this.selectedDepartment!.abbreviation);
                if (updatedDept) {
                    this.selectedDepartment = updatedDept;
                    this.displayCourses(updatedDept.courses);
                }
            }
        });
    }

    private showLoadingState(): void {
        const departmentList = document.getElementById('department-list');
        if (departmentList) {
            departmentList.innerHTML = '<div class="loading-message">Loading departments...</div>';
        }
    }

    private showErrorMessage(message: string): void {
        const departmentList = document.getElementById('department-list');
        if (departmentList) {
            departmentList.innerHTML = `<div class="error-message">${message}</div>`;
        }
        
        const courseContainer = document.getElementById('course-container');
        if (courseContainer) {
            courseContainer.innerHTML = `<div class="error-message">${message}</div>`;
        }
    }

    // Public methods for easy access to selected courses
    public getSelectedCourses() {
        return this.courseSelectionService.getSelectedCourses();
    }

    public getSelectedCoursesCount(): number {
        return this.courseSelectionService.getSelectedCoursesCount();
    }

    public getCourseSelectionService(): CourseSelectionService {
        return this.courseSelectionService;
    }

    private setView(view: 'list' | 'grid'): void {
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
        
        // Re-render current courses if any are displayed
        if (this.selectedDepartment) {
            this.displayCourses(this.selectedDepartment.courses);
        } else {
            // Check if we're showing search results
            const searchInput = document.getElementById('search-input') as HTMLInputElement;
            if (searchInput?.value.trim()) {
                this.handleSearch(searchInput.value);
            }
        }
    }

    private syncHeaderHeights(): void {
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

    private setupHeaderResizeObserver(): void {
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

    private switchToPage(page: 'planner' | 'schedule'): void {
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
}