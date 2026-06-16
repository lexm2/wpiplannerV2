import type { WizardStep } from '../../types/uiState'
import { Course, Section, Period, LectureGroup } from '../../types/types'
import { SelectedCourse, Schedule, LocalCalendarEvent } from '../../types/schedule'
import { CourseSelectionService } from '../../services/selection/CourseSelectionService'
import { CourseDataService } from '../../services/data/courseDataService'
import { FilterService } from '../../services/filtering/FilterService'
import { watch } from '../../svelte/reactivity.svelte'
import { appState } from '../../core/state/appState.svelte'
import { wizardState } from '../../svelte/wizardState.svelte'
import { modalState } from '../../svelte/modals/modalState.svelte'
import { schedulePreviewState } from '../../svelte/schedule/schedulePreviewState.svelte'
import { BitMaskEngine } from '../../core/scheduling/BitMaskEngine'
import type { WeeklyTimeSlot } from '../../types/schedule'
import type { UIStateManager } from '../../services/ui/UIStateManager'
import { CourseColorService } from '../../services/scheduling/CourseColorService'
import { AutoScheduleOrchestrator } from '../../services/scheduling/AutoScheduleOrchestrator'
import type { ComponentSelections } from '../../types/scheduling'

export class ScheduleController {
    private courseSelectionService: CourseSelectionService;
    private courseDataService: CourseDataService | null = null;
    private filterService: FilterService | null = null;
    private conflictDetector: BitMaskEngine | null = null;
    private colorService: CourseColorService;
    private autoScheduleOrchestrator: AutoScheduleOrchestrator;
    private currentSchedule: Schedule | null = null;
    private onScheduleUpdate: ((scheduleId: string, updates: Partial<Schedule>) => void) | null = null;
    private uiStateManager: UIStateManager | null = null;

    constructor(courseSelectionService: CourseSelectionService, colorService: CourseColorService, autoScheduleOrchestrator: AutoScheduleOrchestrator) {
        this.courseSelectionService = courseSelectionService;
        this.colorService = colorService;
        this.autoScheduleOrchestrator = autoScheduleOrchestrator;
    }

    setUIStateManager(uiStateManager: UIStateManager): void {
        this.uiStateManager = uiStateManager;
    }

    setCourseDataService(courseDataService: CourseDataService): void {
        this.courseDataService = courseDataService;
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

        // Refresh the schedule display whenever the active filters change.
        watch(
            () => filterService.getActiveFilters(),
            () => this.applyFiltersAndRefresh(),
        );
    }

    // =========================================================================
    // Schedule Loading
    // =========================================================================

