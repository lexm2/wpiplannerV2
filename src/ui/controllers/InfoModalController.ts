import { ModalService } from '../../services/ui/ModalService';
import { BaseModal } from '../components/BaseModal';
import type { ModalType } from '../../types/modal';

export class InfoModalController extends BaseModal {
    constructor(modalService: ModalService) {
        super(modalService);
    }

    show(title: string, message: string, type: ModalType = 'info'): string {
        const modalElement = this.createModalElement(title, message, type);
        return this.showModal(modalElement);
    }

    showInfo(title: string, message: string): string {
        return this.show(title, message, 'info');
    }

    showWarning(title: string, message: string): string {
        return this.show(title, message, 'warning');
    }

    showError(title: string, message: string): string {
        return this.show(title, message, 'error');
    }

    showSuccess(title: string, message: string): string {
        return this.show(title, message, 'success');
    }

    private createModalElement(title: string, message: string, type: ModalType): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';

        backdrop.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header ${type}">
                        <h3 class="modal-title">${this.escapeHtml(title)}</h3>
                        <button class="modal-close" data-modal-close>×</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-icon ${type}">
                            ${this.getIconForType(type)}
                        </div>
                        <div class="modal-text">
                            ${message}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn btn-${this.getButtonStyleForType(type)}" data-modal-close>OK</button>
                    </div>
                </div>
            </div>
        `;

        const dialog = backdrop.querySelector('.modal-dialog');
        if (dialog instanceof HTMLElement) {
            dialog.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }

        backdrop.querySelectorAll('[data-modal-close]').forEach(btn => {
            btn.addEventListener('click', () => this.hide());
        });

        return backdrop;
    }

    private getIconForType(type: ModalType): string {
        switch (type) {
            case 'info': return 'ℹ';
            case 'warning': return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" class="modal-warning-icon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 2c5.523 0 10 4.477 10 10a10 10 0 0 1 -19.995 .324l-.005 -.324l.004 -.28c.148 -5.393 4.566 -9.72 9.996 -9.72zm.01 13l-.127 .007a1 1 0 0 0 0 1.986l.117 .007l.127 -.007a1 1 0 0 0 0 -1.986l-.117 -.007zm-.01 -8a1 1 0 0 0 -.993 .883l-.007 .117v4l.007 .117a1 1 0 0 0 1.986 0l.007 -.117v-4l-.007 -.117a1 1 0 0 0 -.993 -.883z" /></svg>';
            case 'error': return '✖';
            case 'success': return '✓';
            default: return 'ℹ';
        }
    }

    private getButtonStyleForType(type: ModalType): string {
        switch (type) {
            case 'error': return 'danger';
            case 'warning': return 'warning';
            case 'success': return 'success';
            case 'info':
            default: return 'primary';
        }
    }
}