// =============================================================================
// Course Entry - Sidebar entry for displaying a selected course
// =============================================================================

import type { Course, Section } from '../../../types/types';
import type { SelectedCourse } from '../../../types/schedule';
import type { SidebarEntry, CourseEntryOptions } from '../types';
import { CourseDataService } from '../../../services/data/courseDataService';
import { getInlineSVG } from '../../../utils/iconPaths';
import { Validators } from '../../../utils/validators';

/**
 * Sidebar entry for displaying a selected course with its components.
 */
export class CourseEntry implements SidebarEntry {
    readonly entryId: string;
    readonly entryType = 'course';

    private selectedCourse: SelectedCourse;
    private options: CourseEntryOptions;
    private courseDataService: CourseDataService | null;

    constructor(
        selectedCourse: SelectedCourse,
        options: CourseEntryOptions = {},
        courseDataService?: CourseDataService
    ) {
        this.selectedCourse = selectedCourse;
        this.options = options;
        this.courseDataService = courseDataService || null;
        this.entryId = `course-${selectedCourse.course.id}`;
    }

    /**
     * Render the course entry as HTML
     */
    render(): string {
        const course = this.selectedCourse.course;
        const isExpanded = this.options.isExpanded ?? false;

        const credits = course.minCredits === course.maxCredits
            ? `${course.minCredits} credits`
            : `${course.minCredits}-${course.maxCredits} credits`;

        // Build selected components display
        let selectedComponentsHTML = '';
        const components: string[] = [];

        if (this.selectedCourse.selectedLecture) {
            components.push(`<span class="selected-component lec">Lec ${Validators.escapeHtml(this.selectedCourse.selectedLecture.number)}</span>`);
        }
        if (this.selectedCourse.selectedDiscussion) {
            components.push(`<span class="selected-component dis">Dis ${Validators.escapeHtml(this.selectedCourse.selectedDiscussion.number)}</span>`);
        }
        if (this.selectedCourse.selectedLab) {
            components.push(`<span class="selected-component lab">Lab ${Validators.escapeHtml(this.selectedCourse.selectedLab.number)}</span>`);
        }

        // Check for incomplete selections
        const incompleteInfo = this.getIncompleteSelectionInfo();
        if (incompleteInfo.isIncomplete) {
            const warningIconHTML = `<span class="incomplete-warning" title="${Validators.escapeHtml(incompleteInfo.message)}"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="warning-icon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 2c5.523 0 10 4.477 10 10a10 10 0 0 1 -19.995 .324l-.005 -.324l.004 -.28c.148 -5.393 4.566 -9.72 9.996 -9.72zm.01 13l-.127 .007a1 1 0 0 0 0 1.986l.117 .007l.127 -.007a1 1 0 0 0 0 -1.986l-.117 -.007zm-.01 -8a1 1 0 0 0 -.993 .883l-.007 .117v4l.007 .117a1 1 0 0 0 1.986 0l.007 -.117v-4l-.007 -.117a1 1 0 0 0 -.993 -.883z" /></svg></span>`;
            components.push(warningIconHTML);
        }

        if (components.length > 0) {
            selectedComponentsHTML = `<div class="schedule-course-components">${components.join('')}</div>`;
        }

        return `
            <div class="schedule-course-item ${isExpanded ? 'expanded' : 'collapsed'}" data-entry-id="${this.entryId}" data-course-id="${course.id}">
                <div class="schedule-course-header">
                    <div class="schedule-course-info">
                        <div class="schedule-course-code">${Validators.escapeHtml(course.departmentAbbr)}${Validators.escapeHtml(course.number)}</div>
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
            </div>
        `;
    }

    /**
     * Attach event listeners to the entry elements
     */
    attachListeners(container: HTMLElement): void {
        const entryElement = container.querySelector(`[data-entry-id="${this.entryId}"]`);
        if (!entryElement) return;

        // Course header click (opens wizard)
        const header = entryElement.querySelector('.schedule-course-header');
        if (header && this.options.onClick) {
            header.addEventListener('click', (e) => {
                // Don't trigger if clicking on buttons
                if ((e.target as HTMLElement).closest('button')) return;
                this.options.onClick?.();
            });
        }

        // Clear sections button
        const clearBtn = entryElement.querySelector('.course-clear-sections-btn');
        if (clearBtn && this.options.onClearSections) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.options.onClearSections?.();
            });
        }

        // Remove course button
        const removeBtn = entryElement.querySelector('.course-remove-btn');
        if (removeBtn && this.options.onRemove) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.options.onRemove?.();
            });
        }
    }

    /**
     * Get the data associated with this entry
     */
    getData(): SelectedCourse {
        return this.selectedCourse;
    }

    /**
     * Check if a section has at least one period with a valid time slot
     */
    private hasValidTimeSlot(section: Section): boolean {
        return section.periods.some(period => {
            if (period.isAsync) return true;
            return period.startTime.hours !== period.endTime.hours ||
                   period.startTime.minutes !== period.endTime.minutes;
        });
    }

    /**
     * Check if the course has incomplete component selections
     */
    private getIncompleteSelectionInfo(): { isIncomplete: boolean; message: string } {
        const course = this.selectedCourse.course;

        // Skip check for lab-only courses
        if (this.courseDataService?.isLabOnlyCourse(course)) {
            if (!this.selectedCourse.selectedLab) {
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
        const validLectures = course.lectures.filter(lg => this.hasValidTimeSlot(lg.section));
        if (validLectures.length === 0) {
            return { isIncomplete: false, message: '' };
        }

        // Check lecture selection
        if (!this.selectedCourse.selectedLecture) {
            missingComponents.push('lecture');
        }

        // Check if ANY lecture has discussions/labs with valid time slots
        const hasValidDiscussions = course.lectures.some(lg =>
            lg.compatibleDiscussions?.some(d => this.hasValidTimeSlot(d))
        );
        const hasValidLabs = course.lectures.some(lg =>
            lg.compatibleLabs?.some(l => this.hasValidTimeSlot(l))
        );

        if (hasValidDiscussions && !this.selectedCourse.selectedDiscussion) {
            missingComponents.push('discussion');
        }
        if (hasValidLabs && !this.selectedCourse.selectedLab) {
            missingComponents.push('lab');
        }

        if (missingComponents.length === 0) {
            return { isIncomplete: false, message: '' };
        }

        return { isIncomplete: true, message: `Incomplete: Missing ${missingComponents.join(', ')} selection` };
    }
}
