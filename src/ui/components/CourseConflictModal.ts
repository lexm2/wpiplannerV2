import type { ScheduleConflict, ScheduleConflictResolution, SelectedCourse } from '../../types/schedule';

export class CourseConflictModal {
    private modalElement: HTMLElement | null = null;
    private conflicts: ScheduleConflict[] = [];
    private resolutions: Map<string, ScheduleConflictResolution> = new Map();
    private callback: ((resolutions: Map<string, ScheduleConflictResolution>) => void) | null = null;
    private currentConflictIndex: number = 0;

    constructor() {
    }

    private createModal(): void {
        const existingModal = document.getElementById('schedule-conflict-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'schedule-conflict-modal';
        modal.className = 'modal-backdrop schedule-conflict-modal';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="conflict-modal-header">
                        <h2 class="conflict-modal-title">Resolve Conflicts</h2>
                        <button class="modal-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal-body" id="schedule-conflict-body">
                        <!-- Content will be populated by updateContent() -->
                    </div>
                    <div class="modal-footer conflict-modal-footer">
                        <div class="conflict-navigation">
                            <button id="conflict-prev" class="modal-btn btn-secondary">← Previous</button>
                            <span id="conflict-counter" class="conflict-counter">1 / 1</span>
                            <button id="conflict-next" class="modal-btn btn-secondary">Next →</button>
                        </div>
                        <div class="conflict-actions">
                            <button id="conflict-cancel" class="modal-btn btn-secondary">Cancel</button>
                            <button id="conflict-apply" class="modal-btn btn-primary">Apply Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.modalElement = modal;
        this.attachEventListeners();
    }

    private attachEventListeners(): void {
        if (!this.modalElement) return;

        const closeBtn = this.modalElement.querySelector('.modal-close');
        const cancelBtn = this.modalElement.querySelector('#conflict-cancel');
        const applyBtn = this.modalElement.querySelector('#conflict-apply');
        const prevBtn = this.modalElement.querySelector('#conflict-prev');
        const nextBtn = this.modalElement.querySelector('#conflict-next');
        const dialog = this.modalElement.querySelector('.modal-dialog');

        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.hide();
            }
        });

        dialog?.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        closeBtn?.addEventListener('click', () => this.hide());
        cancelBtn?.addEventListener('click', () => this.hide());
        applyBtn?.addEventListener('click', () => this.handleApply());
        prevBtn?.addEventListener('click', () => this.previousConflict());
        nextBtn?.addEventListener('click', () => this.nextConflict());
    }

    show(conflicts: ScheduleConflict[], callback: (resolutions: Map<string, ScheduleConflictResolution>) => void): void {
        this.conflicts = conflicts;
        this.callback = callback;
        this.resolutions.clear();
        this.currentConflictIndex = 0;

        conflicts.forEach(conflict => {
            this.resolutions.set(conflict.scheduleName, 'keep-local');
        });

        if (!this.modalElement) {
            this.createModal();
        }

        this.updateContent();
        this.updateNavigation();
        this.modalElement?.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    hide(): void {
        this.modalElement?.classList.add('hide');
        setTimeout(() => {
            this.modalElement?.remove();
            this.modalElement = null;
            document.body.style.overflow = '';
        }, 200);
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

        card.innerHTML = `
            <h3 class="conflict-card-schedule-name">${conflict.scheduleName}</h3>
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
                    ${this.renderCourseList(conflict.local.selectedCourses)}
                </div>
                <div class="conflict-course-column" data-view="cloud">
                    <div class="conflict-course-column-header">Cloud Courses (${conflict.cloud.selectedCourses.length})</div>
                    ${this.renderCourseList(conflict.cloud.selectedCourses)}
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

    private renderCourseList(courses: SelectedCourse[]): string {
        if (courses.length === 0) {
            return '<div class="conflict-course-item">No courses</div>';
        }

        return courses.map(sc => {
            const course = sc.course;
            const section = sc.selectedSectionNumber || '';
            const sectionText = section ? `<span class="conflict-course-section">(${section})</span>` : '';

            return `
                <div class="conflict-course-item">
                    <span class="conflict-course-number">${course.department.abbreviation} ${course.number}</span>
                    ${sectionText}
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
