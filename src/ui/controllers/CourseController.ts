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

    getSelectedCourse(): Course | null {
        return this.selectedCourse;
    }

    async displayCourses(courses: Course[], currentView: 'list' | 'grid'): Promise<void> {
        return this.displayCoursesWithCancellation(courses, currentView);
    }
    
    async displayCoursesWithCancellation(courses: Course[], currentView: 'list' | 'grid', cancellationToken?: CancellationToken): Promise<void> {
        // Cancel any existing render operations
        this.progressiveRenderer.cancelCurrentRender();
        
        if (currentView === 'grid') {
            await this.displayCoursesGrid(courses, cancellationToken);
        } else {
            await this.displayCoursesList(courses, cancellationToken);
        }
    }

    private async displayCoursesList(courses: Course[], cancellationToken?: CancellationToken): Promise<void> {
        const courseContainer = document.getElementById('course-container');
        if (!courseContainer) return;

        if (courses.length === 0) {
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
            cancellationToken
        );
    }

    private async displayCoursesGrid(courses: Course[], cancellationToken?: CancellationToken): Promise<void> {
        const courseContainer = document.getElementById('course-container');
        if (!courseContainer) return;

        if (courses.length === 0) {
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
            cancellationToken
        );
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

    toggleCourseSelection(element: HTMLElement): boolean {
        const course = this.elementToCourseMap.get(element);
        if (!course) return false;

        const wasSelected = this.courseSelectionService.toggleCourseSelection(course);
        this.updateCourseSelectionUI(element, wasSelected);
        return wasSelected;
    }

    // Legacy method for backward compatibility
    toggleCourseSelectionById(courseId: string): boolean {
        const course = this.courseSelectionService.findCourseById(courseId);
        if (!course) return false;

        // Find the associated element and call toggleCourseSelection
        const allElements = document.querySelectorAll('.course-item, .course-card');
        for (const element of allElements) {
            const elementCourse = this.elementToCourseMap.get(element as HTMLElement);
            if (elementCourse?.id === courseId) {
                return this.toggleCourseSelection(element as HTMLElement);
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
}