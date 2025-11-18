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
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Schedule Sync Conflicts</h2>
                    <button class="modal-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body" id="schedule-conflict-body">
                    <!-- Content will be populated by updateContent() -->
                </div>
                <div class="modal-footer">
                    <button id="conflict-cancel" class="btn btn-secondary">Cancel</button>
                    <button id="conflict-apply" class="btn btn-primary">Apply Changes</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.modalElement = modal;
        this.attachEventListeners();
    }

    private attachEventListeners(): void {
        if (!this.modalElement) return;

        const backdrop = this.modalElement.querySelector('.modal-backdrop');
        const closeBtn = this.modalElement.querySelector('.modal-close');
        const cancelBtn = this.modalElement.querySelector('#conflict-cancel');
        const applyBtn = this.modalElement.querySelector('#conflict-apply');

        backdrop?.addEventListener('click', () => this.hide());
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
        this.modalElement?.classList.add('visible');
        document.body.style.overflow = 'hidden';
    }

    hide(): void {
        this.modalElement?.classList.remove('visible');
        document.body.style.overflow = '';
    }

    private updateContent(): void {
        const body = document.getElementById('schedule-conflict-body');
        if (!body) return;

        const message = document.createElement('p');
        message.className = 'conflict-message';
        message.textContent = `The following schedules exist in both locations with different content. Choose which version to keep for each schedule:`;

        body.innerHTML = '';
        body.appendChild(message);

        this.conflicts.forEach(conflict => {
            const conflictCard = this.createConflictCard(conflict);
            body.appendChild(conflictCard);
        });
    }

    private createConflictCard(conflict: ScheduleConflict): HTMLElement {
        const card = document.createElement('div');
        card.className = 'course-conflict-card';
        card.innerHTML = `
            <div class="conflict-course-header">
                <h3>${conflict.scheduleName}</h3>
            </div>
            <div class="conflict-comparison">
                <div class="version-card local-version">
                    <h4>Local Version</h4>
                    <div class="version-details">
                        <p>${conflict.local.selectedCourses.length} courses selected</p>
                    </div>
                    <button class="btn btn-sm ${this.resolutions.get(conflict.scheduleName) === 'keep-local' ? 'btn-primary' : 'btn-secondary'}"
                            data-schedule="${conflict.scheduleName}"
                            data-resolution="keep-local">
                        ${this.resolutions.get(conflict.scheduleName) === 'keep-local' ? '✓ ' : ''}Keep Local
                    </button>
                </div>
                <div class="version-card cloud-version">
                    <h4>Cloud Version</h4>
                    <div class="version-details">
                        <p>${conflict.cloud.selectedCourses.length} courses selected</p>
                    </div>
                    <button class="btn btn-sm ${this.resolutions.get(conflict.scheduleName) === 'keep-cloud' ? 'btn-primary' : 'btn-secondary'}"
                            data-schedule="${conflict.scheduleName}"
                            data-resolution="keep-cloud">
                        ${this.resolutions.get(conflict.scheduleName) === 'keep-cloud' ? '✓ ' : ''}Keep Cloud
                    </button>
                </div>
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
