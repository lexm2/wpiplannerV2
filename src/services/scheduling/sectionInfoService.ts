import { modalState } from '../../svelte/modals/modalState.svelte'
import { schedulePreviewState } from '../../svelte/schedule/schedulePreviewState.svelte'
import { openModal } from '../ui/uiState.svelte'
import type { CourseSelectionService } from '../selection/CourseSelectionService'
import type { CourseColorService } from './CourseColorService'
import type { Course, Section } from '../../types/types'
import { logger } from '../../utils/logger'

/**
 * Standalone section-info modal opener for the schedule grid.
 *
 * Resolves the clicked section/course from either the wizard preview rune
 * (schedulePreviewState) or the saved selection (CourseSelectionService), then
 * shows the declarative section-info modal via modalState + openModal.
 * Color get/set route straight through CourseColorService.
 *
 * Needs CourseSelectionService, CourseColorService (both non-singletons),
 * injected once via init().
 */
class SectionInfoService {
    private courseSelectionService: CourseSelectionService | null = null
    private colorService: CourseColorService | null = null

    init(
        courseSelectionService: CourseSelectionService,
        colorService: CourseColorService,
    ): void {
        this.courseSelectionService = courseSelectionService
        this.colorService = colorService
    }

    show(courseId: string, sectionNumber: string): void {
        if (!this.courseSelectionService || !this.colorService) return

        let course: Course | undefined
        let section: Section | null = null

        // Course being edited in wizard mode (preview rune) takes precedence over saved selection
        const previewCourse = schedulePreviewState.previewCourse
        const previewSelections = schedulePreviewState.selections
        if (previewCourse?.id === courseId && previewSelections) {
            course = previewCourse

            if (previewSelections.lecture?.number === sectionNumber) {
                section = previewSelections.lecture
            } else if (previewSelections.discussion?.number === sectionNumber) {
                section = previewSelections.discussion
            } else if (previewSelections.lab?.number === sectionNumber) {
                section = previewSelections.lab
            }
        } else {
            const selectedCourses = this.courseSelectionService.getSelectedCourses()
            const selectedCourse = selectedCourses.find(sc => sc.course.id === courseId)

            if (!selectedCourse) {
                logger.warn('Course not found:', courseId)
                return
            }

            course = selectedCourse.course

            if (selectedCourse.selectedLecture?.number === sectionNumber) {
                section = selectedCourse.selectedLecture
            } else if (selectedCourse.selectedDiscussion?.number === sectionNumber) {
                section = selectedCourse.selectedDiscussion
            } else if (selectedCourse.selectedLab?.number === sectionNumber) {
                section = selectedCourse.selectedLab
            }
        }

        if (!section || !course) {
            logger.warn('Section not found:', sectionNumber)
            return
        }

        // onColorChange patches customColor onto appState.selectedCourses, which the
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
        openModal('section-info')
    }
}

export const sectionInfoService = new SectionInfoService()
