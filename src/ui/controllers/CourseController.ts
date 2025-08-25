import { Course, Department } from '../../types/types'
import { CourseSelectionService } from '../../services/CourseSelectionService'
import { FilterService } from '../../services/FilterService'
import { ProgressiveRenderer, ProgressiveRenderOptions } from '../utils/ProgressiveRenderer'
import { CancellationToken } from '../../utils/RequestCancellation'
import { PerformanceMetrics } from '../../utils/PerformanceMetrics'

export class CourseController {
    private allDepartments: Department[] = [];
    private selectedCourse: Course | null = null;
    private courseSelectionService: CourseSelectionService;
    private filterService: FilterService | null = null;
    private elementToCourseMap = new WeakMap<HTMLElement, Course>();
    private progressiveRenderer: ProgressiveRenderer;
    private performanceMetrics: PerformanceMetrics;
    
    // Pagination state
    private allCoursesToDisplay: Course[] = [];
    private displayedCourses: Course[] = [];
    private readonly INITIAL_PAGE_SIZE = 100;
    private currentPageSize: number = this.INITIAL_PAGE_SIZE;
    private hasMore: boolean = false;

    constructor(courseSelectionService: CourseSelectionService) {
        this.courseSelectionService = courseSelectionService;
        
        // Initialize performance metrics
        this.performanceMetrics = new PerformanceMetrics();
        
        // Initialize progressive renderer with performance callbacks
        const renderOptions: ProgressiveRenderOptions = {
            batchSize: 10,
            batchDelay: 16, // 60 FPS
            performanceMetrics: this.performanceMetrics,
            onBatch: (batchIndex, totalBatches, totalCount) => {
                // Update any progress indicators if needed
                console.log(`Rendered batch ${batchIndex}/${totalBatches} (${totalCount} total courses)`);
            },
            onComplete: (totalRendered, totalTime) => {
                console.log(`Progressive rendering complete: ${totalRendered} courses in ${totalTime.toFixed(2)}ms`);
                
                // Log performance insights periodically
                if (Math.random() < 0.1) { // 10% chance to log insights
                    const insights = this.performanceMetrics.getInsights();
                    console.log('Performance insights:', insights.join(', '));
                    
                    // Auto-adjust batch size based on performance
                    const optimalBatchSize = this.performanceMetrics.getOptimalBatchSize(this.progressiveRenderer.getBatchSize());
                    if (optimalBatchSize !== this.progressiveRenderer.getBatchSize()) {
                        console.log(`Adjusting batch size from ${this.progressiveRenderer.getBatchSize()} to ${optimalBatchSize}`);
                        this.progressiveRenderer.setBatchSize(optimalBatchSize);
                    }
                }
            }
        };
        
        this.progressiveRenderer = new ProgressiveRenderer(renderOptions);
    }

    setFilterService(filterService: FilterService): void {
        this.filterService = filterService;
    }

    setAllDepartments(departments: Department[]): void {
        this.allDepartments = departments;
    }

    // Pagination management methods
    private resetPagination(): void {
        this.displayedCourses = [];
        this.currentPageSize = this.INITIAL_PAGE_SIZE;
        this.hasMore = false;
    }

    private setInitialCourses(courses: Course[]): void {
        this.allCoursesToDisplay = courses;
        this.displayedCourses = courses.slice(0, this.INITIAL_PAGE_SIZE);
        this.hasMore = courses.length > this.INITIAL_PAGE_SIZE;
        this.currentPageSize = Math.min(this.INITIAL_PAGE_SIZE, courses.length);
    }

    loadMoreCourses(): void {
        if (!this.hasMore) return;

        const nextBatchStart = this.displayedCourses.length;
        const nextBatchEnd = Math.min(nextBatchStart + this.INITIAL_PAGE_SIZE, this.allCoursesToDisplay.length);
        const nextBatch = this.allCoursesToDisplay.slice(nextBatchStart, nextBatchEnd);
        
        this.displayedCourses.push(...nextBatch);
        this.hasMore = this.displayedCourses.length < this.allCoursesToDisplay.length;
    }

