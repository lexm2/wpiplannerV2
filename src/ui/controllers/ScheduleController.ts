import { DayOfWeek } from '../../types/types'
import { CourseSelectionService } from '../../services/CourseSelectionService'
import { TimeUtils } from '../utils/timeUtils'

export class ScheduleController {
    private courseSelectionService: CourseSelectionService;
    private statePreserver?: { 
        preserve: () => Map<string, boolean>, 
        restore: (states: Map<string, boolean>) => void 
    };

    constructor(courseSelectionService: CourseSelectionService) {
        this.courseSelectionService = courseSelectionService;
    }

    setStatePreserver(statePreserver: { 
        preserve: () => Map<string, boolean>, 
        restore: (states: Map<string, boolean>) => void 
    }): void {
        this.statePreserver = statePreserver;
    }

    displayScheduleSelectedCourses(): void {
        const selectedCoursesContainer = document.getElementById('schedule-selected-courses');
        const countElement = document.getElementById('schedule-selected-count');
        
        if (!selectedCoursesContainer || !countElement) return;

        // Preserve dropdown states before refresh
        const dropdownStates = this.statePreserver?.preserve();

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
                <div class="schedule-course-item collapsed" data-course-id="${course.id}">
                    <div class="schedule-course-header dropdown-trigger" data-course-id="${course.id}">
                        <div class="schedule-course-info">
                            <div class="schedule-course-code">${course.department.abbreviation}${course.number}</div>
                            <div class="schedule-course-name">${course.name}</div>
                            <div class="schedule-course-credits">${credits}</div>
                        </div>
                        <div class="header-controls">
                            <span class="dropdown-arrow">▼</span>
                            <button class="course-remove-btn" data-course-id="${course.id}" title="Remove from selection">
                                ×
                            </button>
                        </div>
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
                    
                    // Sort periods by type priority (lecture first, then lab, then discussion)
                    const sortedPeriods = [...section.periods].sort((a, b) => {
                        const typePriority = (type: string) => {
                            const lower = type.toLowerCase();
                            if (lower.includes('lec') || lower.includes('lecture')) return 1;
                            if (lower.includes('lab')) return 2;
                            if (lower.includes('dis') || lower.includes('discussion') || lower.includes('rec')) return 3;
                            return 4;
                        };
                        return typePriority(a.type) - typePriority(b.type);
                    });
                    
                    html += `
                        <div class="section-option ${selectedClass}" data-course-id="${course.id}" data-section="${section.number}">
                            <div class="section-info">
                                <div class="section-number">${section.number}</div>
                                <div class="section-periods">`;
                    
                    // Display all periods for this section
                    sortedPeriods.forEach((period, index) => {
                        const timeRange = TimeUtils.formatTimeRange(period.startTime, period.endTime);
                        const days = TimeUtils.formatDays(period.days);
                        const periodTypeLabel = this.getPeriodTypeLabel(period.type);
                        
                        html += `
                            <div class="period-info" data-period-type="${period.type.toLowerCase()}">
                                <div class="period-header">
                                    <span class="period-type-label">${periodTypeLabel}</span>
                                    <span class="period-schedule">${days} ${timeRange}</span>
                                </div>
                                <div class="period-details">
                                    <span class="period-professor">${period.professor}</span>
                                    ${period.location ? `<span class="period-location">${period.location}</span>` : ''}
                                </div>
                            </div>
                        `;
                    });
                    
                    html += `
                                </div>
                            </div>
                            <button class="section-select-btn ${selectedClass}" data-course-id="${course.id}" data-section="${section.number}">
                                ${isSelected ? '✓' : '+'}
                            </button>
                        </div>
                    `;
                });
                
                html += `</div>`;
            });

            html += `
                    </div>
                </div>
            `;
        });

        selectedCoursesContainer.innerHTML = html;

        // Restore dropdown states after refresh
        if (dropdownStates) {
            // Use setTimeout to ensure DOM is fully updated
            setTimeout(() => {
                this.statePreserver?.restore(dropdownStates);
            }, 0);
        }
    }

    handleSectionSelection(courseId: string, sectionNumber: string): void {
        const currentSelectedSection = this.courseSelectionService.getSelectedSection(courseId);
        
        if (currentSelectedSection === sectionNumber) {
            // Deselect current section
            this.courseSelectionService.setSelectedSection(courseId, null);
        } else {
            // Select new section (automatically deselects any previous section)
            this.courseSelectionService.setSelectedSection(courseId, sectionNumber);
        }
        
        // Note: UI refresh is handled automatically by the selection change listener
        // No need to call displayScheduleSelectedCourses() here as it would cause duplicate refreshes
    }

    updateSectionButtonStates(courseId: string, selectedSection: string | null): void {
        // Find the schedule course item specifically (not main course items)
        const courseItem = document.querySelector(`.schedule-course-item[data-course-id="${courseId}"]`);
        if (!courseItem) return;

        const sectionButtons = courseItem.querySelectorAll('.section-select-btn');
        const sectionOptions = courseItem.querySelectorAll('.section-option');

        sectionButtons.forEach(button => {
            const buttonSection = (button as HTMLElement).dataset.section;
            const isSelected = buttonSection === selectedSection;
            
            // Update button appearance
            if (isSelected) {
                button.classList.add('selected');
                button.textContent = '✓';
            } else {
                button.classList.remove('selected');
                button.textContent = '+';
            }
        });

        sectionOptions.forEach(option => {
            const optionSection = (option as HTMLElement).dataset.section;
            const isSelected = optionSection === selectedSection;
            
            // Update option appearance
            if (isSelected) {
                option.classList.add('selected');
            } else {
                option.classList.remove('selected');
            }
        });
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
        const periodTypeClass = this.getPeriodTypeClass(primaryCourse.period.type);
        const periodTypeLabel = this.getPeriodTypeLabel(primaryCourse.period.type);
        
        const content = primaryCourse.isFirstSlot ? `
            <div class="course-block ${periodTypeClass} ${hasConflict ? 'conflict' : ''}" style="background-color: ${courseColor}">
                <div class="course-header">
                    <div class="course-title">${primaryCourse.course.course.department.abbreviation}${primaryCourse.course.course.number}</div>
                    <div class="period-type-badge">${periodTypeLabel}</div>
                </div>
                <div class="course-time">${TimeUtils.formatTimeRange(primaryCourse.period.startTime, primaryCourse.period.endTime)}</div>
                <div class="course-location">${primaryCourse.period.location}</div>
                <div class="course-professor">${primaryCourse.period.professor}</div>
                ${hasConflict ? '<div class="conflict-indicator">⚠ Conflict</div>' : ''}
            </div>
        ` : `<div class="course-continuation ${periodTypeClass} ${hasConflict ? 'conflict' : ''}"></div>`;
        
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

    private getPeriodTypeLabel(type: string): string {
        const lower = type.toLowerCase();
        
        if (lower.includes('lec') || lower.includes('lecture')) return 'LEC';
        if (lower.includes('lab')) return 'LAB';
        if (lower.includes('dis') || lower.includes('discussion')) return 'DIS';
        if (lower.includes('rec') || lower.includes('recitation')) return 'REC';
        if (lower.includes('sem') || lower.includes('seminar')) return 'SEM';
        if (lower.includes('studio')) return 'STU';
        if (lower.includes('conference') || lower.includes('conf')) return 'CONF';
        
        // Return abbreviated version for unknown types (first 3-4 chars)
        return type.substring(0, Math.min(4, type.length)).toUpperCase();
    }

    private getPeriodTypeClass(type: string): string {
        const lower = type.toLowerCase();
        
        if (lower.includes('lec') || lower.includes('lecture')) return 'period-lecture';
        if (lower.includes('lab')) return 'period-lab';
        if (lower.includes('dis') || lower.includes('discussion')) return 'period-discussion';
        if (lower.includes('rec') || lower.includes('recitation')) return 'period-recitation';
        if (lower.includes('sem') || lower.includes('seminar')) return 'period-seminar';
        if (lower.includes('studio')) return 'period-studio';
        if (lower.includes('conference') || lower.includes('conf')) return 'period-conference';
        
        return 'period-other';
    }
}