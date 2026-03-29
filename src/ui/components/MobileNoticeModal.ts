import { BaseModal } from './BaseModal';
import { ModalService } from '../../services/ui/ModalService';

export class MobileNoticeModal extends BaseModal {
    get modalTypeId() { return 'mobile-notice'; }
    constructor(modalService: ModalService) {
        super(modalService);
    }

    show(): void {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title">Mobile Not Supported</h2>
                    </div>
                    <div class="modal-body">
                        <p>Mobile support was temporarily removed to make it easier to ship new features. Please use a desktop browser for the best experience.</p>
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn btn-primary" data-action="close">Got it</button>
                    </div>
                </div>
            </div>
        `;

        backdrop.querySelector('.modal-dialog')?.addEventListener('click', e => e.stopPropagation());
        backdrop.querySelector('[data-action="close"]')?.addEventListener('click', () => this.hide());

        this.showModal(backdrop, { closeOnBackdrop: false, closeOnEscape: false });
    }
}