    getRemainingCoursesCount(): number {
        return this.allCoursesToDisplay.length - this.displayedCourses.length;
    }

    hasMoreCourses(): boolean {
        return this.hasMore;
    }

    getSelectedCourse(): Course | null {
        return this.selectedCourse;
    }

    async displayCourses(courses: Course[], currentView: 'list' | 'grid'): Promise<void> {
        return this.displayCoursesWithCancellation(courses, currentView);
    }
    
    async displayCoursesWithCancellation(courses: Course[], currentView: 'list' | 'grid', cancellationToken?: CancellationToken, isLoadMore: boolean = false): Promise<void> {
        // Cancel any existing render operations
        this.progressiveRenderer.cancelCurrentRender();
        
        // Handle pagination setup for initial load
        if (!isLoadMore) {
            this.resetPagination();
            this.setInitialCourses(courses);
        }
        
        // Use displayed courses (paginated) instead of all courses
        const coursesToRender = isLoadMore ? 
            this.allCoursesToDisplay.slice(this.displayedCourses.length - this.INITIAL_PAGE_SIZE) : 
            this.displayedCourses;
        
        if (currentView === 'grid') {
            await this.displayCoursesGrid(coursesToRender, cancellationToken, isLoadMore);
        } else {
            await this.displayCoursesList(coursesToRender, cancellationToken, isLoadMore);
        }
    }

    async displayMoreCourses(currentView: 'list' | 'grid', cancellationToken?: CancellationToken): Promise<void> {
        if (!this.hasMore) return;
        
        const previousCount = this.displayedCourses.length;
        this.loadMoreCourses();
        
        // Get the newly loaded courses
        const newCourses = this.displayedCourses.slice(previousCount);
        
        if (currentView === 'grid') {
            await this.displayCoursesGrid(newCourses, cancellationToken, true);
        } else {
            await this.displayCoursesList(newCourses, cancellationToken, true);
        }
        
        // Update the Load More button
        this.updateLoadMoreButton();
    }

    private async displayCoursesList(courses: Course[], cancellationToken?: CancellationToken, isLoadMore: boolean = false): Promise<void> {
        const courseContainer = document.getElementById('course-container');
        if (!courseContainer) return;

        if (courses.length === 0 && !isLoadMore) {
            courseContainer.innerHTML = '<div class="empty-state">No courses found in this department.</div>';
            return;
        }

        // Sort courses by course number
        const sortedCourses = courses.sort((a, b) => a.number.localeCompare(b.number));

        // Use progressive rendering for better performance
        await this.progressiveRenderer.renderCourseList(
            sortedCourses, 
            this.courseSelectionService, 
            courseContainer,
            this.elementToCourseMap,
            cancellationToken,
            isLoadMore
        );
        
        // Add or update Load More button if not in load more mode
        if (!isLoadMore) {
            this.addLoadMoreButton();
        }
    }

    private async displayCoursesGrid(courses: Course[], cancellationToken?: CancellationToken, isLoadMore: boolean = false): Promise<void> {
        const courseContainer = document.getElementById('course-container');
        if (!courseContainer) return;

        if (courses.length === 0 && !isLoadMore) {
            courseContainer.innerHTML = '<div class="empty-state">No courses found in this department.</div>';
            return;
        }

        // Sort courses by course number
        const sortedCourses = courses.sort((a, b) => a.number.localeCompare(b.number));

        // Use progressive rendering for better performance
        await this.progressiveRenderer.renderCourseGrid(
            sortedCourses, 
            this.courseSelectionService, 
            courseContainer,
            this.elementToCourseMap,
            cancellationToken,
            isLoadMore
        );
        
        // Add or update Load More button if not in load more mode
        if (!isLoadMore) {
            this.addLoadMoreButton();
        }
    }

