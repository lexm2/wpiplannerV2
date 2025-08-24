import { ModalService } from '../../services/ModalService';

export type InfoModalType = 'info' | 'warning' | 'error' | 'success';

export class InfoModalController {
    private modalService: ModalService;

    constructor(modalService: ModalService) {
        this.modalService = modalService;
    }

    show(title: string, message: string, type: InfoModalType = 'info'): string {
        const id = this.modalService.generateId();
        const modalElement = this.createModalElement(id, title, message, type);
        
        this.modalService.showModal(id, modalElement);
        this.modalService.setupModalBehavior(modalElement, id);

        return id;
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

    private createModalElement(id: string, title: string, message: string, type: InfoModalType): HTMLElement {
        // Create modal backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.id = id;

        // Add embedded CSS
        const style = document.createElement('style');
        style.textContent = this.getModalCSS();
        backdrop.appendChild(style);

        // Create modal content
        backdrop.innerHTML += `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header ${type}">
                        <h3 class="modal-title">${title}</h3>
                        <button class="modal-close" onclick="document.getElementById('${id}').querySelector('.modal-backdrop').click()">×</button>
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
                        <button class="modal-btn btn-${this.getButtonStyleForType(type)}" onclick="document.getElementById('${id}').querySelector('.modal-backdrop').click()">OK</button>
                    </div>
                </div>
            </div>
        `;

        // Prevent clicks on modal dialog from closing modal
        const dialog = backdrop.querySelector('.modal-dialog') as HTMLElement;
        if (dialog) {
            dialog.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }

        return backdrop;
    }

    private getIconForType(type: InfoModalType): string {
        switch (type) {
            case 'info': return 'ℹ';
            case 'warning': return '⚠';
            case 'error': return '✖';
            case 'success': return '✓';
            default: return 'ℹ';
        }
    }

    private getButtonStyleForType(type: InfoModalType): string {
        switch (type) {
            case 'error': return 'danger';
            case 'warning': return 'warning';
            case 'success': return 'success';
            case 'info':
            default: return 'primary';
        }
    }

    private getModalCSS(): string {
        return `
            .modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1rem;
                opacity: 0;
                transition: var(--effect-transition);
                cursor: pointer;
            }

            .modal-backdrop.show {
                opacity: 1;
            }

            .modal-backdrop.hide {
                opacity: 0;
            }

            .modal-dialog {
                background: var(--color-surface);
                border-radius: var(--effect-border-radius-large);
                box-shadow: var(--effect-shadow-hover);
                max-width: 500px;
                width: 100%;
                max-height: 90vh;
                overflow: hidden;
                transform: scale(0.9);
                transition: var(--effect-transition);
                cursor: default;
            }

            .modal-backdrop.show .modal-dialog {
                transform: scale(1);
            }

            .modal-backdrop.hide .modal-dialog {
                transform: scale(0.9);
            }

            .modal-content {
                display: flex;
                flex-direction: column;
                max-height: 90vh;
            }

            .modal-header {
                padding: 1.5rem 1.5rem 1rem 1.5rem;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid var(--color-border);
                color: var(--color-text-inverse);
            }

            .modal-header.info {
                background: linear-gradient(135deg, var(--color-info), var(--color-primary));
            }

            .modal-header.warning {
                background: linear-gradient(135deg, var(--color-warning), var(--color-warning));
            }

            .modal-header.error {
                background: linear-gradient(135deg, var(--color-error), var(--color-error));
            }

            .modal-header.success {
                background: linear-gradient(135deg, var(--color-success), var(--color-success));
            }

            .modal-title {
                margin: 0;
                font-size: 1.25rem;
                font-weight: 600;
                color: var(--color-text-inverse);
                font-family: var(--font-family);
            }

            .modal-close {
                background: none;
                border: none;
                font-size: 1.5rem;
                color: rgba(255, 255, 255, 0.8);
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: var(--effect-border-radius);
                transition: var(--effect-transition);
            }

            .modal-close:hover {
                background: rgba(255, 255, 255, 0.1);
                color: var(--color-text-inverse);
            }

            .modal-body {
                padding: 1rem 1.5rem;
                flex: 1;
                overflow-y: auto;
                display: flex;
                align-items: flex-start;
                gap: 1rem;
                background: var(--color-surface);
            }

            .modal-icon {
                flex-shrink: 0;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.5rem;
                font-weight: bold;
            }

            .modal-icon.info {
                background: rgba(0, 123, 255, 0.1);
                color: var(--color-info);
            }

            .modal-icon.warning {
                background: rgba(255, 193, 7, 0.1);
                color: var(--color-warning);
            }

            .modal-icon.error {
                background: rgba(220, 53, 69, 0.1);
                color: var(--color-error);
            }

            .modal-icon.success {
                background: rgba(40, 167, 69, 0.1);
                color: var(--color-success);
            }

            .modal-text {
                flex: 1;
                color: var(--color-text);
                line-height: 1.5;
                font-family: var(--font-family);
            }

            .modal-footer {
                padding: 1rem 1.5rem 1.5rem 1.5rem;
                display: flex;
                gap: 0.75rem;
                justify-content: flex-end;
                border-top: 1px solid var(--color-border);
                background: var(--color-background);
            }

            .modal-btn {
                padding: 0.5rem 1rem;
                border-radius: var(--effect-border-radius);
                font-weight: 500;
                font-size: 0.875rem;
                cursor: pointer;
                transition: var(--effect-transition);
                border: 1px solid;
                min-width: 80px;
                font-family: var(--font-family);
            }

            .btn-primary {
                background: var(--color-primary);
                color: var(--color-text-inverse);
                border-color: var(--color-primary);
            }

            .btn-primary:hover {
                background: var(--color-primary-hover);
                border-color: var(--color-primary-hover);
                transform: translateY(-1px);
            }

            .btn-warning {
                background: var(--color-warning);
                color: var(--color-text);
                border-color: var(--color-warning);
            }

            .btn-warning:hover {
                background: var(--color-warning);
                border-color: var(--color-warning);
                transform: translateY(-1px);
                opacity: 0.9;
            }

            .btn-danger {
                background: var(--color-error);
                color: var(--color-text-inverse);
                border-color: var(--color-error);
            }

            .btn-danger:hover {
                background: var(--color-error);
                border-color: var(--color-error);
                transform: translateY(-1px);
                opacity: 0.9;
            }

            .btn-success {
                background: var(--color-success);
                color: var(--color-text-inverse);
                border-color: var(--color-success);
            }

            .btn-success:hover {
                background: var(--color-success);
                border-color: var(--color-success);
                transform: translateY(-1px);
                opacity: 0.9;
            }

            @media (max-width: 768px) {
                .modal-backdrop {
                    padding: 0.5rem;
                }
                
                .modal-dialog {
                    max-width: 100%;
                    margin: 0;
                }
                
                .modal-header {
                    padding: 1rem 1rem 0.75rem 1rem;
                }
                
                .modal-body {
                    padding: 0.75rem 1rem;
                }
                
                .modal-footer {
                    padding: 0.75rem 1rem 1rem 1rem;
                }
                
                .modal-btn {
                    width: 100%;
                    margin: 0;
                }
                
                .modal-icon {
                    width: 40px;
                    height: 40px;
                    font-size: 1.25rem;
                }
            }
        `;
    }
}