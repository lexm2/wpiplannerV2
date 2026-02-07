import { DayOfWeek, Course, Section, Period } from '../../types/types'
import { SelectedCourse, Schedule, LocalCalendarEvent, AcademicTerm, EventType } from '../../types/schedule'
import { CourseSelectionService } from '../../services/selection/CourseSelectionService'
import { CourseDataService } from '../../services/data/courseDataService'
import { ScheduleFilterService } from '../../services/filtering/ScheduleFilterService'
import { ScheduleManagementService } from '../../services/selection/ScheduleManagementService'
import { SectionInfoModalController } from './SectionInfoModalController'
import { ScheduleFilterModalController } from './ScheduleFilterModalController'
import { ComponentSelectionWizard } from '../components/ComponentSelectionWizard'
import { LocalEventModal } from '../components/LocalEventModal'
import { SidebarManager } from '../sidebar/SidebarManager'
import type { SidebarPanel } from '../sidebar/types'
import { TimeUtils } from '../utils/timeUtils'
import { ConflictDetector } from '../../core/scheduling/ConflictEngine'
import { getComputedTerm, validateSelectedCourses, getDisplayTerms } from '../../utils/typeGuards'
import { AutoScheduler, type ScheduleResult } from '../../services/scheduling/AutoScheduler'
import type { AutoScheduleSettings, WeeklyTimeSlot, DisplayableTimeSlot } from '../../types/schedule'
import { getInlineSVG } from '../../utils/iconPaths'
import { Validators } from '../../utils/validators'
import { getAllSections } from '../../utils/courseUtils'
import { ModalService } from '../../services/ui/ModalService'
import { perfMonitor } from '../../utils/PerformanceMonitor'

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
    private hoverPreviewSections: Set<number> = new Set(); // Track CRNs of sections being previewed
    private courseColorMap: Map<string, string> = new Map();
    private usedColors: Set<string> = new Set();
    private colorCache: Map<string, string> = new Map();
    private generatedSchedules: ScheduleResult[][] = [];
    private currentScheduleIndex: number = 0;
    private isApplyingAutoSchedule: boolean = false;
    private currentSchedule: Schedule | null = null;
    private onScheduleUpdate: ((scheduleId: string, updates: Partial<Schedule>) => void) | null = null;
    private sidebarManager: SidebarManager;
    private modalService: ModalService | null = null;

    // Performance optimization: Caching infrastructure for grid rendering
    private cellContentCache: Map<string, any> = new Map();
    private currentCacheKey: string = '';
    private conflictMap: Map<string, Set<string>> = new Map();
    private lastConflictCacheKey: string = '';
    private autoScheduleE2EStartTime: number | null = null;

    constructor(courseSelectionService: CourseSelectionService) {
        this.courseSelectionService = courseSelectionService;
        this.sidebarManager = new SidebarManager('schedule-sidebar-content');
        this.setupTermFocusHandlers();
        this.setupColorManagement();
    }

    /**
     * Set the ModalService for opening modals from this controller.
     */
    setModalService(modalService: ModalService): void {
        this.modalService = modalService;
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

    // =========================================================================
    // Schedule Loading
    // =========================================================================

    /**
     * Load a schedule for display.
     * Should be called when the active schedule changes.
     */
    async loadExternalEvents(schedule: Schedule): Promise<void> {
        console.log('[ScheduleController] Loading schedule:', {
            name: schedule.name,
            id: schedule.id,
            localEventsCount: schedule.localEvents?.length || 0,
        });

        this.currentSchedule = schedule;
        this.renderScheduleGrids();
        this.displayScheduleSelectedCourses();
    }

    /**
     * Clear the current schedule.
     */
    clearExternalEvents(): void {
        this.currentSchedule = null;
        this.renderScheduleGrids();
    }

    /**
     * Set the callback for updating schedules (used for saving exclusion changes).
     */
    setScheduleUpdateCallback(callback: (scheduleId: string, updates: Partial<Schedule>) => void): void {
        this.onScheduleUpdate = callback;
    }

    // =========================================================================
    // Local Event Helper Methods
    // =========================================================================

    /**
     * Get local events for a specific term.
     */
    private getLocalEventsForTerm(term: string): LocalCalendarEvent[] {
        if (!this.currentSchedule?.localEvents) return [];

        return this.currentSchedule.localEvents.filter(event => {
            if (event.eventType === EventType.ONE_TIME) {
                return false;
            }

            return event.terms?.includes(term as AcademicTerm) || event.terms?.includes(AcademicTerm.ALL);
        });
    }

    /**
     * Get visible local events for a specific term.
     */
    private getVisibleLocalEventsForTerm(term: string): LocalCalendarEvent[] {
        return this.getLocalEventsForTerm(term).filter(event => event.visible);
    }

    /**
     * Convert a local event to displayable time slots.
     */
    private localEventToSlots(event: LocalCalendarEvent): DisplayableTimeSlot[] {
        const slots: DisplayableTimeSlot[] = [];

        if (event.eventType === EventType.ONE_TIME) {
            return slots;
        }

        const days = event.days || [];
        const terms = event.terms || [AcademicTerm.ALL];

        for (const term of terms) {
            const academicTerm = term as AcademicTerm;
            for (const day of days) {
                slots.push({
                    id: `${event.id}-${term}-${day}`,
                    day,
                    startTime: event.startTime,
                    endTime: event.endTime,
                    term: academicTerm,
                    title: event.title,
                    subtitle: event.description,
                    color: '#6B7280',
                    sourceType: 'blocked',
                    sourceId: event.id,
                });
            }
        }

        return slots;
    }

    /**
     * Get all local event slots for a specific term (visible only).
     */
    private getLocalEventSlotsForTerm(term: string): DisplayableTimeSlot[] {
        const visibleEvents = this.getVisibleLocalEventsForTerm(term);
        const slots: DisplayableTimeSlot[] = [];

        for (const event of visibleEvents) {
            const eventSlots = this.localEventToSlots(event);
            const termSlots = eventSlots.filter(slot => slot.term === term);
            slots.push(...termSlots);
        }

        return slots;
    }

    /**
     * Get all blocked times from local events for auto-scheduler.
     */
    private getAllLocalEventBlockedTimes(): WeeklyTimeSlot[] {
        if (!this.currentSchedule?.localEvents) return [];

        const blockedTimes: WeeklyTimeSlot[] = [];
        const visibleEvents = this.currentSchedule.localEvents.filter(e => e.visible);

        for (const event of visibleEvents) {
            if (event.eventType === EventType.ONE_TIME) continue;

            const days = event.days || [];
            const terms = event.terms || [AcademicTerm.ALL];

            for (const term of terms) {
                const academicTerm = term as AcademicTerm;
                for (const day of days) {
                    blockedTimes.push({
                        id: `${event.id}-${term}-${day}`,
                        day,
                        startTime: event.startTime,
                        endTime: event.endTime,
                        term: academicTerm,
                    });
                }
            }
        }

        return blockedTimes;
    }

    getCalendarEventCount(): number {
        return 0;
    }

    getLocalEventCount(): number {
        const localEvents = this.currentSchedule?.localEvents || [];
        return localEvents.filter(e => e.visible).length;
    }

    getAllCalendarBlockedTimes(): WeeklyTimeSlot[] {
        return this.getAllLocalEventBlockedTimes();
    }

    openCalendarEventsPanel(): void {
        this.openAddLocalEventModal();
    }

    /**
     * Open the calendar events panel to manage local and external events.
     * Uses SidebarManager for consistent panel management.
     */

    // =========================================================================
    // Local Event CRUD Methods
    // =========================================================================

    /**
     * Open modal to add a new local event.
     */
    private openAddLocalEventModal(): void {
        if (!this.modalService || !this.currentSchedule) {
            console.warn('[ScheduleController] Cannot open add event modal - missing service or schedule');
            return;
        }

        const modal = new LocalEventModal(this.modalService, {
            onSave: (eventData) => this.addLocalEvent(eventData),
        });
        modal.show();
    }

    /**
     * Open modal to edit an existing local event.
     */
    private openEditLocalEventModal(eventId: string): void {
        if (!this.modalService || !this.currentSchedule) {
            console.warn('[ScheduleController] Cannot open edit event modal - missing service or schedule');
            return;
        }

        const localEvents = this.currentSchedule.localEvents || [];
        const existingEvent = localEvents.find(e => e.id === eventId);
        if (!existingEvent) {
            console.warn('[ScheduleController] Cannot find event to edit:', eventId);
            return;
        }

        const modal = new LocalEventModal(this.modalService, {
            existingEvent,
            onSave: (eventData) => this.updateLocalEvent(eventId, eventData),
        });
        modal.show();
    }

    /**
     * Add a new local event.
     */
    private addLocalEvent(eventData: Omit<LocalCalendarEvent, 'id' | 'createdAt' | 'updatedAt'>): void {
        if (!this.currentSchedule || !this.onScheduleUpdate) return;

        const now = Date.now();
        const newEvent: LocalCalendarEvent = {
            ...eventData,
            id: `local-${now}-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: now,
            updatedAt: now,
        };

        const currentEvents = this.currentSchedule.localEvents || [];
        const updatedLocalEvents = [...currentEvents, newEvent];

        this.currentSchedule = {
            ...this.currentSchedule,
            localEvents: updatedLocalEvents,
        };

        this.renderScheduleGrids();

        this.onScheduleUpdate(this.currentSchedule.id, {
            localEvents: updatedLocalEvents,
        });
    }

    /**
     * Update an existing local event.
     */
    private updateLocalEvent(eventId: string, eventData: Omit<LocalCalendarEvent, 'id' | 'createdAt' | 'updatedAt'>): void {
        if (!this.currentSchedule || !this.onScheduleUpdate) return;

        const currentEvents = this.currentSchedule.localEvents || [];
        const eventIndex = currentEvents.findIndex(e => e.id === eventId);

        if (eventIndex === -1) {
            console.warn('[ScheduleController] Event not found for update:', eventId);
            return;
        }

        const existingEvent = currentEvents[eventIndex];
        const updatedEvent: LocalCalendarEvent = {
            ...eventData,
            id: eventId,
            createdAt: existingEvent.createdAt,
            updatedAt: Date.now(),
        };

        const updatedLocalEvents = [
            ...currentEvents.slice(0, eventIndex),
            updatedEvent,
            ...currentEvents.slice(eventIndex + 1),
        ];

        this.currentSchedule = {
            ...this.currentSchedule,
            localEvents: updatedLocalEvents,
        };

        this.renderScheduleGrids();

        this.onScheduleUpdate(this.currentSchedule.id, {
            localEvents: updatedLocalEvents,
        });
    }

    /**
     * Delete a local event.
     */
    private deleteLocalEvent(eventId: string): void {
        if (!this.currentSchedule || !this.onScheduleUpdate) return;

        const currentEvents = this.currentSchedule.localEvents || [];
        const updatedLocalEvents = currentEvents.filter(e => e.id !== eventId);

        this.currentSchedule = {
            ...this.currentSchedule,
            localEvents: updatedLocalEvents,
        };

        this.renderScheduleGrids();

        this.onScheduleUpdate(this.currentSchedule.id, {
            localEvents: updatedLocalEvents,
        });
    }

    /**
     * Toggle visibility of a local event.
     */
    private toggleLocalEventVisibility(eventId: string): void {
        if (!this.currentSchedule || !this.onScheduleUpdate) return;

        const currentEvents = this.currentSchedule.localEvents || [];
        const updatedLocalEvents = currentEvents.map(event =>
            event.id === eventId
                ? { ...event, visible: !event.visible }
                : event
        );

        this.currentSchedule = {
            ...this.currentSchedule,
            localEvents: updatedLocalEvents,
        };

        this.renderScheduleGrids();

        this.onScheduleUpdate(this.currentSchedule.id, {
            localEvents: updatedLocalEvents,
        });
    }

    /**
     * Open the component selection wizard for a course.
     * Uses SidebarManager for consistent panel management.
     */
    openComponentWizard(course: Course, existingSelections?: any): void {
        if (!this.courseDataService) {
            console.error('CourseDataService not available');
            return;
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

        // Filter out the current course being edited from the context
        // This prevents the wizard from checking conflicts against itself
        const otherSelectedCourses = allSelectedCourses.filter(sc => sc.course.id !== freshCourse.id);

        // Create new wizard with fresh course data
        this.componentWizard = new ComponentSelectionWizard(
            freshCourse,
            this.courseDataService,
            (selections) => this.onWizardComplete(freshCourse, selections),
            () => this.closeComponentWizard(),
            existingSelections,
            (selections) => this.onWizardSelectionChange(freshCourse, selections),
            this.scheduleFilterService || undefined,
            otherSelectedCourses,
            (selections) => this.onWizardHoverPreview(freshCourse, selections)
        );

        // Use SidebarManager to open the panel (handles closing existing panels)
        this.sidebarManager.openPanel(this.componentWizard);
    }

    /**
     * Close the component selection wizard
     */
    closeComponentWizard(): void {
        this.componentWizard = null;
        this.sidebarManager.closePanel();

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
        this.wizardPreviewCourse = course;
        this.wizardPreviewSelections = selections;
        this.hoverPreviewSections.clear();
        this.renderScheduleGrids();
    }

    /**
     * Handle hover preview changes from the wizard (shows dashed preview)
     */
    onWizardHoverPreview(course: Course, selections: WizardSelections): void {
        // Store preview data
        this.wizardPreviewCourse = course;
        this.wizardPreviewSelections = selections;

        // Track which specific sections are hover previews (by CRN)
        // Only mark sections as preview if they're different from existing selections
        this.hoverPreviewSections.clear();

        // Get existing selected course to compare
        const existingCourse = this.courseSelectionService.getSelectedCourses()
            .find(sc => sc.course.id === course.id);

        // Only mark as preview if this section is NEW (different from existing)
        if (selections.lecture && selections.lecture.crn !== existingCourse?.selectedLecture?.crn) {
            this.hoverPreviewSections.add(selections.lecture.crn);
        }
        if (selections.discussion && selections.discussion.crn !== existingCourse?.selectedDiscussion?.crn) {
            this.hoverPreviewSections.add(selections.discussion.crn);
        }
        if (selections.lab && selections.lab.crn !== existingCourse?.selectedLab?.crn) {
            this.hoverPreviewSections.add(selections.lab.crn);
        }

        // Re-render calendar with hover preview
        this.renderScheduleGrids();
    }

    displayScheduleSelectedCourses(): void {
        const selectedCoursesContainer = document.getElementById('schedule-sidebar-content');
        const countElement = document.getElementById('schedule-selected-count');

        if (!selectedCoursesContainer) {
            console.log('ERROR: Missing DOM element - selectedCoursesContainer not found');
            return;
        }

        let selectedCourses = this.courseSelectionService.getSelectedCourses();

        let filteredSections: Array<{course: any, section: any}> = [];
        let hasActiveFilters = false;

        if (this.scheduleFilterService && !this.scheduleFilterService.isEmpty()) {
            filteredSections = this.scheduleFilterService.filterSections(selectedCourses);
            hasActiveFilters = true;
        }
        
        // Always show calendar button - users can add local events even without courses
        if (selectedCourses.length === 0) {
            console.log('No courses selected - showing calendar button and empty state');
            if (countElement) {
                countElement.textContent = '(0)';
            }

            // Preserve panels if open
            const wizardPanel = selectedCoursesContainer.querySelector('.sidebar-panel--component-wizard');
            const sidebarPanel = selectedCoursesContainer.querySelector('.sidebar-panel');

            // Build calendar events button + empty state message
            const html = `
                ${this.buildCalendarEventsButtonHTML()}
                <div class="empty-state">No courses selected yet</div>
            `;
            selectedCoursesContainer.innerHTML = html;

            if (wizardPanel) {
                selectedCoursesContainer.appendChild(wizardPanel);
            }
            if (sidebarPanel) {
                selectedCoursesContainer.appendChild(sidebarPanel);
            }

            // Set up calendar events button click handler
            this.setupCalendarEventsButtonHandler(selectedCoursesContainer);
            return;
        }

        if (hasActiveFilters && filteredSections.length === 0) {
            console.log('Early return: 0 sections match active filters - displaying empty state');
            if (countElement) {
                countElement.textContent = '(0 sections match filters)';
            }

            // Preserve wizard if open
            const wizardPanel = selectedCoursesContainer.querySelector('.sidebar-panel--component-wizard');
            selectedCoursesContainer.innerHTML = '<div class="empty-state">No sections match the current filters</div>';
            if (wizardPanel) {
                selectedCoursesContainer.appendChild(wizardPanel);
            }
            return;
        }

        let html = '';

        if (hasActiveFilters) {
            html = this.buildFilteredSectionsHTML(filteredSections, selectedCourses);

            if (countElement) {
                const uniqueCourses = new Set(filteredSections.map(fs => fs.course.course.id)).size;
                countElement.textContent = `(${filteredSections.length} sections in ${uniqueCourses} courses)`;
            }
        } else {
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

        const wizardPanel = selectedCoursesContainer.querySelector('.sidebar-panel--component-wizard');
        const sidebarPanel = selectedCoursesContainer.querySelector('.sidebar-panel');

        selectedCoursesContainer.innerHTML = html;

        if (wizardPanel) {
            selectedCoursesContainer.appendChild(wizardPanel);
        }

        if (sidebarPanel) {
            selectedCoursesContainer.appendChild(sidebarPanel);
        }

        if (!hasActiveFilters) {
            const sortedCourses = selectedCourses.sort((a, b) => {
                const deptCompare = a.course.department.abbreviation.localeCompare(b.course.department.abbreviation);
                if (deptCompare !== 0) return deptCompare;
                return a.course.number.localeCompare(b.course.number);
            });
            this.setupDOMElementMapping(selectedCoursesContainer, sortedCourses);
        } else {
            this.setupFilteredDOMElementMapping(selectedCoursesContainer, filteredSections);
        }

        this.setupCalendarEventsButtonHandler(selectedCoursesContainer);
    }

    /**
     * Set up click handler for the calendar events button.
     */
    private setupCalendarEventsButtonHandler(container: HTMLElement): void {
        const calendarBtn = container.querySelector('#calendar-events-btn');
        if (calendarBtn) {
            calendarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openAddLocalEventModal();
            });
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

        // Calendar button at top if connected
        let html = this.buildCalendarEventsButtonHTML();
        
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
            <div class="sidebar-content-item schedule-course-item ${isExpanded ? 'expanded' : 'collapsed'}">
                <div class="schedule-course-header">
                    <div class="schedule-course-info">
                        <div class="schedule-course-code">${Validators.escapeHtml(course.department.abbreviation)}${Validators.escapeHtml(course.number)}</div>
                        <div class="schedule-course-name">${Validators.escapeHtml(course.name)}</div>
                        ${selectedComponentsHTML}
                        <div class="schedule-course-credits">${credits}</div>
                    </div>
                    <div class="header-controls">
                        <button class="course-clear-sections-btn" title="Clear selected sections">
                            ${getInlineSVG('ERASER', 'eraser-icon')}
                        </button>
                        <button class="course-remove-btn" title="Remove from selection">
                            ${getInlineSVG('TRASH', 'trash-icon')}
                        </button>
                    </div>
                </div>
        `;
    }

    /**
     * Check if a section has at least one period with a valid time slot
     * Async sections are valid even with 12:00-12:00 times
     */
    private hasValidTimeSlot(section: any): boolean {
        return section.periods.some((period: any) => {
            // Async periods are always valid
            if (period.isAsync) {
                return true;
            }
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
        // Calendar button at top if connected
        let html = this.buildCalendarEventsButtonHTML();

        sortedCourses.forEach(selectedCourse => {
            const course = selectedCourse.course;

            html += this.buildCourseHeaderHTML(course, selectedCourse);
            html += '</div>'; // Close schedule-course-item
        });

        return html;
    }

    /**
     * Build HTML for the calendar events button (always shown for local events).
     */
    private buildCalendarEventsButtonHTML(): string {
        const localEvents = this.currentSchedule?.localEvents || [];
        const localEventCount = localEvents.length;
        const visibleLocalCount = localEvents.filter(e => e.visible).length;

        const buttonText = localEventCount > 0
            ? `${visibleLocalCount} local event${visibleLocalCount !== 1 ? 's' : ''}`
            : 'Add events to avoid';

        return `
            <div class="sidebar-content-item calendar-events-section">
                <button class="calendar-events-btn" id="calendar-events-btn">
                    <span class="calendar-events-btn-icon">${getInlineSVG('CALENDAR_DOWN', 'calendar-btn-icon')}</span>
                    <span class="calendar-events-btn-info">
                        <span class="calendar-events-btn-name">Calendar Events</span>
                        <span class="calendar-events-btn-count">${buttonText}</span>
                    </span>
                </button>
            </div>
        `;
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

        // Associate clear sections buttons with their Course objects
        const clearSectionsButtons = selectedCoursesContainer.querySelectorAll('.course-clear-sections-btn');
        clearSectionsButtons.forEach((button, index) => {
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

        // Associate clear sections buttons with their Course objects
        const clearSectionsButtons = selectedCoursesContainer.querySelectorAll('.course-clear-sections-btn');
        clearSectionsButtons.forEach((button, index) => {
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
                button.innerHTML = getInlineSVG('CHECK', 'check-icon');
            } else {
                button.classList.remove('selected');
                button.innerHTML = getInlineSVG('PLUS', 'plus-icon');
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

    /**
     * Apply wizard preview overlay to selected courses
     */
    private applyPreviewOverlay(courses: SelectedCourse[]): SelectedCourse[] {
        if (!this.wizardPreviewCourse || !this.wizardPreviewSelections) {
            return courses;
        }

        const previewCourses = courses.map(sc => ({...sc}));

        const previewIndex = previewCourses.findIndex(
            sc => sc.course.id === this.wizardPreviewCourse!.id
        );

        if (previewIndex >= 0) {
            previewCourses[previewIndex] = {
                ...previewCourses[previewIndex],
                selectedLecture: this.wizardPreviewSelections.lecture,
                selectedDiscussion: this.wizardPreviewSelections.discussion,
                selectedLab: this.wizardPreviewSelections.lab
            };
        } else {
            previewCourses.push({
                course: this.wizardPreviewCourse,
                selectedLecture: this.wizardPreviewSelections.lecture,
                selectedDiscussion: this.wizardPreviewSelections.discussion,
                selectedLab: this.wizardPreviewSelections.lab,
                isRequired: false,
                lockedSections: new Set()
            });
        }

        return previewCourses;
    }

    private precomputeConflicts(selectedCourses: SelectedCourse[]): void {
        const cacheKey = selectedCourses.map(sc => sc.course.id).sort().join(',');
        if (cacheKey === this.lastConflictCacheKey) return;

        const startTime = perfMonitor.startMeasure('conflict-precompute');

        this.conflictMap.clear();
        this.lastConflictCacheKey = cacheKey;

        const allSections: Section[] = [];
        for (const sc of selectedCourses) {
            if (sc.selectedLecture) allSections.push(sc.selectedLecture);
            if (sc.selectedDiscussion) allSections.push(sc.selectedDiscussion);
            if (sc.selectedLab) allSections.push(sc.selectedLab);
        }

        if (!this.conflictDetector) {
            perfMonitor.endMeasure('conflict-precompute', startTime);
            return;
        }

        this.conflictMap = this.conflictDetector.detectConflicts(allSections);

        perfMonitor.endMeasure('conflict-precompute', startTime);
    }

    private precomputeCourseColors(selectedCourses: SelectedCourse[]): void {
        const startTime = perfMonitor.startMeasure('color-precompute');

        this.colorCache.clear();

        const colors = [
            '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336',
            '#00BCD4', '#795548', '#607D8B', '#3F51B5', '#E91E63'
        ];

        const shuffledColors = [...colors];
        for (let i = shuffledColors.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledColors[i], shuffledColors[j]] = [shuffledColors[j], shuffledColors[i]];
        }

        let colorIndex = 0;
        for (const sc of selectedCourses) {
            const courseId = sc.course.id;

            if (sc.customColor) {
                this.colorCache.set(courseId, sc.customColor);
                this.courseColorMap.set(courseId, sc.customColor);
                this.usedColors.add(sc.customColor);
            } else if (this.courseColorMap.has(courseId)) {
                this.colorCache.set(courseId, this.courseColorMap.get(courseId)!);
            } else {
                while (colorIndex < shuffledColors.length && this.usedColors.has(shuffledColors[colorIndex])) {
                    colorIndex++;
                }

                let assignedColor: string;
                if (colorIndex < shuffledColors.length) {
                    assignedColor = shuffledColors[colorIndex];
                    colorIndex++;
                } else {
                    let hash = 0;
                    for (let i = 0; i < courseId.length; i++) {
                        hash = courseId.charCodeAt(i) + ((hash << 5) - hash);
                    }
                    assignedColor = colors[Math.abs(hash) % colors.length];
                }

                this.colorCache.set(courseId, assignedColor);
                this.courseColorMap.set(courseId, assignedColor);
                this.usedColors.add(assignedColor);
            }
        }

        perfMonitor.endMeasure('color-precompute', startTime);
    }

    renderScheduleGrids(): void {
        const renderStartTime = perfMonitor.startMeasure('grid-render-total');

        let rawSelectedCourses = this.courseSelectionService.getSelectedCourses();

        if (this.wizardPreviewCourse && this.wizardPreviewSelections) {
            rawSelectedCourses = this.applyPreviewOverlay(rawSelectedCourses);
        }

        const selectedCourses = validateSelectedCourses(rawSelectedCourses);

        this.precomputeConflicts(selectedCourses);
        this.precomputeCourseColors(selectedCourses);

        const cacheKey = this.generateCacheKey(selectedCourses);
        if (cacheKey !== this.currentCacheKey) {
            this.cellContentCache.clear();
            this.currentCacheKey = cacheKey;
        }

        const grids = ['A', 'B', 'C', 'D'];


        grids.forEach(term => {
            const termStart = performance.now();
            const gridContainer = document.getElementById(`schedule-grid-${term}`);
            if (!gridContainer) return;

            const termCourses = selectedCourses.filter(sc => {
                const computedTerm = getComputedTerm(sc);

                if (!computedTerm) {
                    console.warn(`Course ${sc.course.department.abbreviation}${sc.course.number} has no valid section data`);
                    return false;
                }

                const displayTerms = getDisplayTerms(computedTerm);
                return displayTerms.includes(term);
            });

            const hasLocalEvents = this.getLocalEventSlotsForTerm(term).length > 0;

            if (termCourses.length === 0 && !hasLocalEvents) {
                this.renderEmptyGrid(gridContainer);
                const termEnd = performance.now();
                console.log(`[ScheduleController] Rendered term ${term} in ${(termEnd - termStart).toFixed(2)}ms (empty)`);
                return;
            }

            this.renderPopulatedGrid(gridContainer, termCourses, term);
            const termEnd = performance.now();
            console.log(`[ScheduleController] Rendered term ${term} in ${(termEnd - termStart).toFixed(2)}ms`);
        });

        perfMonitor.endMeasure('grid-render-total', renderStartTime);
    }

    public renderAffectedTerms(affectedCourseIds: string[]): void {
        if (affectedCourseIds.length === 0) {
            return;
        }

        const selectedCourses = this.courseSelectionService.getSelectedCourses();
        const affectedCourses = selectedCourses.filter(sc =>
            affectedCourseIds.includes(sc.course.id)
        );

        const termsToRender = new Set<string>();
        for (const selectedCourse of affectedCourses) {
            const computedTerm = getComputedTerm(selectedCourse);
            if (!computedTerm) continue;
            const displayTerms = getDisplayTerms(computedTerm);
            displayTerms.forEach(term => termsToRender.add(term));
        }

        const grids = ['A', 'B', 'C', 'D'];
        grids.forEach(term => {
            if (termsToRender.has(term)) {
                const termStart = performance.now();
                const gridContainer = document.getElementById(`schedule-grid-${term}`);
                if (!gridContainer) return;

                const termCourses = selectedCourses.filter(sc => {
                    const computedTerm = getComputedTerm(sc);
                    if (!computedTerm) return false;
                    const displayTerms = getDisplayTerms(computedTerm);
                    return displayTerms.includes(term);
                });

                const hasLocalEvents = this.getLocalEventSlotsForTerm(term).length > 0;

                if (termCourses.length === 0 && !hasLocalEvents) {
                    this.renderEmptyGrid(gridContainer);
                    const termEnd = performance.now();
                    console.log(`[ScheduleController] Rendered term ${term} in ${(termEnd - termStart).toFixed(2)}ms (empty)`);
                    return;
                }

                this.renderPopulatedGrid(gridContainer, termCourses, term);
                const termEnd = performance.now();
                console.log(`[ScheduleController] Rendered term ${term} in ${(termEnd - termStart).toFixed(2)}ms`);
            }
        });

        if (this.autoScheduleE2EStartTime !== null) {
            const e2eTime = performance.now() - this.autoScheduleE2EStartTime;
            console.log(`[PERF E2E] Auto-schedule navigation (button click → schedule-cell updated): ${e2eTime.toFixed(2)}ms`);
            this.autoScheduleE2EStartTime = null;
        }
    }

    private renderEmptyGrid(container: HTMLElement): void {
        container.innerHTML = '';
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

        // Create 5-day (Mon-Fri) × 12 time slot grid (7 AM - 7 PM, hourly intervals)
        const weekdays = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
        const timeSlots = TimeUtils.TOTAL_TIME_SLOTS;

        const htmlParts: string[] = [];
        let hasConflicts = false;

        // First row: empty time cell + day headers
        htmlParts.push('<div class="time-label"></div>');
        weekdays.forEach(day => {
            htmlParts.push(`<div class="day-header">${TimeUtils.getDayAbbr(day)}</div>`);
        });

        const localEventSlots = this.getLocalEventSlotsForTerm(term);
        const calendarSlotsForTerm = localEventSlots;
        console.log(`[ScheduleController] Rendering term ${term} with ${localEventSlots.length} local calendar slots`);

        const calendarSlotsByDay = new Map<DayOfWeek, DisplayableTimeSlot[]>();
        for (const day of weekdays) {
            calendarSlotsByDay.set(day,
                calendarSlotsForTerm.filter(slot => slot.day === day)
            );
        }

        // Time rows: time label + 5 schedule cells
        for (let slot = 0; slot < timeSlots; slot++) {
            const hour = slot + TimeUtils.START_HOUR;
            const minutes = 0;
            const timeLabel = TimeUtils.formatTime({ hours: hour, minutes: minutes, displayTime: '' });

            htmlParts.push(`<div class="time-label">${timeLabel}</div>`);

            weekdays.forEach(day => {
                const dayCalendarSlots = calendarSlotsByDay.get(day) || [];
                const cell = this.getCellContent(courses, day, slot, dayCalendarSlots, term);
                if (cell.classes.includes('has-conflict')) {
                    hasConflicts = true;
                }
                htmlParts.push(`<div class="schedule-cell ${cell.classes}" data-day="${day}" data-slot="${slot}" style="position: relative;">${cell.content}</div>`);
            });
        }

        container.innerHTML = htmlParts.join('');

        this.updateTermHeaderConflictIndicator(term, hasConflicts);
        this.addSectionBlockEventListeners(container);
    }

    private updateTermHeaderConflictIndicator(term: string, hasConflicts: boolean): void {
        const termGraph = document.querySelector(`.term-graph[data-term="${term}"]`);
        if (!termGraph) return;

        const termHeader = termGraph.querySelector('.term-header');
        if (!termHeader) return;

        let warningIcon = termHeader.querySelector('.term-conflict-warning') as HTMLElement | null;

        if (hasConflicts) {
            if (!warningIcon) {
                warningIcon = document.createElement('div');
                warningIcon.className = 'term-conflict-warning';
                warningIcon.innerHTML = getInlineSVG('ALERT_CIRCLE', 'conflict-warning-icon');
                warningIcon.title = 'This term has overlapping courses';
                termHeader.appendChild(warningIcon);
            }
        } else {
            if (warningIcon) {
                warningIcon.remove();
            }
        }
    }

    private getCellContent(courses: any[], day: DayOfWeek, timeSlot: number, calendarSlots: DisplayableTimeSlot[] = [], term: string): { content: string, classes: string } {
        const calendarKey = calendarSlots.map(cs => cs.id).join(',');
        const cacheKey = `${term}-${day}-${timeSlot}-${calendarKey}`;

        if (this.cellContentCache.has(cacheKey)) {
            return this.cellContentCache.get(cacheKey);
        }

        // Find all sections that occupy this cell
        const occupyingSections: any[] = [];
        // Find calendar slots that occupy this cell
        const occupyingCalendarSlots: any[] = [];

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

            // Process each section
            for (const section of sections) {
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

        // Process calendar slots (already pre-computed with day and time info)
        for (const slot of calendarSlots) {
            // Check if this slot is on the current day
            if (slot.day !== day) {
                continue;
            }

            // Use pre-computed time values from WeeklyTimeSlot
            const startMinutes = slot.startTime.hours * 60 + slot.startTime.minutes;
            const endMinutes = slot.endTime.hours * 60 + slot.endTime.minutes;

            // Map to grid slots (TimeUtils.START_HOUR is typically 7am)
            const startSlot = Math.floor((startMinutes - TimeUtils.START_HOUR * 60) / 60);
            const endSlot = Math.ceil((endMinutes - TimeUtils.START_HOUR * 60) / 60);

            // Check if this slot overlaps with current time slot
            if (timeSlot >= startSlot && timeSlot < endSlot) {
                const isFirstSlot = timeSlot === startSlot;

                occupyingCalendarSlots.push({
                    slot,
                    startSlot,
                    endSlot,
                    isFirstSlot,
                    startMinutes,
                    endMinutes,
                });
            }
        }

        if (occupyingSections.length === 0 && occupyingCalendarSlots.length === 0) {
            return { content: '', classes: '' };
        }

        let hasConflict = false;
        let allConflictingSections: Section[] = [];

        if (occupyingSections.length > 1) {
            for (let i = 0; i < occupyingSections.length; i++) {
                const crn1 = occupyingSections[i].section.crn.toString();

                for (let j = i + 1; j < occupyingSections.length; j++) {
                    const crn2 = occupyingSections[j].section.crn.toString();

                    if (this.conflictMap.get(crn1)?.has(crn2)) {
                        hasConflict = true;
                        if (!allConflictingSections.includes(occupyingSections[i].section)) {
                            allConflictingSections.push(occupyingSections[i].section);
                        }
                        if (!allConflictingSections.includes(occupyingSections[j].section)) {
                            allConflictingSections.push(occupyingSections[j].section);
                        }
                    }
                }
            }
        }

        const contentParts: string[] = [];

        for (const occupyingSection of occupyingSections) {
            if (!occupyingSection.isFirstSlot) {
                continue;
            }

            const courseColor = this.getCourseColor(occupyingSection.course.course.id);
            const isPreview = this.hoverPreviewSections.has(occupyingSection.section.crn);
            const blockClass = isPreview ? 'section-preview' : 'section-block';

            const durationMinutes = occupyingSection.endMinutes - occupyingSection.startMinutes;
            const startOffsetMinutes = occupyingSection.startMinutes - (TimeUtils.START_HOUR * 60);
            const slotStartMinutes = timeSlot * 60;
            const topOffsetPercent = ((startOffsetMinutes - slotStartMinutes) / 60) * 100;
            const heightPercent = (durationMinutes / 60) * 100;

            contentParts.push(`
                <div class="${blockClass}"
                     data-course-id="${occupyingSection.course.course.id}"
                     data-section-number="${occupyingSection.section.number}"
                     data-section-crn="${occupyingSection.section.crn}"
                     data-selected-course-index="${occupyingSection.courseIndex || 0}"
                     style="
                    ${isPreview ? `border-color: ${courseColor};` : `background-color: ${courseColor};`}
                    height: ${heightPercent}%;
                    width: 100%;
                    position: absolute;
                    top: ${topOffsetPercent}%;
                    left: 0;
                    z-index: ${isPreview ? '15' : '10'};
                    ${!isPreview ? `border: 1px solid rgba(0,0,0,0.2);` : ''}
                    border-radius: 3px;
                    box-sizing: border-box;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    font-weight: bold;
                    font-size: 0.8rem;
                    ${isPreview ? `color: var(--color-text-primary);` : `color: white; text-shadow: 1px 1px 1px rgba(0,0,0,0.3);`}
                    cursor: pointer;
                ">
                    ${occupyingSection.course.course.department.abbreviation}${occupyingSection.course.course.number}
                </div>
            `);
        }

        // Add conflict overlay if conflicts exist and this is the first slot
        if (hasConflict && occupyingSections.some(os => os.isFirstSlot)) {
            // Calculate overlapping time range
            let overlapStartMinutes = Math.max(...occupyingSections.map(os => os.startMinutes));
            let overlapEndMinutes = Math.min(...occupyingSections.map(os => os.endMinutes));

            const overlapDurationMinutes = overlapEndMinutes - overlapStartMinutes;
            const overlapStartOffsetMinutes = overlapStartMinutes - (TimeUtils.START_HOUR * 60);
            const slotStartMinutes = timeSlot * 60;
            const overlapTopOffsetPercent = ((overlapStartOffsetMinutes - slotStartMinutes) / 60) * 100;
            const overlapHeightPercent = (overlapDurationMinutes / 60) * 100;

            // Build conflict information
            const conflictInfo = allConflictingSections.map(s => {
                const conflictCourse = occupyingSections.find(os => os.section.crn === s.crn)?.course.course;
                return conflictCourse ? `${conflictCourse.department.abbreviation}${conflictCourse.number} ${s.number}` : '';
            }).filter(info => info).join(', ');

            // Log conflict details (moved outside overlayStartsInThisSlot to always log)
            const startHours = Math.floor(overlapStartMinutes / 60);
            const startMins = overlapStartMinutes % 60;
            const endHours = Math.floor(overlapEndMinutes / 60);
            const endMins = overlapEndMinutes % 60;

            // Only add overlay if it starts in this slot
            // timeSlot is 0-indexed grid row, need to add START_HOUR to get actual hour
            const overlayStartsInThisSlot = overlapStartMinutes >= (TimeUtils.START_HOUR + timeSlot) * 60 &&
                                           overlapStartMinutes < (TimeUtils.START_HOUR + timeSlot + 1) * 60;

            if (overlayStartsInThisSlot) {

                contentParts.push(`
                    <div class="conflict-overlay"
                         title="Conflict: ${conflictInfo}"
                         data-conflicts-with="${conflictInfo}"
                         style="
                        height: ${overlapHeightPercent}%;
                        width: 100%;
                        top: ${overlapTopOffsetPercent}%;
                        left: 0;
                    ">
                    </div>
                `);
            }
        }

        for (const calendarSlot of occupyingCalendarSlots) {
            if (!calendarSlot.isFirstSlot) {
                continue;
            }

            const durationMinutes = calendarSlot.endMinutes - calendarSlot.startMinutes;
            const startOffsetMinutes = calendarSlot.startMinutes - (TimeUtils.START_HOUR * 60);
            const slotStartMinutes = timeSlot * 60;
            const topOffsetPercent = ((startOffsetMinutes - slotStartMinutes) / 60) * 100;
            const heightPercent = (durationMinutes / 60) * 100;

            const eventTitle = Validators.escapeHtml(calendarSlot.slot.title || 'Untitled Event');
            const eventId = calendarSlot.slot.sourceId || '';

            contentParts.push(`
                <div class="external-event-block"
                     data-event-id="${eventId}"
                     title="${eventTitle}"
                     style="
                    height: ${heightPercent}%;
                    width: 100%;
                    position: absolute;
                    top: ${topOffsetPercent}%;
                    left: 0;
                    z-index: 5;
                    border-radius: 3px;
                    box-sizing: border-box;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    font-weight: 500;
                    font-size: 0.7rem;
                    overflow: hidden;
                ">
                    ${eventTitle}
                </div>
            `);
        }

        const hasAnyFirstSlot = occupyingSections.some(os => os.isFirstSlot) || occupyingCalendarSlots.some(s => s.isFirstSlot);
        const classes = hasAnyFirstSlot ?
            `occupied section-start ${hasConflict ? 'has-conflict' : ''}` :
            '';

        const result = { content: contentParts.join(''), classes };

        // Performance optimization: Store result in cache
        this.cellContentCache.set(cacheKey, result);

        return result;
    }

    private getCourseColor(courseId: string): string {
        return this.colorCache.get(courseId) || '#6B7280';
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

    /**
     * Set a custom color for a course and persist it
     */
    setCourseColor(courseId: string, color: string): void {
        // Update local cache
        this.courseColorMap.set(courseId, color);
        this.usedColors.add(color);
        // Persist via CourseSelectionService
        this.courseSelectionService.setCourseColor(courseId, color);
        // Re-render
        this.renderScheduleGrids();
    }

    getCourseFromElement(element: HTMLElement): Course | undefined {
        return this.elementToCourseMap.get(element);
    }

    applyFiltersAndRefresh(): void {
        this.displayScheduleSelectedCourses();
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

        let course: Course | undefined;
        let section: Section | null = null;

        // Check if this is the course being edited in wizard mode
        if (this.wizardPreviewCourse?.id === courseId && this.wizardPreviewSelections) {
            course = this.wizardPreviewCourse;

            // Find section from wizard selections
            if (this.wizardPreviewSelections.lecture?.number === sectionNumber) {
                section = this.wizardPreviewSelections.lecture;
            } else if (this.wizardPreviewSelections.discussion?.number === sectionNumber) {
                section = this.wizardPreviewSelections.discussion;
            } else if (this.wizardPreviewSelections.lab?.number === sectionNumber) {
                section = this.wizardPreviewSelections.lab;
            }
        } else {
            // Use existing logic for saved courses
            const selectedCourses = this.courseSelectionService.getSelectedCourses();
            const selectedCourse = selectedCourses.find(sc => sc.course.id === courseId);

            if (!selectedCourse) {
                console.warn('Course not found:', courseId);
                return;
            }

            course = selectedCourse.course;

            // Find the section from component selections
            if (selectedCourse.selectedLecture?.number === sectionNumber) {
                section = selectedCourse.selectedLecture;
            } else if (selectedCourse.selectedDiscussion?.number === sectionNumber) {
                section = selectedCourse.selectedDiscussion;
            } else if (selectedCourse.selectedLab?.number === sectionNumber) {
                section = selectedCourse.selectedLab;
            }
        }

        if (!section || !course) {
            console.warn('Section not found:', sectionNumber);
            return;
        }

        // Create section data for modal controller
        const sectionData = {
            courseCode: `${course.department.abbreviation}${course.number}`,
            courseName: course.name,
            section: section,
            course: course,
            courseId: courseId,
            currentColor: this.getCourseColor(courseId),
            onColorChange: (color: string) => this.setCourseColor(courseId, color)
        };

        // Show modal using the dedicated controller
        this.sectionInfoModalController.show(sectionData);
    }

    private setupTermFocusHandlers(): void {
        const backButtons = document.querySelectorAll('.term-back-btn');
        backButtons.forEach(btn => {
            btn.innerHTML = getInlineSVG('ARROW_FORWARD_UP', 'term-back-icon');
        });

        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            // Check if back button was clicked
            if (target.closest('.term-back-btn')) {
                e.stopPropagation();
                this.unfocusTerm();
                return;
            }

            // Check if term-graph or its header was clicked (but not the schedule grid)
            const termGraph = target.closest('.term-graph');
            const isMobile = document.documentElement.classList.contains('is-mobile');
            if (termGraph && !target.closest('.schedule-grid') && !isMobile) {
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

        autoScheduleBtn.insertAdjacentHTML('afterbegin', getInlineSVG('WAND', 'auto-schedule-icon'));
        autoScheduleBtn.addEventListener('click', () => this.handleAutoSchedule());

        // Setup navigation buttons
        const prevBtn = document.getElementById('schedule-prev-btn');
        const nextBtn = document.getElementById('schedule-next-btn');

        if (prevBtn) {
            prevBtn.insertAdjacentHTML('afterbegin', getInlineSVG('ARROW_BAR_LEFT', 'schedule-nav-icon'));
            prevBtn.addEventListener('click', () => {
                this.autoScheduleE2EStartTime = performance.now();
                this.handlePrevSchedule();
            });
        }

        if (nextBtn) {
            nextBtn.insertAdjacentHTML('afterbegin', getInlineSVG('ARROW_BAR_RIGHT', 'schedule-nav-icon'));
            nextBtn.addEventListener('click', () => {
                this.autoScheduleE2EStartTime = performance.now();
                this.handleNextSchedule();
            });
        }
    }

    setupClearAllSectionsButton(): void {
        const clearAllBtn = document.getElementById('clear-all-sections-btn');
        if (!clearAllBtn) {
            console.warn('Clear all sections button not found');
            return;
        }

        clearAllBtn.insertAdjacentHTML('afterbegin', getInlineSVG('ERASER', 'clear-all-eraser-icon'));
        clearAllBtn.addEventListener('click', () => this.handleClearAllSections());
    }

    setupCourseSelectionChangeListener(): void {
        this.courseSelectionService.onSelectionChange(() => {
            if (this.isApplyingAutoSchedule) return;
            this.generatedSchedules = [];
            this.currentScheduleIndex = 0;
            this.updateAutoScheduleButtonUI();
        });
    }

    private async handleClearAllSections(): Promise<void> {
        const selectedCourses = this.courseSelectionService.getSelectedCourses();

        if (selectedCourses.length === 0) {
            alert('No courses selected.');
            return;
        }

        const hasAnySections = selectedCourses.some(sc =>
            sc.selectedLecture || sc.selectedDiscussion || sc.selectedLab
        );

        if (!hasAnySections) {
            alert('No sections selected to clear.');
            return;
        }

        if (confirm('Clear all selected sections for all courses?')) {
            try {
                await this.courseSelectionService.clearAllComponents();
            } catch (error) {
                console.error('Failed to clear all components:', error);
                alert('Failed to clear sections. Please try again.');
            }
        }
    }

    private updateAutoScheduleButtonUI(): void {
        const btn = document.getElementById('auto-schedule-btn') as HTMLButtonElement;
        const navButtons = document.getElementById('schedule-nav-buttons');
        const counter = document.getElementById('schedule-counter');
        if (!btn) return;

        if (this.generatedSchedules.length === 0) {
            // Show auto-schedule button, hide nav buttons
            btn.style.display = '';
            btn.innerHTML = `${getInlineSVG('WAND', 'auto-schedule-icon')}<span>Auto-Schedule</span>`;
            btn.disabled = false;
            btn.title = 'Automatically generate a schedule';
            if (navButtons) navButtons.style.display = 'none';
        } else {
            // Hide auto-schedule button, show nav buttons
            btn.style.display = 'none';
            if (navButtons) navButtons.style.display = 'flex';
            if (counter) counter.textContent = `${this.currentScheduleIndex + 1}/${this.generatedSchedules.length}`;
        }
    }

    private async handlePrevSchedule(): Promise<void> {
        if (this.generatedSchedules.length === 0) return;

        if (this.currentScheduleIndex === 0) {
            this.currentScheduleIndex = this.generatedSchedules.length - 1;
        } else {
            this.currentScheduleIndex--;
        }

        await this.applyScheduleAtIndex(this.currentScheduleIndex);
        this.updateAutoScheduleButtonUI();
    }

    private async handleNextSchedule(): Promise<void> {
        if (this.generatedSchedules.length === 0) return;

        if (this.currentScheduleIndex >= this.generatedSchedules.length - 1) {
            this.currentScheduleIndex = 0;
        } else {
            this.currentScheduleIndex++;
        }

        await this.applyScheduleAtIndex(this.currentScheduleIndex);
        this.updateAutoScheduleButtonUI();
    }

    private async handleAutoSchedule(): Promise<void> {
        if (!this.scheduleFilterService) {
            console.error('[Auto-Schedule] Filter service not available');
            alert('Filter service not available. Please try again.');
            return;
        }

        const selectedCourses = this.courseSelectionService.getSelectedCourses();

        if (selectedCourses.length === 0) {
            console.warn('[Auto-Schedule] No courses selected');
            alert('No courses selected. Please select courses first.');
            return;
        }

        // Populate lockedSections with currently selected components
        for (const selectedCourse of selectedCourses) {
            selectedCourse.lockedSections = new Set();

            if (selectedCourse.selectedLecture) {
                selectedCourse.lockedSections.add(String(selectedCourse.selectedLecture.crn));
            }
            if (selectedCourse.selectedDiscussion) {
                selectedCourse.lockedSections.add(String(selectedCourse.selectedDiscussion.crn));
            }
            if (selectedCourse.selectedLab) {
                selectedCourse.lockedSections.add(String(selectedCourse.selectedLab.crn));
            }
        }

        if (!this.modalService) {
            console.error('[Auto-Schedule] Modal service not available');
            await this.generateSchedulesWithSettings({ blockedTimes: [] }, selectedCourses);
            return;
        }

        const scheduleFilterModal = new ScheduleFilterModalController(this.modalService, this);
        scheduleFilterModal.setScheduleFilterService(this.scheduleFilterService);
        scheduleFilterModal.setSelectedCourses(selectedCourses);
        scheduleFilterModal.setMode('auto-schedule');
        scheduleFilterModal.show();
    }

    /**
     * Generate schedules with the given settings.
     * Called after user configures settings in the modal.
     */
    private async generateSchedulesWithSettings(
        settings: AutoScheduleSettings,
        selectedCourses: SelectedCourse[]
    ): Promise<void> {
        const autoScheduleBtn = document.getElementById('auto-schedule-btn') as HTMLButtonElement;
        if (autoScheduleBtn) {
            autoScheduleBtn.disabled = true;
            autoScheduleBtn.textContent = 'Generating...';
        }

        try {
            const autoScheduler = new AutoScheduler(this.scheduleFilterService!);

            let blockedTimes = [...settings.blockedTimes];
            if (settings.avoidCalendarEvents) {
                const calendarBlockedTimes = this.getAllLocalEventBlockedTimes();
                blockedTimes = [...blockedTimes, ...calendarBlockedTimes];
            }

            if (blockedTimes.length > 0) {
                this.scheduleFilterService!.addFilter('blockedTimes', {
                    blockedTimes
                });
            }

            if (settings.wakeUpTime) {
                this.scheduleFilterService!.addFilter('wakeUpTime', {
                    wakeUpTime: settings.wakeUpTime
                });
            }

            const allSchedules = autoScheduler.generateSchedules(selectedCourses, 100);

            this.scheduleFilterService!.removeFilter('blockedTimes');
            this.scheduleFilterService!.removeFilter('wakeUpTime');

            if (allSchedules.length === 0) {
                console.warn('[Auto-Schedule] No valid schedules found');
                alert('Could not generate a valid schedule.\n\nCommon causes:\n• Missing or invalid time/day data for course sections\n• Active schedule filters that exclude all sections\n• Course sections with conflicts');
                this.updateAutoScheduleButtonUI();
                return;
            }

            this.generatedSchedules = allSchedules;
            this.currentScheduleIndex = 0;

            // Apply the first schedule
            await this.applyScheduleAtIndex(0);
            this.updateAutoScheduleButtonUI();

        } catch (error) {
            console.error('[Auto-Schedule] Error generating schedules:', error);
            alert('An error occurred while generating the schedule. Please try again.');
            this.generatedSchedules = [];
            this.currentScheduleIndex = 0;
            this.updateAutoScheduleButtonUI();

            this.scheduleFilterService!.removeFilter('blockedTimes');
            this.scheduleFilterService!.removeFilter('wakeUpTime');
        }
    }

    async generateSchedulesWithActiveFilters(selectedCourses: SelectedCourse[]): Promise<void> {
        const autoScheduleBtn = document.getElementById('auto-schedule-btn') as HTMLButtonElement;
        if (autoScheduleBtn) {
            autoScheduleBtn.disabled = true;
            autoScheduleBtn.textContent = 'Generating...';
        }

        try {
            const autoScheduler = new AutoScheduler(this.scheduleFilterService!);

            const allSchedules = autoScheduler.generateSchedules(selectedCourses, 100);

            if (allSchedules.length === 0) {
                console.warn('[Auto-Schedule] No valid schedules found');
                alert('Could not generate a valid schedule.\n\nCommon causes:\n• Missing or invalid time/day data for course sections\n• Active schedule filters that exclude all sections\n• Course sections with conflicts');
                this.updateAutoScheduleButtonUI();
                return;
            }

            this.generatedSchedules = allSchedules;
            this.currentScheduleIndex = 0;

            await this.applyScheduleAtIndex(0);
            this.updateAutoScheduleButtonUI();

        } catch (error) {
            console.error('[Auto-Schedule] Error generating schedules:', error);
            alert('An error occurred while generating the schedule. Please try again.');
            this.generatedSchedules = [];
            this.currentScheduleIndex = 0;
            this.updateAutoScheduleButtonUI();
        }
    }

    private async applyScheduleAtIndex(index: number): Promise<void> {
        const schedule = this.generatedSchedules[index];
        if (!schedule) {
            console.warn(`[Auto-Schedule] No schedule found at index ${index}`);
            return;
        }

        this.isApplyingAutoSchedule = true;
        try {
            let lockedCount = 0;

            const selections: Array<{
                course: any;
                lecture: any;
                discussion: any;
                lab: any;
            }> = [];

            for (const result of schedule) {
                if (result.isLocked) {
                    lockedCount++;
                    continue;
                }

                selections.push({
                    course: result.course,
                    lecture: result.combination.lecture,
                    discussion: result.combination.discussion,
                    lab: result.combination.lab
                });
            }

            if (selections.length > 0) {
                await this.courseSelectionService.batchSetSelectedComponents(selections, true);
                this.renderScheduleGrids();
            }
        } finally {
            this.isApplyingAutoSchedule = false;
        }
    }

    // Performance optimization: Generate cache key for invalidation
    private generateCacheKey(selectedCourses: SelectedCourse[]): string {
        const courseKeys = selectedCourses
            .map(sc => {
                const lectureId = sc.selectedLecture?.crn || 'none';
                const discussionId = sc.selectedDiscussion?.crn || 'none';
                const labId = sc.selectedLab?.crn || 'none';
                const color = this.getCourseColor(sc.course.id) || 'default';
                return `${sc.course.id}-${lectureId}-${discussionId}-${labId}-${color}`;
            })
            .sort()
            .join('|');

        return courseKeys;
    }

}
