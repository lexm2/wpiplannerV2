import { BaseModal } from './BaseModal';
import { ModalService } from '../../services/ui/ModalService';
import type { SelectedCourse } from '../../types/schedule';
import { Validators } from '../../utils/validators';

export class AutoScheduleIntroModal extends BaseModal {
    private selectedCourses: SelectedCourse[];
    private getColor: (courseId: string) => string;
    private selectedIds: Set<string>;
    private onNext: ((filtered: SelectedCourse[]) => void) | null = null;

    constructor(modalService: ModalService, selectedCourses: SelectedCourse[], getColor: (courseId: string) => string) {
        super(modalService);
        this.selectedCourses = selectedCourses;
        this.getColor = getColor;
        this.selectedIds = new Set(selectedCourses.map(sc => sc.course.id));
    }

    setOnNext(callback: (filtered: SelectedCourse[]) => void): void {
        this.onNext = callback;
    }

    show(): void {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop filter-modal';
        backdrop.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title">Auto-Schedule</h2>
                        <button class="modal-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal-body as-course-picker-body">
                        <p class="as-picker-hint">Select the courses to include in schedule generation.</p>
                        <div class="as-course-grid">
                            ${this.renderCards()}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <span class="as-picker-count">${this.selectedCourses.length} of ${this.selectedCourses.length} selected</span>
                        <button class="modal-btn btn-primary" data-action="next">Next</button>
                    </div>
                </div>
            </div>
        `;

        backdrop.querySelector('.modal-dialog')?.addEventListener('click', e => e.stopPropagation());
        backdrop.querySelector('.modal-close')?.addEventListener('click', () => this.hide());

        backdrop.querySelectorAll<HTMLElement>('.as-course-card').forEach(card => {
            card.addEventListener('click', () => this.toggleCard(card, backdrop));
        });

        backdrop.querySelector('[data-action="next"]')?.addEventListener('click', () => {
            const filtered = this.selectedCourses.filter(sc => this.selectedIds.has(sc.course.id));
            this.hide();
            this.onNext?.(filtered);
        });

        this.showModal(backdrop, { closeOnBackdrop: true, closeOnEscape: true });
    }

    private renderTermBadges(sc: SelectedCourse): string {
        const available = new Set<string>();
        sc.course.lectures?.forEach(lg => available.add(lg.section.computedTerm));
        sc.course.standaloneLabs?.forEach(s => available.add(s.computedTerm));
        return ['A', 'B', 'C', 'D'].map(t => {
            const cls = available.has(t) ? 'term-badge' : 'term-badge unavailable';
            return `<span class="${cls}"><span class="term-letter">${t}</span></span>`;
        }).join('');
    }

    private renderCards(): string {
        return this.selectedCourses.map(sc => {
            const color = this.getColor(sc.course.id);
            const code = Validators.escapeHtml(`${sc.course.departmentAbbr}${sc.course.number}`);
            const name = Validators.escapeHtml(sc.course.name);
            const year = sc.course.academicYear ? Validators.escapeHtml(String(sc.course.academicYear)) : '—';
            return `
                <div class="as-course-card selected" data-course-id="${Validators.escapeHtml(sc.course.id)}">
                    <div class="as-course-card-accent" style="background:${Validators.escapeHtml(color)}"></div>
                    <div class="as-course-card-content">
                        <div class="as-course-code">${code}</div>
                        <div class="as-course-name">${name}</div>
                        <div class="as-course-year">${year}</div>
                    </div>
                    <div class="as-card-terms term-badges-container">${this.renderTermBadges(sc)}</div>
                </div>
            `;
        }).join('');
    }

    private toggleCard(card: HTMLElement, backdrop: HTMLElement): void {
        const id = card.dataset.courseId;
        if (!id) return;

        if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
            card.classList.remove('selected');
        } else {
            this.selectedIds.add(id);
            card.classList.add('selected');
        }

        const count = backdrop.querySelector('.as-picker-count');
        if (count) count.textContent = `${this.selectedIds.size} of ${this.selectedCourses.length} selected`;

        const nextBtn = backdrop.querySelector<HTMLButtonElement>('[data-action="next"]');
        if (nextBtn) nextBtn.disabled = this.selectedIds.size === 0;
    }
}
