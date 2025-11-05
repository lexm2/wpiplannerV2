import { DayOfWeek, Course, Section } from '../../types/types'
import { SelectedCourse } from '../../types/schedule'
import { CourseSelectionService } from '../../services/CourseSelectionService'
import { CourseDataService } from '../../services/courseDataService'
import { ScheduleFilterService } from '../../services/ScheduleFilterService'
import { ScheduleManagementService } from '../../services/ScheduleManagementService'
import { SectionInfoModalController } from './SectionInfoModalController'
import { ScheduleFilterModalController } from './ScheduleFilterModalController'
import { ComponentSelectionWizard } from '../components/ComponentSelectionWizard'
import { TimeUtils } from '../utils/timeUtils'
import { ConflictDetector } from '../../core/ConflictDetector'
import { getComputedTerm, validateSelectedCourses } from '../../utils/typeGuards'
import { AutoScheduler } from '../../services/AutoScheduler'
import { ICONS } from '../../utils/iconPaths'

interface WizardSelections {
    lecture: Section | null;
    discussion: Section | null;
    lab: Section | null;
}

export class ScheduleController {
    private courseSelectionService: CourseSelectionService;
    private courseDataService: CourseDataService | null = null;
    private scheduleFilterService: ScheduleFilterService | null = null;
    private sectionInfoModalController: SectionInfoModalController | null = null;
    private conflictDetector: ConflictDetector | null = null;
    private elementToCourseMap = new WeakMap<HTMLElement, Course>();
    private containerEventListeners = new Map<HTMLElement, EventListener>();
    private escapeKeyHandler: ((e: KeyboardEvent) => void) | null = null;
    private componentWizard: ComponentSelectionWizard | null = null;
    private wizardPreviewCourse: Course | null = null;
    private wizardPreviewSelections: WizardSelections | null = null;
    private courseColorMap: Map<string, string> = new Map();
    private usedColors: Set<string> = new Set();

    constructor(courseSelectionService: CourseSelectionService) {
        this.courseSelectionService = courseSelectionService;
        this.setupTermFocusHandlers();
        this.setupColorManagement();
    }

    /**
     * Set up listener to clean up colors when courses are removed
     */
    private setupColorManagement(): void {
        this.courseSelectionService.addSelectionListener((event) => {
            if (event.type === 'course_removed' && event.course) {
                this.releaseCourseColor(event.course.id);
            } else if (event.type === 'selection_cleared') {
                // Clear all color assignments
                this.courseColorMap.clear();
                this.usedColors.clear();
            }
        });
    }

