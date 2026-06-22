import type { WizardStep } from '../../types/uiState'
import type { Course, Section } from '../../types/types'
import type { SelectedCourse } from '../../types/schedule'
import type { ComponentSelections } from '../../types/scheduling'
import { wizardState } from '../../svelte/wizardState.svelte'
import { determineAvailableSteps } from '../../svelte/wizardLogic'
import { schedulePreviewState } from '../../svelte/schedule/schedulePreviewState.svelte'
import type { CourseSelectionService } from '../selection/CourseSelectionService'
import type { CourseDataService } from '../data/courseDataService'
import type { FilterService } from '../filtering/FilterService'

/**
 * Standalone component-selection wizard launcher for the schedule page.
 *
 * Drives the reactive `wizardState` store (WizardHost renders the Svelte
 * ComponentSelectionWizard panel) and pushes the calendar preview through the
 * `schedulePreviewState` rune (the grid reacts). Persists committed selections
 * via CourseSelectionService — the schedule sidebar re-renders on its own.
 * Replaces ScheduleController's openComponentWizard / jumpWizardToStep /
 * closeComponentWizard / onWizardComplete / onWizardSelectionChange /
 * onWizardHoverPreview + getIncompleteSelectionInfo / hasValidTimeSlot, and is
 * the last responsibility lifted off the now-deleted ScheduleController.
 *
 * Needs the non-singleton services (CourseSelectionService, CourseDataService,
 * FilterService), injected once via init() during bootstrap.
 */
class ComponentWizardService {
    private courseSelectionService: CourseSelectionService | null = null
    private courseDataService: CourseDataService | null = null
    private filterService: FilterService | null = null

    init(
        courseSelectionService: CourseSelectionService,
        courseDataService: CourseDataService,
        filterService: FilterService,
    ): void {
        this.courseSelectionService = courseSelectionService
        this.courseDataService = courseDataService
        this.filterService = filterService
    }

    /**
     * Open the component selection wizard for a course.
     * Drives the wizardState store; WizardHost renders the Svelte wizard panel.
     */
    openComponentWizard(course: Course, existingSelections?: SelectedCourse, initialStep?: WizardStep): void {
        if (!this.courseDataService || !this.courseSelectionService) {
            console.error('CourseDataService not available')
            return
        }

        // Look up fresh course data from courseDataService to ensure we have the latest structure
        // (the passed course may be from cached localStorage with old structure)
        const freshCourse = this.courseDataService.getAllDepartments()
            .flatMap(d => d.courses)
            .find(c => c.id === course.id)

        if (!freshCourse) {
            console.error('Could not find fresh course data for:', course.id)
            return
        }

        // Open the wizard via the reactive store; WizardHost renders the Svelte
        // ComponentSelectionWizard panel. The callbacks below are framework-agnostic
        // and unchanged from the old vanilla wizard's contract.
        wizardState.open(
            {
                course: freshCourse,
                courseDataService: this.courseDataService,
                filterService: this.filterService,
                existingSelections,
                onComplete: (selections) => this.onWizardComplete(freshCourse, selections),
                onCancel: () => this.closeComponentWizard(),
                onSelectionChange: (selections) => this.onWizardSelectionChange(freshCourse, selections),
                onHoverPreview: (selections) => this.onWizardHoverPreview(freshCourse, selections),
            },
            initialStep,
        )
    }

    closeComponentWizard(): void {
        wizardState.close()

        // Clear the preview rune unconditionally — the grid reacts and drops any
        // preview blocks on its own.
        schedulePreviewState.clear()
    }

    /**
     * Handle wizard completion - save component selections
     */
    private async onWizardComplete(course: Course, selections: ComponentSelections): Promise<void> {
        // Clear preview first
        schedulePreviewState.clear()

        if (!this.courseSelectionService) return

        try {
            const result = await this.courseSelectionService.setSelectedComponents(
                course,
                selections.lecture,
                selections.discussion,
                selections.lab
            )

            if (result.success) {
                // The schedule sidebar (ScheduleSidebar) is reactive on
                // appState.selectedCourses, so the updated selection re-renders
                // on its own — no imperative sidebar refresh needed here.
            } else {
                console.error('Failed to save component selections:', result.error)
                alert('Failed to save selections. Please try again.')
            }
        } catch (error) {
            console.error('Error saving component selections:', error)
            alert('An error occurred while saving selections.')
        }

        this.closeComponentWizard()
    }

    /**
     * Handle wizard selection changes - update calendar preview
     */
    private onWizardSelectionChange(course: Course, selections: ComponentSelections): void {
        // Committed wizard selection → solid preview blocks (the grid reacts).
        schedulePreviewState.previewCourse = course
        schedulePreviewState.selections = selections
        schedulePreviewState.hover = null
    }

    private onWizardHoverPreview(course: Course, selections: ComponentSelections): void {
        // Hovered (not-yet-committed) option → dashed preview blocks.
        schedulePreviewState.previewCourse = course
        schedulePreviewState.hover = selections
    }

    /**
     * Check if a section has at least one period with a valid time slot
     * Async sections are valid even with 12:00-12:00 times
     */
    /**
     * Check if a selected course has incomplete component selections.
     *
     * "Required components" is delegated to the wizard's own
     * {@link determineAvailableSteps} — the single source of truth for which
     * steps the wizard would present for this course given the currently-selected
     * lecture. This keeps the schedule-sidebar warning exactly in sync with the
     * wizard (and, unlike the old hand-rolled check, narrows discussion/lab to the
     * SELECTED lecture rather than "any lecture").
     */
    getIncompleteSelectionInfo(selectedCourse: SelectedCourse): { isIncomplete: boolean; message: string } {
        if (!this.courseDataService) return { isIncomplete: false, message: '' }

        const steps = determineAvailableSteps(
            selectedCourse.course,
            this.courseDataService,
            selectedCourse.selectedLecture ?? null,
        )

        const selectionForStep: Record<WizardStep, Section | null> = {
            lecture: selectedCourse.selectedLecture ?? null,
            discussion: selectedCourse.selectedDiscussion ?? null,
            lab: selectedCourse.selectedLab ?? null,
        }

        const missing = steps.filter(step => !selectionForStep[step])
        if (missing.length === 0) return { isIncomplete: false, message: '' }

        return { isIncomplete: true, message: `Incomplete: Missing ${missing.join(', ')} selection` }
    }
}

export const componentWizardService = new ComponentWizardService()
