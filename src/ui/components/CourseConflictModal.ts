import type { ScheduleConflict, ScheduleConflictResolution } from '../../types/schedule';

export class CourseConflictModal {
    private modalElement: HTMLElement | null = null;
    private conflicts: ScheduleConflict[] = [];
    private resolutions: Map<string, ScheduleConflictResolution> = new Map();
    private callback: ((resolutions: Map<string, ScheduleConflictResolution>) => void) | null = null;

    constructor() {
        this.createModal();
    }

    private createModal(): void {
        const existingModal = document.getElementById('schedule-conflict-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'schedule-conflict-modal';
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title">Resolve Conflicts</h2>
                        <button class="modal-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal-body" id="schedule-conflict-body">
                        <!-- Content will be populated by updateContent() -->
                    </div>
                    <div class="modal-footer">
                        <button id="conflict-cancel" class="modal-btn btn-secondary">Cancel</button>
                        <button id="conflict-apply" class="modal-btn btn-primary">Apply Changes</button>
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
    }

    show(conflicts: ScheduleConflict[], callback: (resolutions: Map<string, ScheduleConflictResolution>) => void): void {
        this.conflicts = conflicts;
        this.callback = callback;
        this.resolutions.clear();

        conflicts.forEach(conflict => {
            this.resolutions.set(conflict.scheduleName, 'keep-local');
        });

        this.updateContent();
        this.modalElement?.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    hide(): void {
        this.modalElement?.classList.add('hide');
        setTimeout(() => {
            this.modalElement?.classList.remove('show', 'hide');
            document.body.style.overflow = '';
        }, 200);
    }

    private updateContent(): void {
        const body = document.getElementById('schedule-conflict-body');
        if (!body) return;

        body.innerHTML = '';

        this.conflicts.forEach(conflict => {
            const conflictCard = this.createConflictCard(conflict);
            body.appendChild(conflictCard);
        });
    }

    private createConflictCard(conflict: ScheduleConflict): HTMLElement {
        const card = document.createElement('div');
        card.className = 'course-conflict-card';

        const isLocalSelected = this.resolutions.get(conflict.scheduleName) === 'keep-local';
        const isCloudSelected = this.resolutions.get(conflict.scheduleName) === 'keep-cloud';

        card.innerHTML = `
            <h3 class="conflict-schedule-name">${conflict.scheduleName}</h3>
            <div class="conflict-options">
                <button class="conflict-option ${isLocalSelected ? 'selected' : ''}"
                        data-schedule="${conflict.scheduleName}"
                        data-resolution="keep-local">
                    <div class="option-radio">${isLocalSelected ? '●' : '○'}</div>
                    <div class="option-content">
                        <div class="option-label">Local</div>
                        <div class="option-info">${conflict.local.selectedCourses.length} courses</div>
                    </div>
                </button>
                <button class="conflict-option ${isCloudSelected ? 'selected' : ''}"
                        data-schedule="${conflict.scheduleName}"
                        data-resolution="keep-cloud">
                    <div class="option-radio">${isCloudSelected ? '●' : '○'}</div>
                    <div class="option-content">
                        <div class="option-label">Cloud</div>
                        <div class="option-info">${conflict.cloud.selectedCourses.length} courses</div>
                    </div>
                </button>
            </div>
        `;

        const buttons = card.querySelectorAll('button[data-resolution]');
        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const scheduleName = button.getAttribute('data-schedule')!;
                const resolution = button.getAttribute('data-resolution') as ScheduleConflictResolution;
                this.setResolution(scheduleName, resolution);
                this.updateContent();
            });
        });

        return card;
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

    destroy(): void {
        this.modalElement?.remove();
        this.modalElement = null;
        this.callback = null;
    }
}
