import { DayOfWeek, Course, Section, Period, LectureGroup } from '../../types/types'
import { SelectedCourse, Schedule, LocalCalendarEvent, AcademicTerm, EventType } from '../../types/schedule'
import { CourseSelectionService } from '../../services/selection/CourseSelectionService'
import { CourseDataService } from '../../services/data/courseDataService'
import { FilterService } from '../../services/filtering/FilterService'
import { SectionInfoModalController } from './SectionInfoModalController'
import { FilterModalController } from './FilterModalController'
import { ComponentSelectionWizard } from '../components/ComponentSelectionWizard'
import { LocalEventModal } from '../components/LocalEventModal'
import { DeleteLocalEventModal } from '../components/DeleteLocalEventModal'
import { SidebarManager } from '../sidebar/SidebarManager'
import { TimeUtils } from '../utils/timeUtils'
import { BitMaskEngine, buildConflictMatrix } from '../../core/scheduling/BitMaskEngine'
import { getComputedTerm, validateSelectedCourses, getDisplayTerms } from '../../utils/typeGuards'
import type { WeeklyTimeSlot, DisplayableTimeSlot } from '../../types/schedule'
import { getInlineSVG } from '../../utils/iconPaths'
import { Validators } from '../../utils/validators'
import { ModalService } from '../../services/ui/ModalService'
import { ModalQueue } from '../../services/ui/ModalQueue'
import { AutoScheduleIntroModal } from '../components/AutoScheduleIntroModal'
import { CourseColorService } from '../../services/scheduling/CourseColorService'
import { AutoScheduleOrchestrator, type CalendarEventProvider } from '../../services/scheduling/AutoScheduleOrchestrator'
import type { ComponentSelections, SectionOccupant, CalendarOccupant, CellData, CellContentResult } from '../../types/scheduling'

export class ScheduleController implements CalendarEventProvider {
    private courseSelectionService: CourseSelectionService;
    private courseDataService: CourseDataService | null = null;
    private filterService: FilterService | null = null;
    private sectionInfoModalController: SectionInfoModalController | null = null;
    private conflictDetector: BitMaskEngine | null = null;
    private containerEventListeners = new Map<HTMLElement, EventListener>();
    private escapeKeyHandler: ((e: KeyboardEvent) => void) | null = null;
    private componentWizard: ComponentSelectionWizard | null = null;
    private wizardPreviewCourse: Course | null = null;
    private wizardPreviewSelections: ComponentSelections | null = null;
    private hoverPreviewSelections: ComponentSelections | null = null;
    private colorService: CourseColorService;
    private autoScheduleOrchestrator: AutoScheduleOrchestrator;
    private currentSchedule: Schedule | null = null;
    private onScheduleUpdate: ((scheduleId: string, updates: Partial<Schedule>) => void) | null = null;
    private sidebarManager: SidebarManager;
    private modalService: ModalService | null = null;

    // Performance optimization: Caching infrastructure for grid rendering
    private cellContentCache: Map<string, CellContentResult> = new Map();
    private currentCacheKey: string = '';
    private conflictMap: Map<number, Set<number>> = new Map();
    private lastConflictCacheKey: string = '';


    constructor(courseSelectionService: CourseSelectionService, colorService: CourseColorService, autoScheduleOrchestrator: AutoScheduleOrchestrator) {
        this.courseSelectionService = courseSelectionService;
        this.colorService = colorService;
        this.autoScheduleOrchestrator = autoScheduleOrchestrator;
        this.sidebarManager = new SidebarManager('schedule-sidebar-content');
        this.setupTermFocusHandlers();

        this.autoScheduleOrchestrator.onStateChange(() => {
            this.updateAutoScheduleButtonUI();
        });
    }

    /**
     * Set the ModalService for opening modals from this controller.
     */
    setModalService(modalService: ModalService): void {
        this.modalService = modalService;
    }

    setCourseDataService(courseDataService: CourseDataService): void {
        this.courseDataService = courseDataService;
    }

    setSectionInfoModalController(sectionInfoModalController: SectionInfoModalController): void {
        this.sectionInfoModalController = sectionInfoModalController;
    }

