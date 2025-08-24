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
        
        console.log('\n=== RENDER SCHEDULE GRIDS ===');
        console.log(`Processing ${selectedCourses.length} selected courses for terms: ${grids.join(', ')}`);
        
        grids.forEach(term => {
            const gridContainer = document.getElementById(`schedule-grid-${term}`);
            if (!gridContainer) return;
            
            // Filter courses for this term - use direct Section object access
            const termCourses = selectedCourses.filter(sc => {
                const hasSelectedSection = sc.selectedSection !== null;
                
                if (!hasSelectedSection) return false;
                
                // Debug: log term matching
                console.log(`  Checking course ${sc.course.department.abbreviation}${sc.course.number} with term "${sc.selectedSection!.term}" against grid term "${term}"`);
                
                // For now, let's put courses in Term A until we understand the term format better
                const matchesTerm = term === 'A';
                
                console.log(`    Match result: ${matchesTerm}`);
                return matchesTerm;
            });
            
            console.log(`Term ${term}: ${termCourses.length} courses`);
            termCourses.forEach(tc => {
                console.log(`  ${tc.course.department.abbreviation}${tc.course.number} (${tc.selectedSection!.periods.length} periods)`);
            });
            
            if (termCourses.length === 0) {
                // Check if there are selected courses without sections for better messaging
                const coursesWithoutSections = selectedCourses.filter(sc => !sc.selectedSection);
                this.renderEmptyGrid(gridContainer, term, coursesWithoutSections.length > 0);
                return;
            }
            
            this.renderPopulatedGrid(gridContainer, termCourses, term);
        });
        
        console.log('=== END RENDER SCHEDULE GRIDS ===\n');
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
        
        // Create 5-day (Mon-Fri) × 24 time slot grid (7 AM - 7 PM, 30-min intervals)
        const weekdays = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
        const timeSlots = TimeUtils.TOTAL_TIME_SLOTS;
        
        let html = '';
        
        // First row: empty time cell + day headers
        html += '<div class="time-label"></div>'; // Empty corner cell
        weekdays.forEach(day => {
            html += `<div class="day-header">${TimeUtils.getDayAbbr(day)}</div>`;
        });
        
        // Time rows: time label + 5 schedule cells
        for (let slot = 0; slot < timeSlots; slot++) {
            const hour = Math.floor(slot / TimeUtils.SLOTS_PER_HOUR) + TimeUtils.START_HOUR;
            const minutes = (slot % TimeUtils.SLOTS_PER_HOUR) * 30;
            const timeLabel = TimeUtils.formatTime({ hours: hour, minutes: minutes, displayTime: '' });
            
            // Time label cell
            html += `<div class="time-label">${timeLabel}</div>`;
            
            // Schedule cells for each day
            weekdays.forEach(day => {
                const cell = this.getCellContent(courses, day, slot);
                html += `<div class="schedule-cell ${cell.classes}" data-day="${day}" data-slot="${slot}" style="position: relative;">${cell.content}</div>`;
            });
        }
        
        container.innerHTML = html;
    }

    private getCellContent(courses: any[], day: DayOfWeek, timeSlot: number): { content: string, classes: string } {
        // Find all sections that occupy this cell
        const occupyingSections: any[] = [];
        
        // Log for a wider range to catch the course times
        const shouldLog = timeSlot < 12 && courses.length > 0; // Log first 6 hours (7:00 AM - 1:00 PM)
        
        if (shouldLog && courses.length > 0) {
            const hour = Math.floor(timeSlot / 2) + 7;
            const minute = (timeSlot % 2) * 30;
            console.log(`\n--- getCellContent: ${day} ${hour}:${minute.toString().padStart(2, '0')} (slot ${timeSlot}) ---`);
            console.log(`Checking ${courses.length} courses for this time slot`);
        }
        
        for (const selectedCourse of courses) {
            if (!selectedCourse.selectedSection) {
                continue;
            }
            
            const section = selectedCourse.selectedSection;
            
            // Check if this section has any period that occupies this time slot on this day
            const periodsOnThisDay = section.periods.filter((period: any) => period.days.has(day));
            
            if (shouldLog && periodsOnThisDay.length > 0) {
                console.log(`  Course ${selectedCourse.course.department.abbreviation}${selectedCourse.course.number} has ${periodsOnThisDay.length} periods on ${day}:`);
                periodsOnThisDay.forEach(p => {
                    console.log(`    ${p.type}: ${p.startTime.hours}:${p.startTime.minutes.toString().padStart(2, '0')}-${p.endTime.hours}:${p.endTime.minutes.toString().padStart(2, '0')}`);
                });
            }
            
            let sectionOccupiesSlot = false;
            let sectionStartSlot = Infinity;
            let sectionEndSlot = -1;
            let isFirstSlot = false;
            
            for (const period of periodsOnThisDay) {
                const startSlot = TimeUtils.timeToGridRowStart(period.startTime);
                const endSlot = TimeUtils.timeToGridRowEnd(period.endTime);
                
                if (shouldLog) {
                    console.log(`    Checking period ${period.type}: slots ${startSlot}-${endSlot} vs current slot ${timeSlot}`);
                }
                
                if (timeSlot >= startSlot && timeSlot < endSlot) {
                    sectionOccupiesSlot = true;
                    sectionStartSlot = Math.min(sectionStartSlot, startSlot);
                    sectionEndSlot = Math.max(sectionEndSlot, endSlot);
                    
                    if (shouldLog) {
                        console.log(`      ✓ MATCHES! Period occupies slot ${timeSlot}`);
                    }
                }
            }
            
            if (sectionOccupiesSlot) {
                // Check if this is the first slot for this section on this day
                isFirstSlot = timeSlot === sectionStartSlot;
                
                if (shouldLog) {
                    console.log(`    Course ${selectedCourse.course.department.abbreviation}${selectedCourse.course.number} occupies slot, isFirstSlot: ${isFirstSlot}`);
                }
                
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
        
        // Calculate how many rows this section should span
        const rowSpan = primarySection.endSlot - primarySection.startSlot;
        const heightInPixels = rowSpan * 30; // 30px per row
        
        console.log(`Course ${primarySection.course.course.department.abbreviation}${primarySection.course.course.number} should span ${rowSpan} rows (${heightInPixels}px) from slot ${primarySection.startSlot} to ${primarySection.endSlot}`);
        
        // Build content for the first section in the slot - simplified to show only course name
        const content = primarySection.isFirstSlot ? `
            <div class="section-block ${hasConflict ? 'conflict' : ''}" style="
                background-color: ${courseColor}; 
                height: ${heightInPixels}px;
                width: 100%;
                position: absolute;
                top: 0;
                left: 0;
                z-index: 10;
                border: 1px solid rgba(0,0,0,0.2);
                border-radius: 3px;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                justify-content: center;
                text-align: center;
                font-weight: bold;
                font-size: 0.8rem;
                color: white;
                text-shadow: 1px 1px 1px rgba(0,0,0,0.3);
                cursor: pointer;
            ">
                ${primarySection.course.course.department.abbreviation}${primarySection.course.course.number}
            </div>
        ` : ``; // Empty for continuation slots - the spanning block covers them
        
        // Only add classes for the first slot (where content actually appears)
        const classes = primarySection.isFirstSlot ? 
            `occupied section-start ${hasConflict ? 'has-conflict' : ''}` :
            ''; // No classes for continuation slots - they should be invisible
        
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