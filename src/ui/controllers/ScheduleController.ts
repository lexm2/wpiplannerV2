import { DayOfWeek, Course } from '../../types/types'
import { CourseSelectionService } from '../../services/CourseSelectionService'
import { TimeUtils } from '../utils/timeUtils'

export class ScheduleController {
    private courseSelectionService: CourseSelectionService;
    private elementToCourseMap = new WeakMap<HTMLElement, Course>();
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
                <div class="schedule-course-item collapsed" >
                    <div class="schedule-course-header dropdown-trigger" >
                        <div class="schedule-course-info">
                            <div class="schedule-course-code">${course.department.abbreviation}${course.number}</div>
                            <div class="schedule-course-name">${course.name}</div>
                            <div class="schedule-course-credits">${credits}</div>
                        </div>
                        <div class="header-controls">
                            <span class="dropdown-arrow">▼</span>
                            <button class="course-remove-btn"  title="Remove from selection">
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
                    const isSelected = selectedCourse.selectedSectionNumber === section.number;
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
                        <div class="section-option ${selectedClass}"  data-section="${section.number}">
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
                            <button class="section-select-btn ${selectedClass}"  data-section="${section.number}">
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

        // Associate DOM elements with Course objects
        const courseElements = selectedCoursesContainer.querySelectorAll('.schedule-course-item');
        const removeButtons = selectedCoursesContainer.querySelectorAll('.course-remove-btn');
        
        courseElements.forEach((element, index) => {
            const course = sortedCourses[index]?.course;
            this.elementToCourseMap.set(element as HTMLElement, course);
        });
        
        removeButtons.forEach((button, index) => {
            const course = sortedCourses[index]?.course;
            this.elementToCourseMap.set(button as HTMLElement, course);
        });

        // IMPORTANT: Associate section buttons with their Course objects
        const sectionButtons = selectedCoursesContainer.querySelectorAll('.section-select-btn');
        sectionButtons.forEach(button => {
            const courseItem = button.closest('.schedule-course-item') as HTMLElement;
            if (courseItem) {
                const courseIndex = Array.from(courseElements).indexOf(courseItem);
                if (courseIndex >= 0 && courseIndex < sortedCourses.length) {
                    const course = sortedCourses[courseIndex].course;
                    this.elementToCourseMap.set(button as HTMLElement, course);
                }
            }
        });

