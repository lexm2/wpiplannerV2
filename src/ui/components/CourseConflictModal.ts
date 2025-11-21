import type { ScheduleConflict, ScheduleConflictResolution, SelectedCourse } from '../../types/schedule';
import type { Section } from '../../types/types';
import { BaseModal } from './BaseModal';
import { ModalService } from '../../services/ModalService';
import { getInlineSVG } from '../../utils/iconPaths';
import { TimeUtils } from '../utils/timeUtils';

export class CourseConflictModal extends BaseModal {
    private conflicts: ScheduleConflict[] = [];
    private resolutions: Map<string, ScheduleConflictResolution> = new Map();
    private callback: ((resolutions: Map<string, ScheduleConflictResolution>) => void) | null = null;
    private currentConflictIndex: number = 0;

    constructor(modalService: ModalService) {
        super(modalService);
    }

    private createModalElement(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop schedule-conflict-modal';
        backdrop.innerHTML = `
            <div class="modal-dialog">
                <div class="conflict-modal-header">
                    <h2 class="conflict-modal-title">${getInlineSVG('ALERT_CIRCLE', 'conflict-title-icon')}Resolve Conflicts</h2>
                    <button class="modal-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body" id="schedule-conflict-body">
                    <!-- Content will be populated by updateContent() -->
                </div>
                <div class="modal-footer conflict-modal-footer">
                    <div class="conflict-navigation">
                        <button id="conflict-prev" class="modal-btn btn-secondary conflict-nav-btn">${getInlineSVG('ARROW_BAR_LEFT', 'nav-icon')}</button>
                        <span id="conflict-counter" class="conflict-counter">1 / 1</span>
                        <button id="conflict-next" class="modal-btn btn-secondary conflict-nav-btn">${getInlineSVG('ARROW_BAR_RIGHT', 'nav-icon')}</button>
                    </div>
                    <div class="conflict-actions">
                        <button id="conflict-cancel" class="modal-btn btn-secondary">Cancel</button>
                        <button id="conflict-apply" class="modal-btn btn-primary">Apply Changes</button>
                    </div>
                </div>
            </div>
        `;

        // Setup event listeners
        const dialog = backdrop.querySelector('.modal-dialog') as HTMLElement;
        const closeBtn = backdrop.querySelector('.modal-close');
        const cancelBtn = backdrop.querySelector('#conflict-cancel');
        const applyBtn = backdrop.querySelector('#conflict-apply');
        const prevBtn = backdrop.querySelector('#conflict-prev');
        const nextBtn = backdrop.querySelector('#conflict-next');

        dialog?.addEventListener('click', (e) => e.stopPropagation());
        closeBtn?.addEventListener('click', () => this.hide());
        cancelBtn?.addEventListener('click', () => this.hide());
        applyBtn?.addEventListener('click', () => this.handleApply());
        prevBtn?.addEventListener('click', () => this.previousConflict());
        nextBtn?.addEventListener('click', () => this.nextConflict());

        return backdrop;
    }

    show(conflicts: ScheduleConflict[], callback: (resolutions: Map<string, ScheduleConflictResolution>) => void): void {
        this.conflicts = conflicts;
        this.callback = callback;
        this.resolutions.clear();
        this.currentConflictIndex = 0;

        conflicts.forEach(conflict => {
            this.resolutions.set(conflict.scheduleName, 'keep-local');
        });

        const element = this.createModalElement();
        this.showModal(element);

        // Update content after modal is shown
        setTimeout(() => {
            this.updateContent();
            this.updateNavigation();
        }, 0);
    }

    private updateContent(): void {
        const body = document.getElementById('schedule-conflict-body');
        if (!body || this.conflicts.length === 0) return;

        body.innerHTML = '';

        const currentConflict = this.conflicts[this.currentConflictIndex];
        if (currentConflict) {
            const conflictCard = this.createConflictCard(currentConflict);
            body.appendChild(conflictCard);
        }
    }