    private courseHasWarning(course: Course): boolean {
        // Check if ALL sections are fully enrolled (no available options)
        return course.sections.every(section => section.seatsAvailable <= 0);
    }

    handleSearch(query: string, selectedDepartment: Department | null): Course[] {
        const baseCourses = selectedDepartment ? selectedDepartment.courses : this.getAllCourses();
        
        // If we have a FilterService, use it for search and filtering
        if (this.filterService) {
            const results = this.filterService.searchAndFilter(query, baseCourses);
            this.updateSearchHeader(query, results.length, selectedDepartment);
            return results;
        }
        
        // Fallback to simple search if no FilterService
        if (!query.trim()) {
            return baseCourses;
        }

        const filteredCourses = baseCourses.filter(course => 
            course.name.toLowerCase().includes(query.toLowerCase()) ||
            course.number.toLowerCase().includes(query.toLowerCase()) ||
            course.id.toLowerCase().includes(query.toLowerCase())
        );

        this.updateSearchHeader(query, filteredCourses.length, selectedDepartment);
        return filteredCourses;
    }

    // New method to handle courses with filters (no search query)
    handleFilter(selectedDepartment: Department | null): Course[] {
        const baseCourses = selectedDepartment ? selectedDepartment.courses : this.getAllCourses();
        
        if (this.filterService && !this.filterService.isEmpty()) {
            const results = this.filterService.filterCourses(baseCourses);
            this.updateFilterHeader(results.length, selectedDepartment);
            return results;
        }
        
        return baseCourses;
    }

    private getAllCourses(): Course[] {
        const allCourses: Course[] = [];
        this.allDepartments.forEach(dept => {
            allCourses.push(...dept.courses);
        });
        return allCourses;
    }

