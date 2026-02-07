import { Course, Department, Section } from '../../types/types'
import { CourseSelectionService } from '../../services/selection/CourseSelectionService'
import { CourseFilterService } from '../../services/filtering/CourseFilterService'
import { CourseDataService } from '../../services/data/courseDataService'
import { rateMyProfessorService } from '../../services/external/RateMyProfessorService'
import { ProgressiveRenderer, ProgressiveRenderOptions } from '../utils/ProgressiveRenderer'
import { CancellationToken } from '../../utils/RequestCancellation'
import { PerformanceMetrics } from '../../utils/PerformanceMetrics'
import { getInlineSVG } from '../../utils/iconPaths'
import { Validators } from '../../utils/validators'
import { ProfileStateManager } from '../../core/state/ProfileStateManager'
import { DeviceDetection } from '../../utils/deviceDetection'

// Course listing and interaction management with optimistic UI integration
// Provides progressive rendering for large datasets with instant visual feedback
export class CourseController {
    private allDepartments: Department[] = [];
    private selectedCourse: Course | null = null;
    private courseSelectionService: CourseSelectionService;
    private courseDataService: CourseDataService;
    private filterService: CourseFilterService | null = null;
    private elementToCourseMap = new WeakMap<HTMLElement, Course>();
    private progressiveRenderer: ProgressiveRenderer;
    private performanceMetrics: PerformanceMetrics;

    // Pagination state
    private allCoursesToDisplay: Course[] = [];
    private displayedCourses: Course[] = [];
    private readonly INITIAL_PAGE_SIZE = 100;
    private hasMore: boolean = false;

    // Callbacks
    private onBatchCallback?: () => void;
    private onRenderCompleteCallback?: () => void;

