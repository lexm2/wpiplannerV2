import { BaseModal } from './BaseModal';
import { ModalService } from '../../services/ui/ModalService';
import { getInlineSVG } from '../../utils/iconPaths';
import type { TutorialSetup } from '../../services/tutorial/setupTutorial';

export class TutorialsModal extends BaseModal {
    private tutorial: TutorialSetup;

    constructor(modalService: ModalService, tutorial: TutorialSetup) {
        super(modalService);
        this.tutorial = tutorial;
    }

    show(): void {
        const element = this.createModalElement();
        this.showModal(element, { closeOnBackdrop: true, closeOnEscape: true });
    }

    private createModalElement(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';

        const tutorialItems = this.tutorial.tutorials.map(t => `
            <button class="btn btn-secondary tutorial-list-btn" data-tutorial-id="${t.id}">
                ${getInlineSVG('CALENDAR_REPEAT', 'modal-footer-icon')}
                <span class="btn-text">${t.label}</span>
            </button>
        `).join('');

        backdrop.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title">Tutorials</h2>
                        <button class="modal-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal-body tutorials-modal-body">
                        ${tutorialItems}
                    </div>
                </div>
            </div>
        `;

        backdrop.querySelector('.modal-close')?.addEventListener('click', () => this.hide());

        backdrop.querySelectorAll('.tutorial-list-btn').forEach(btn => {
            const id = (btn as HTMLElement).dataset.tutorialId!;
            btn.addEventListener('click', () => {
                this.hide();
                this.tutorial.start(id);
            });
        });

        return backdrop;
    }
}
