import { DayOfWeek } from '../../types/types'
import { CourseSelectionService } from '../../services/CourseSelectionService'
import { TimeUtils } from '../utils/timeUtils'

export class ScheduleController {
    private courseSelectionService: CourseSelectionService;

    constructor(courseSelectionService: CourseSelectionService) {
        this.courseSelectionService = courseSelectionService;
    }

    displayScheduleSelectedCourses(): void {
        const selectedCoursesContainer = document.getElementById('schedule-selected-courses');
        const countElement = document.getElementById('schedule-selected-count');
        
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

            // Group sections by term
            const sectionsByTerm: { [term: string]: typeof course.sections } = {};
            course.sections.forEach(section => {
                if (!sectionsByTerm[section.term]) {
                    sectionsByTerm[section.term] = [];
                }
                sectionsByTerm[section.term].push(section);
            });

            html += `
                <div class="schedule-course-item" data-course-id="${course.id}">
                    <div class="schedule-course-header">
                        <div class="schedule-course-info">
                            <div class="schedule-course-code">${course.department.abbreviation}${course.number}</div>
                            <div class="schedule-course-name">${course.name}</div>
                            <div class="schedule-course-credits">${credits}</div>
                        </div>
                        <button class="course-remove-btn" data-course-id="${course.id}" title="Remove from selection">
                            ×
                        </button>
                    </div>
                    <div class="schedule-sections-container">
            `;

            // Display sections grouped by term
            const terms = Object.keys(sectionsByTerm).sort();
            terms.forEach(term => {
                html += `<div class="term-sections" data-term="${term}">`;
                html += `<div class="term-label">${term} Term</div>`;
                
                sectionsByTerm[term].forEach(section => {
                    const isSelected = selectedCourse.selectedSection === section.number;
                    const selectedClass = isSelected ? 'selected' : '';
                    
                    // Get primary period for display
                    const primaryPeriod = section.periods[0];
                    if (primaryPeriod) {
                        const timeRange = TimeUtils.formatTimeRange(primaryPeriod.startTime, primaryPeriod.endTime);
                        const days = TimeUtils.formatDays(primaryPeriod.days);
                        
                        html += `
                            <div class="section-option ${selectedClass}" data-course-id="${course.id}" data-section="${section.number}">
                                <div class="section-info">
                                    <div class="section-number">${section.number}</div>
                                    <div class="section-schedule">${days} ${timeRange}</div>
                                    <div class="section-professor">${primaryPeriod.professor}</div>
                                </div>
                                <button class="section-select-btn ${selectedClass}" data-course-id="${course.id}" data-section="${section.number}">
                                    ${isSelected ? '✓' : '+'}
                                </button>
                            </div>
                        `;
                    }
                });
                
                html += `</div>`;
            });

            html += `
                    </div>
                </div>
            `;
        });

        selectedCoursesContainer.innerHTML = html;
    }

    handleSectionSelection(courseId: string, sectionNumber: string): void {
        const currentSelectedSection = this.courseSelectionService.getSelectedSection(courseId);
        
        if (currentSelectedSection === sectionNumber) {
            // Deselect current section
            this.courseSelectionService.setSelectedSection(courseId, null);
        } else {
            // Select new section
            this.courseSelectionService.setSelectedSection(courseId, sectionNumber);
        }
    }

    renderScheduleGrids(): void {
        const selectedCourses = this.courseSelectionService.getSelectedCourses();
        const grids = ['A', 'B', 'C', 'D'];
        
        grids.forEach(term => {
            const gridContainer = document.getElementById(`schedule-grid-${term}`);
            if (!gridContainer) return;
            
            // Filter courses for this term
            const termCourses = selectedCourses.filter(sc => 
                sc.selectedSection && 
                sc.course.sections.some(section => 
                    section.number === sc.selectedSection && 
                    section.term.toUpperCase().includes(term)
                )
            );
            
            if (termCourses.length === 0) {
                this.renderEmptyGrid(gridContainer, term);
                return;
            }
            
            this.renderPopulatedGrid(gridContainer, termCourses, term);
        });
    }

    private renderEmptyGrid(container: HTMLElement, term: string): void {
        container.innerHTML = `
            <div class="empty-schedule">
                <div class="empty-message">No classes scheduled for ${term} term</div>
            </div>
        `;
        container.classList.add('empty');
    }

    private renderPopulatedGrid(container: HTMLElement, courses: any[], term: string): void {
        container.classList.remove('empty');
        
        // Create 5-day (Mon-Fri) × 24 time slot grid (7 AM - 7 PM, 30-min intervals)
        const weekdays = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
        const timeSlots = TimeUtils.TOTAL_TIME_SLOTS;
        
        let html = `
            <div class="schedule-grid-header">
                <div class="time-column-header"></div>
                ${weekdays.map(day => `
                    <div class="day-header">${TimeUtils.getDayAbbr(day)}</div>
                `).join('')}
            </div>
            <div class="schedule-grid-body">
        `;
        
        // Generate time rows
        for (let slot = 0; slot < timeSlots; slot++) {
            const hour = Math.floor(slot / 2) + TimeUtils.START_HOUR;
            const minute = (slot % 2) * 30;
            const timeLabel = slot % 2 === 0 ? TimeUtils.formatTime({ hours: hour, minutes: minute, displayTime: '' }) : '';
            
            html += `
                <div class="schedule-row">
                    <div class="time-label">${timeLabel}</div>
                    ${weekdays.map(day => {
                        const cell = this.getCellContent(courses, day, slot);
                        return `<div class="schedule-cell ${cell.classes}" data-day="${day}" data-slot="${slot}">${cell.content}</div>`;
                    }).join('')}
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;
    }

    private getCellContent(courses: any[], day: DayOfWeek, timeSlot: number): { content: string, classes: string } {
        // Find all courses that occupy this cell
        const occupyingCourses: any[] = [];
        
        for (const selectedCourse of courses) {
            if (!selectedCourse.selectedSection) continue;
            
            const section = selectedCourse.course.sections.find((s: { number: any }) => s.number === selectedCourse.selectedSection);
            if (!section) continue;
            
            for (const period of section.periods) {
                if (!period.days.has(day)) continue;
                
                const startSlot = TimeUtils.timeToGridRow(period.startTime);
                const endSlot = TimeUtils.timeToGridRow(period.endTime);
                
                if (timeSlot >= startSlot && timeSlot < endSlot) {
                    occupyingCourses.push({
                        course: selectedCourse,
                        section,
                        period,
                        startSlot,
                        endSlot,
                        isFirstSlot: timeSlot === startSlot
                    });
                }
            }
        }
        
        if (occupyingCourses.length === 0) {
            return { content: '', classes: '' };
        }
        
        // Check for conflicts
        const hasConflict = occupyingCourses.length > 1;
        const primaryCourse = occupyingCourses[0];
        const courseColor = this.getCourseColor(primaryCourse.course.course.id);
        
        // Build content for the first course in the slot
        const content = primaryCourse.isFirstSlot ? `
            <div class="course-block ${hasConflict ? 'conflict' : ''}" style="background-color: ${courseColor}">
                <div class="course-title">${primaryCourse.course.course.department.abbreviation}${primaryCourse.course.course.number}</div>
                <div class="course-time">${TimeUtils.formatTimeRange(primaryCourse.period.startTime, primaryCourse.period.endTime)}</div>
                <div class="course-location">${primaryCourse.period.location}</div>
                ${hasConflict ? '<div class="conflict-indicator">⚠ Conflict</div>' : ''}
            </div>
        ` : `<div class="course-continuation ${hasConflict ? 'conflict' : ''}"></div>`;
        
        const classes = `occupied ${primaryCourse.isFirstSlot ? 'course-start' : 'course-continuation'} ${hasConflict ? 'has-conflict' : ''}`;
        
        return { content, classes };
    }

    private getCourseColor(courseId: string): string {
        // Generate consistent colors for courses
        const colors = [
            '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336',
            '#00BCD4', '#795548', '#607D8B', '#3F51B5', '#E91E63'
        ];
        
        let hash = 0;
        for (let i = 0; i < courseId.length; i++) {
            hash = courseId.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        return colors[Math.abs(hash) % colors.length];
    }
}