    private createConflictCard(conflict: ScheduleConflict): HTMLElement {
        const card = document.createElement('div');
        card.className = 'conflict-card';

        const isLocalSelected = this.resolutions.get(conflict.scheduleName) === 'keep-local';
        const toggleId = `conflict-toggle-${conflict.scheduleName.replace(/\s+/g, '-')}`;

        const diffSummary = this.renderDiffSummary(conflict);

        card.innerHTML = `
            <h3 class="conflict-card-schedule-name">${conflict.scheduleName}</h3>
            ${diffSummary}
            <div class="conflict-toggle-container">
                <span class="conflict-toggle-label-left">Local</span>
                <input
                    id="${toggleId}"
                    class="conflict-toggle"
                    type="checkbox"
                    role="switch"
                    name="conflict-toggle"
                    ${!isLocalSelected ? 'checked' : ''}
                    data-schedule="${conflict.scheduleName}"
                    aria-checked="${!isLocalSelected}">
                <span class="conflict-toggle-label-right">Cloud</span>
            </div>
            <div class="conflict-course-container">
                <div class="conflict-course-indicator ${!isLocalSelected ? 'cloud-selected' : ''}"></div>
                <div class="conflict-course-column" data-view="local">
                    <div class="conflict-course-column-header">Local Courses (${conflict.local.selectedCourses.length})</div>
                    ${this.renderCourseList(conflict.local.selectedCourses, conflict, 'local')}
                </div>
                <div class="conflict-course-column" data-view="cloud">
                    <div class="conflict-course-column-header">Cloud Courses (${conflict.cloud.selectedCourses.length})</div>
                    ${this.renderCourseList(conflict.cloud.selectedCourses, conflict, 'cloud')}
                </div>
            </div>
        `;

        const toggle = card.querySelector('.conflict-toggle') as HTMLInputElement;
        const indicator = card.querySelector('.conflict-course-indicator');

        toggle?.addEventListener('change', () => {
            const scheduleName = toggle.getAttribute('data-schedule')!;
            const resolution = toggle.checked ? 'keep-cloud' : 'keep-local';
            this.setResolution(scheduleName, resolution);

            if (toggle.checked) {
                indicator?.classList.add('cloud-selected');
            } else {
                indicator?.classList.remove('cloud-selected');
            }

            toggle.setAttribute('aria-checked', toggle.checked.toString());
        });

        return card;
    }

    private renderDiffSummary(conflict: ScheduleConflict): string {
        if (!conflict.diff) return '';

        const diff = conflict.diff;
        const parts: string[] = [];

        if (diff.coursesOnlyInLocal.length > 0) {
            parts.push(`<span class="diff-badge diff-local-only">${diff.coursesOnlyInLocal.length} course${diff.coursesOnlyInLocal.length > 1 ? 's' : ''} only in Local</span>`);
        }

        if (diff.coursesOnlyInCloud.length > 0) {
            parts.push(`<span class="diff-badge diff-cloud-only">${diff.coursesOnlyInCloud.length} course${diff.coursesOnlyInCloud.length > 1 ? 's' : ''} only in Cloud</span>`);
        }

        if (diff.coursesWithDifferentSections.length > 0) {
            parts.push(`<span class="diff-badge diff-section-diff">${diff.coursesWithDifferentSections.length} course${diff.coursesWithDifferentSections.length > 1 ? 's' : ''} with different sections</span>`);
        }

        if (parts.length === 0) return '';

        return `<div class="conflict-diff-summary">${parts.join('')}</div>`;
    }

