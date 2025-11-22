import type { ScheduleConflict, ScheduleConflictResolution } from '../../types/schedule';
import { BaseModal } from './BaseModal';
import { ModalService } from '../../services/ModalService';
import { getInlineSVG } from '../../utils/iconPaths';

export class CourseConflictModal extends BaseModal {
    private conflicts: ScheduleConflict[] = [];
    private callback: ((resolutions: Map<string, ScheduleConflictResolution> | null) => void) | null = null;

    constructor(modalService: ModalService) {
        super(modalService);
    }

    private createModalElement(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop schedule-conflict-modal';
        backdrop.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="conflict-modal-header">
                        <h2 class="conflict-modal-title">${getInlineSVG('ALERT_CIRCLE', 'conflict-title-icon')}Sync Conflict Detected</h2>
                        <button class="modal-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal-body" id="schedule-conflict-body">
                        <p class="conflict-message">
                            Your local schedules differ from the cloud version.
                            Do you want to overwrite your local changes with the cloud data?
                        </p>
                        <p class="conflict-warning">
                            ${getInlineSVG('ALERT_CIRCLE', 'warning-icon')}
                            This action cannot be undone.
                        </p>
                    </div>
                    <div class="modal-footer conflict-modal-footer">
                        <div class="conflict-actions">
                            <button id="conflict-cancel" class="modal-btn btn-secondary">Cancel</button>
                            <button id="conflict-apply" class="modal-btn btn-primary">Overwrite Local</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Setup event listeners
        const dialog = backdrop.querySelector('.modal-dialog') as HTMLElement;
        const closeBtn = backdrop.querySelector('.modal-close');
        const cancelBtn = backdrop.querySelector('#conflict-cancel');
        const applyBtn = backdrop.querySelector('#conflict-apply');

        dialog?.addEventListener('click', (e) => e.stopPropagation());
        closeBtn?.addEventListener('click', () => this.handleCancel());
        cancelBtn?.addEventListener('click', () => this.handleCancel());
        applyBtn?.addEventListener('click', () => this.handleOverwrite());

        return backdrop;
    }

    show(conflicts: ScheduleConflict[], callback: (resolutions: Map<string, ScheduleConflictResolution> | null) => void): void {
        this.conflicts = conflicts;
        this.callback = callback;

        const element = this.createModalElement();
        this.showModal(element);
    }

    private handleOverwrite(): void {
        if (this.callback) {
            // Set all conflicts to keep-cloud
            const resolutions = new Map<string, ScheduleConflictResolution>();
            this.conflicts.forEach(conflict => {
                resolutions.set(conflict.scheduleName, 'keep-cloud');
            });
            this.callback(resolutions);
        }
        this.hide();
    }

    private handleCancel(): void {
        if (this.callback) {
            this.callback(null);
        }
        this.hide();
    }

    destroy(): void {
        this.modalElement?.remove();
        this.modalElement = null;
        this.callback = null;
    }
}