    setCourseDataService(courseDataService: CourseDataService): void {
        this.courseDataService = courseDataService;
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

    setScheduleFilterModalController(_scheduleFilterModalController: ScheduleFilterModalController): void {
        // Intentionally empty - kept for backward compatibility
    }

    setScheduleManagementService(_scheduleManagementService: ScheduleManagementService): void {
        // Intentionally empty - kept for backward compatibility
    }

    /**
     * Open the component selection wizard for a course
     */
    openComponentWizard(course: Course, existingSelections?: any): void {
        if (!this.courseDataService) {
            console.error('CourseDataService not available');
            return;
        }

        // Close any existing wizard
        if (this.componentWizard) {
            this.componentWizard.close();
        }

        // Look up fresh course data from courseDataService to ensure we have the latest structure
        // (the passed course may be from cached localStorage with old structure)
        const freshCourse = this.courseDataService.getAllDepartments()
            .flatMap(d => d.courses)
            .find(c => c.id === course.id);

        if (!freshCourse) {
            console.error('Could not find fresh course data for:', course.id);
            return;
        }

        // Get all currently selected courses for conflict detection context
        const allSelectedCourses = this.courseSelectionService.getSelectedCourses();
        console.log('[ScheduleController] All selected courses:', allSelectedCourses.length);
        allSelectedCourses.forEach(sc => {
            console.log(`  - ${sc.course.department.abbreviation}${sc.course.number}:`, {
                lecture: sc.selectedLecture?.number,
                discussion: sc.selectedDiscussion?.number,
                lab: sc.selectedLab?.number,
                lecturePeriods: sc.selectedLecture?.periods.length,
                discussionPeriods: sc.selectedDiscussion?.periods.length,
                labPeriods: sc.selectedLab?.periods.length
            });
        });

        // Filter out the current course being edited from the context
        // This prevents the wizard from checking conflicts against itself
        const otherSelectedCourses = allSelectedCourses.filter(sc => sc.course.id !== freshCourse.id);
        console.log('[ScheduleController] Other selected courses for conflict checking:', otherSelectedCourses.length);

        // Create new wizard with fresh course data
        this.componentWizard = new ComponentSelectionWizard(
            freshCourse,
            this.courseDataService,
            (selections) => this.onWizardComplete(freshCourse, selections),
            () => this.closeComponentWizard(),
            existingSelections,
            (selections) => this.onWizardSelectionChange(freshCourse, selections),
            this.scheduleFilterService || undefined,
            otherSelectedCourses
        );

        this.componentWizard.open();
    }

    /**
     * Close the component selection wizard
     */
    closeComponentWizard(): void {
        if (this.componentWizard) {
            this.componentWizard.close();
            this.componentWizard = null;
        }

        // Clear preview and re-render calendar
        this.wizardPreviewCourse = null;
        this.wizardPreviewSelections = null;
        this.renderScheduleGrids();
    }

    /**
     * Handle wizard completion - save component selections
     */
    private async onWizardComplete(course: Course, selections: any): Promise<void> {
        // Clear preview first
        this.wizardPreviewCourse = null;
        this.wizardPreviewSelections = null;

        try {
            const result = await this.courseSelectionService.setSelectedComponents(
                course,
                selections.lecture,
                selections.discussion,
                selections.lab
            );

            if (result.success) {
                // Refresh the display to show updated selections
                this.displayScheduleSelectedCourses();
            } else {
                console.error('Failed to save component selections:', result.error);
                alert('Failed to save selections. Please try again.');
            }
        } catch (error) {
            console.error('Error saving component selections:', error);
            alert('An error occurred while saving selections.');
        }

        this.closeComponentWizard();
    }

    /**
     * Handle wizard selection changes - update calendar preview
     */
    private onWizardSelectionChange(course: Course, selections: WizardSelections): void {
        console.log('[Preview] onWizardSelectionChange called');
        console.log('[Preview] Course:', course.department.abbreviation + course.number);
        console.log('[Preview] Selections:', {
            lecture: selections.lecture?.number || null,
            discussion: selections.discussion?.number || null,
            lab: selections.lab?.number || null
        });

        // Debug: Check if lecture has periods with days
        if (selections.lecture) {
            console.log('[Preview] Lecture section:', selections.lecture.number);
            console.log('[Preview] Lecture periods:', selections.lecture.periods?.length);
            if (selections.lecture.periods && selections.lecture.periods.length > 0) {
                const firstPeriod = selections.lecture.periods[0];
                console.log('[Preview] First period days:', Array.from(firstPeriod.days || []));
            }
        }

        // Store preview data
        this.wizardPreviewCourse = course;
        this.wizardPreviewSelections = selections;

        // Re-render calendar with preview
        console.log('[Preview] Calling renderScheduleGrids()');
        this.renderScheduleGrids();
    }

    displayScheduleSelectedCourses(): void {

        const selectedCoursesContainer = document.getElementById('schedule-selected-courses');
        const countElement = document.getElementById('schedule-selected-count');

        if (!selectedCoursesContainer) {
            console.log('❌ Missing DOM element - selectedCoursesContainer not found');
            return;
        }

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
            console.log('Early return: 0 selected courses - displaying empty state');
            if (countElement) {
                countElement.textContent = '(0)';
            }

            // Preserve wizard if open
            const wizardPanel = selectedCoursesContainer.querySelector('.wizard-inline-panel');
            selectedCoursesContainer.innerHTML = '<div class="empty-state">No courses selected yet</div>';
            if (wizardPanel) {
                selectedCoursesContainer.appendChild(wizardPanel);
            }
            return;
        }

        if (hasActiveFilters && filteredSections.length === 0) {
            console.log('Early return: 0 sections match active filters - displaying empty state');
            if (countElement) {
                countElement.textContent = '(0 sections match filters)';
            }

            // Preserve wizard if open
            const wizardPanel = selectedCoursesContainer.querySelector('.wizard-inline-panel');
            selectedCoursesContainer.innerHTML = '<div class="empty-state">No sections match the current filters</div>';
            if (wizardPanel) {
                selectedCoursesContainer.appendChild(wizardPanel);
            }
            return;
        }

        let html = '';

        if (hasActiveFilters) {
            // Display filtered sections
            html = this.buildFilteredSectionsHTML(filteredSections, selectedCourses);

            // Update count to show section matches
            if (countElement) {
                const uniqueCourses = new Set(filteredSections.map(fs => fs.course.course.id)).size;
                countElement.textContent = `(${filteredSections.length} sections in ${uniqueCourses} courses)`;
            }
        } else {
            // Display all courses normally when no filters are active
            const sortedCourses = selectedCourses.sort((a, b) => {
                const deptCompare = a.course.department.abbreviation.localeCompare(b.course.department.abbreviation);
                if (deptCompare !== 0) return deptCompare;
                return a.course.number.localeCompare(b.course.number);
            });

            html = this.buildAllCoursesHTML(sortedCourses);
            if (countElement) {
                countElement.textContent = `(${selectedCourses.length})`;
            }
        }

        // Check if wizard is open before wiping innerHTML
        const wizardPanel = selectedCoursesContainer.querySelector('.wizard-inline-panel');

        selectedCoursesContainer.innerHTML = html;

        // Restore wizard panel if it was open
        if (wizardPanel) {
            selectedCoursesContainer.appendChild(wizardPanel);
        }

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
    }
    
