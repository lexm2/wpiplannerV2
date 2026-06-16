import { modalState } from '../../svelte/modals/modalState.svelte'
import { schedulePreviewState } from '../../svelte/schedule/schedulePreviewState.svelte'
import type { CourseSelectionService } from '../selection/CourseSelectionService'
import type { CourseColorService } from './CourseColorService'
import type { UIStateManager } from '../ui/UIStateManager'
import type { Course, Section } from '../../types/types'

/**
 * Standalone section-info modal opener for the schedule grid.
 *
 * Resolves the clicked section/course from either the wizard preview rune
 * (schedulePreviewState) or the saved selection (CourseSelectionService), then
 * shows the declarative section-info modal via modalState + UIStateManager.
 * Color get/set route straight through CourseColorService — this absorbs
 * ScheduleController's private getCourseColor/setCourseColor delegators, which
 * had no other callers.
 *
 * Needs CourseSelectionService, CourseColorService (both non-singletons) +
 * UIStateManager, injected once via init() from MainController.
 */
class SectionInfoService {
    private courseSelectionService: CourseSelectionService | null = null
    private colorService: CourseColorService | null = null
    private uiStateManager: UIStateManager | null = null

    init(
        courseSelectionService: CourseSelectionService,
        colorService: CourseColorService,
        uiStateManager: UIStateManager,
    ): void {
        this.courseSelectionService = courseSelectionService
        this.colorService = colorService
        this.uiStateManager = uiStateManager
    }

    show(courseId: string, sectionNumber: string): void {
        if (!this.courseSelectionService || !this.colorService) return

        let course: Course | undefined
        let section: Section | null = null

        // Check if this is the course being edited in wizard mode (preview rune)
        const previewCourse = schedulePreviewState.previewCourse
        const previewSelections = schedulePreviewState.selections
        if (previewCourse?.id === courseId && previewSelections) {
            course = previewCourse

            // Find section from wizard selections
            if (previewSelections.lecture?.number === sectionNumber) {
                section = previewSelections.lecture
            } else if (previewSelections.discussion?.number === sectionNumber) {
                section = previewSelections.discussion
            } else if (previewSelections.lab?.number === sectionNumber) {
                section = previewSelections.lab
            }
        } else {
            // Use existing logic for saved courses
            const selectedCourses = this.courseSelectionService.getSelectedCourses()
            const selectedCourse = selectedCourses.find(sc => sc.course.id === courseId)

            if (!selectedCourse) {
                console.warn('Course not found:', courseId)
                return
            }

            course = selectedCourse.course

            // Find the section from component selections
            if (selectedCourse.selectedLecture?.number === sectionNumber) {
                section = selectedCourse.selectedLecture
            } else if (selectedCourse.selectedDiscussion?.number === sectionNumber) {
                section = selectedCourse.selectedDiscussion
            } else if (selectedCourse.selectedLab?.number === sectionNumber) {
                section = selectedCourse.selectedLab
            }
        }

        if (!section || !course) {
            console.warn('Section not found:', sectionNumber)
            return
        }

        // Show modal via the declarative modal layer. The recolor patches the
        // course's customColor onto appState.selectedCourses, which the
        // declarative grid derives off — re-colors on its own.
        modalState.sectionInfo = {
            courseCode: `${course.departmentAbbr}${course.number}`,
            courseName: course.name,
            section,
            course,
            courseId,
            currentColor: this.colorService.getCourseColor(courseId),
            onColorChange: (color: string) => this.colorService?.setCourseColor(courseId, color),
        }
        this.uiStateManager?.modalOpened('section-info')
    }
}

export const sectionInfoService = new SectionInfoService()
