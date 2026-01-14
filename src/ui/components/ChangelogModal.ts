import { BaseModal } from './BaseModal';
import { ModalService } from '../../services/ui/ModalService';
import { CHANGELOG } from '../../data/changelog';
import type { ChangelogEntry } from '../../types/changelog';

export class ChangelogModal extends BaseModal {
    constructor(modalService: ModalService) {
        super(modalService);
    }

    show(): void {
        const modalElement = this.createModalElement();
        this.showModal(modalElement, {
            closeOnBackdrop: true,
            closeOnEscape: true,
        });
    }

    private createModalElement(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';

        backdrop.innerHTML = `
            <div class="modal-dialog changelog-modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title">What's New</h2>
                        <button class="modal-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal-body changelog-modal-body">
                        ${this.renderChangelogEntries()}
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn btn-primary" data-action="close">Got it</button>
                    </div>
                </div>
            </div>
        `;

        this.attachEventListeners(backdrop);
        return backdrop;
    }

    private renderChangelogEntries(): string {
        if (CHANGELOG.length === 0) {
            return '<p class="changelog-empty">No changes to display</p>';
        }

        return CHANGELOG.map(entry => this.renderEntry(entry)).join('');
    }

    private renderEntry(entry: ChangelogEntry): string {
        const formattedDate = this.formatDate(entry.date);
        const changesList = entry.changes
            .map(change => `<li class="changelog-item">${this.escapeHtml(change)}</li>`)
            .join('');

        return `
            <div class="changelog-entry">
                <h3 class="changelog-date">${formattedDate}</h3>
                <ul class="changelog-list">
                    ${changesList}
                </ul>
            </div>
        `;
    }

    private formatDate(dateString: string): string {
        const date = new Date(dateString + 'T00:00:00');
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    private attachEventListeners(backdrop: HTMLElement): void {
        const dialog = backdrop.querySelector('.modal-dialog');
        dialog?.addEventListener('click', (e) => e.stopPropagation());

        const closeBtn = backdrop.querySelector('.modal-close');
        closeBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
        });

        const gotItBtn = backdrop.querySelector('[data-action="close"]');
        gotItBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
        });
    }
}