    private buildFilteredSectionsHTML(filteredSections: Array<{course: any, section: any}>, _selectedCourses: any[], dropdownStates?: Map<string, boolean>): string {
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
            const course = selectedCourse.course;

            // Check dropdown state, default to expanded if not specified
            const isExpanded = dropdownStates ? (dropdownStates.get(courseId) ?? true) : true;

            html += this.buildCourseHeaderHTML(course, selectedCourse, isExpanded);
            html += '</div>'; // Close schedule-course-item
        });
        
        return html;
    }
    
    private buildCourseHeaderHTML(course: any, selectedCourse: any, isExpanded: boolean = false): string {
        const credits = course.minCredits === course.maxCredits
            ? `${course.minCredits} credits`
            : `${course.minCredits}-${course.maxCredits} credits`;

        // Build selected components display
        let selectedComponentsHTML = '';
        let warningIconHTML = '';

        if (selectedCourse) {
            const components: string[] = [];
            if (selectedCourse.selectedLecture) {
                components.push(`<span class="selected-component lec">Lec ${selectedCourse.selectedLecture.number}</span>`);
            }
            if (selectedCourse.selectedDiscussion) {
                components.push(`<span class="selected-component dis">Dis ${selectedCourse.selectedDiscussion.number}</span>`);
            }
            if (selectedCourse.selectedLab) {
                components.push(`<span class="selected-component lab">Lab ${selectedCourse.selectedLab.number}</span>`);
            }

            // Check for incomplete selections
            const incompleteInfo = this.getIncompleteSelectionInfo(selectedCourse);
            if (incompleteInfo.isIncomplete) {
                warningIconHTML = `<span class="incomplete-warning" title="${incompleteInfo.message}"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="warning-icon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 2c5.523 0 10 4.477 10 10a10 10 0 0 1 -19.995 .324l-.005 -.324l.004 -.28c.148 -5.393 4.566 -9.72 9.996 -9.72zm.01 13l-.127 .007a1 1 0 0 0 0 1.986l.117 .007l.127 -.007a1 1 0 0 0 0 -1.986l-.117 -.007zm-.01 -8a1 1 0 0 0 -.993 .883l-.007 .117v4l.007 .117a1 1 0 0 0 1.986 0l.007 -.117v-4l-.007 -.117a1 1 0 0 0 -.993 -.883z" /></svg></span>`;
                components.push(warningIconHTML);
            }

            if (components.length > 0) {
                selectedComponentsHTML = `<div class="schedule-course-components">${components.join('')}</div>`;
            }
        }

        return `
            <div class="schedule-course-item ${isExpanded ? 'expanded' : 'collapsed'}">
                <div class="schedule-course-header">
                    <div class="schedule-course-info">
                        <div class="schedule-course-code">${course.department.abbreviation}${course.number}</div>
                        <div class="schedule-course-name">${course.name}</div>
                        ${selectedComponentsHTML}
                        <div class="schedule-course-credits">${credits}</div>
                    </div>
                    <div class="header-controls">
                        <button class="course-remove-btn" title="Remove from selection">
                            ×
                        </button>
                    </div>
                </div>
        `;
    }

    /**
     * Check if a section has at least one period with a valid time slot
     * Placeholder sections have start_time === end_time (e.g., "12:00" to "12:00")
     * This matches the wizard's hasValidTimeSlot logic
     */
    private hasValidTimeSlot(section: any): boolean {
        return section.periods.some((period: any) => {
            // Compare actual time values, not object references
            // A valid time slot has different start and end times
            return period.startTime.hours !== period.endTime.hours ||
                   period.startTime.minutes !== period.endTime.minutes;
        });
    }

    /**
     * Check if a selected course has incomplete component selections
     * Returns information about what's missing
     * This logic matches the wizard's determineAvailableSteps() to ensure consistency
     */
    private getIncompleteSelectionInfo(selectedCourse: any): { isIncomplete: boolean; message: string } {
        const course = selectedCourse.course;

        // Skip check for lab-only courses
        if (this.courseDataService && this.courseDataService.isLabOnlyCourse(course)) {
            // For lab-only courses, check if a lab section is selected
            if (!selectedCourse.selectedLab) {
                const labs = this.courseDataService.getStandaloneLabs(course);
                const hasValidLabs = labs.some(lab => this.hasValidTimeSlot(lab));
                if (hasValidLabs) {
                    return { isIncomplete: true, message: 'Incomplete: Missing lab selection' };
                }
            }
            return { isIncomplete: false, message: '' };
        }

        // For hierarchical courses, check if lecture groups exist
        if (!course.lectures || course.lectures.length === 0) {
            return { isIncomplete: false, message: '' };
        }

        const missingComponents: string[] = [];

        // Check if lectures with valid time slots exist
        const validLectures = course.lectures.filter((lg: any) => this.hasValidTimeSlot(lg.section));
        if (validLectures.length === 0) {
            // No valid lectures available, nothing to warn about
            return { isIncomplete: false, message: '' };
        }

        // Check lecture selection (only warn if valid lectures exist)
        if (!selectedCourse.selectedLecture) {
            missingComponents.push('lecture');
        }

        // Check if ANY lecture has discussions/labs with valid time slots
        // This matches the wizard's logic for determining available steps
        const hasValidDiscussions = course.lectures.some((lg: any) =>
            lg.compatibleDiscussions && lg.compatibleDiscussions.some((d: any) => this.hasValidTimeSlot(d))
        );
        const hasValidLabs = course.lectures.some((lg: any) =>
            lg.compatibleLabs && lg.compatibleLabs.some((l: any) => this.hasValidTimeSlot(l))
        );

        // Only warn about missing components if they would appear in the wizard
        if (hasValidDiscussions && !selectedCourse.selectedDiscussion) {
            missingComponents.push('discussion');
        }
        if (hasValidLabs && !selectedCourse.selectedLab) {
            missingComponents.push('lab');
        }

        if (missingComponents.length === 0) {
            return { isIncomplete: false, message: '' };
        }

        const message = `Incomplete: Missing ${missingComponents.join(', ')} selection`;
        return { isIncomplete: true, message };
    }
    
    private buildAllCoursesHTML(sortedCourses: any[]): string {
        let html = '';

        sortedCourses.forEach(selectedCourse => {
            const course = selectedCourse.course;

            html += this.buildCourseHeaderHTML(course, selectedCourse);
            html += '</div>'; // Close schedule-course-item
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

        // Associate edit buttons with their Course objects
        const editButtons = selectedCoursesContainer.querySelectorAll('.course-edit-btn');
        editButtons.forEach((button, index) => {
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

        // Associate edit buttons with their Course objects
        const editButtons = selectedCoursesContainer.querySelectorAll('.course-edit-btn');
        editButtons.forEach((button, index) => {
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

    private syncSectionObjects(selectedCourses: any[]): void {
        selectedCourses.forEach(sc => {
            // If we have a selectedSectionNumber but no selectedSection object (or invalid object)
            if (sc.selectedSectionNumber && (!sc.selectedSection || !sc.selectedSection.computedTerm)) {
                // Find the section object in the course
                const sectionObject = sc.course.sections?.find((s: any) => s.number === sc.selectedSectionNumber);
                
                if (sectionObject && sectionObject.computedTerm) {
                    sc.selectedSection = sectionObject;
                }
            }
            
            // If we have a selectedSection but no selectedSectionNumber, sync the other way
            if (sc.selectedSection && sc.selectedSection.number && !sc.selectedSectionNumber) {
                sc.selectedSectionNumber = sc.selectedSection.number;
            }
        });
    }

    /**
     * Apply wizard preview overlay to selected courses
     */
    private applyPreviewOverlay(courses: SelectedCourse[]): SelectedCourse[] {
        console.log('[Preview] applyPreviewOverlay called');
        console.log('[Preview] wizardPreviewCourse:', this.wizardPreviewCourse?.id || 'null');
        console.log('[Preview] wizardPreviewSelections:', this.wizardPreviewSelections);

        if (!this.wizardPreviewCourse || !this.wizardPreviewSelections) {
            console.log('[Preview] No preview data, returning original courses');
            return courses;
        }

        // Create a copy of courses array to avoid mutating original
        const previewCourses = courses.map(sc => ({...sc}));

        // Find the course being previewed
        const previewIndex = previewCourses.findIndex(
            sc => sc.course.id === this.wizardPreviewCourse!.id
        );

        console.log('[Preview] Preview index:', previewIndex);
        console.log('[Preview] Total courses:', previewCourses.length);

        if (previewIndex >= 0) {
            console.log('[Preview] Updating existing course at index', previewIndex);
            // Update existing course with preview selections
            previewCourses[previewIndex] = {
                ...previewCourses[previewIndex],
                selectedLecture: this.wizardPreviewSelections.lecture,
                selectedDiscussion: this.wizardPreviewSelections.discussion,
                selectedLab: this.wizardPreviewSelections.lab
            };
        } else {
            console.log('[Preview] Adding new preview course');
            // Course not yet selected - add temporary preview entry
            previewCourses.push({
                course: this.wizardPreviewCourse,
                selectedLecture: this.wizardPreviewSelections.lecture,
                selectedDiscussion: this.wizardPreviewSelections.discussion,
                selectedLab: this.wizardPreviewSelections.lab,
                selectedSection: this.wizardPreviewSelections.lecture,
                selectedSectionNumber: this.wizardPreviewSelections.lecture?.number || null,
                isRequired: false
            });
        }

        console.log('[Preview] Returning', previewCourses.length, 'courses');
        return previewCourses;
    }

    renderScheduleGrids(): void {
        console.log('[Preview] renderScheduleGrids() called');
        let rawSelectedCourses = this.courseSelectionService.getSelectedCourses();
        console.log('[Preview] Raw selected courses:', rawSelectedCourses.length);

        // Apply preview overlay if wizard is open
        if (this.wizardPreviewCourse && this.wizardPreviewSelections) {
            console.log('[Preview] Applying preview overlay');
            rawSelectedCourses = this.applyPreviewOverlay(rawSelectedCourses);
            console.log('[Preview] After overlay:', rawSelectedCourses.length, 'courses');
        } else {
            console.log('[Preview] No preview to apply');
        }

        // Sync section objects with section numbers before validation
        this.syncSectionObjects(rawSelectedCourses);

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
                this.renderEmptyGrid(gridContainer);
                return;
            }
            
            this.renderPopulatedGrid(gridContainer, termCourses, term);
        });
        
    }

    private renderEmptyGrid(container: HTMLElement): void {
        container.innerHTML = '';
        container.classList.add('empty');
    }

    private renderPopulatedGrid(container: HTMLElement, courses: any[], _term: string): void {
        container.classList.remove('empty');

        console.log(`[Grid] renderPopulatedGrid for term ${_term} with ${courses.length} courses`);
        courses.forEach((sc, idx) => {
            console.log(`[Grid] Course ${idx}: ${sc.course.department.abbreviation}${sc.course.number}`);
            console.log(`[Grid]   - selectedLecture:`, sc.selectedLecture?.number || 'none');
            console.log(`[Grid]   - selectedDiscussion:`, sc.selectedDiscussion?.number || 'none');
            console.log(`[Grid]   - selectedLab:`, sc.selectedLab?.number || 'none');
        });

        // Clean up existing event listeners before replacing DOM content
        const existingListener = this.containerEventListeners.get(container);
        if (existingListener) {
            container.removeEventListener('click', existingListener);
            this.containerEventListeners.delete(container);
        }

        // Create 5-day (Mon-Fri) × 12 time slot grid (7 AM - 7 PM, hourly intervals)
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
            const hour = slot + TimeUtils.START_HOUR;
            const minutes = 0; // Hourly intervals only
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

        // Log for first 3 slots on Monday/Tuesday to see patterns
        const debugLog = timeSlot < 3 && day <= DayOfWeek.TUESDAY;

        if (debugLog) {
            console.log(`[Cell] Checking slot ${timeSlot} (${timeSlot + TimeUtils.START_HOUR}:00), day ${day} (${TimeUtils.getDayAbbr(day)})`);
            console.log(`[Cell] Processing ${courses.length} courses`);
        }

        for (const selectedCourse of courses) {
            // Collect all component sections (lecture, discussion, lab)
            const sections: Section[] = [];

            if (selectedCourse.selectedLecture) {
                sections.push(selectedCourse.selectedLecture);
            }
            if (selectedCourse.selectedDiscussion) {
                sections.push(selectedCourse.selectedDiscussion);
            }
            if (selectedCourse.selectedLab) {
                sections.push(selectedCourse.selectedLab);
            }

            // Fallback to legacy selectedSection if no components are set
            if (sections.length === 0 && selectedCourse.selectedSection) {
                sections.push(selectedCourse.selectedSection);
            }

            if (debugLog) {
                console.log(`[Cell] Course ${selectedCourse.course.department.abbreviation}${selectedCourse.course.number}: ${sections.length} sections`);
                sections.forEach((s, idx) => {
                    console.log(`[Cell]   Section ${idx}: ${s.number}, periods: ${s.periods?.length || 0}`);
                });
            }

            // Process each section
            for (const section of sections) {
                if (debugLog && section.periods.length > 0) {
                    console.log(`[Cell] Section ${section.number}: checking against day "${day}" (type: ${typeof day})`);
                    const firstPeriod = section.periods[0];
                    console.log(`[Cell]   period.days type:`, typeof firstPeriod.days, firstPeriod.days);
                    console.log(`[Cell]   period.days contents:`, Array.from(firstPeriod.days));
                    console.log(`[Cell]   period.days.has("${day}")?:`, firstPeriod.days.has(day));
                }

                // Check if this section has any period that occupies this time slot on this day
                const periodsOnThisDay = section.periods.filter((period: any) => period.days.has(day));

                if (debugLog) {
                    console.log(`[Cell] Section ${section.number}: ${periodsOnThisDay.length} periods on day ${day}`);
                    if (periodsOnThisDay.length > 0) {
                        periodsOnThisDay.forEach(p => {
                            const daysList = Array.from(p.days).join(',');
                            console.log(`[Cell]   - ${p.startTime.hours}:${String(p.startTime.minutes).padStart(2, '0')} - ${p.endTime.hours}:${String(p.endTime.minutes).padStart(2, '0')}, days: ${daysList}`);
                        });
                    }
                }

                let sectionOccupiesSlot = false;
                let sectionStartSlot = Infinity;
                let sectionEndSlot = -1;
                let isFirstSlot = false;

                for (const period of periodsOnThisDay) {
                    const startSlot = TimeUtils.timeToGridRowStart(period.startTime);
                    const endSlot = TimeUtils.timeToGridRowEnd(period.endTime);

                    if (debugLog) {
                        console.log(`[Cell]   Period: ${period.startTime.hours}:${period.startTime.minutes.toString().padStart(2, '0')} - ${period.endTime.hours}:${period.endTime.minutes.toString().padStart(2, '0')}`);
                        console.log(`[Cell]   Slots: start=${startSlot}, end=${endSlot}, current=${timeSlot}`);
                        console.log(`[Cell]   Occupies? ${timeSlot >= startSlot && timeSlot < endSlot}`);
                    }

                    if (timeSlot >= startSlot && timeSlot < endSlot) {
                        sectionOccupiesSlot = true;
                        sectionStartSlot = Math.min(sectionStartSlot, startSlot);
                        sectionEndSlot = Math.max(sectionEndSlot, endSlot);

                    }
                }

                if (sectionOccupiesSlot) {
                    // Check if this is the first slot for this section on this day
                    isFirstSlot = timeSlot === sectionStartSlot;

                    // Calculate actual start and end times in minutes for precise height
                    let earliestStartMinutes = Infinity;
                    let latestEndMinutes = -1;
                    for (const period of periodsOnThisDay) {
                        const startMinutes = period.startTime.hours * 60 + period.startTime.minutes;
                        const endMinutes = period.endTime.hours * 60 + period.endTime.minutes;
                        earliestStartMinutes = Math.min(earliestStartMinutes, startMinutes);
                        latestEndMinutes = Math.max(latestEndMinutes, endMinutes);
                    }

                    occupyingSections.push({
                        course: selectedCourse,
                        section,
                        periodsOnThisDay,
                        startSlot: sectionStartSlot,
                        endSlot: sectionEndSlot,
                        isFirstSlot,
                        startMinutes: earliestStartMinutes,
                        endMinutes: latestEndMinutes
                    });
                }
            }
        }

        if (debugLog) {
            console.log(`[Cell] Found ${occupyingSections.length} occupying sections for this slot`);
        }

        if (occupyingSections.length === 0) {
            return { content: '', classes: '' };
        }
        
        // Check for conflicts
        const hasConflict = occupyingSections.length > 1;
        const primarySection = occupyingSections[0];
        const courseColor = this.getCourseColor(primarySection.course.course.id);

        // Calculate precise height based on actual duration in minutes
        // Each hourly slot represents 60 minutes
        const durationMinutes = primarySection.endMinutes - primarySection.startMinutes;
        const startOffsetMinutes = primarySection.startMinutes - (TimeUtils.START_HOUR * 60);
        const slotStartMinutes = timeSlot * 60; // Minutes from START_HOUR for this slot
        const topOffsetPercent = ((startOffsetMinutes - slotStartMinutes) / 60) * 100;
        const heightPercent = (durationMinutes / 60) * 100;


        // Build content for the first section in the slot - simplified to show only course name
        const content = primarySection.isFirstSlot ? `
            <div class="section-block ${hasConflict ? 'conflict' : ''}"
                 data-course-id="${primarySection.course.course.id}"
                 data-section-number="${primarySection.section.number}"
                 data-selected-course-index="${primarySection.courseIndex || 0}"
                 style="
                background-color: ${courseColor};
                height: ${heightPercent}%;
                width: 100%;
                position: absolute;
                top: ${topOffsetPercent}%;
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

    private getCourseColor(courseId: string): string {
        // If this course already has a color assigned, return it
        if (this.courseColorMap.has(courseId)) {
            return this.courseColorMap.get(courseId)!;
        }

        // Color palette
        const colors = [
            '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336',
            '#00BCD4', '#795548', '#607D8B', '#3F51B5', '#E91E63'
        ];

        // Shuffle the colors array to get random distribution
        const shuffledColors = [...colors].sort(() => Math.random() - 0.5);

        // Find first unused color from shuffled array
        let assignedColor: string;
        const unusedColor = shuffledColors.find(color => !this.usedColors.has(color));

        if (unusedColor) {
            // Assign first available unused color from shuffled array
            assignedColor = unusedColor;
        } else {
            // All colors in use, fall back to hash-based selection
            let hash = 0;
            for (let i = 0; i < courseId.length; i++) {
                hash = courseId.charCodeAt(i) + ((hash << 5) - hash);
            }
            assignedColor = colors[Math.abs(hash) % colors.length];
        }

        // Track the assignment
        this.courseColorMap.set(courseId, assignedColor);
        this.usedColors.add(assignedColor);

        return assignedColor;
    }

    /**
     * Release a course's color assignment when it's removed from the schedule
     */
    releaseCourseColor(courseId: string): void {
        const color = this.courseColorMap.get(courseId);
        if (color) {
            this.usedColors.delete(color);
            this.courseColorMap.delete(courseId);
        }
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

        if (!selectedCourse) {
            console.warn('Course not found:', courseId);
            return;
        }

        const course = selectedCourse.course;

        // Find the section from component selections or legacy selectedSection
        let section: Section | null = null;

        if (selectedCourse.selectedLecture?.number === sectionNumber) {
            section = selectedCourse.selectedLecture;
        } else if (selectedCourse.selectedDiscussion?.number === sectionNumber) {
            section = selectedCourse.selectedDiscussion;
        } else if (selectedCourse.selectedLab?.number === sectionNumber) {
            section = selectedCourse.selectedLab;
        } else if (selectedCourse.selectedSection?.number === sectionNumber) {
            section = selectedCourse.selectedSection;
        }

        if (!section) {
            console.warn('Section not found:', sectionNumber);
            return;
        }

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

    private setupTermFocusHandlers(): void {
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            // Check if back button was clicked
            if (target.classList.contains('term-back-btn')) {
                e.stopPropagation();
                this.unfocusTerm();
                return;
            }

            // Check if term-graph or its header was clicked (but not the schedule grid)
            const termGraph = target.closest('.term-graph');
            if (termGraph && !target.closest('.schedule-grid')) {
                const termsGrid = document.querySelector('.terms-grid');
                // Only focus if not already focused
                if (termsGrid && !termsGrid.classList.contains('focused')) {
                    const term = (termGraph as HTMLElement).dataset.term;
                    if (term) {
                        this.focusTerm(term);
                    }
                }
            }
        });

        // Setup escape key handler
        this.escapeKeyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                const termsGrid = document.querySelector('.terms-grid');
                if (termsGrid && termsGrid.classList.contains('focused')) {
                    e.preventDefault();
                    this.unfocusTerm();
                }
            }
        };
        document.addEventListener('keydown', this.escapeKeyHandler);
    }

    private focusTerm(term: string): void {
        const termsGrid = document.querySelector('.terms-grid');
        const termGraphs = document.querySelectorAll('.term-graph');

        if (!termsGrid) return;

        termsGrid.classList.add('focused');

        termGraphs.forEach(graph => {
            const graphElement = graph as HTMLElement;
            if (graphElement.dataset.term === term) {
                graphElement.classList.add('focused-term');
            } else {
                graphElement.classList.remove('focused-term');
            }
        });
    }

    private unfocusTerm(): void {
        const termsGrid = document.querySelector('.terms-grid');
        const termGraphs = document.querySelectorAll('.term-graph');

        if (!termsGrid) return;

        termsGrid.classList.remove('focused');

        termGraphs.forEach(graph => {
            graph.classList.remove('focused-term');
        });
    }

    setupAutoScheduleButton(): void {
        const autoScheduleBtn = document.getElementById('auto-schedule-btn');
        if (!autoScheduleBtn) {
            console.warn('Auto-schedule button not found');
            return;
        }

        autoScheduleBtn.addEventListener('click', () => this.handleAutoSchedule());
    }

    private async handleAutoSchedule(): Promise<void> {
        if (!this.scheduleFilterService) {
            alert('Filter service not available. Please try again.');
            return;
        }

        const selectedCourses = this.courseSelectionService.getSelectedCourses();

        if (selectedCourses.length === 0) {
            alert('No courses selected. Please select courses first.');
            return;
        }

        const autoScheduleBtn = document.getElementById('auto-schedule-btn') as HTMLButtonElement;
        if (autoScheduleBtn) {
            autoScheduleBtn.disabled = true;
            autoScheduleBtn.textContent = 'Generating...';
        }

        try {
            const autoScheduler = new AutoScheduler(this.scheduleFilterService);

            const defaultPreferences = {
                preferredTimeRange: {
                    startTime: { hours: 8, minutes: 0 },
                    endTime: { hours: 18, minutes: 0 }
                },
                preferredDays: new Set<string>(),
                avoidBackToBackClasses: false
            };

            const schedule = autoScheduler.generateBestSchedule(
                selectedCourses,
                defaultPreferences
            );

            if (!schedule) {
                alert('Could not generate a valid schedule. Try adjusting your filters or course selections.');
                return;
            }

            let autoFilledCount = 0;
            let lockedCount = 0;

            for (const result of schedule) {
                if (result.isLocked) {
                    lockedCount++;
                    continue;
                }

                await this.courseSelectionService.setSelectedComponents(
                    result.course,
                    result.combination.lecture,
                    result.combination.discussion,
                    result.combination.lab
                );
                autoFilledCount++;
            }

            this.displayScheduleSelectedCourses();
            this.renderScheduleGrids();

            let message = `Successfully generated optimized schedule!`;
            if (lockedCount > 0) {
                message += ` (${autoFilledCount} courses auto-filled, ${lockedCount} already selected)`;
            }
            console.log(message);
        } catch (error) {
            console.error('Error generating schedule:', error);
            alert('An error occurred while generating the schedule. Please try again.');
        } finally {
            if (autoScheduleBtn) {
                autoScheduleBtn.disabled = false;
                autoScheduleBtn.innerHTML = `<img src="${ICONS.WAND}" alt="Auto-schedule" class="auto-schedule-icon" /><span>Auto-Schedule</span>`;
            }
        }
    }

}