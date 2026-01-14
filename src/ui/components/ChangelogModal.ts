import { BaseModal } from './BaseModal';
import { ModalService } from '../../services/ui/ModalService';
import changelogMarkdown from '../../../CHANGELOG.md?raw';

interface ChangelogSection {
    title: string;
    items: string[];
}

interface ChangelogEntry {
    date: string;
    sections: ChangelogSection[];
}

export class ChangelogModal extends BaseModal {
    private changelogData: ChangelogEntry[] = [];

    constructor(modalService: ModalService) {
        super(modalService);
        this.changelogData = this.parseMarkdown(changelogMarkdown);
    }

    show(): void {
        const modalElement = this.createModalElement();
        this.showModal(modalElement, {
            closeOnBackdrop: true,
            closeOnEscape: true,
        });
    }

    private parseMarkdown(markdown: string): ChangelogEntry[] {
        const entries: ChangelogEntry[] = [];
        const lines = markdown.split('\n');

        let currentEntry: ChangelogEntry | null = null;
        let currentSection: ChangelogSection | null = null;

        for (const line of lines) {
            const dateMatch = line.match(/^## \[([^\]]+)\]/);
            if (dateMatch) {
                if (currentEntry) {
                    entries.push(currentEntry);
                }
                currentEntry = { date: dateMatch[1], sections: [] };
                currentSection = null;
                continue;
            }

            const sectionMatch = line.match(/^### (.+)/);
            if (sectionMatch && currentEntry) {
                currentSection = { title: sectionMatch[1], items: [] };
                currentEntry.sections.push(currentSection);
                continue;
            }

            const itemMatch = line.match(/^- (.+)/);
            if (itemMatch && currentEntry) {
                if (!currentSection) {
                    currentSection = { title: '', items: [] };
                    currentEntry.sections.push(currentSection);
                }
                currentSection.items.push(itemMatch[1]);
            }
        }

        if (currentEntry) {
            entries.push(currentEntry);
        }

        return entries;
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
        if (this.changelogData.length === 0) {
            return '<p class="changelog-empty">No changes to display</p>';
        }

        return this.changelogData.map(entry => this.renderEntry(entry)).join('');
    }

    private renderEntry(entry: ChangelogEntry): string {
        const formattedDate = this.formatDate(entry.date);
        const sectionsHtml = entry.sections
            .map(section => this.renderSection(section))
            .join('');

        return `
            <div class="changelog-entry">
                <h3 class="changelog-date">${formattedDate}</h3>
                ${sectionsHtml}
            </div>
        `;
    }

    private renderSection(section: ChangelogSection): string {
        const itemsList = section.items
            .map(item => `<li class="changelog-item">${this.escapeHtml(item)}</li>`)
            .join('');

        const titleHtml = section.title
            ? `<h4 class="changelog-section-title">${this.escapeHtml(section.title)}</h4>`
            : '';

        return `
            <div class="changelog-section">
                ${titleHtml}
                <ul class="changelog-list">
                    ${itemsList}
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
