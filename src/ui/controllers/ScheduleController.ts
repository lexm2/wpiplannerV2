import { DayOfWeek, Course, Section } from '../../types/types'
import { CourseSelectionService } from '../../services/CourseSelectionService'
import { ScheduleFilterService } from '../../services/ScheduleFilterService'
import { ScheduleManagementService } from '../../services/ScheduleManagementService'
import { SectionInfoModalController } from './SectionInfoModalController'
import { ScheduleFilterModalController } from './ScheduleFilterModalController'
import { TimeUtils } from '../utils/timeUtils'
import { ConflictDetector } from '../../core/ConflictDetector'
import { getComputedTerm, validateSelectedCourses } from '../../utils/typeGuards'

export class ScheduleController {
    private courseSelectionService: CourseSelectionService;
    private scheduleFilterService: ScheduleFilterService | null = null;
    private scheduleManagementService: ScheduleManagementService | null = null;
    private scheduleFilterModalController: ScheduleFilterModalController | null = null;
    private sectionInfoModalController: SectionInfoModalController | null = null;
    private conflictDetector: ConflictDetector | null = null;
    private elementToCourseMap = new WeakMap<HTMLElement, Course>();
    private containerEventListeners = new Map<HTMLElement, EventListener>();
    private statePreserver?: { 
        preserve: () => Map<string, boolean>, 
        restore: (states: Map<string, boolean>) => void 
    };

    constructor(courseSelectionService: CourseSelectionService) {
        this.courseSelectionService = courseSelectionService;
    }

    setSectionInfoModalController(sectionInfoModalController: SectionInfoModalController): void {
        this.sectionInfoModalController = sectionInfoModalController;
    }

    setConflictDetector(conflictDetector: ConflictDetector): void {
        this.conflictDetector = conflictDetector;
        
        // If we already have ScheduleFilterService, update it with ConflictDetector
        if (this.scheduleFilterService) {
            this.scheduleFilterService.setConflictDetector(conflictDetector);
        }
    }

    setScheduleFilterService(scheduleFilterService: ScheduleFilterService): void {
        this.scheduleFilterService = scheduleFilterService;
        
        // If we already have ConflictDetector, pass it to the service
        if (this.conflictDetector) {
            this.scheduleFilterService.setConflictDetector(this.conflictDetector);
        }
        
        // Set up filter change listener to refresh display
        this.scheduleFilterService.addEventListener(() => {
            this.applyFiltersAndRefresh();
        });
    }

    setScheduleFilterModalController(scheduleFilterModalController: ScheduleFilterModalController): void {
        this.scheduleFilterModalController = scheduleFilterModalController;
    }

