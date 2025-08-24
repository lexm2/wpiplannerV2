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
        
        // Wire up state preservation for dropdown states
        this.scheduleController.setStatePreserver({
            preserve: () => this.preserveDropdownStates(),
            restore: (states) => this.restoreDropdownStates(states)
        });
        
        // Initialize tracking for course changes
        const initialSelectedCourses = this.courseSelectionService.getSelectedCourses();
        this.previousSelectedCoursesCount = initialSelectedCourses.length;
        this.previousSelectedCoursesMap = new Map();
        initialSelectedCourses.forEach(sc => {
            this.previousSelectedCoursesMap.set(sc.course.id, sc.selectedSection);
        });
        
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
            this.courseSelectionService.setAllDepartments(this.allDepartments);
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
                const courseElement = target.closest('.course-item, .course-card') as HTMLElement;
                if (courseElement) {
                    this.courseController.toggleCourseSelection(courseElement);
                }
            }

            if (target.classList.contains('course-remove-btn')) {
                const course = this.courseController.getCourseFromElement(target as HTMLElement);
                if (course) {
                    // Directly remove course (remove button means always unselect)
                    this.courseSelectionService.unselectCourse(course);
                }
            }

            // Handle section-related clicks FIRST (before dropdown logic)
            if (target.classList.contains('section-select-btn')) {
                e.stopPropagation();
                const courseElement = target.closest('.schedule-course-item') as HTMLElement;
                const sectionNumber = target.dataset.section;
                if (courseElement && sectionNumber) {
                    const course = this.scheduleController.getCourseFromElement(courseElement);
                    console.log('MainController - Retrieved course from element:', course);
                    console.log('MainController - Course element:', courseElement);
                    console.log('MainController - Section number:', sectionNumber);
                    if (course) {
                        this.scheduleController.handleSectionSelection(course, sectionNumber);
                    } else {
                        console.error('MainController - No course found for element:', courseElement);
                    }
                }
                return;
            }

            // Prevent dropdown closing for any other section-related clicks
            if (target.classList.contains('section-option') || target.closest('.section-option') ||
                target.classList.contains('section-info') || target.closest('.section-info') ||
                target.classList.contains('section-number') || 
                target.classList.contains('section-schedule') || 
                target.classList.contains('section-professor')) {
                e.stopPropagation();
                e.preventDefault();
                return;
            }

            if (target.classList.contains('dropdown-trigger') || target.closest('.dropdown-trigger')) {
                const triggerElement = target.classList.contains('dropdown-trigger') 
                    ? target 
                    : target.closest('.dropdown-trigger') as HTMLElement;
                    
                if (triggerElement) {
                    // Only trigger dropdown if clicking on course header area (not section-related elements)
                    const shouldToggle = !target.classList.contains('course-remove-btn') && 
                        !target.classList.contains('section-select-btn') &&
                        !target.classList.contains('section-number') && 
                        !target.classList.contains('section-schedule') && 
                        !target.classList.contains('section-professor') &&
                        !target.closest('.section-option') &&
                        !target.closest('.section-info') &&
                        !target.closest('.schedule-sections-container');
                        
                    if (shouldToggle) {
                        this.toggleCourseDropdown(triggerElement);
                    }
                }
            }


            if (target.closest('.course-item, .course-card') && !target.classList.contains('course-select-btn') && !target.classList.contains('section-badge')) {
                const courseElement = target.closest('.course-item, .course-card') as HTMLElement;
                if (courseElement) {
                    this.courseController.selectCourse(courseElement);
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






    private previousSelectedCoursesCount = 0;
    private previousSelectedCoursesMap = new Map<string, string | null>();

    private setupCourseSelectionListener(): void {
        this.courseSelectionService.onSelectionChange((selectedCourses) => {
            const currentCount = selectedCourses.length;
            const isCoursesAddedOrRemoved = currentCount !== this.previousSelectedCoursesCount;
            
            // Create current state map for comparison
            const currentCoursesMap = new Map<string, string | null>();
            selectedCourses.forEach(sc => {
                currentCoursesMap.set(sc.course.id, sc.selectedSection);
            });
            
            // Always update main course UI
            this.courseController.refreshCourseSelectionUI();
            this.courseController.displaySelectedCourses();
            
            if (isCoursesAddedOrRemoved) {
                // Full refresh needed when courses are added/removed
                this.scheduleController.displayScheduleSelectedCourses();
            } else {
                // Check if only section selections changed
                let sectionSelectionsChanged = false;
                for (const [courseId, selectedSection] of currentCoursesMap) {
                    const previousSection = this.previousSelectedCoursesMap.get(courseId);
                    if (previousSection !== selectedSection) {
                        sectionSelectionsChanged = true;
                        // Find the course object and update section buttons
                        const course = this.courseSelectionService.findCourseById(courseId);
                        if (course) {
                            this.scheduleController.updateSectionButtonStates(course, selectedSection);
                        }
                    }
                }
                
                // Update schedule grids if any sections changed
                if (sectionSelectionsChanged && this.uiStateManager.currentPage === 'schedule') {
                    this.scheduleController.renderScheduleGrids();
                }
            }
            
            // Update tracking state
            this.previousSelectedCoursesCount = currentCount;
            this.previousSelectedCoursesMap = new Map(currentCoursesMap);
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

    private toggleCourseDropdown(triggerElement: HTMLElement): void {
        const courseItem = triggerElement.closest('.schedule-course-item');
        if (!courseItem) return;

        const isCollapsed = courseItem.classList.contains('collapsed');
        
        if (isCollapsed) {
            // Expand
            courseItem.classList.remove('collapsed');
            courseItem.classList.add('expanded');
        } else {
            // Collapse
            courseItem.classList.remove('expanded');
            courseItem.classList.add('collapsed');
        }
    }

    private preserveDropdownStates(): Map<string, boolean> {
        const states = new Map<string, boolean>();
        document.querySelectorAll('.schedule-course-item').forEach(item => {
            const course = this.scheduleController.getCourseFromElement(item as HTMLElement);
            if (course) {
                const isExpanded = item.classList.contains('expanded');
                states.set(course.id, isExpanded);
            }
        });
        return states;
    }

    private restoreDropdownStates(states: Map<string, boolean>): void {
        document.querySelectorAll('.schedule-course-item').forEach(item => {
            const course = this.scheduleController.getCourseFromElement(item as HTMLElement);
            if (course && states.has(course.id)) {
                const wasExpanded = states.get(course.id);
                if (wasExpanded) {
                    item.classList.remove('collapsed');
                    item.classList.add('expanded');
                } else {
                    item.classList.remove('expanded');
                    item.classList.add('collapsed');
                }
            }
        });
    }





}