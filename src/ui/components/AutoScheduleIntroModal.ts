import { BaseModal } from './BaseModal';
import { ModalService } from '../../services/ui/ModalService';
import type { UIStateManager } from '../../services/ui/UIStateManager';
import type { SelectedCourse } from '../../types/schedule';
import { Validators } from '../../utils/validators';

export class AutoScheduleIntroModal extends BaseModal {
    get modalTypeId() { return 'auto-schedule-intro'; }
    private selectedCourses: SelectedCourse[];
    private getColor: (courseId: string) => string;
    private selectedTermsByCourseid: Map<string, Set<string>>;
    private onNext: ((filtered: SelectedCourse[]) => void) | null = null;

    constructor(modalService: ModalService, selectedCourses: SelectedCourse[], getColor: (courseId: string) => string, uiStateManager?: UIStateManager) {
        super(modalService, uiStateManager);
        this.selectedCourses = selectedCourses;
        this.getColor = getColor;
        this.selectedTermsByCourseid = new Map(
            selectedCourses.map(sc => [sc.course.id, this.hasPickedSections(sc) ? new Set<string>() : this.availableTerms(sc)])
        );
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
                        <p class="as-picker-hint">Courses with selected sections are locked by default. Click a course to include it in auto-scheduling.</p>
                        <div class="as-course-grid">
                            ${this.renderCards()}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn btn-primary" data-action="next">Next</button>
                    </div>
                </div>
            </div>
        `;

        backdrop.querySelector('.modal-dialog')?.addEventListener('click', e => e.stopPropagation());
        backdrop.querySelector('.modal-close')?.addEventListener('click', () => this.hide());

        backdrop.querySelectorAll<HTMLElement>('.as-course-card').forEach(card => {
            card.addEventListener('click', () => this.toggleCard(card));
        });

        backdrop.querySelectorAll<HTMLElement>('.as-card-terms .term-badge:not(.unavailable)').forEach(badge => {
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                const courseId = badge.dataset.courseId;
                const term = badge.dataset.term;
                if (courseId && term) this.toggleTerm(courseId, term, badge);
            });
        });

        backdrop.querySelector('[data-action="next"]')?.addEventListener('click', () => {
            const filtered = this.selectedCourses.map(sc => {
                const available = this.availableTerms(sc);
                const selected = this.selectedTermsByCourseid.get(sc.course.id) ?? available;
                if ([...available].every(t => selected.has(t))) return sc;
                return { ...sc, allowedTerms: [...selected] };
            });
            this.hide();
            this.onNext?.(filtered);
        });

        this.showModal(backdrop, { closeOnBackdrop: true, closeOnEscape: true });
    }

    private hasPickedSections(sc: SelectedCourse): boolean {
        return !!(sc.selectedLecture || sc.selectedDiscussion || sc.selectedLab);
    }

    private availableTerms(sc: SelectedCourse): Set<string> {
        const terms = new Set<string>();
        sc.course.lectures?.forEach(lg => terms.add(lg.section.computedTerm));
        sc.course.standaloneLabs?.forEach(s => terms.add(s.computedTerm));
        return terms;
    }

    private renderTermBadges(sc: SelectedCourse): string {
        const available = this.availableTerms(sc);
        const selectedTerms = this.selectedTermsByCourseid.get(sc.course.id) ?? available;
        return ['A', 'B', 'C', 'D'].map(t => {
            if (!available.has(t)) {
                return `<span class="term-badge unavailable" data-term="${t}" data-course-id="${Validators.escapeHtml(sc.course.id)}"><span class="term-letter">${t}</span></span>`;
            }
            const sel = selectedTerms.has(t) ? ' selected' : '';
            return `<span class="term-badge${sel}" data-term="${t}" data-course-id="${Validators.escapeHtml(sc.course.id)}"><span class="term-letter">${t}</span></span>`;
        }).join('');
    }

    private renderCards(): string {
        return this.selectedCourses.map(sc => {
            const color = this.getColor(sc.course.id);
            const code = Validators.escapeHtml(`${sc.course.departmentAbbr}${sc.course.number}`);
            const name = Validators.escapeHtml(sc.course.name);
            const year = sc.course.academicYear ? Validators.escapeHtml(String(sc.course.academicYear)) : '—';
            const termSet = this.selectedTermsByCourseid.get(sc.course.id);
            const selectedClass = (termSet?.size ?? 0) > 0 ? ' selected' : '';
            return `
                <div class="as-course-card${selectedClass}" data-course-id="${Validators.escapeHtml(sc.course.id)}">
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

    setTermPreferences(preferences: Record<string, string[]>): void {
        for (const [courseId, terms] of Object.entries(preferences)) {
            this.selectedTermsByCourseid.set(courseId, new Set(terms));
        }
        for (const sc of this.selectedCourses) {
            const card = document.querySelector(`.as-course-card[data-course-id="${sc.course.id}"]`);
            if (!card) continue;
            const termsContainer = card.querySelector('.as-card-terms');
            if (!termsContainer) continue;
            termsContainer.innerHTML = this.renderTermBadges(sc);
            termsContainer.querySelectorAll<HTMLElement>('.term-badge:not(.unavailable)').forEach(badge => {
                badge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const cid = badge.dataset.courseId;
                    const term = badge.dataset.term;
                    if (cid && term) this.toggleTerm(cid, term, badge);
                });
            });
            const termSet = this.selectedTermsByCourseid.get(sc.course.id);
            card.classList.toggle('selected', (termSet?.size ?? 0) > 0);
        }
    }

    private toggleCard(card: HTMLElement): void {
        const courseId = card.dataset.courseId;
        if (!courseId) return;
        const termSet = this.selectedTermsByCourseid.get(courseId);
        if (!termSet) return;

        if (termSet.size > 0) {
            termSet.clear();
            card.classList.remove('selected');
            card.querySelectorAll<HTMLElement>('.term-badge.selected').forEach(b => b.classList.remove('selected'));
        } else {
            const sc = this.selectedCourses.find(c => c.course.id === courseId);
            if (sc) this.availableTerms(sc).forEach(t => termSet.add(t));
            card.classList.add('selected');
            card.querySelectorAll<HTMLElement>('.term-badge:not(.unavailable)').forEach(b => b.classList.add('selected'));
        }
    }

    private toggleTerm(courseId: string, term: string, badgeEl: HTMLElement): void {
        const termSet = this.selectedTermsByCourseid.get(courseId);
        if (!termSet) return;

        if (termSet.has(term)) {
            termSet.delete(term);
            badgeEl.classList.remove('selected');
        } else {
            termSet.add(term);
            badgeEl.classList.add('selected');
        }

        const card = badgeEl.closest<HTMLElement>('.as-course-card');
        if (card) card.classList.toggle('selected', termSet.size > 0);
    }
}