    setScheduleManagementService(scheduleManagementService: ScheduleManagementService): void {
        this.scheduleManagementService = scheduleManagementService;
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
        
        if (!selectedCoursesContainer || !countElement) {
            console.log('❌ Missing DOM elements - selectedCoursesContainer or countElement not found');
            return;
        }

        // Preserve dropdown states before refresh
        const dropdownStates = this.statePreserver?.preserve();

        let selectedCourses = this.courseSelectionService.getSelectedCourses();
        
        // Get filtered sections if filter service is available
        let filteredSections: Array<{course: any, section: any}> = [];
        let hasActiveFilters = false;
        
        if (this.scheduleFilterService && !this.scheduleFilterService.isEmpty()) {
            filteredSections = this.scheduleFilterService.filterSections(selectedCourses);
            hasActiveFilters = true;
            console.log(`🔎 Filters active: ${filteredSections.length} sections match filters`);
        }
        
        if (selectedCourses.length === 0) {
            console.log('⚠️ Early return: 0 selected courses - displaying empty state');
            countElement.textContent = '(0)';
            selectedCoursesContainer.innerHTML = '<div class="empty-state">No courses selected yet</div>';
            return;
        }

        if (hasActiveFilters && filteredSections.length === 0) {
            console.log('⚠️ Early return: 0 sections match active filters - displaying empty state');
            countElement.textContent = '(0 sections match filters)';
            selectedCoursesContainer.innerHTML = '<div class="empty-state">No sections match the current filters</div>';
            return;
        }

        let html = '';
        
        if (hasActiveFilters) {
            // Display filtered sections
            html = this.buildFilteredSectionsHTML(filteredSections, selectedCourses, dropdownStates);
            
            // Update count to show section matches
            const uniqueCourses = new Set(filteredSections.map(fs => fs.course.course.id)).size;
            countElement.textContent = `(${filteredSections.length} sections in ${uniqueCourses} courses)`;
        } else {
            // Display all courses normally when no filters are active
            const sortedCourses = selectedCourses.sort((a, b) => {
                const deptCompare = a.course.department.abbreviation.localeCompare(b.course.department.abbreviation);
                if (deptCompare !== 0) return deptCompare;
                return a.course.number.localeCompare(b.course.number);
            });
            
            html = this.buildAllCoursesHTML(sortedCourses);
            countElement.textContent = `(${selectedCourses.length})`;
        }

        selectedCoursesContainer.innerHTML = html;

        // Set up DOM element mapping for course association
        if (!hasActiveFilters) {
            const sortedCourses = selectedCourses.sort((a, b) => {
                const deptCompare = a.course.department.abbreviation.localeCompare(b.course.department.abbreviation);
                if (deptCompare !== 0) return deptCompare;
                return a.course.number.localeCompare(b.course.number);
            });
            this.setupDOMElementMapping(selectedCoursesContainer, sortedCourses);
        } else {
            // For filtered view, we need to set up mapping differently
            this.setupFilteredDOMElementMapping(selectedCoursesContainer, filteredSections);
        }

        // Restore dropdown states after refresh
        if (dropdownStates) {
            this.statePreserver?.restore(dropdownStates);
        }

        // Log how many schedule-course-items were created
        const courseItemCount = selectedCoursesContainer.querySelectorAll('.schedule-course-item').length;
    }
    
