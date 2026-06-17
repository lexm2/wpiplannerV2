import { appState } from '../../core/state/appState.svelte'
import { modalState } from '../../svelte/modals/modalState.svelte'
import type { SelectedCourse } from '../../types/schedule'
import type { WeeklyTimeSlot } from '../../types/schedule'
import type { CourseSelectionService } from '../selection/CourseSelectionService'
import type { FilterService } from '../filtering/FilterService'
import type { CourseColorService } from './CourseColorService'
import type { AutoScheduleOrchestrator } from './AutoScheduleOrchestrator'
import type { UIStateManager } from '../ui/UIStateManager'

/**
 * Standalone auto-schedule modal orchestration for the schedule page.
 *
 * Drives the declarative intro → filter modal sequence (plain modalState +
 * continuation callbacks) and generation via AutoScheduleOrchestrator. Reads
 * the selection through CourseSelectionService and surfaces the generating
 * overlay through the `appState.scheduleGenerating` rune (the grid reacts).
 * Replaces ScheduleController's openAutoSchedule / openScheduleFilterModal /
 * openAutoScheduleIntro / updateAutoScheduleIntroTerms / openAutoScheduleFilter /
 * runAutoSchedule / doGenerateSchedules.
 *
 * Needs the non-singleton services (CourseSelectionService, FilterService,
 * CourseColorService, AutoScheduleOrchestrator, UIStateManager), injected once
 * via init() from MainController.
 */
class AutoScheduleService {
    private courseSelectionService: CourseSelectionService | null = null
    private filterService: FilterService | null = null
    private colorService: CourseColorService | null = null
    private orchestrator: AutoScheduleOrchestrator | null = null
    private uiStateManager: UIStateManager | null = null

    init(
        courseSelectionService: CourseSelectionService,
        filterService: FilterService,
        colorService: CourseColorService,
        orchestrator: AutoScheduleOrchestrator,
        uiStateManager: UIStateManager,
    ): void {
        this.courseSelectionService = courseSelectionService
        this.filterService = filterService
        this.colorService = colorService
        this.orchestrator = orchestrator
        this.uiStateManager = uiStateManager
    }

    async openAutoSchedule(): Promise<void> {
        if (!this.filterService || !this.courseSelectionService) {
            console.error('[Auto-Schedule] Filter service not available')
            alert('Filter service not available. Please try again.')
            return
        }

        const selectedCourses = this.courseSelectionService.getSelectedCourses()

        if (selectedCourses.length === 0) {
            console.warn('[Auto-Schedule] No courses selected')
            alert('No courses selected. Please select courses first.')
            return
        }

        if (!this.uiStateManager) {
            console.error('[Auto-Schedule] UI state manager not available')
            await this.doGenerateSchedules(selectedCourses, { blockedTimes: [] })
            return
        }

        // Declarative intro modal → its onNext opens the declarative filter
        // modal with the term-filtered courses. This replaces the old ModalQueue
        // intro→filter sequencing with plain state + a continuation callback.
        modalState.autoScheduleIntro = {
            selectedCourses,
            getColor: (id) => this.colorService?.getCourseColor(id) ?? '',
            onNext: (filtered) => this.openScheduleFilterModal(filtered),
        }
        this.uiStateManager?.modalOpened('auto-schedule-intro')
    }

    /** Open the declarative FilterModal (auto-schedule mode) for the given courses. */
    private openScheduleFilterModal(coursesToSchedule: SelectedCourse[]): void {
        if (!this.filterService) return
        modalState.filter = {
            mode: 'auto-schedule',
            coursesToSchedule,
            onGenerate: () => this.doGenerateSchedules(coursesToSchedule),
        }
        this.uiStateManager?.modalOpened('auto-schedule-filter')
    }

    openAutoScheduleIntro(): void {
        if (!this.courseSelectionService) return
        const selectedCourses = this.courseSelectionService.getSelectedCourses()
        modalState.autoScheduleIntro = {
            selectedCourses,
            getColor: (id) => this.colorService?.getCourseColor(id) ?? '',
            onNext: (filtered) => this.openScheduleFilterModal(filtered),
        }
        this.uiStateManager?.modalOpened('auto-schedule-intro')
    }

    updateAutoScheduleIntroTerms(preferences: Record<string, string[]>): void {
        // Pushed into the declarative intro modal via a reactive override channel
        // (the component merges it into its per-course term selection).
        modalState.autoScheduleIntroTermPrefs = preferences
    }

    openAutoScheduleFilter(): void {
        if (!this.filterService || !this.courseSelectionService) return
        const selectedCourses = this.courseSelectionService.getSelectedCourses()
        // Same declarative FilterModal as openScheduleFilterModal, but for the
        // current selection (direct button / tutorial reopen path).
        this.openScheduleFilterModal(selectedCourses)
    }

    runAutoSchedule(): void {
        if (!this.courseSelectionService) return
        const selectedCourses = this.courseSelectionService.getSelectedCourses()
        this.doGenerateSchedules(selectedCourses)
    }

    private async doGenerateSchedules(selectedCourses: SelectedCourse[], settings?: { blockedTimes: WeeklyTimeSlot[] }): Promise<void> {
        if (!this.orchestrator) return

        // Drive the declarative grid's generating overlay via a rune (replaces the
        // imperative .schedule-generating-overlay create/append).
        appState.scheduleGenerating = true

        try {
            const success = await this.orchestrator.generateSchedules(selectedCourses, settings)

            if (!success) {
                console.warn('[Auto-Schedule] No valid schedules found')
                alert('Could not generate a valid schedule.\n\nCommon causes:\n• Missing or invalid time/day data for course sections\n• Active schedule filters that exclude all sections\n• Course sections with conflicts')
            }
            // On success the grid re-renders on its own: the orchestrator applied
            // the schedule via batchSetSelectedComponents (appState.selectedCourses).
            // The footer (AutoScheduleControls) reacts via appState.autoScheduleCount/Index.
        } catch (error) {
            console.error('[Auto-Schedule] Error generating schedules:', error)
            alert('An error occurred while generating the schedule. Please try again.')
        } finally {
            appState.scheduleGenerating = false
        }
    }
}

export const autoScheduleService = new AutoScheduleService()