    private updateSearchHeader(query: string, resultCount: number, selectedDepartment: Department | null): void {
        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            if (query.trim()) {
                contentHeader.textContent = `Search Results (${resultCount})`;
            } else if (selectedDepartment) {
                contentHeader.textContent = `${selectedDepartment.name} (${resultCount})`;
            } else {
                contentHeader.textContent = `All Courses (${resultCount})`;
            }
        }
    }

    private updateFilterHeader(resultCount: number, selectedDepartment: Department | null): void {
        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            let title = selectedDepartment ? selectedDepartment.name : 'All Courses';
            
            if (this.filterService && !this.filterService.isEmpty()) {
                const filterSummary = this.filterService.getFilterSummary();
                title += ` (${resultCount}) - ${filterSummary}`;
            } else {
                title += ` (${resultCount})`;
            }
            
            contentHeader.textContent = title;
        }
    }

    selectCourse(element: HTMLElement): Course | null {
        const course = this.elementToCourseMap.get(element);
        if (!course) return null;

        this.selectedCourse = course;
        this.displayCourseDescription(course);
        
        // Update active state for course items
        document.querySelectorAll('.course-item, .course-card').forEach(item => {
            item.classList.remove('active');
        });
        
        element.classList.add('active');
        return course;
    }

    // Legacy method for backward compatibility
    selectCourseById(courseId: string): Course | null {
        const course = this.courseSelectionService.findCourseById(courseId);
        if (!course) return null;

        // Find the associated element and call selectCourse
        const allElements = document.querySelectorAll('.course-item, .course-card');
        for (const element of allElements) {
            const elementCourse = this.elementToCourseMap.get(element as HTMLElement);
            if (elementCourse?.id === courseId) {
                return this.selectCourse(element as HTMLElement);
            }
        }
        return null;
    }

    async toggleCourseSelection(element: HTMLElement): Promise<boolean> {
        const course = this.elementToCourseMap.get(element);
        if (!course) return false;

        try {
            const result = await this.courseSelectionService.toggleCourseSelection(course);
            const wasSelected = result.success && result.course !== undefined;
            this.updateCourseSelectionUI(element, wasSelected);
            return wasSelected;
        } catch (error) {
            console.error('Error toggling course selection:', error);
            return false;
        }
    }

    // Legacy method for backward compatibility
    async toggleCourseSelectionById(courseId: string): Promise<boolean> {
        const course = this.courseSelectionService.findCourseById(courseId);
        if (!course) return false;

        // Find the associated element and call toggleCourseSelection
        const allElements = document.querySelectorAll('.course-item, .course-card');
        for (const element of allElements) {
            const elementCourse = this.elementToCourseMap.get(element as HTMLElement);
            if (elementCourse?.id === courseId) {
                return await this.toggleCourseSelection(element as HTMLElement);
            }
        }
        return false;
    }

    private updateCourseSelectionUI(element: HTMLElement, isSelected: boolean): void {
        const selectBtn = element.querySelector('.course-select-btn');
        
        if (selectBtn) {
            if (isSelected) {
                element.classList.add('selected');
                selectBtn.textContent = '✓';
                selectBtn.classList.add('selected');
            } else {
                element.classList.remove('selected');
                selectBtn.textContent = '+';
                selectBtn.classList.remove('selected');
            }
        }
    }

    refreshCourseSelectionUI(): void {
        // Update all course items to reflect current selection state
        document.querySelectorAll('.course-item, .course-card').forEach(item => {
            const course = this.elementToCourseMap.get(item as HTMLElement);
            if (course) {
                const isSelected = this.courseSelectionService.isCourseSelected(course);
                this.updateCourseSelectionUI(item as HTMLElement, isSelected);
            }
        });
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

    clearCourseDescription(): void {
        const descriptionContainer = document.getElementById('course-description');
        if (descriptionContainer) {
            descriptionContainer.innerHTML = '<div class="empty-state">Select a course to view description</div>';
        }
    }

    clearCourseSelection(): void {
        this.selectedCourse = null;
        this.clearCourseDescription();
    }

    displaySelectedCourses(): void {
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
                <div class="selected-course-item">
                    <div class="selected-course-info">
                        <div class="selected-course-code">${course.department.abbreviation}${course.number}</div>
                        <div class="selected-course-name">${course.name}</div>
                        <div class="selected-course-credits">${credits}</div>
                    </div>
                    <button class="course-remove-btn" title="Remove from selection">
                        ×
                    </button>
                </div>
            `;
        });

        selectedCoursesContainer.innerHTML = html;

        // Associate remove buttons with Course objects  
        const removeButtons = selectedCoursesContainer.querySelectorAll('.course-remove-btn');
        removeButtons.forEach((button, index) => {
            this.elementToCourseMap.set(button as HTMLElement, sortedCourses[index].course);
        });
    }

    getCourseFromElement(element: HTMLElement): Course | undefined {
        return this.elementToCourseMap.get(element);
    }

    // Load More button management
    private addLoadMoreButton(): void {
        const courseContainer = document.getElementById('course-container');
        if (!courseContainer || !this.hasMore) return;

        // Remove existing load more button
        const existingButton = courseContainer.querySelector('.load-more-button');
        if (existingButton) {
            existingButton.remove();
        }

        if (this.hasMore) {
            const remainingCount = this.getRemainingCoursesCount();
            const loadMoreButton = document.createElement('div');
            loadMoreButton.className = 'load-more-container';
            loadMoreButton.innerHTML = `
                <button class="load-more-button btn btn-secondary">
                    Load ${remainingCount} more courses
                </button>
            `;
            
            courseContainer.appendChild(loadMoreButton);
        }
    }

    private updateLoadMoreButton(): void {
        const loadMoreContainer = document.querySelector('.load-more-container');
        if (!loadMoreContainer) return;

        if (this.hasMore) {
            const remainingCount = this.getRemainingCoursesCount();
            const button = loadMoreContainer.querySelector('.load-more-button');
            if (button) {
                button.textContent = `Load ${remainingCount} more courses`;
            }
        } else {
            loadMoreContainer.remove();
        }
    }
}