    private buildFilteredSectionsHTML(filteredSections: Array<{course: any, section: any}>, selectedCourses: any[], dropdownStates?: Map<string, boolean>): string {
        // Group filtered sections by course
        const sectionsByCourse = new Map();
        
        filteredSections.forEach(fs => {
            const courseId = fs.course.course.id;
            if (!sectionsByCourse.has(courseId)) {
                sectionsByCourse.set(courseId, {
                    selectedCourse: fs.course,
                    sections: []
                });
            }
            sectionsByCourse.get(courseId).sections.push(fs.section);
        });
        
        let html = '';
        
        // Sort courses by department and number
        const sortedEntries = Array.from(sectionsByCourse.entries()).sort((a, b) => {
            const courseA = a[1].selectedCourse.course;
            const courseB = b[1].selectedCourse.course;
            const deptCompare = courseA.department.abbreviation.localeCompare(courseB.department.abbreviation);
            if (deptCompare !== 0) return deptCompare;
            return courseA.number.localeCompare(courseB.number);
        });
        
        sortedEntries.forEach(([courseId, data]) => {
            const selectedCourse = data.selectedCourse;
            const matchingSections = data.sections;
            const course = selectedCourse.course;
            
            // Determine if this course should be expanded
            // Default to expanded when filtering (so users can see the results)
            // But preserve any explicit state from previous interactions
            const isExpanded = dropdownStates?.has(course.id) ? dropdownStates.get(course.id)! : true;
            
            html += this.buildCourseHeaderHTML(course, selectedCourse, isExpanded);
            
            html += '<div class="schedule-sections-container">';
            
            // Group sections by term
            const sectionsByTerm: any = {};
            matchingSections.forEach((section: any) => {
                if (!sectionsByTerm[section.computedTerm]) {
                    sectionsByTerm[section.computedTerm] = [];
                }
                sectionsByTerm[section.computedTerm].push({
                    section: section,
                    filteredPeriods: section.periods // Show all periods in the section
                });
            });
            
            const terms = Object.keys(sectionsByTerm).sort();
            terms.forEach((term: string) => {
                html += `<div class="term-sections" data-term="${term}">`;
                html += `<div class="term-label">${term} Term</div>`;
                
                sectionsByTerm[term].forEach((sectionData: any) => {
                    const section = sectionData.section;
                    const filteredPeriods = sectionData.filteredPeriods;
                    const isSelected = selectedCourse.selectedSectionNumber === section.number;
                    const selectedClass = isSelected ? 'selected' : '';
                    
                    html += `
                        <div class="section-option ${selectedClass} filtered-section" data-section="${section.number}">
                            <div class="section-info">
                                <div class="section-number">${section.number}</div>
                                <div class="section-periods">`;
                    
                    // Sort filtered periods by type priority
                    const sortedPeriods = [...filteredPeriods].sort((a: any, b: any) => {
                        const typePriority = (type: string) => {
                            const lower = type.toLowerCase();
                            if (lower.includes('lec') || lower.includes('lecture')) return 1;
                            if (lower.includes('lab')) return 2;
                            if (lower.includes('dis') || lower.includes('discussion') || lower.includes('rec')) return 3;
                            return 4;
                        };
                        return typePriority(a.type) - typePriority(b.type);
                    });
                    
                    // Display only the filtered periods (highlighted)
                    sortedPeriods.forEach((period: any) => {
                        const timeRange = TimeUtils.formatTimeRange(period.startTime, period.endTime);
                        const days = TimeUtils.formatDays(period.days);
                        const periodTypeLabel = this.getPeriodTypeLabel(period.type);
                        
                        html += `
                            <div class="period-info highlighted-period" data-period-type="${period.type.toLowerCase()}">
                                <div class="period-header">
                                    <span class="period-type-label">${periodTypeLabel}</span>
                                    <span class="period-schedule">${days} ${timeRange}</span>
                                </div>
                            </div>
                        `;
                    });
                    
                    html += `
                                </div>
                            </div>
                            <button class="section-select-btn ${selectedClass}" data-section="${section.number}">
                                ${isSelected ? '✓' : '+'}
                            </button>
                        </div>
                    `;
                });
                
                html += '</div>';
            });
            
            html += '</div></div>';
        });
        
        return html;
    }
    
    private buildCourseHeaderHTML(course: any, selectedCourse: any, isExpanded: boolean = false): string {
        const credits = course.minCredits === course.maxCredits 
            ? `${course.minCredits} credits` 
            : `${course.minCredits}-${course.maxCredits} credits`;
        
        const expansionClass = isExpanded ? 'expanded' : 'collapsed';
            
        return `
            <div class="schedule-course-item ${expansionClass}">
                <div class="schedule-course-header dropdown-trigger">
                    <div class="schedule-course-info">
                        <div class="schedule-course-code">${course.department.abbreviation}${course.number}</div>
                        <div class="schedule-course-name">${course.name}</div>
                        <div class="schedule-course-credits">${credits}</div>
                    </div>
                    <div class="header-controls">
                        <span class="dropdown-arrow">▼</span>
                        <button class="course-remove-btn" title="Remove from selection">
                            ×
                        </button>
                    </div>
                </div>
        `;
    }
    