    constructor(courseSelectionService: CourseSelectionService, courseDataService: CourseDataService) {
        this.courseSelectionService = courseSelectionService;
        this.courseDataService = courseDataService;
        
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

                // Call external batch callback if registered
                this.onBatchCallback?.();
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

                // Call external completion callback if registered
                this.onRenderCompleteCallback?.();
            }
        };
        
        this.progressiveRenderer = new ProgressiveRenderer(renderOptions);

        // Initialize selected courses expander
        this.initializeSelectedCoursesExpander();
    }

    setFilterService(filterService: CourseFilterService): void {
        this.filterService = filterService;
    }

    private initializeSelectedCoursesExpander(): void {
        const header = document.getElementById('selected-courses-header');
        const content = document.getElementById('selected-courses-list');
        const chevronContainer = document.getElementById('selected-courses-chevron');

        if (!header || !content || !chevronContainer) return;

        // Inject chevron icon (without adding the chevron-icon class to avoid double rotation)
        chevronContainer.innerHTML = getInlineSVG('CHEVRON_DOWN');

        // Load saved state from localStorage (default: collapsed)
        const savedState = localStorage.getItem('selectedCoursesExpanded');
        const isExpanded = savedState === 'true';

        // Set initial state
        header.setAttribute('aria-expanded', isExpanded.toString());
        if (isExpanded) {
            content.classList.add('expanded');
        }

        // Get backdrop element
        const getBackdrop = (): HTMLElement | null => {
            return document.querySelector('.mobile-backdrop');
        };

        const isMobile = (): boolean => {
            return DeviceDetection.isMobilePhone();
        };

        // Mobile overlay toggle
        const toggleMobileOverlay = () => {
            const backdrop = getBackdrop();
            const isOpen = content.classList.contains('mobile-open');

            if (isOpen) {
                content.classList.remove('mobile-open');
                if (backdrop) {
                    backdrop.classList.remove('active');
                }
            } else {
                content.classList.add('mobile-open');
                if (backdrop) {
                    backdrop.classList.add('active');
                }
            }
        };

        // Desktop expander toggle
        const toggleDesktopExpander = () => {
            const currentState = header.getAttribute('aria-expanded') === 'true';
            const newState = !currentState;

            header.setAttribute('aria-expanded', newState.toString());
            if (newState) {
                content.classList.add('expanded');
            } else {
                content.classList.remove('expanded');
            }

            // Save state to localStorage
            localStorage.setItem('selectedCoursesExpanded', newState.toString());
        };

        // Unified toggle function
        const toggleExpander = () => {
            if (isMobile()) {
                toggleMobileOverlay();
            } else {
                toggleDesktopExpander();
            }
        };

        // Add click handler
        header.addEventListener('click', toggleExpander);

        // Add keyboard handler for accessibility
        header.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleExpander();
            }
        });

        // Handle backdrop clicks to close mobile overlay
        const handleBackdropClick = (e: MouseEvent) => {
            const backdrop = e.target as HTMLElement;
            if (backdrop.classList.contains('mobile-backdrop') && content.classList.contains('mobile-open')) {
                content.classList.remove('mobile-open');
                backdrop.classList.remove('active');
            }
        };

        // Add backdrop listener
        document.addEventListener('click', handleBackdropClick);

        // Handle window resize to clean up state
        window.addEventListener('resize', () => {
            if (!isMobile()) {
                // Switched to desktop - clean up mobile state
                content.classList.remove('mobile-open');
                const backdrop = getBackdrop();
                if (backdrop) {
                    backdrop.classList.remove('active');
                }
            } else {
                // Switched to mobile - clean up desktop state
                content.classList.remove('expanded');
            }
        });
    }

    setAllDepartments(departments: Department[]): void {
        this.allDepartments = departments;
    }

    // Pagination management methods
    private resetPagination(): void {
        this.displayedCourses = [];
        this.hasMore = false;
    }

    private setInitialCourses(courses: Course[]): void {
        this.allCoursesToDisplay = courses;
        this.displayedCourses = courses.slice(0, this.INITIAL_PAGE_SIZE);
        this.hasMore = courses.length > this.INITIAL_PAGE_SIZE;
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

        // Only sort by course number when not searching
        // When searching, preserve relevance ranking from SearchService
        const displayCourses = (this.filterService && this.filterService.hasFilter('searchText'))
            ? courses
            : courses.sort((a, b) => a.number.localeCompare(b.number));

        // Use progressive rendering for better performance
        await this.progressiveRenderer.renderCourseList(
            displayCourses,
            this.courseSelectionService,
            courseContainer,
            this.elementToCourseMap,
            cancellationToken,
            isLoadMore
        );
        
        // Always add Load More button if there are more courses
        this.addLoadMoreButton();
    }

    private async displayCoursesGrid(courses: Course[], cancellationToken?: CancellationToken, isLoadMore: boolean = false): Promise<void> {
        const courseContainer = document.getElementById('course-container');
        if (!courseContainer) return;

        if (courses.length === 0 && !isLoadMore) {
            courseContainer.innerHTML = '<div class="empty-state">No courses found in this department.</div>';
            return;
        }

        // Only sort by course number when not searching
        // When searching, preserve relevance ranking from SearchService
        const displayCourses = (this.filterService && this.filterService.hasFilter('searchText'))
            ? courses
            : courses.sort((a, b) => a.number.localeCompare(b.number));

        // Use progressive rendering for better performance
        await this.progressiveRenderer.renderCourseGrid(
            displayCourses,
            this.courseSelectionService,
            courseContainer,
            this.elementToCourseMap,
            cancellationToken,
            isLoadMore
        );
        
        // Always add Load More button if there are more courses
        this.addLoadMoreButton();
    }

    handleSearch(query: string, selectedDepartment: Department | null): Course[] {
        const baseCourses = selectedDepartment ? selectedDepartment.courses : this.getAllCourses();
        
        // If we have a FilterService, use it for search and filtering
        if (this.filterService) {
            // Handle search text filter
            if (query.trim()) {
                this.filterService.addFilter('searchText', { query: query.trim() });
            } else {
                this.filterService.removeFilter('searchText');
            }
            
            const results = this.filterService.filterCourses(baseCourses);
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


    toggleCourseSelection(element: HTMLElement): void {
        const course = this.elementToCourseMap.get(element);
        if (!course) return;

        const wasSelected = this.courseSelectionService.isCourseSelected(course);

        this.updateCourseUIById(course.id, !wasSelected);

        this.courseSelectionService.toggleCourseSelection(course)
            .then(result => {
                if (!result.success) {
                    this.updateCourseUIById(course.id, wasSelected);
                }
            })
            .catch(error => {
                console.error('Error toggling course selection:', error);
                this.updateCourseUIById(course.id, wasSelected);
            });
    }


    private updateCourseSelectionUI(element: HTMLElement, isSelected: boolean): void {
        const selectBtn = element.querySelector('.course-select-btn');

        if (selectBtn) {
            selectBtn.innerHTML = isSelected
                ? getInlineSVG('CHECK', 'check-icon')
                : getInlineSVG('PLUS', 'plus-icon');

            if (isSelected) {
                element.classList.add('selected');
                selectBtn.classList.add('selected');
            } else {
                element.classList.remove('selected');
                selectBtn.classList.remove('selected');
            }
        }
    }

    toggleCourseBookmark(element: HTMLElement): void {
        const courseId = element.dataset.courseId;
        if (!courseId) return;

        const stateManager = ProfileStateManager.getInstance();
        const wasBookmarked = stateManager.isBookmarked(courseId);

        try {
            // Show immediate optimistic feedback
            this.updateCourseBookmarkUI(element, !wasBookmarked);

            // Perform the state change
            if (wasBookmarked) {
                stateManager.unbookmarkCourse(courseId);
            } else {
                stateManager.bookmarkCourse(courseId);
            }
        } catch (error) {
            console.error('Error toggling course bookmark:', error);
            // Rollback optimistic change on error
            this.updateCourseBookmarkUI(element, wasBookmarked);
        }
    }

    private updateCourseBookmarkUI(element: HTMLElement, isBookmarked: boolean): void {
        const bookmarkBtn = element.querySelector('.course-bookmark-btn');
        if (bookmarkBtn) {
            if (isBookmarked) {
                bookmarkBtn.innerHTML = getInlineSVG('BOOKMARK_FILLED', 'bookmark-icon');
                bookmarkBtn.classList.add('bookmarked');
                bookmarkBtn.setAttribute('title', 'Remove bookmark');
            } else {
                bookmarkBtn.innerHTML = getInlineSVG('BOOKMARK', 'bookmark-icon');
                bookmarkBtn.classList.remove('bookmarked');
                bookmarkBtn.setAttribute('title', 'Add bookmark');
            }
        }
    }

    /**
     * Efficiently refresh UI for specific courses using targeted updates (O(k) where k = changed courses)
     * @param selectedCourses Array of currently selected courses
     * @param previousSelections Map of previously selected course IDs
     */
    refreshCourseSelectionUI(selectedCourses: any[], previousSelections: Map<string, any>): void {
        const currentIds = new Set(selectedCourses.map(sc => sc.course.id));
        const previousIds = new Set(previousSelections.keys());
        
        // Update UI for newly selected courses
        for (const courseId of currentIds) {
            if (!previousIds.has(courseId)) {
                this.updateCourseUIById(courseId, true);
            }
        }
        
        // Update UI for deselected courses
        for (const courseId of previousIds) {
            if (!currentIds.has(courseId)) {
                this.updateCourseUIById(courseId, false);
            }
        }
    }

    /**
     * Efficiently update UI for a specific course by ID (O(1) operation)
     * Enhanced: Provides instant visual feedback for optimistic UI
     * @param courseId The course ID to update
     * @param isSelected Whether the course is selected
     */
    updateCourseUIById(courseId: string, isSelected: boolean): void {
        // Find all elements with this course ID using direct attribute selector
        const courseElements = document.querySelectorAll(`[data-course-id="${courseId}"]`);
        
        courseElements.forEach(element => {
            this.updateCourseSelectionUI(element as HTMLElement, isSelected);
        });
    }

    /**
     * Update UI for a specific course object (finds elements by course ID)
     * Enhanced: Instant optimistic UI updates
     * @param course The course object to update
     * @param isSelected Whether the course is selected
     * @param showOptimisticFeedback Show pending state indicators
     */
    updateCourseUIByCourse(course: Course, isSelected: boolean): void {
        this.updateCourseUIById(course.id, isSelected);
    }

    private displayCourseDescription(course: Course): void {
        const descriptionContainer = document.getElementById('course-description');
        if (!descriptionContainer) return;

        const isHierarchical = this.courseDataService.isHierarchicalCourse(course);
        const isLabOnly = this.courseDataService.isLabOnlyCourse(course);

        const credits = course.minCredits === course.maxCredits
            ? `${course.minCredits} credits`
            : `${course.minCredits}-${course.maxCredits} credits`;

        let html = `
            <div class="course-info">
                <div class="course-title">${Validators.escapeHtml(course.name)}</div>
                <div class="course-code">${Validators.escapeHtml(course.departmentAbbr)}${Validators.escapeHtml(course.number)} (${credits})</div>
            </div>
            <div class="course-description-text">${Validators.escapeHtml(course.description)}</div>
        `;

        // Add tabs for hierarchical courses
        if (isHierarchical || isLabOnly) {
            html += this.renderComponentTabs(course, isHierarchical, isLabOnly);
        }

        descriptionContainer.innerHTML = html;

        // Attach tab event listeners if hierarchical
        if (isHierarchical || isLabOnly) {
            this.attachTabEventListeners();
        }
    }

    private renderComponentTabs(course: Course, isHierarchical: boolean, isLabOnly: boolean): string {
        let html = '<div class="course-components-section">';
        html += '<div class="component-tabs">';

        // Determine which tabs to show
        const showLectures = isHierarchical;
        const showDiscussions = isHierarchical && this.hasAnyDiscussions(course);
        const showLabs = isHierarchical ? this.hasAnyLabs(course) : isLabOnly;
        const showInterestLists = isHierarchical && this.hasAnyInterestLists(course);

        // Render tab buttons
        if (showLectures) {
            html += '<button class="component-tab active" data-tab="lectures">Lectures</button>';
        }
        if (showDiscussions) {
            html += '<button class="component-tab" data-tab="discussions">Discussions</button>';
        }
        if (showLabs) {
            html += `<button class="component-tab" data-tab="labs">${isLabOnly ? 'Lab Sections' : 'Labs'}</button>`;
        }
        if (showInterestLists) {
            html += '<button class="component-tab" data-tab="interest-lists">Interest Lists</button>';
        }

        html += '</div>'; // end component-tabs

        // Render tab content
        html += '<div class="component-tab-content">';

        if (showLectures) {
            html += this.renderLecturesTab(course);
        }
        if (showDiscussions) {
            html += this.renderDiscussionsTab(course);
        }
        if (showLabs) {
            html += this.renderLabsTab(course, isLabOnly);
        }
        if (showInterestLists) {
            html += this.renderInterestListsTab(course);
        }

        html += '</div>'; // end component-tab-content
        html += '</div>'; // end course-components-section

        return html;
    }

    private renderLecturesTab(course: Course): string {
        // Filter out interest lists - they have their own tab
        const lectures = this.courseDataService.getLecturesForCourse(course)
            .filter(lg => !lg.section.isInterestList);

        let html = '<div class="tab-panel active" data-panel="lectures">';
        html += `<h3>Available Lectures (${lectures.length})</h3>`;
        html += '<div class="sections-list">';

        for (const lectureGroup of lectures) {
            html += this.renderSectionCard(lectureGroup.section, 'Lecture');
        }

        html += '</div></div>';
        return html;
    }

    private renderInterestListsTab(course: Course): string {
        const interestLists = this.courseDataService.getLecturesForCourse(course)
            .filter(lg => lg.section.isInterestList);

        let html = '<div class="tab-panel" data-panel="interest-lists">';
        html += `<h3>Interest Lists (${interestLists.length})</h3>`;
        html += '<div class="sections-list">';

        for (const lectureGroup of interestLists) {
            html += this.renderSectionCard(lectureGroup.section, 'Interest List');
        }

        html += '</div></div>';
        return html;
    }

    private renderDiscussionsTab(course: Course): string {
        const lectures = this.courseDataService.getLecturesForCourse(course);

        let html = '<div class="tab-panel" data-panel="discussions">';
        html += '<h3>Available Discussions by Lecture</h3>';

        for (const lectureGroup of lectures) {
            const discussions = lectureGroup.compatibleDiscussions;
            if (discussions.length === 0) continue;

            html += `<div class="lecture-group">`;
            html += `<h4>Lecture ${Validators.escapeHtml(lectureGroup.section.number)} - ${discussions.length} Discussion(s)</h4>`;
            html += '<div class="sections-list">';

            for (const discussion of discussions) {
                html += this.renderSectionCard(discussion, 'Discussion');
            }

            html += '</div></div>';
        }

        html += '</div>';
        return html;
    }

    private renderLabsTab(course: Course, isLabOnly: boolean): string {
        let html = '<div class="tab-panel" data-panel="labs">';

        if (isLabOnly) {
            const labs = this.courseDataService.getStandaloneLabs(course);
            html += `<h3>Available Lab Sections (${labs.length})</h3>`;
            html += '<div class="sections-list">';

            for (const lab of labs) {
                html += this.renderSectionCard(lab, 'Lab');
            }
        } else {
            const lectures = this.courseDataService.getLecturesForCourse(course);
            html += '<h3>Available Labs by Lecture</h3>';

            for (const lectureGroup of lectures) {
                const labs = lectureGroup.compatibleLabs;
                if (labs.length === 0) continue;

                html += `<div class="lecture-group">`;
                html += `<h4>Lecture ${Validators.escapeHtml(lectureGroup.section.number)} - ${labs.length} Lab(s)</h4>`;
                html += '<div class="sections-list">';

                for (const lab of labs) {
                    html += this.renderSectionCard(lab, 'Lab');
                }

                html += '</div></div>';
            }
        }

        html += '</div></div>';
        return html;
    }

    private renderSectionCard(section: Section, type: string): string {
        const period = section.periods[0];

        // Check if async: either via isAsync flag or by detecting 12:00-12:00 times
        const isAsync = period?.isAsync || (period &&
            period.startTime.hours === 12 && period.startTime.minutes === 0 &&
            period.endTime.hours === 12 && period.endTime.minutes === 0);

        const professor = period?.professor || 'Not Assigned';
        const rmpUrl = professor !== 'Not Assigned' ? rateMyProfessorService.getProfessorRMPUrl(professor) : null;

        const escapedProfessor = Validators.escapeHtml(professor);

        // Build time/location content based on section type
        let timeLocationContent: string;
        if (section.isInterestList) {
            // Interest lists have 12:00-12:00 times but are not async courses
            timeLocationContent = ``;
        } else if (isAsync) {
            timeLocationContent = `
                <div class="section-card-async-badge">
                    ${getInlineSVG('CLOCK', 'async-icon')}
                    Asynchronous
                </div>
            `;
        } else {
            const days = period ? Array.from(period.days).join(', ').toUpperCase() : 'TBA';
            const time = period ? `${period.startTime.displayTime} - ${period.endTime.displayTime}` : 'TBA';
            const location = period?.location || 'TBA';
            timeLocationContent = `
                <div class="section-time">
                    <strong>${Validators.escapeHtml(days)}</strong> ${Validators.escapeHtml(time)}
                </div>
                <div class="section-location">${Validators.escapeHtml(location)}</div>
            `;
        }

        // Hide type and professor for interest lists
        const showType = !section.isInterestList;
        const showProfessor = !section.isInterestList;

        return `
            <div class="section-list-item">
                <div class="section-header">
                    <span class="section-number">${Validators.escapeHtml(section.number)}</span>
                    ${showType ? `<span class="section-type">${Validators.escapeHtml(type)}</span>` : ''}
                    <span class="section-crn">CRN: ${section.crn}</span>
                </div>
                <div class="section-details">
                    ${timeLocationContent}
                    ${showProfessor ? `<div class="section-professor">${rmpUrl ? `<a href="${Validators.escapeHtml(rmpUrl)}" target="_blank" rel="noopener noreferrer" class="professor-link">${escapedProfessor}</a>` : escapedProfessor}</div>` : ''}
                    <div class="section-seats">
                        Seats: ${section.seatsAvailable}/${section.seats} available
                        ${section.actualWaitlist > 0 ? `(Waitlist: ${section.actualWaitlist}/${section.maxWaitlist})` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    private hasAnyDiscussions(course: Course): boolean {
        const lectures = this.courseDataService.getLecturesForCourse(course);
        return lectures.some(lg => lg.compatibleDiscussions.length > 0);
    }

    private hasAnyLabs(course: Course): boolean {
        const lectures = this.courseDataService.getLecturesForCourse(course);
        return lectures.some(lg => lg.compatibleLabs.length > 0);
    }

    private hasAnyInterestLists(course: Course): boolean {
        const lectures = this.courseDataService.getLecturesForCourse(course);
        return lectures.some(lg => lg.section.isInterestList);
    }

    private attachTabEventListeners(): void {
        const tabs = document.querySelectorAll('.component-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const tabName = target.dataset.tab;
                if (!tabName) return;

                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                target.classList.add('active');

                // Update active panel
                const panels = document.querySelectorAll('.tab-panel');
                panels.forEach(p => p.classList.remove('active'));

                const activePanel = document.querySelector(`.tab-panel[data-panel="${tabName}"]`);
                if (activePanel) {
                    activePanel.classList.add('active');
                }
            });
        });
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
            const deptCompare = a.course.departmentAbbr.localeCompare(b.course.departmentAbbr);
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
                <div class="selected-course-item" data-course-id="${Validators.escapeHtml(course.id)}">
                    <div class="selected-course-info">
                        <div class="selected-course-code">${Validators.escapeHtml(course.departmentAbbr)}${Validators.escapeHtml(course.number)}</div>
                        <div class="selected-course-name">${Validators.escapeHtml(course.name)}</div>
                        <div class="selected-course-credits">${credits}</div>
                    </div>
                    <button class="course-remove-btn" title="Remove from selection">
                        ${getInlineSVG('TRASH', 'trash-icon')}
                    </button>
                </div>
            `;
        });

        selectedCoursesContainer.innerHTML = html;

        // Associate selected course items and remove buttons with Course objects
        const selectedCourseItems = selectedCoursesContainer.querySelectorAll('.selected-course-item');
        selectedCourseItems.forEach((item, index) => {
            this.elementToCourseMap.set(item as HTMLElement, sortedCourses[index].course);
        });

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
        const existingButton = courseContainer.querySelector('.load-more-container');
        if (existingButton) {
            existingButton.remove();
        }

        if (this.hasMore) {
            const remainingCount = this.getRemainingCoursesCount();
            const nextBatchSize = Math.min(this.INITIAL_PAGE_SIZE, remainingCount);
            const buttonText = nextBatchSize < this.INITIAL_PAGE_SIZE 
                ? `Load ${remainingCount} more courses` 
                : `Load next ${this.INITIAL_PAGE_SIZE} courses`;
            
            const loadMoreButton = document.createElement('div');
            loadMoreButton.className = 'load-more-container';
            loadMoreButton.innerHTML = `
                <button class="load-more-button btn btn-secondary">
                    ${buttonText}
                </button>
            `;
            
            courseContainer.appendChild(loadMoreButton);
        }
    }

    private updateLoadMoreButton(): void {
        const loadMoreContainer = document.querySelector('.load-more-container');
        
        if (this.hasMore) {
            const remainingCount = this.getRemainingCoursesCount();
            const nextBatchSize = Math.min(this.INITIAL_PAGE_SIZE, remainingCount);
            const buttonText = nextBatchSize < this.INITIAL_PAGE_SIZE 
                ? `Load ${remainingCount} more courses` 
                : `Load next ${this.INITIAL_PAGE_SIZE} courses`;

            if (loadMoreContainer) {
                // Update existing button
                const button = loadMoreContainer.querySelector('.load-more-button');
                if (button) {
                    button.textContent = buttonText;
                }
            } else {
                // Button doesn't exist, add it
                this.addLoadMoreButton();
            }
        } else {
            // No more courses, remove button if it exists
            if (loadMoreContainer) {
                loadMoreContainer.remove();
            }
        }
    }

    isRendering(): boolean {
        return this.progressiveRenderer.isCurrentlyRendering();
    }

    setOnBatchCallback(callback: () => void): void {
        this.onBatchCallback = callback;
    }

    setOnRenderCompleteCallback(callback: () => void): void {
        this.onRenderCompleteCallback = callback;
    }
}