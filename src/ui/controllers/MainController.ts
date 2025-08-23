import { Course, Department } from '../../types/types'
import { CourseDataService } from '../../services/courseDataService'
import { ThemeSelector } from '../components/ThemeSelector'
import { CourseSelectionService } from '../../services/CourseSelectionService'
import { ConflictDetector } from '../../core/ConflictDetector'
import { DepartmentController } from './DepartmentController'
import { CourseController } from './CourseController'
import { ScheduleController } from './ScheduleController'
import { UIStateManager } from './UIStateManager'
import { TimestampManager } from './TimestampManager'

export class MainController {
    private courseDataService: CourseDataService;
    private themeSelector: ThemeSelector;
    private courseSelectionService: CourseSelectionService;
    private conflictDetector: ConflictDetector;
    private departmentController: DepartmentController;
    private courseController: CourseController;
    private scheduleController: ScheduleController;
    private uiStateManager: UIStateManager;
    private timestampManager: TimestampManager;
    private allDepartments: Department[] = [];


    constructor() {
        this.courseDataService = new CourseDataService();
        this.themeSelector = new ThemeSelector();
        this.courseSelectionService = new CourseSelectionService();
        this.conflictDetector = new ConflictDetector();
        this.departmentController = new DepartmentController();
        this.courseController = new CourseController(this.courseSelectionService);
        this.scheduleController = new ScheduleController(this.courseSelectionService);
        this.uiStateManager = new UIStateManager();
        this.timestampManager = new TimestampManager();
        this.init();
    }

    private async init(): Promise<void> {
        this.uiStateManager.showLoadingState();
        await this.loadCourseData();
        this.departmentController.displayDepartments();
        this.setupEventListeners();
        this.setupCourseSelectionListener();
        this.courseController.displaySelectedCourses();
        this.uiStateManager.syncHeaderHeights();
        this.uiStateManager.setupHeaderResizeObserver();
    }

    private async loadCourseData(): Promise<void> {
        try {
            console.log('Loading course data...');
            const scheduleDB = await this.courseDataService.loadCourseData();
            this.allDepartments = scheduleDB.departments;
            this.departmentController.setAllDepartments(this.allDepartments);
            this.courseController.setAllDepartments(this.allDepartments);
            console.log(`Loaded ${this.allDepartments.length} departments`);
            this.timestampManager.updateClientTimestamp();
            this.timestampManager.loadServerTimestamp();
        } catch (error) {
            console.error('Failed to load course data:', error);
            this.uiStateManager.showErrorMessage('Failed to load course data. Please try refreshing the page.');
        }
    }


    private setupEventListeners(): void {
        // Department selection
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            
            if (target.classList.contains('department-item')) {
                const deptId = target.dataset.deptId;
                if (deptId) {
                    const department = this.departmentController.handleDepartmentClick(deptId);
                    if (department) {
                        this.courseController.displayCourses(department.courses, this.uiStateManager.currentView);
                    }
                }
            }
            
            if (target.classList.contains('section-badge')) {
                target.classList.toggle('selected');
            }
            
            if (target.classList.contains('course-select-btn')) {
                const courseId = target.dataset.courseId;
                if (courseId) {
                    this.courseController.toggleCourseSelection(courseId);
                }
            }

            if (target.classList.contains('course-remove-btn')) {
                const courseId = target.dataset.courseId;
                if (courseId) {
                    // Directly remove course (remove button means always unselect)
                    this.courseSelectionService.unselectCourse(courseId);
                }
            }

            if (target.classList.contains('section-select-btn')) {
                const courseId = target.dataset.courseId;
                const sectionNumber = target.dataset.section;
                if (courseId && sectionNumber) {
                    this.scheduleController.handleSectionSelection(courseId, sectionNumber);
                    if (this.uiStateManager.currentPage === 'schedule') {
                        this.scheduleController.renderScheduleGrids();
                    }
                }
            }

            if (target.closest('.course-item') && !target.classList.contains('course-select-btn') && !target.classList.contains('section-badge')) {
                const courseItem = target.closest('.course-item') as HTMLElement;
                const courseId = courseItem.dataset.courseId;
                if (courseId) {
                    this.courseController.selectCourse(courseId);
                }
            }
        });

        // Search functionality
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const filteredCourses = this.courseController.handleSearch(searchInput.value, this.departmentController.getSelectedDepartment());
                this.courseController.displayCourses(filteredCourses, this.uiStateManager.currentView);
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
                this.uiStateManager.togglePage();
                if (this.uiStateManager.currentPage === 'schedule') {
                    this.scheduleController.displayScheduleSelectedCourses();
                    this.scheduleController.renderScheduleGrids();
                }
            });
        }

        // View toggle buttons
        const viewListBtn = document.getElementById('view-list');
        const viewGridBtn = document.getElementById('view-grid');
        
        if (viewListBtn) {
            viewListBtn.addEventListener('click', () => {
                this.uiStateManager.setView('list');
                this.refreshCurrentView();
            });
        }
        
        if (viewGridBtn) {
            viewGridBtn.addEventListener('click', () => {
                this.uiStateManager.setView('grid');
                this.refreshCurrentView();
            });
        }
    }

    private refreshCurrentView(): void {
        const selectedDepartment = this.departmentController.getSelectedDepartment();
        if (selectedDepartment) {
            this.courseController.displayCourses(selectedDepartment.courses, this.uiStateManager.currentView);
        } else {
            // Check if we're showing search results
            const searchInput = document.getElementById('search-input') as HTMLInputElement;
            if (searchInput?.value.trim()) {
                const filteredCourses = this.courseController.handleSearch(searchInput.value, null);
                this.courseController.displayCourses(filteredCourses, this.uiStateManager.currentView);
            }
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

        this.departmentController.clearDepartmentSelection();
        this.courseController.clearCourseSelection();
        this.courseController.displaySelectedCourses();
    }






    private setupCourseSelectionListener(): void {
        this.courseSelectionService.onSelectionChange((selectedCourses) => {
            console.log(`Selected courses updated: ${selectedCourses.length} courses selected`);
            // Update UI to reflect changes
            this.courseController.refreshCourseSelectionUI();
            this.courseController.displaySelectedCourses();
            this.scheduleController.displayScheduleSelectedCourses();
        });
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





}