    private buildAllCoursesHTML(sortedCourses: any[]): string {
        let html = '';
        
        sortedCourses.forEach(selectedCourse => {
            const course = selectedCourse.course;
            
            html += this.buildCourseHeaderHTML(course, selectedCourse);
            
            // Group sections by term
            const sectionsByTerm: { [term: string]: typeof course.sections } = {};
            course.sections.forEach((section: Section) => {
                if (!sectionsByTerm[section.computedTerm]) {
                    sectionsByTerm[section.computedTerm] = [];
                }
                sectionsByTerm[section.computedTerm].push(section);
            });

            html += '<div class="schedule-sections-container">';

            // Display sections grouped by term
            const terms = Object.keys(sectionsByTerm).sort();
            terms.forEach(term => {
                html += `<div class="term-sections" data-term="${term}">`;
                html += `<div class="term-label">${term} Term</div>`;
                
                sectionsByTerm[term].forEach((section: Section) => {
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
                            </div>
                        `;
                    });
                    
                    html += `
                                </div>
                            </div>
                            <button class="section-select-btn ${selectedClass}" data-section="${section.number}">
                                ${isSelected ? '✓' : '+'}
                            </button>
                        </div>
                    `;
                });
                
                html += '</div>';
            });

            html += '</div></div>';
        });
        
        return html;
    }
    
    private setupDOMElementMapping(selectedCoursesContainer: HTMLElement, sortedCourses: any[]): void {
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
    }
    
    private setupFilteredDOMElementMapping(selectedCoursesContainer: HTMLElement, filteredSections: Array<{course: any, section: any}>): void {
        // For filtered view, we need to map elements to courses differently
        const courseElements = selectedCoursesContainer.querySelectorAll('.schedule-course-item');
        const removeButtons = selectedCoursesContainer.querySelectorAll('.course-remove-btn');
        
        // Get unique courses from filtered sections in the same order as displayed
        const uniqueCourses: any[] = [];
        const seenCourseIds = new Set();
        
        filteredSections.forEach(fs => {
            const courseId = fs.course.course.id;
            if (!seenCourseIds.has(courseId)) {
                seenCourseIds.add(courseId);
                uniqueCourses.push(fs.course);
            }
        });
        
        // Sort by department and number (same as display order)
        uniqueCourses.sort((a, b) => {
            const deptCompare = a.course.department.abbreviation.localeCompare(b.course.department.abbreviation);
            if (deptCompare !== 0) return deptCompare;
            return a.course.number.localeCompare(b.course.number);
        });
        
        courseElements.forEach((element, index) => {
            const course = uniqueCourses[index]?.course;
            this.elementToCourseMap.set(element as HTMLElement, course);
        });
        
        removeButtons.forEach((button, index) => {
            const course = uniqueCourses[index]?.course;
            this.elementToCourseMap.set(button as HTMLElement, course);
        });

        // Associate section buttons with their Course objects
        const sectionButtons = selectedCoursesContainer.querySelectorAll('.section-select-btn');
        sectionButtons.forEach(button => {
            const courseItem = button.closest('.schedule-course-item') as HTMLElement;
            if (courseItem) {
                const courseIndex = Array.from(courseElements).indexOf(courseItem);
                if (courseIndex >= 0 && courseIndex < uniqueCourses.length) {
                    const course = uniqueCourses[courseIndex].course;
                    this.elementToCourseMap.set(button as HTMLElement, course);
                }
            }
        });
    }

    async handleSectionSelection(course: Course, sectionNumber: string): Promise<void> {
        const currentSelectedSection = this.courseSelectionService.getSelectedSection(course);
        
        try {
            if (currentSelectedSection === sectionNumber) {
                // Deselect current section
                await this.courseSelectionService.setSelectedSection(course, null);
            } else {
                // Select new section (automatically deselects any previous section)
                await this.courseSelectionService.setSelectedSection(course, sectionNumber);
            }
        } catch (error) {
            console.error('Failed to update section selection:', error);
            // TODO: Show error message to user
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

        // TypeScript assertion to ensure courseItem is HTMLElement
        const validCourseItem = courseItem as HTMLElement;
        const sectionButtons = validCourseItem.querySelectorAll('.section-select-btn');
        const sectionOptions = validCourseItem.querySelectorAll('.section-option');

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
        const rawSelectedCourses = this.courseSelectionService.getSelectedCourses();
        const selectedCourses = validateSelectedCourses(rawSelectedCourses);
        const grids = ['A', 'B', 'C', 'D'];
        
        
        grids.forEach(term => {
            const gridContainer = document.getElementById(`schedule-grid-${term}`);
            if (!gridContainer) return;
            
            // Filter courses for this term - use direct Section object access
            const termCourses = selectedCourses.filter(sc => {
                const computedTerm = getComputedTerm(sc);
                
                if (!computedTerm) {
                    if (sc.selectedSection) {
                        console.warn(`Course ${sc.course.department.abbreviation}${sc.course.number} has invalid section data:`, sc.selectedSection);
                    }
                    return false;
                }
                
                return computedTerm === term;
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
        
        // Clean up existing event listeners before replacing DOM content
        const existingListener = this.containerEventListeners.get(container);
        if (existingListener) {
            container.removeEventListener('click', existingListener);
            this.containerEventListeners.delete(container);
        }
        
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
        
        // Add click event listeners for section blocks
        this.addSectionBlockEventListeners(container);
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
                const startSlot = TimeUtils.timeToGridRowStart(period.startTime);
                const endSlot = TimeUtils.timeToGridRowEnd(period.endTime);
                
                
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
        
        // Calculate how many rows this section should span
        const rowSpan = primarySection.endSlot - primarySection.startSlot;
        const heightInPixels = rowSpan * 30; // 30px per row
        
        
        // Build content for the first section in the slot - simplified to show only course name
        const content = primarySection.isFirstSlot ? `
            <div class="section-block ${hasConflict ? 'conflict' : ''}" 
                 data-course-id="${primarySection.course.course.id}"
                 data-section-number="${primarySection.course.selectedSectionNumber || ''}"
                 data-selected-course-index="${primarySection.courseIndex || 0}"
                 style="
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

    applyFiltersAndRefresh(): void {
        // Refresh the selected courses display with current filters
        this.displayScheduleSelectedCourses();
        
        // Update filter button state
        this.updateScheduleFilterButtonState();
    }

    private updateScheduleFilterButtonState(): void {
        const scheduleFilterButton = document.getElementById('schedule-filter-btn');
        if (scheduleFilterButton && this.scheduleFilterService) {
            const hasActiveFilters = !this.scheduleFilterService.isEmpty();
            const filterCount = this.scheduleFilterService.getFilterCount();
            
            if (hasActiveFilters) {
                scheduleFilterButton.classList.add('active');
                scheduleFilterButton.title = `${filterCount} filter${filterCount === 1 ? '' : 's'} active - Click to modify`;
            } else {
                scheduleFilterButton.classList.remove('active');
                scheduleFilterButton.title = 'Filter selected courses';
            }
        }
    }

    private addSectionBlockEventListeners(container: HTMLElement): void {
        // Remove existing listener for this container if it exists
        const existingListener = this.containerEventListeners.get(container);
        if (existingListener) {
            container.removeEventListener('click', existingListener);
        }
        
        // Create new listener
        const clickListener = (event: Event) => {
            const target = event.target as HTMLElement;
            
            // Find the section block element (might be the target or a parent)
            const sectionBlock = target.closest('.section-block');
            if (!sectionBlock) return;
            
            // Get section information from data attributes
            const courseId = (sectionBlock as HTMLElement).dataset.courseId;
            const sectionNumber = (sectionBlock as HTMLElement).dataset.sectionNumber;
            
            if (courseId && sectionNumber) {
                event.stopPropagation(); // Prevent event bubbling
                this.showSectionInfoModal(courseId, sectionNumber);
            }
        };
        
        // Add new listener and track it
        container.addEventListener('click', clickListener);
        this.containerEventListeners.set(container, clickListener);
    }

    showSectionInfoModal(courseId: string, sectionNumber: string): void {
        if (!this.sectionInfoModalController) {
            console.warn('Section info modal controller not available');
            return;
        }

        // Find the selected course and section
        const selectedCourses = this.courseSelectionService.getSelectedCourses();
        const selectedCourse = selectedCourses.find(sc => sc.course.id === courseId);
        
        if (!selectedCourse || !selectedCourse.selectedSection) {
            console.warn('Course or section not found:', courseId, sectionNumber);
            return;
        }

        const course = selectedCourse.course;
        const section = selectedCourse.selectedSection;

        // Create section data for modal controller
        const sectionData = {
            courseCode: `${course.department.abbreviation}${course.number}`,
            courseName: course.name,
            section: section,
            course: course
        };

        // Show modal using the dedicated controller
        this.sectionInfoModalController.show(sectionData);
    }

}