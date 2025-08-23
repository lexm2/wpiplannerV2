import { Course, Department } from '../../types/types'
import { CourseSelectionService } from '../../services/CourseSelectionService'

export class CourseController {
    private allDepartments: Department[] = [];
    private selectedCourse: Course | null = null;
    private courseSelectionService: CourseSelectionService;

    constructor(courseSelectionService: CourseSelectionService) {
        this.courseSelectionService = courseSelectionService;
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
        // Check if ALL sections are fully enrolled (no available options)
        return course.sections.every(section => section.seatsAvailable <= 0);
    }

    handleSearch(query: string, selectedDepartment: Department | null): Course[] {
        if (!query.trim()) {
            return selectedDepartment ? selectedDepartment.courses : [];
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

        // Update header for search results
        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            contentHeader.textContent = `Search Results (${filteredCourses.length})`;
        }

        return filteredCourses;
    }

    selectCourse(courseId: string): Course | null {
        // Find the course in all departments
        let course: Course | null = null;
        for (const dept of this.allDepartments) {
            course = dept.courses.find(c => c.id === courseId) || null;
            if (course) break;
        }

        if (!course) return null;

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

        return course;
    }

    toggleCourseSelection(courseId: string): boolean {
        // Find the course in all departments
        let course: Course | null = null;
        for (const dept of this.allDepartments) {
            course = dept.courses.find(c => c.id === courseId) || null;
            if (course) break;
        }

        if (!course) return false;

        const wasSelected = this.courseSelectionService.toggleCourseSelection(course);
        this.updateCourseSelectionUI(courseId, wasSelected);
        return wasSelected;
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

    refreshCourseSelectionUI(): void {
        // Update all course items to reflect current selection state
        document.querySelectorAll('.course-item').forEach(item => {
            const courseId = (item as HTMLElement).dataset.courseId;
            if (courseId) {
                const isSelected = this.courseSelectionService.isCourseSelected(courseId);
                this.updateCourseSelectionUI(courseId, isSelected);
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
}