        // Restore dropdown states after refresh
        if (dropdownStates) {
            // Use setTimeout to ensure DOM is fully updated
            setTimeout(() => {
                this.statePreserver?.restore(dropdownStates);
            }, 0);
        }
    }

    handleSectionSelection(course: Course, sectionNumber: string): void {
        const currentSelectedSection = this.courseSelectionService.getSelectedSection(course);
        
        if (currentSelectedSection === sectionNumber) {
            // Deselect current section
            this.courseSelectionService.setSelectedSection(course, null);
        } else {
            // Select new section (automatically deselects any previous section)
            this.courseSelectionService.setSelectedSection(course, sectionNumber);
        }
        
        // Note: UI refresh is handled automatically by the selection change listener
        // No need to call displayScheduleSelectedCourses() here as it would cause duplicate refreshes
    }

    updateSectionButtonStates(course: Course, selectedSection: string | null): void {
        // Find the schedule course item by matching the associated Course object
        let courseItem: HTMLElement | null = null;
        
        document.querySelectorAll('.schedule-course-item').forEach(item => {
            const itemCourse = this.elementToCourseMap.get(item as HTMLElement);
            if (itemCourse && itemCourse.id === course.id) {
                courseItem = item as HTMLElement;
            }
        });
        
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
            
            // Filter courses for this term - use direct Section object access
            const termCourses = selectedCourses.filter(sc => {
                const hasSelectedSection = sc.selectedSection !== null;
                const matchesTerm = hasSelectedSection && sc.selectedSection!.term.toUpperCase().includes(term);
                return hasSelectedSection && matchesTerm;
            });
            
            if (termCourses.length === 0) {
                // Check if there are selected courses without sections for better messaging
                const coursesWithoutSections = selectedCourses.filter(sc => !sc.selectedSection);
                this.renderEmptyGrid(gridContainer, term, coursesWithoutSections.length > 0);
                return;
            }
            
            this.renderPopulatedGrid(gridContainer, termCourses, term);
        });
    }

    private renderEmptyGrid(container: HTMLElement, term: string, hasCoursesWithoutSections: boolean = false): void {
        const message = hasCoursesWithoutSections 
            ? `No sections selected for ${term} term<br><small>Select specific sections in the left panel to see schedule</small>`
            : `No classes scheduled for ${term} term`;
            
        container.innerHTML = `
            <div class="empty-schedule">
                <div class="empty-message">${message}</div>
            </div>
        `;
        container.classList.add('empty');
    }

    private renderPopulatedGrid(container: HTMLElement, courses: any[], term: string): void {
        container.classList.remove('empty');
        
        // Create 5-day (Mon-Fri) × 72 time slot grid (7 AM - 7 PM, 10-min intervals)
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
            const hour = Math.floor(slot / TimeUtils.SLOTS_PER_HOUR) + TimeUtils.START_HOUR;
            const minutes = (slot % TimeUtils.SLOTS_PER_HOUR) * 10;
            const timeLabel = minutes === 0 ? TimeUtils.formatTime({ hours: hour, minutes: 0, displayTime: '' }) : '';
            
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
        // Find all sections that occupy this cell
        const occupyingSections: any[] = [];
        
        for (const selectedCourse of courses) {
            if (!selectedCourse.selectedSection) {
                continue;
            }
            
            const section = selectedCourse.selectedSection;
            
            // Check if this section has any period that occupies this time slot on this day
            const periodsOnThisDay = section.periods.filter((period: any) => period.days.has(day));
            
            let sectionOccupiesSlot = false;
            let sectionStartSlot = Infinity;
            let sectionEndSlot = -1;
            let isFirstSlot = false;
            
            for (const period of periodsOnThisDay) {
                const startSlot = TimeUtils.timeToGridRow(period.startTime);
                const endSlot = TimeUtils.timeToGridRow(period.endTime);
                
                if (timeSlot >= startSlot && timeSlot < endSlot) {
                    sectionOccupiesSlot = true;
                    sectionStartSlot = Math.min(sectionStartSlot, startSlot);
                    sectionEndSlot = Math.max(sectionEndSlot, endSlot);
                    
                }
            }
            
            if (sectionOccupiesSlot) {
                // Check if this is the first slot for this section on this day
                isFirstSlot = timeSlot === sectionStartSlot;
                
                occupyingSections.push({
                    course: selectedCourse,
                    section,
                    periodsOnThisDay,
                    startSlot: sectionStartSlot,
                    endSlot: sectionEndSlot,
                    isFirstSlot
                });
            }
        }
        
        if (occupyingSections.length === 0) {
            return { content: '', classes: '' };
        }
        
        // Check for conflicts
        const hasConflict = occupyingSections.length > 1;
        const primarySection = occupyingSections[0];
        const courseColor = this.getCourseColor(primarySection.course.course.id);
        
        // Build content for the first section in the slot
        const content = primarySection.isFirstSlot ? `
            <div class="section-block ${hasConflict ? 'conflict' : ''}" style="background-color: ${courseColor}">
                <div class="section-header">
                    <div class="course-title">${primarySection.course.course.department.abbreviation}${primarySection.course.course.number}</div>
                    <div class="section-number">${primarySection.section.number}</div>
                </div>
                <div class="section-periods">
                    ${this.formatSectionPeriods(primarySection.periodsOnThisDay)}
                </div>
                <div class="section-enrollment">
                    ${primarySection.section.seatsAvailable}/${primarySection.section.seats} seats
                </div>
                ${hasConflict ? '<div class="conflict-indicator">⚠ Conflict</div>' : ''}
            </div>
        ` : `<div class="section-continuation ${hasConflict ? 'conflict' : ''}"></div>`;
        
        const classes = `occupied ${primarySection.isFirstSlot ? 'section-start' : 'section-continuation'} ${hasConflict ? 'has-conflict' : ''}`;
        
        return { content, classes };
    }

    private formatSectionPeriods(periods: any[]): string {
        if (periods.length === 0) return '';
        
        // Group periods by type and format them
        const periodsByType: { [type: string]: any[] } = {};
        
        for (const period of periods) {
            const periodType = this.getPeriodTypeLabel(period.type);
            if (!periodsByType[periodType]) {
                periodsByType[periodType] = [];
            }
            periodsByType[periodType].push(period);
        }
        
        // Create formatted list of periods
        const periodStrings: string[] = [];
        
        // Sort by priority: Lecture, Lab, Discussion, etc.
        const typeOrder = ['LEC', 'LAB', 'DIS', 'REC', 'SEM', 'STU', 'CONF'];
        const sortedTypes = Object.keys(periodsByType).sort((a, b) => {
            const indexA = typeOrder.indexOf(a);
            const indexB = typeOrder.indexOf(b);
            const priorityA = indexA === -1 ? 999 : indexA;
            const priorityB = indexB === -1 ? 999 : indexB;
            return priorityA - priorityB;
        });
        
        for (const type of sortedTypes) {
            const periodsOfType = periodsByType[type];
            const timeRanges = periodsOfType.map(p => 
                TimeUtils.formatTimeRange(p.startTime, p.endTime)
            ).join(', ');
            
            periodStrings.push(`<div class="period-type-info">
                <span class="period-type">${type}</span>
                <span class="period-times">${timeRanges}</span>
            </div>`);
        }
        
        return periodStrings.join('');
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

    getCourseFromElement(element: HTMLElement): Course | undefined {
        return this.elementToCourseMap.get(element);
    }

}