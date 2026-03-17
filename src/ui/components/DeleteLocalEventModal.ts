import { BaseModal } from './BaseModal';
import { ModalService } from '../../services/ui/ModalService';

export class DeleteLocalEventModal extends BaseModal {
    constructor(
        modalService: ModalService,
        private eventTitle: string,
        private onConfirm: () => void
    ) {
        super(modalService);
    }

    show(): void {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title">Delete Event</h2>
                    </div>
                    <div class="modal-body">
                        <p>Delete "<strong>${this.escapeHtml(this.eventTitle)}</strong>"?</p>
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn btn-secondary" data-action="cancel">Cancel</button>
                        <button class="modal-btn btn-danger" data-action="confirm">Delete</button>
                    </div>
                </div>
            </div>
        `;

        backdrop.querySelector('.modal-dialog')?.addEventListener('click', e => e.stopPropagation());
        backdrop.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.hide());
        backdrop.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
            this.onConfirm();
            this.hide();
        });

        this.showModal(backdrop);
    }
}
