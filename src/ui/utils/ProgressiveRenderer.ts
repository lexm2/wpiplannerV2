import { Course, Section } from '../../types/types';
import type { CourseSelectionService } from '../../services/selection/CourseSelectionService';
import { CancellationToken } from '../../utils/RequestCancellation';
import { getAllSections } from '../../utils/courseUtils';
import { rateMyProfessorService } from '../../services/external/RateMyProfessorService';
import { getInlineSVG } from '../../utils/iconPaths';
import { Validators } from '../../utils/validators';
import { ProfileStateManager } from '../../core/state/ProfileStateManager';

export interface ProgressiveRenderOptions {
    onComplete?: (totalRendered: number) => void;
}

export class ProgressiveRenderer {
    constructor(private options: ProgressiveRenderOptions = {}) {}

    renderCourseList(
        courses: Course[],
        courseSelectionService: CourseSelectionService,
        container: HTMLElement,
        elementToCourseMap: WeakMap<HTMLElement, Course>,
        _cancellationToken?: CancellationToken,
        isLoadMore: boolean = false
    ): void {
        const stateManager = ProfileStateManager.getInstance();

        const html = courses.map(course => {
            const isSelected = courseSelectionService.isCourseSelected(course);
            const isBookmarked = stateManager.isBookmarked(course.id);
            const hasWarning = this.courseHasWarning(course);

            const sectionsByTerm = new Map<string, Section[]>();
            getAllSections(course).forEach((section: Section) => {
                const term = section.computedTerm || 'Unknown';
                if (!sectionsByTerm.has(term)) sectionsByTerm.set(term, []);
                sectionsByTerm.get(term)!.push(section);
            });

            const allTerms = ['A', 'B', 'C', 'D'];
            const sortedTerms = allTerms.filter(t => sectionsByTerm.has(t));

            const termBadgesHtml = allTerms.map(term => {
                const sections = sectionsByTerm.get(term);
                if (!sections) {
                    return `<span class="term-badge unavailable" data-term="${Validators.escapeHtml(term)}">
                        <span class="term-letter">${Validators.escapeHtml(term)}</span>
                    </span>`;
                }
                const allFull = sections.every((section: Section) => section.seatsAvailable <= 0);
                return `<span class="term-badge ${allFull ? 'full' : ''}" data-term="${Validators.escapeHtml(term)}"${allFull ? ' title="All sections full"' : ''}>
                    <span class="term-letter">${Validators.escapeHtml(term)}</span>
                    ${getInlineSVG('PLUS', 'term-icon')}
                </span>`;
            }).join('');

            const termSectionsHtml = sortedTerms.map(term => {
                const sections = sectionsByTerm.get(term)!;

                // Deduplicate: if a section code has both a named professor and a TBA entry, drop the TBA one
                const sectionsByNumber = new Map<string, Section[]>();
                sections.forEach((section: Section) => {
                    const num = section.number;
                    if (!sectionsByNumber.has(num)) sectionsByNumber.set(num, []);
                    sectionsByNumber.get(num)!.push(section);
                });
                const dedupedSections: Section[] = [];
                sectionsByNumber.forEach(group => {
                    if (group.length <= 1) {
                        dedupedSections.push(...group);
                        return;
                    }
                    // Check which entries have a real (non-TBA) professor
                    const withProf = group.filter((s: Section) =>
                        s.periods.some((p: { professor: string }) =>
                            p.professor && p.professor !== 'TBA' && p.professor !== 'Not Assigned' && p.professor.trim() !== ''
                        )
                    );
                    if (withProf.length > 0) {
                        dedupedSections.push(...withProf);
                    } else {
                        // All TBA — just keep one
                        dedupedSections.push(group[0]);
                    }
                });

                const maxBadges = 100;
                const totalSections = dedupedSections.length;
                const displaySections = dedupedSections.slice(0, maxBadges);

                const sectionBadgesHtml = displaySections.map((section: Section) => {
                    const isFull = section.seatsAvailable <= 0;
                    const professors = new Set<string>();
                    section.periods.forEach((period: { professor: string }) => {
                        if (period.professor && period.professor !== 'TBA' && period.professor !== 'Not Assigned' && period.professor.trim() !== '') {
                            professors.add(period.professor);
                        }
                    });
                    const profArray = Array.from(professors);
                    const profListPlain = profArray.join(', ') || 'TBA';
                    const profListHtml = profArray.length > 0
                        ? profArray.map(prof => {
                            const escapedProf = Validators.escapeHtml(prof);
                            const rmpUrl = rateMyProfessorService.getProfessorRMPUrl(prof);
                            return rmpUrl
                                ? `<a href="${Validators.escapeHtml(rmpUrl)}" target="_blank" rel="noopener noreferrer" class="professor-link">${escapedProf}</a>`
                                : escapedProf;
                        }).join(', ')
                        : 'TBA';
                    const escapedSectionNumber = Validators.escapeHtml(section.number);
                    const escapedProfListPlain = Validators.escapeHtml(profListPlain);
                    return `<span class="section-badge ${isFull ? 'full' : ''}" data-section="${escapedSectionNumber}" title="${escapedProfListPlain}: ${escapedSectionNumber}">${profListHtml}: ${escapedSectionNumber}</span>`;
                }).join('');

                const overflowHtml = totalSections > maxBadges
                    ? `<span class="section-badge section-badge-overflow" title="View course details for all sections">+${totalSections - maxBadges} more — see course details</span>`
                    : '';

                const allFull = sections.every((section: Section) => section.seatsAvailable <= 0);
                return `<div class="term-sections-container" data-term="${Validators.escapeHtml(term)}" style="display: none;">
                    <span class="term-badge active ${allFull ? 'full' : ''}" data-term="${Validators.escapeHtml(term)}"${allFull ? ' title="All sections full"' : ''}>
                        <span class="term-letter">${Validators.escapeHtml(term)}</span>
                        ${getInlineSVG('PLUS', 'term-icon')}
                    </span>
                    ${sectionBadgesHtml}
                    ${overflowHtml}
                </div>`;
            }).join('');

            const capacityBadgeHtml = hasWarning ? `<span class="capacity-badge">At capacity</span>` : '';

            return `
                <div class="course-item ${isSelected ? 'selected' : ''}" data-course-id="${Validators.escapeHtml(course.id)}">
                    <div class="course-header">
                        <div class="course-header-controls">
                            <button class="course-select-btn ${isSelected ? 'selected' : ''}" title="${isSelected ? 'Remove from selection' : 'Add to selection'}">
                                ${isSelected ? getInlineSVG('CHECK', 'check-icon') : getInlineSVG('PLUS', 'plus-icon')}
                            </button>
                            <button class="course-bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" title="${isBookmarked ? 'Remove bookmark' : 'Add bookmark'}">
                                ${isBookmarked ? getInlineSVG('BOOKMARK_FILLED', 'bookmark-icon') : getInlineSVG('BOOKMARK', 'bookmark-icon')}
                            </button>
                            <div class="course-code">${Validators.escapeHtml(course.departmentAbbr)}${Validators.escapeHtml(course.number)}</div>
                            <div class="course-name">
                                <span class="course-name-text">${Validators.escapeHtml(course.name)}</span>
                            </div>
                        </div>
                        <div class="course-sections" data-course-id="${Validators.escapeHtml(course.id)}">
                            <div class="term-badges-container" style="opacity: 1; transform: translateX(0);">
                                ${capacityBadgeHtml}
                                ${termBadgesHtml}
                            </div>
                            ${termSectionsHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (isLoadMore) {
            const courseListContainer = container.querySelector('.course-list');
            if (!courseListContainer) return;
            container.querySelector('.load-more-container')?.remove();
            courseListContainer.querySelectorAll('.loading-indicator').forEach(el => el.remove());
            courseListContainer.insertAdjacentHTML('beforeend', html);
            const allElements = courseListContainer.querySelectorAll('.course-item');
            const startIndex = allElements.length - courses.length;
            for (let i = 0; i < courses.length; i++) {
                const element = allElements[startIndex + i];
                if (element) elementToCourseMap.set(element as HTMLElement, courses[i]);
            }
        } else {
            container.innerHTML = '<div class="course-list"></div>';
            const courseListContainer = container.querySelector('.course-list')!;
            courseListContainer.innerHTML = html;
            courseListContainer.querySelectorAll('.course-item').forEach((el, i) => {
                if (i < courses.length) elementToCourseMap.set(el as HTMLElement, courses[i]);
            });
        }

        this.options.onComplete?.(courses.length);
    }

    renderCourseGrid(
        courses: Course[],
        courseSelectionService: CourseSelectionService,
        container: HTMLElement,
        elementToCourseMap: WeakMap<HTMLElement, Course>,
        _cancellationToken?: CancellationToken,
        isLoadMore: boolean = false
    ): void {
        const stateManager = ProfileStateManager.getInstance();

        const html = courses.map(course => {
            const isSelected = courseSelectionService.isCourseSelected(course);
            const isBookmarked = stateManager.isBookmarked(course.id);
            const hasWarning = this.courseHasWarning(course);

            return `
                <div class="course-card ${isSelected ? 'selected' : ''}" data-course-id="${Validators.escapeHtml(course.id)}">
                    <div class="course-card-header">
                        <div class="course-card-info">
                            <div class="course-title-main">${Validators.escapeHtml(course.name)}</div>
                            <div class="course-code-row">
                                <div class="course-code-badge">${Validators.escapeHtml(course.departmentAbbr)}${Validators.escapeHtml(course.number)}</div>
                                ${hasWarning ? `<span class="capacity-badge">At capacity</span>` : ''}
                            </div>
                        </div>
                        <div class="course-card-buttons">
                            <button class="course-select-btn ${isSelected ? 'selected' : ''}" title="${isSelected ? 'Remove from selection' : 'Add to selection'}">
                                ${isSelected ? getInlineSVG('CHECK', 'check-icon') : getInlineSVG('PLUS', 'plus-icon')}
                            </button>
                            <button class="course-bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" title="${isBookmarked ? 'Remove bookmark' : 'Add bookmark'}">
                                ${isBookmarked ? getInlineSVG('BOOKMARK_FILLED', 'bookmark-icon') : getInlineSVG('BOOKMARK', 'bookmark-icon')}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (isLoadMore) {
            const courseGridContainer = container.querySelector('.course-grid');
            if (!courseGridContainer) return;
            container.querySelector('.load-more-container')?.remove();
            courseGridContainer.querySelectorAll('.loading-indicator, .grid-loading').forEach(el => el.remove());
            courseGridContainer.insertAdjacentHTML('beforeend', html);
            const allElements = courseGridContainer.querySelectorAll('.course-card');
            const startIndex = allElements.length - courses.length;
            for (let i = 0; i < courses.length; i++) {
                const element = allElements[startIndex + i];
                if (element) elementToCourseMap.set(element as HTMLElement, courses[i]);
            }
        } else {
            container.innerHTML = '<div class="course-grid"></div>';
            const courseGridContainer = container.querySelector('.course-grid')!;
            courseGridContainer.innerHTML = html;
            courseGridContainer.querySelectorAll('.course-card').forEach((el, i) => {
                if (i < courses.length) elementToCourseMap.set(el as HTMLElement, courses[i]);
            });
        }

        this.options.onComplete?.(courses.length);
    }

    cancelCurrentRender(): void {}

    isCurrentlyRendering(): boolean { return false; }

    private courseHasWarning(course: Course): boolean {
        const sections = getAllSections(course);
        return sections.length > 0 && sections.every((section: Section) => section.seatsAvailable <= 0);
    }
}