    /**
     * Load a schedule for display.
     * Should be called when the active schedule changes.
     */
    async loadExternalEvents(schedule: Schedule): Promise<void> {
        // The declarative grid reads appState.activeSchedule.localEvents directly,
        // so it updates on its own. We still track currentSchedule here for the
        // auto-scheduler's blocked-times getters and local-event CRUD.
        this.currentSchedule = schedule;
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

    openCalendarEventsPanel(): void {
        this.openAddLocalEventModal();
    }

    /**
     * Open the calendar events panel to manage local and external events.
     */

    // =========================================================================
    // Local Event CRUD Methods
    // =========================================================================

    /**
     * Open modal to add a new local event.
     */
    private openAddLocalEventModal(): void {
        if (!this.currentSchedule) {
            console.warn('[ScheduleController] Cannot open add event modal - missing schedule');
            return;
        }

        modalState.localEvent = {
            onSave: (eventData) => this.addLocalEvent(eventData),
        };
        this.uiStateManager?.modalOpened('local-event');
    }

    /**
     * Open the delete-confirmation modal for a local event (the grid's
     * external-event-block click target). Confirming calls deleteLocalEvent.
     */
    openDeleteLocalEventModal(eventId: string): void {
        if (!this.currentSchedule || !this.uiStateManager) return;
        const localEvent = (this.currentSchedule.localEvents || []).find(e => e.id === eventId);
        const title = localEvent?.title || 'Untitled Event';
        modalState.deleteLocalEvent = { title, onConfirm: () => this.deleteLocalEvent(eventId) };
        this.uiStateManager.modalOpened('delete-local-event');
    }

    private deleteLocalEvent(eventId: string): void {
        if (!this.currentSchedule || !this.onScheduleUpdate) return;

        const updatedLocalEvents = (this.currentSchedule.localEvents || []).filter(e => e.id !== eventId);

        this.currentSchedule = {
            ...this.currentSchedule,
            localEvents: updatedLocalEvents,
        };

        // The grid is reactive on appState.activeSchedule.localEvents; this
        // persist replaces the schedule immutably so activeSchedule re-derives.
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

        this.onScheduleUpdate(this.currentSchedule.id, {
            localEvents: updatedLocalEvents,
        });
    }

    /**
     * Open the component selection wizard for a course.
     * Drives the wizardState store; WizardHost renders the Svelte wizard panel.
     */
    openComponentWizard(course: Course, existingSelections?: SelectedCourse, initialStep?: WizardStep): void {
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

        // Open the wizard via the reactive store; WizardHost renders the Svelte
        // ComponentSelectionWizard panel. The callbacks below are framework-agnostic
        // and unchanged from the old vanilla wizard's contract.
        wizardState.open(
            {
                course: freshCourse,
                courseDataService: this.courseDataService,
                filterService: this.filterService,
                allSelectedCourses: otherSelectedCourses,
                existingSelections,
                onComplete: (selections) => this.onWizardComplete(freshCourse, selections),
                onCancel: () => this.closeComponentWizard(),
                onSelectionChange: (selections) => this.onWizardSelectionChange(freshCourse, selections),
                onHoverPreview: (selections) => this.onWizardHoverPreview(freshCourse, selections),
                onStepChange: (step) => this.uiStateManager?.wizardStepChanged(step),
            },
            initialStep,
        );
        this.uiStateManager?.wizardOpened(freshCourse.id, initialStep ?? 'lecture');
    }

    /**
     * Close the component selection wizard
     */
    jumpWizardToStep(step: WizardStep): void {
        wizardState.jumpToStep(step);
    }

    closeComponentWizard(): void {
        wizardState.close();
        this.uiStateManager?.wizardClosed();

        // Clear the preview rune unconditionally — the grid reacts and drops any
        // preview blocks on its own.
        schedulePreviewState.clear();
    }

    /**
     * Handle wizard completion - save component selections
     */
    private async onWizardComplete(course: Course, selections: ComponentSelections): Promise<void> {
        // Clear preview first
        schedulePreviewState.clear();

        try {
            const result = await this.courseSelectionService.setSelectedComponents(
                course,
                selections.lecture,
                selections.discussion,
                selections.lab
            );

            if (result.success) {
                // The schedule sidebar (ScheduleSidebar) is reactive on
                // appState.selectedCourses, so the updated selection re-renders
                // on its own — no imperative sidebar refresh needed here.
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
        // Committed wizard selection → solid preview blocks (the grid reacts).
        schedulePreviewState.previewCourse = course;
        schedulePreviewState.selections = selections;
        schedulePreviewState.hover = null;
    }

    onWizardHoverPreview(course: Course, selections: ComponentSelections): void {
        // Hovered (not-yet-committed) option → dashed preview blocks.
        schedulePreviewState.previewCourse = course;
        schedulePreviewState.hover = selections;
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
    getIncompleteSelectionInfo(selectedCourse: SelectedCourse): { isIncomplete: boolean; message: string } {
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

    private getCourseColor(courseId: string): string {
        return this.colorService.getCourseColor(courseId);
    }

    setCourseColor(courseId: string, color: string): void {
        // The recolor patches the course's customColor onto appState.selectedCourses,
        // which the declarative grid derives off — re-colors on its own, no
        // imperative re-render needed.
        this.colorService.setCourseColor(courseId, color);
    }

    applyFiltersAndRefresh(): void {
        // The schedule sidebar list shows every selected course (filters only
        // apply inside the wizard), so the reactive ScheduleSidebar needs no
        // refresh here — just sync the filter button.
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

    showSectionInfoModal(courseId: string, sectionNumber: string): void {
        let course: Course | undefined;
        let section: Section | null = null;

        // Check if this is the course being edited in wizard mode (preview rune)
        const previewCourse = schedulePreviewState.previewCourse;
        const previewSelections = schedulePreviewState.selections;
        if (previewCourse?.id === courseId && previewSelections) {
            course = previewCourse;

            // Find section from wizard selections
            if (previewSelections.lecture?.number === sectionNumber) {
                section = previewSelections.lecture;
            } else if (previewSelections.discussion?.number === sectionNumber) {
                section = previewSelections.discussion;
            } else if (previewSelections.lab?.number === sectionNumber) {
                section = previewSelections.lab;
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

        // Show modal via the declarative modal layer
        modalState.sectionInfo = sectionData;
        this.uiStateManager?.modalOpened('section-info');
    }

    async openAutoSchedule(): Promise<void> {
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

        if (!this.uiStateManager) {
            console.error('[Auto-Schedule] UI state manager not available');
            await this.doGenerateSchedules(selectedCourses, { blockedTimes: [] });
            return;
        }

        // Declarative intro modal → its onNext opens the declarative filter
        // modal with the term-filtered courses. This replaces the old ModalQueue
        // intro→filter sequencing with plain state + a continuation callback.
        modalState.autoScheduleIntro = {
            selectedCourses,
            getColor: (id) => this.colorService.getCourseColor(id),
            onNext: (filtered) => this.openScheduleFilterModal(filtered),
        };
        this.uiStateManager?.modalOpened('auto-schedule-intro');
    }

    /** Open the declarative FilterModal (auto-schedule mode) for the given courses. */
    private openScheduleFilterModal(coursesToSchedule: SelectedCourse[]): void {
        if (!this.filterService) return;
        modalState.filter = {
            mode: 'auto-schedule',
            coursesToSchedule,
            onGenerate: () => this.doGenerateSchedules(coursesToSchedule),
        };
        this.uiStateManager?.modalOpened('auto-schedule-filter');
    }

    openAutoScheduleIntro(): void {
        const selectedCourses = this.courseSelectionService.getSelectedCourses();
        modalState.autoScheduleIntro = {
            selectedCourses,
            getColor: (id) => this.colorService.getCourseColor(id),
            onNext: (filtered) => this.openScheduleFilterModal(filtered),
        };
        this.uiStateManager?.modalOpened('auto-schedule-intro');
    }

    updateAutoScheduleIntroTerms(preferences: Record<string, string[]>): void {
        // Pushed into the declarative intro modal via a reactive override channel
        // (the component merges it into its per-course term selection).
        modalState.autoScheduleIntroTermPrefs = preferences;
    }

    openAutoScheduleFilter(): void {
        if (!this.filterService) return;
        const selectedCourses = this.courseSelectionService.getSelectedCourses();
        // Same declarative FilterModal as openScheduleFilterModal, but for the
        // current selection (direct button / tutorial reopen path).
        this.openScheduleFilterModal(selectedCourses);
    }

    refreshAutoScheduleFilterUI(): void {
        // Re-sync the open FilterModal's checkboxes from filterService.
        modalState.filterRefreshTick++;
    }

    runAutoSchedule(): void {
        const selectedCourses = this.courseSelectionService.getSelectedCourses();
        this.doGenerateSchedules(selectedCourses);
    }

    private async doGenerateSchedules(selectedCourses: SelectedCourse[], settings?: { blockedTimes: WeeklyTimeSlot[] }): Promise<void> {
        // Drive the declarative grid's generating overlay via a rune (replaces the
        // imperative .schedule-generating-overlay create/append).
        appState.scheduleGenerating = true;

        try {
            const success = await this.autoScheduleOrchestrator.generateSchedules(selectedCourses, settings);

            if (!success) {
                console.warn('[Auto-Schedule] No valid schedules found');
                alert('Could not generate a valid schedule.\n\nCommon causes:\n• Missing or invalid time/day data for course sections\n• Active schedule filters that exclude all sections\n• Course sections with conflicts');
            }
            // On success the grid re-renders on its own: the orchestrator applied
            // the schedule via batchSetSelectedComponents (appState.selectedCourses).
            // The footer (AutoScheduleControls) reacts via appState.autoScheduleCount/Index.
        } catch (error) {
            console.error('[Auto-Schedule] Error generating schedules:', error);
            alert('An error occurred while generating the schedule. Please try again.');
        } finally {
            appState.scheduleGenerating = false;
        }
    }

}