    private renderCourseList(courses: SelectedCourse[], conflict: ScheduleConflict, view: 'local' | 'cloud'): string {
        if (courses.length === 0) {
            return '<div class="conflict-course-item">No courses</div>';
        }

        return courses.map((sc, index) => {
            const course = sc.course;
            const courseId = course.id;
            const diff = conflict.diff;

            let highlightClass = '';
            let diffLabel = '';
            let sectionDiffs: { lecture: boolean; discussion: boolean; lab: boolean; section: boolean } | undefined;

            if (diff) {
                if (view === 'local' && diff.coursesOnlyInLocal.some(c => c.course.id === courseId)) {
                    highlightClass = 'highlight-local-only';
                    diffLabel = '<span class="diff-label diff-label-local">Local Only</span>';
                } else if (view === 'cloud' && diff.coursesOnlyInCloud.some(c => c.course.id === courseId)) {
                    highlightClass = 'highlight-cloud-only';
                    diffLabel = '<span class="diff-label diff-label-cloud">Cloud Only</span>';
                } else {
                    const sectionDiff = diff.coursesWithDifferentSections.find(d => d.courseId === courseId);
                    if (sectionDiff && sectionDiff.sectionDifferences) {
                        highlightClass = 'highlight-section-diff';
                        diffLabel = '<span class="diff-label diff-label-section">Different Sections</span>';
                        sectionDiffs = sectionDiff.sectionDifferences;
                    }
                }
            }

            return `
                <div class="conflict-course-item-wrapper ${highlightClass}">
                    <div class="conflict-course-item">
                        <div class="conflict-course-header">
                            <span class="conflict-course-number">${course.department.abbreviation} ${course.number}</span>
                            ${diffLabel}
                        </div>
                        <div class="conflict-course-details">
                            ${this.renderSectionDetails(sc, sectionDiffs)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    private renderSectionDetails(sc: SelectedCourse, sectionDiffs?: { lecture: boolean; discussion: boolean; lab: boolean; section: boolean }): string {
        const sections: { name: string; section: Section | null; key: 'lecture' | 'discussion' | 'lab' | 'section' }[] = [
            { name: 'Lecture', section: sc.selectedLecture, key: 'lecture' },
            { name: 'Discussion', section: sc.selectedDiscussion, key: 'discussion' },
            { name: 'Lab', section: sc.selectedLab, key: 'lab' },
            { name: 'Section', section: sc.selectedSection, key: 'section' }
        ];

        const activeSections = sections.filter(s => s.section !== null);

        if (activeSections.length === 0) {
            return '<div class="conflict-no-sections">No sections selected</div>';
        }

        return activeSections.map(({ name, section, key }) => {
            if (!section) return '';

            const isDifferent = sectionDiffs && sectionDiffs[key];
            const highlightClass = isDifferent ? 'section-highlight' : '';

            const periodsHtml = section.periods.map(period => {
                const days = Array.from(period.days).join('');
                const timeRange = `${TimeUtils.formatTime(period.startTime)} - ${TimeUtils.formatTime(period.endTime)}`;

                return `
                    <div class="conflict-period-info">
                        <span class="conflict-period-days">${days}</span>
                        <span class="conflict-period-time">${timeRange}</span>
                    </div>
                `;
            }).join('');

            return `
                <div class="conflict-section-block ${highlightClass}">
                    <div class="conflict-section-name">${name}: ${section.number}</div>
                    <div class="conflict-section-periods">
                        ${periodsHtml || '<div class="conflict-no-periods">No time info</div>'}
                    </div>
                </div>
            `;
        }).join('');
    }

    private setResolution(scheduleName: string, resolution: ScheduleConflictResolution): void {
        this.resolutions.set(scheduleName, resolution);
    }

    private handleApply(): void {
        if (this.callback) {
            this.callback(this.resolutions);
        }
        this.hide();
    }

    private previousConflict(): void {
        if (this.currentConflictIndex > 0) {
            this.currentConflictIndex--;
            this.updateContent();
            this.updateNavigation();
        }
    }

    private nextConflict(): void {
        if (this.currentConflictIndex < this.conflicts.length - 1) {
            this.currentConflictIndex++;
            this.updateContent();
            this.updateNavigation();
        }
    }

    private updateNavigation(): void {
        const prevBtn = document.getElementById('conflict-prev') as HTMLButtonElement;
        const nextBtn = document.getElementById('conflict-next') as HTMLButtonElement;
        const counter = document.getElementById('conflict-counter');

        if (prevBtn) {
            prevBtn.disabled = this.currentConflictIndex === 0;
        }
        if (nextBtn) {
            nextBtn.disabled = this.currentConflictIndex === this.conflicts.length - 1;
        }
        if (counter) {
            counter.textContent = `${this.currentConflictIndex + 1} / ${this.conflicts.length}`;
        }

        const navigation = this.modalElement?.querySelector('.conflict-navigation');
        if (navigation) {
            if (this.conflicts.length <= 1) {
                (navigation as HTMLElement).style.display = 'none';
            } else {
                (navigation as HTMLElement).style.display = 'flex';
            }
        }
    }

    destroy(): void {
        this.modalElement?.remove();
        this.modalElement = null;
        this.callback = null;
    }
}
