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
import { logger } from '../../utils/logger'

/**
 * Standalone component-selection wizard launcher for the schedule page.
 *
 * Drives the reactive `wizardState` store (WizardHost renders the Svelte
 * ComponentSelectionWizard panel) and pushes the calendar preview through the
 * `schedulePreviewState` rune. Persists committed selections via
 * CourseSelectionService — the schedule sidebar re-renders on its own.
 *
 * Needs the non-singleton services injected once via init() during bootstrap.
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

    openComponentWizard(course: Course, existingSelections?: SelectedCourse, initialStep?: WizardStep): void {
        if (!this.courseDataService || !this.courseSelectionService) {
            logger.error('CourseDataService not available')
            return
        }

        // Look up fresh course data from courseDataService to ensure we have the latest structure
        // (the passed course may be from cached localStorage with old structure)
        const freshCourse = this.courseDataService.getAllDepartments()
            .flatMap(d => d.courses)
            .find(c => c.id === course.id)

        if (!freshCourse) {
            logger.error('Could not find fresh course data for:', course.id)
            return
        }

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

        // Clear the preview rune unconditionally — the grid drops preview blocks on its own.
        schedulePreviewState.clear()
    }

    private async onWizardComplete(course: Course, selections: ComponentSelections): Promise<void> {
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
                // ScheduleSidebar is reactive on appState.selectedCourses, so the
                // updated selection re-renders on its own — nothing to do here.
            } else {
                logger.error('Failed to save component selections:', result.error)
                alert('Failed to save selections. Please try again.')
            }
        } catch (error) {
            logger.error('Error saving component selections:', error)
            alert('An error occurred while saving selections.')
        }

        this.closeComponentWizard()
    }

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
     * Check if a selected course has incomplete component selections.
     *
     * "Required components" is delegated to the wizard's own
     * {@link determineAvailableSteps} — the single source of truth for which steps
     * the wizard would present given the currently-selected lecture. Keeps the
     * schedule-sidebar warning in sync with the wizard, and narrows discussion/lab
     * to the SELECTED lecture rather than "any lecture".
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
