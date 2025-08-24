import { Course, Department } from '../../types/types'
import { CourseSelectionService } from '../../services/CourseSelectionService'
import { FilterService } from '../../services/FilterService'

export class CourseController {
    private allDepartments: Department[] = [];
    private selectedCourse: Course | null = null;
    private courseSelectionService: CourseSelectionService;
    private filterService: FilterService | null = null;
    private elementToCourseMap = new WeakMap<HTMLElement, Course>();

    constructor(courseSelectionService: CourseSelectionService) {
        this.courseSelectionService = courseSelectionService;
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

    displayCourses(courses: Course[], currentView: 'list' | 'grid'): void {
        if (currentView === 'grid') {
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
            const isSelected = this.courseSelectionService.isCourseSelected(course);
            
            html += `
                <div class="course-item ${isSelected ? 'selected' : ''}">
                    <div class="course-header">
                        <button class="course-select-btn ${isSelected ? 'selected' : ''}" title="${isSelected ? 'Remove from selection' : 'Add to selection'}">
                            ${isSelected ? '✓' : '+'}
                        </button>
                        <div class="course-code">${course.department.abbreviation}${course.number}</div>
                        <div class="course-details">
                            <div class="course-name">
                                ${course.name}
                                ${hasWarning ? '<span class="warning-icon">⚠</span>' : ''}
                            </div>
                            <div class="course-sections">
                                ${course.sections.map(section => {
                                    const isFull = section.seatsAvailable <= 0;
                                    return `<span class="section-badge ${isFull ? 'full' : ''}" data-section="${section.number}">${section.number}</span>`;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        courseContainer.innerHTML = html;

        // Associate DOM elements with Course objects
        const courseElements = courseContainer.querySelectorAll('.course-item');
        courseElements.forEach((element, index) => {
            this.elementToCourseMap.set(element as HTMLElement, sortedCourses[index]);
        });
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
            const isSelected = this.courseSelectionService.isCourseSelected(course);
            const credits = course.minCredits === course.maxCredits ? course.minCredits : `${course.minCredits}-${course.maxCredits}`;
            
            html += `
                <div class="course-card ${isSelected ? 'selected' : ''}">
                    <div class="course-card-header">
                        <div class="course-code">${course.department.abbreviation}${course.number}</div>
                        <button class="course-select-btn ${isSelected ? 'selected' : ''}" title="${isSelected ? 'Remove from selection' : 'Add to selection'}">
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

        // Associate DOM elements with Course objects
        const courseElements = courseContainer.querySelectorAll('.course-card');
        courseElements.forEach((element, index) => {
            this.elementToCourseMap.set(element as HTMLElement, sortedCourses[index]);
        });
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