    setConflictDetector(engine: BitMaskEngine): void {
        this.conflictDetector = engine;
        
        if (this.filterService) {
            this.filterService.setConflictDetector();
        }
    }

    setFilterService(filterService: FilterService): void {
        this.filterService = filterService;

        if (this.conflictDetector) {
            this.filterService.setConflictDetector();
        }

        // Set up filter change listener to refresh display
        this.filterService.addEventListener(() => {
            this.applyFiltersAndRefresh();
        });
    }

    // =========================================================================
    // Schedule Loading
    // =========================================================================

    /**
     * Load a schedule for display.
     * Should be called when the active schedule changes.
     */
    async loadExternalEvents(schedule: Schedule): Promise<void> {
        this.currentSchedule = schedule;
        if (this.isSchedulePageVisible()) {
            this.renderScheduleGrids();
        }
        this.displayScheduleSelectedCourses();
    }

    private isSchedulePageVisible(): boolean {
        const schedulePage = document.getElementById('schedule-page');
        return schedulePage ? getComputedStyle(schedulePage).display !== 'none' : false;
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
    getAllLocalEventBlockedTimes(): WeeklyTimeSlot[] {
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

    private deleteLocalEvent(eventId: string): void {
        if (!this.currentSchedule || !this.onScheduleUpdate) return;

        const updatedLocalEvents = (this.currentSchedule.localEvents || []).filter(e => e.id !== eventId);

        this.currentSchedule = {
            ...this.currentSchedule,
            localEvents: updatedLocalEvents,
        };

        this.renderScheduleGrids();
        this.displayScheduleSelectedCourses();

        this.onScheduleUpdate(this.currentSchedule.id, {
            localEvents: updatedLocalEvents,
        });
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
        this.displayScheduleSelectedCourses();

        this.onScheduleUpdate(this.currentSchedule.id, {
            localEvents: updatedLocalEvents,
        });
    }

    /**
     * Open the component selection wizard for a course.
     * Uses SidebarManager for consistent panel management.
     */
    openComponentWizard(course: Course, existingSelections?: SelectedCourse): void {
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
            this.filterService || undefined,
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

        const hadPreview = this.wizardPreviewCourse !== null;
        this.wizardPreviewCourse = null;
        this.wizardPreviewSelections = null;
        this.hoverPreviewSelections = null;
        if (hadPreview) {
            this.renderScheduleGrids();
        }
    }

    /**
     * Handle wizard completion - save component selections
     */
    private async onWizardComplete(course: Course, selections: ComponentSelections): Promise<void> {
        // Clear preview first
        this.wizardPreviewCourse = null;
        this.wizardPreviewSelections = null;
        this.hoverPreviewSelections = null;

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
    private onWizardSelectionChange(course: Course, selections: ComponentSelections): void {
        this.wizardPreviewCourse = course;
        this.wizardPreviewSelections = selections;
        this.hoverPreviewSelections = null;
        this.cellContentCache.clear();
        this.renderScheduleGrids();
    }

    onWizardHoverPreview(course: Course, selections: ComponentSelections): void {
        this.wizardPreviewCourse = course;
        this.hoverPreviewSelections = selections;
        this.cellContentCache.clear();
        this.renderScheduleGrids();
    }

    displayScheduleSelectedCourses(): void {
        const selectedCoursesContainer = document.getElementById('schedule-sidebar-content');
        const countElement = document.getElementById('schedule-selected-count');

        if (!selectedCoursesContainer) {
            console.error('Missing DOM element - selectedCoursesContainer not found');
            return;
        }

        let selectedCourses = this.courseSelectionService.getSelectedCourses();

        // Always show calendar button - users can add local events even without courses
        if (selectedCourses.length === 0) {
            if (countElement) {
                countElement.textContent = '(0)';
            }

            // Preserve panels if open
            const wizardPanel = selectedCoursesContainer.querySelector('.sidebar-panel--component-wizard');
            const sidebarPanel = selectedCoursesContainer.querySelector('.sidebar-panel');

            this.renderCalendarEventsHeader();

            const html = `<div class="empty-state">No courses selected yet</div>`;
            selectedCoursesContainer.innerHTML = html;

            if (wizardPanel) {
                selectedCoursesContainer.appendChild(wizardPanel);
            }
            if (sidebarPanel) {
                selectedCoursesContainer.appendChild(sidebarPanel);
            }

            return;
        }

        // Always show all selected courses - filters only apply inside the component wizard
        const sortedCourses = selectedCourses.sort((a, b) => {
            const deptCompare = a.course.departmentAbbr.localeCompare(b.course.departmentAbbr);
            if (deptCompare !== 0) return deptCompare;
            return a.course.number.localeCompare(b.course.number);
        });

        this.renderCalendarEventsHeader();

        const html = this.buildAllCoursesHTML(sortedCourses);
        if (countElement) {
            countElement.textContent = `(${selectedCourses.length})`;
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
    }

    private renderCalendarEventsHeader(): void {
        const slot = document.getElementById('calendar-events-header-slot');
        if (!slot) return;
        slot.innerHTML = this.buildCalendarEventsButtonHTML();
        const calendarBtn = slot.querySelector('#calendar-events-btn');
        if (calendarBtn) {
            calendarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openAddLocalEventModal();
            });
        }
    }
    
    
    private buildCourseHeaderHTML(course: Course, selectedCourse: SelectedCourse | undefined, isExpanded: boolean = false): string {
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
            <div class="sidebar-content-item schedule-course-item ${isExpanded ? 'expanded' : 'collapsed'}" data-course-id="${course.id}">
                <div class="schedule-course-header">
                    <div class="schedule-course-info">
                        <div class="schedule-course-code">${Validators.escapeHtml(course.departmentAbbr)}${Validators.escapeHtml(course.number)}</div>
                        <div class="schedule-course-name">${Validators.escapeHtml(course.name)}</div>
                        ${selectedComponentsHTML}
                        <div class="schedule-course-credits">${credits}</div>
                    </div>
                    <div class="course-item-controls">
                        <button class="course-clear-sections-btn" data-course-id="${course.id}" title="Clear selected sections">
                            ${getInlineSVG('ERASER', 'eraser-icon')}
                        </button>
                        <button class="course-remove-btn" data-course-id="${course.id}" title="Remove from selection">
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
    private hasValidTimeSlot(section: Section): boolean {
        return section.periods.some((period: Period) => {
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
    private getIncompleteSelectionInfo(selectedCourse: SelectedCourse): { isIncomplete: boolean; message: string } {
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
        const validLectures = course.lectures.filter((lg: LectureGroup) => this.hasValidTimeSlot(lg.section));
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
        const hasValidDiscussions = course.lectures.some((lg: LectureGroup) =>
            lg.compatibleDiscussions && lg.compatibleDiscussions.some((d: Section) => this.hasValidTimeSlot(d))
        );
        const hasValidLabs = course.lectures.some((lg: LectureGroup) =>
            lg.compatibleLabs && lg.compatibleLabs.some((l: Section) => this.hasValidTimeSlot(l))
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
    
    private buildAllCoursesHTML(sortedCourses: SelectedCourse[]): string {
        let html = '';

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
        return `
            <button class="calendar-events-btn" id="calendar-events-btn">
                <span class="calendar-events-btn-icon">${getInlineSVG('CALENDAR_DOWN', 'calendar-btn-icon')}</span>
                <span class="calendar-events-btn-name">Calendar Events</span>
            </button>
        `;
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
        const validCourseItem = document.querySelector<HTMLElement>(`.schedule-course-item[data-course-id="${course.id}"]`);
        if (!validCourseItem) return;
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
        const cacheKey = selectedCourses.map(sc =>
            `${sc.course.id}:${sc.selectedLecture?.crn ?? ''}-${sc.selectedDiscussion?.crn ?? ''}-${sc.selectedLab?.crn ?? ''}`
        ).sort().join(',');
        if (cacheKey === this.lastConflictCacheKey) return;

        this.conflictMap.clear();
        this.lastConflictCacheKey = cacheKey;

        const allSections: Section[] = [];
        for (const sc of selectedCourses) {
            if (sc.selectedLecture) allSections.push(sc.selectedLecture);
            if (sc.selectedDiscussion) allSections.push(sc.selectedDiscussion);
            if (sc.selectedLab) allSections.push(sc.selectedLab);
        }

        if (!this.conflictDetector) {
            return;
        }

        this.conflictMap = buildConflictMatrix(allSections, this.conflictDetector);
    }

    private precomputeCourseColors(selectedCourses: SelectedCourse[]): void {
        this.colorService.precomputeCourseColors(selectedCourses);
    }

    private buildHoverCourse(selectedCourses: SelectedCourse[]): SelectedCourse | null {
        if (!this.wizardPreviewCourse || !this.hoverPreviewSelections) return null;

        const hover = this.hoverPreviewSelections;

        const lecture = hover.lecture || null;
        const discussion = hover.discussion || null;
        const lab = hover.lab || null;

        if (!lecture && !discussion && !lab) return null;

        const base = selectedCourses.find(sc => sc.course.id === this.wizardPreviewCourse!.id);
        if (!base) return null;

        return { ...base, selectedLecture: lecture, selectedDiscussion: discussion, selectedLab: lab };
    }

    renderScheduleGrids(): void {
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
        const hoverCourse = this.buildHoverCourse(selectedCourses);

        grids.forEach(term => {
            const gridContainer = document.getElementById(`schedule-grid-${term}`);
            if (!gridContainer) return;

            const termCourses = selectedCourses.filter(sc => {
                const computedTerm = getComputedTerm(sc);

                if (!computedTerm) {
                    return false;
                }

                const displayTerms = getDisplayTerms(computedTerm);
                return displayTerms.includes(term);
            });

            let termHoverCourse: SelectedCourse | null = null;
            if (hoverCourse) {
                const hoverTerm = getComputedTerm(hoverCourse);
                if (hoverTerm) {
                    const hoverDisplayTerms = getDisplayTerms(hoverTerm);
                    if (hoverDisplayTerms.includes(term)) {
                        termHoverCourse = hoverCourse;
                    }
                }
            }

            this.renderPopulatedGrid(gridContainer, termCourses, term, termHoverCourse);
        });
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
                const gridContainer = document.getElementById(`schedule-grid-${term}`);
                if (!gridContainer) return;

                const termCourses = selectedCourses.filter(sc => {
                    const computedTerm = getComputedTerm(sc);
                    if (!computedTerm) return false;
                    const displayTerms = getDisplayTerms(computedTerm);
                    return displayTerms.includes(term);
                });

                this.renderPopulatedGrid(gridContainer, termCourses, term, null);
            }
        });

    }

    private renderPopulatedGrid(container: HTMLElement, courses: SelectedCourse[], term: string, hoverCourse: SelectedCourse | null): void {
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

        // First row: term label + day headers
        htmlParts.push(`<div class="time-label term-letter-label">${term}</div>`);
        weekdays.forEach(day => {
            htmlParts.push(`<div class="day-header">${TimeUtils.getDayAbbr(day)}</div>`);
        });

        const localEventSlots = this.getLocalEventSlotsForTerm(term);

        const cellMap = this.buildCellOccupancyMap(courses, localEventSlots, weekdays, hoverCourse);

        // Time rows: time label + 5 schedule cells
        for (let slot = 0; slot < timeSlots; slot++) {
            const hour = slot + TimeUtils.START_HOUR;
            const minutes = 0;
            const timeLabel = TimeUtils.formatTime({ hours: hour, minutes: minutes, displayTime: '' });

            htmlParts.push(`<div class="time-label">${timeLabel}</div>`);

            weekdays.forEach(day => {
                const cell = this.getCellFromMap(cellMap.get(day)?.get(slot), slot, day, term);
                if (cell.hasConflict) hasConflicts = true;
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

        let warningIcon = termGraph.querySelector('.term-conflict-warning') as HTMLElement | null;

        if (hasConflicts) {
            if (!warningIcon) {
                warningIcon = document.createElement('div');
                warningIcon.className = 'term-conflict-warning';
                warningIcon.innerHTML = getInlineSVG('ALERT_CIRCLE', 'conflict-warning-icon');
                warningIcon.title = 'This term has overlapping courses';
                termGraph.appendChild(warningIcon);
            }
        } else {
            if (warningIcon) {
                warningIcon.remove();
            }
        }
    }

    private buildCellOccupancyMap(
        courses: SelectedCourse[],
        calendarSlotsForTerm: DisplayableTimeSlot[],
        weekdays: DayOfWeek[],
        hoverCourse: SelectedCourse | null
    ): Map<DayOfWeek, Map<number, CellData>> {
        const map = new Map<DayOfWeek, Map<number, CellData>>();
        for (const day of weekdays) map.set(day, new Map());

        const getCell = (day: DayOfWeek, slot: number): CellData => {
            const dayMap = map.get(day)!;
            if (!dayMap.has(slot)) dayMap.set(slot, { sections: [], calendar: [] });
            return dayMap.get(slot)!;
        };

        const addCourse = (selectedCourse: SelectedCourse, isPreview: boolean) => {
            const sections = [
                selectedCourse.selectedLecture,
                selectedCourse.selectedDiscussion,
                selectedCourse.selectedLab,
            ].filter(Boolean) as Section[];

            for (const section of sections) {
                for (const day of weekdays) {
                    const periodsOnThisDay = section.periods.filter(p => p.days.has(day));
                    if (periodsOnThisDay.length === 0) continue;

                    let earliestStartMinutes = Infinity;
                    let latestEndMinutes = -1;
                    const occupiedSlots = new Set<number>();
                    let sectionStartSlot = Infinity;
                    let sectionEndSlot = -1;

                    for (const period of periodsOnThisDay) {
                        const startSlot = TimeUtils.timeToGridRowStart(period.startTime);
                        const endSlot = TimeUtils.timeToGridRowEnd(period.endTime);
                        for (let s = startSlot; s < endSlot; s++) occupiedSlots.add(s);
                        sectionStartSlot = Math.min(sectionStartSlot, startSlot);
                        sectionEndSlot = Math.max(sectionEndSlot, endSlot);
                        earliestStartMinutes = Math.min(earliestStartMinutes, period.startTime.hours * 60 + period.startTime.minutes);
                        latestEndMinutes = Math.max(latestEndMinutes, period.endTime.hours * 60 + period.endTime.minutes);
                    }

                    for (const slot of occupiedSlots) {
                        getCell(day, slot).sections.push({
                            course: selectedCourse,
                            section,
                            periodsOnThisDay,
                            startSlot: sectionStartSlot,
                            endSlot: sectionEndSlot,
                            isFirstSlot: slot === sectionStartSlot,
                            startMinutes: earliestStartMinutes,
                            endMinutes: latestEndMinutes,
                            isPreview,
                        });
                    }
                }
            }
        };

        for (const selectedCourse of courses) addCourse(selectedCourse, false);
        if (hoverCourse) addCourse(hoverCourse, true);

        for (const calSlot of calendarSlotsForTerm) {
            if (!map.has(calSlot.day)) continue;
            const startMinutes = calSlot.startTime.hours * 60 + calSlot.startTime.minutes;
            const endMinutes = calSlot.endTime.hours * 60 + calSlot.endTime.minutes;
            const startSlot = Math.floor((startMinutes - TimeUtils.START_HOUR * 60) / 60);
            const endSlot = Math.ceil((endMinutes - TimeUtils.START_HOUR * 60) / 60);
            for (let s = startSlot; s < endSlot; s++) {
                getCell(calSlot.day, s).calendar.push({
                    slot: calSlot,
                    startSlot,
                    endSlot,
                    isFirstSlot: s === startSlot,
                    startMinutes,
                    endMinutes,
                });
            }
        }

        return map;
    }

    private getCellFromMap(cellData: CellData | undefined, timeSlot: number, day: DayOfWeek, term: string): { content: string, classes: string, hasConflict: boolean } {
        const calendarKey = cellData?.calendar.map(c => c.slot.id).join(',') || '';
        const cacheKey = `${term}-${day}-${timeSlot}-${calendarKey}`;

        if (this.cellContentCache.has(cacheKey)) {
            return this.cellContentCache.get(cacheKey)!;
        }

        const occupyingSections: SectionOccupant[] = cellData?.sections ?? [];
        const occupyingCalendarSlots: CalendarOccupant[] = cellData?.calendar ?? [];

        if (occupyingSections.length === 0 && occupyingCalendarSlots.length === 0) {
            return { content: '', classes: '', hasConflict: false };
        }

        let hasConflict = false;
        let allConflictingSections: Section[] = [];

        if (occupyingSections.length > 1) {
            for (let i = 0; i < occupyingSections.length; i++) {
                const crn1 = occupyingSections[i].section.crn;

                for (let j = i + 1; j < occupyingSections.length; j++) {
                    const crn2 = occupyingSections[j].section.crn;

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
            const isPreview = occupyingSection.isPreview;
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
                     style="${isPreview ? `border-color: ${courseColor}; --preview-color: ${courseColor};` : `background-color: ${courseColor};`} height: ${heightPercent}%; top: ${topOffsetPercent}%;">
                    ${occupyingSection.course.course.departmentAbbr}${occupyingSection.course.course.number}
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
                return conflictCourse ? `${conflictCourse.departmentAbbr}${conflictCourse.number} ${s.number}` : '';
            }).filter(info => info).join(', ');

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
                     style="height: ${heightPercent}%; top: ${topOffsetPercent}%;">
                    ${eventTitle}
                </div>
            `);
        }

        const hasAnyFirstSlot = occupyingSections.some(os => os.isFirstSlot) || occupyingCalendarSlots.some(s => s.isFirstSlot);
        const classes = hasAnyFirstSlot ? 'occupied section-start' : '';

        const result = { content: contentParts.join(''), classes, hasConflict };

        // Performance optimization: Store result in cache
        this.cellContentCache.set(cacheKey, result);

        return result;
    }

    private getCourseColor(courseId: string): string {
        return this.colorService.getCourseColor(courseId);
    }

    setCourseColor(courseId: string, color: string): void {
        this.colorService.setCourseColor(courseId, color);
        this.renderScheduleGrids();
    }

    getCourseFromElement(element: HTMLElement): Course | undefined {
        const courseId = element.dataset.courseId;
        if (!courseId) return undefined;
        return this.courseSelectionService.getSelectedCourses().find(sc => sc.course.id === courseId)?.course;
    }

    applyFiltersAndRefresh(): void {
        this.displayScheduleSelectedCourses();
        this.updateScheduleFilterButtonState();
    }

    private updateScheduleFilterButtonState(): void {
        const scheduleFilterButton = document.getElementById('schedule-filter-btn');
        if (scheduleFilterButton && this.filterService) {
            const hasActiveFilters = !this.filterService.isEmpty();
            const filterCount = this.filterService.getFilterCount();
            
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

            const externalBlock = target.closest('.external-event-block') as HTMLElement | null;
            if (externalBlock) {
                const eventId = externalBlock.dataset.eventId;
                if (eventId && this.currentSchedule && this.modalService) {
                    event.stopPropagation();
                    const localEvent = (this.currentSchedule.localEvents || []).find(e => e.id === eventId);
                    const title = localEvent?.title || 'Untitled Event';
                    const modal = new DeleteLocalEventModal(this.modalService, title, () => this.deleteLocalEvent(eventId));
                    modal.show();
                }
                return;
            }

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
            courseCode: `${course.departmentAbbr}${course.number}`,
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

            // Check if term-graph was clicked while not focused
            const termGraph = target.closest('.term-graph');
            const isMobile = document.documentElement.classList.contains('is-mobile');
            if (termGraph && !isMobile) {
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
            prevBtn.addEventListener('click', async () => {

                await this.autoScheduleOrchestrator.navigateSchedule(-1);
                this.renderScheduleGrids();
                this.updateAutoScheduleButtonUI();
            });
        }

        if (nextBtn) {
            nextBtn.insertAdjacentHTML('afterbegin', getInlineSVG('ARROW_BAR_RIGHT', 'schedule-nav-icon'));
            nextBtn.addEventListener('click', async () => {

                await this.autoScheduleOrchestrator.navigateSchedule(1);
                this.renderScheduleGrids();
                this.updateAutoScheduleButtonUI();
            });
        }

        const restartBtn = document.getElementById('schedule-restart-btn');
        if (restartBtn) {
            restartBtn.insertAdjacentHTML('afterbegin', getInlineSVG('REFRESH', 'schedule-nav-icon'));
            restartBtn.addEventListener('click', () => this.handleAutoSchedule());
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
        const progressTrack = document.getElementById('schedule-progress-track');
        const progressBar = document.getElementById('schedule-progress-bar') as HTMLElement | null;
        if (!btn) return;

        const generatedSchedules = this.autoScheduleOrchestrator.getGeneratedSchedules();

        if (generatedSchedules.length === 0) {
            btn.style.display = '';
            btn.innerHTML = `${getInlineSVG('WAND', 'auto-schedule-icon')}<span>Auto-Schedule</span>`;
            btn.disabled = false;
            btn.title = 'Automatically generate a schedule';
            if (navButtons) navButtons.style.display = 'none';
            if (progressTrack) progressTrack.style.display = 'none';
            if (progressBar) progressBar.style.width = '0%';
        } else {
            btn.style.display = 'none';
            if (navButtons) navButtons.style.display = 'flex';
            if (progressTrack) progressTrack.style.display = '';
            const pct = ((this.autoScheduleOrchestrator.getCurrentScheduleIndex() + 1) / generatedSchedules.length) * 100;
            if (progressBar) progressBar.style.width = `${pct}%`;
        }
    }

    private async handleAutoSchedule(): Promise<void> {
        if (!this.filterService) {
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

        this.autoScheduleOrchestrator.prepareLockedSections(selectedCourses);

        if (!this.modalService) {
            console.error('[Auto-Schedule] Modal service not available');
            await this.doGenerateSchedules(selectedCourses, { blockedTimes: [] });
            return;
        }

        const queue = new ModalQueue();
        let coursesToSchedule = selectedCourses;

        queue.add((q) => {
            const introModal = new AutoScheduleIntroModal(
                this.modalService!,
                selectedCourses,
                (id) => this.colorService.getCourseColor(id)
            );
            introModal.setOnNext((filtered) => {
                coursesToSchedule = filtered;
                q.next();
            });
            introModal.show();
        });

        queue.add(() => {
            const scheduleFilterModal = new FilterModalController(this.modalService!);
            scheduleFilterModal.setFilterService(this.filterService!);
            scheduleFilterModal.setCourseSelectionService(this.courseSelectionService);
            scheduleFilterModal.setAutoScheduleOrchestrator(this.autoScheduleOrchestrator);
            scheduleFilterModal.setMode('auto-schedule');
            scheduleFilterModal.setCoursesToSchedule(coursesToSchedule);
            scheduleFilterModal.setOnGenerate(() => {
                this.doGenerateSchedules(coursesToSchedule);
            });
            if (this.courseDataService) {
                scheduleFilterModal.setCourseData(this.courseDataService.getAllDepartments());
            }
            scheduleFilterModal.show();
        });

        queue.start();
    }

    private async doGenerateSchedules(selectedCourses: SelectedCourse[], settings?: { blockedTimes: WeeklyTimeSlot[] }): Promise<void> {
        const termsGrid = document.querySelector('.terms-grid');
        const overlay = document.createElement('div');
        overlay.className = 'schedule-generating-overlay';
        overlay.innerHTML = '<span class="auto-schedule-spinner"></span>';
        termsGrid?.appendChild(overlay);
        overlay.getBoundingClientRect();
        overlay.classList.add('visible');

        try {
            const success = await this.autoScheduleOrchestrator.generateSchedules(selectedCourses, settings);

            if (!success) {
                console.warn('[Auto-Schedule] No valid schedules found');
                alert('Could not generate a valid schedule.\n\nCommon causes:\n• Missing or invalid time/day data for course sections\n• Active schedule filters that exclude all sections\n• Course sections with conflicts');
            } else {
                this.renderScheduleGrids();
            }
            this.updateAutoScheduleButtonUI();
        } catch (error) {
            console.error('[Auto-Schedule] Error generating schedules:', error);
            alert('An error occurred while generating the schedule. Please try again.');
            this.updateAutoScheduleButtonUI();
        } finally {
            overlay.classList.remove('visible');
            overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
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
