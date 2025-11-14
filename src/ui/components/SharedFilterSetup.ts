import { DualRangeSlider } from './DualRangeSlider';

export interface FilterServiceLike {
    addFilter(filterId: string, criteria: any): boolean;
    removeFilter(filterId: string): boolean;
    getFilterOptions(filterId: string, data: any): any;
    getActiveFilters?: () => any[];
}

export interface RMPSetupOptions {
    modalElement: HTMLElement;
    filterService: FilterServiceLike;
    idPrefix: string;
    filterId: string;
    updatePreview: (element: HTMLElement) => void;
}

export interface ProfessorSetupOptions {
    modalElement: HTMLElement;
    filterService: FilterServiceLike;
    idPrefix: string;
    filterId: string;
    professors: string[];
    updateFilter: (professors: string[]) => void;
}

export interface TermSetupOptions {
    modalElement: HTMLElement;
    filterService: FilterServiceLike;
    filterId: string;
    updateFilter: () => void;
}

export interface AvailabilitySetupOptions {
    modalElement: HTMLElement;
    idPrefix: string;
    updateFilter: () => void;
}

export interface ConflictSetupOptions {
    modalElement: HTMLElement;
    idPrefix: string;
    updateFilter: () => void;
}

export class SharedFilterSetup {
    static setupRMPRatingFilter(
        options: RMPSetupOptions,
        sliderRefs: { rating?: DualRangeSlider, difficulty?: DualRangeSlider, retake?: DualRangeSlider }
    ): void {
        const { modalElement, filterService, idPrefix, filterId, updatePreview } = options;

        // Get current filter values
        const activeFilter = filterService.getActiveFilters?.().find((f: any) => f.id === filterId);
        const minRating = activeFilter?.criteria?.minRating ?? 0;
        const maxRating = activeFilter?.criteria?.maxRating ?? 5;
        const minDifficulty = activeFilter?.criteria?.minDifficulty ?? 0;
        const maxDifficulty = activeFilter?.criteria?.maxDifficulty ?? 5;
        const minRetake = activeFilter?.criteria?.minWouldTakeAgain ?? 0;
        const maxRetake = activeFilter?.criteria?.maxWouldTakeAgain ?? 100;

        const ratingMinValue = modalElement.querySelector(`#${idPrefix}-rmp-rating-min-value`);
        const ratingMaxValue = modalElement.querySelector(`#${idPrefix}-rmp-rating-max-value`);
        const difficultyMinValue = modalElement.querySelector(`#${idPrefix}-rmp-difficulty-min-value`);
        const difficultyMaxValue = modalElement.querySelector(`#${idPrefix}-rmp-difficulty-max-value`);
        const retakeMinValue = modalElement.querySelector(`#${idPrefix}-rmp-retake-min-value`);
        const retakeMaxValue = modalElement.querySelector(`#${idPrefix}-rmp-retake-max-value`);

        const ratingContainer = modalElement.querySelector(`#${idPrefix}-rmp-rating-slider-container`);
        const difficultyContainer = modalElement.querySelector(`#${idPrefix}-rmp-difficulty-slider-container`);
        const retakeContainer = modalElement.querySelector(`#${idPrefix}-rmp-retake-slider-container`);

        let debounceTimer: number | undefined;

        const updateFilter = () => {
            if (!sliderRefs.rating || !sliderRefs.difficulty || !sliderRefs.retake) return;

            const minRating = sliderRefs.rating.getMinValue();
            const maxRating = sliderRefs.rating.getMaxValue();
            const minDifficulty = sliderRefs.difficulty.getMinValue();
            const maxDifficulty = sliderRefs.difficulty.getMaxValue();
            const minRetake = sliderRefs.retake.getMinValue();
            const maxRetake = sliderRefs.retake.getMaxValue();
            const includeCheckbox = modalElement.querySelector(`#${idPrefix}-rmp-include-without-data`) as HTMLInputElement;
            const includeWithoutData = includeCheckbox?.checked ?? true;

            const isDefaultRating = minRating === 0 && maxRating === 5;
            const isDefaultDifficulty = minDifficulty === 0 && maxDifficulty === 5;
            const isDefaultRetake = minRetake === 0 && maxRetake === 100;
            const isDefaultInclude = includeWithoutData === true;

            // Only remove filter if ALL settings are at defaults (including the checkbox)
            if (isDefaultRating && isDefaultDifficulty && isDefaultRetake && isDefaultInclude) {
                filterService.removeFilter(filterId);
            } else {
                const criteria: any = {
                    minRating,
                    maxRating,
                    minDifficulty,
                    maxDifficulty,
                    minWouldTakeAgain: minRetake,
                    maxWouldTakeAgain: maxRetake,
                    includeWithoutData
                };
                filterService.addFilter(filterId, criteria);
            }

            updatePreview(modalElement);
        };

        const debouncedUpdateFilter = () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = window.setTimeout(() => updateFilter(), 300);
        };

        if (ratingContainer) {
            sliderRefs.rating = new DualRangeSlider({
                min: 0,
                max: 5,
                step: 0.1,
                minValue: minRating,
                maxValue: maxRating,
                leftLabel: 'Minimum Rating',
                rightLabel: 'Maximum Rating',
                onChange: (min: number, max: number) => {
                    if (ratingMinValue) ratingMinValue.textContent = min.toFixed(1);
                    if (ratingMaxValue) ratingMaxValue.textContent = max.toFixed(1);
                    debouncedUpdateFilter();
                }
            });
            ratingContainer.appendChild(sliderRefs.rating.getElement());
        }

        if (difficultyContainer) {
            sliderRefs.difficulty = new DualRangeSlider({
                min: 0,
                max: 5,
                step: 0.1,
                minValue: minDifficulty,
                maxValue: maxDifficulty,
                leftLabel: 'Minimum Difficulty',
                rightLabel: 'Maximum Difficulty',
                onChange: (min: number, max: number) => {
                    if (difficultyMinValue) difficultyMinValue.textContent = min.toFixed(1);
                    if (difficultyMaxValue) difficultyMaxValue.textContent = max.toFixed(1);
                    debouncedUpdateFilter();
                }
            });
            difficultyContainer.appendChild(sliderRefs.difficulty.getElement());
        }

        if (retakeContainer) {
            sliderRefs.retake = new DualRangeSlider({
                min: 0,
                max: 100,
                step: 1,
                minValue: minRetake,
                maxValue: maxRetake,
                leftLabel: 'Minimum Would Take Again',
                rightLabel: 'Maximum Would Take Again',
                onChange: (min: number, max: number) => {
                    if (retakeMinValue) retakeMinValue.textContent = min.toString();
                    if (retakeMaxValue) retakeMaxValue.textContent = max.toString();
                    debouncedUpdateFilter();
                }
            });
            retakeContainer.appendChild(sliderRefs.retake.getElement());
        }

        const includeCheckbox = modalElement.querySelector(`#${idPrefix}-rmp-include-without-data`) as HTMLInputElement;
        includeCheckbox?.addEventListener('change', () => {
            debouncedUpdateFilter();
        });
    }

    static setupProfessorFilter(options: ProfessorSetupOptions): void {
        const { modalElement, filterService, idPrefix, filterId, professors, updateFilter } = options;

        const searchInput = modalElement.querySelector(`.${idPrefix}-professor-search`) as HTMLInputElement;
        const dropdown = modalElement.querySelector(`#${idPrefix}-professor-dropdown`) as HTMLElement;
        const chipsContainer = modalElement.querySelector(`#${idPrefix}-professor-chips`) as HTMLElement;

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.toLowerCase();
                if (query.length > 0) {
                    const matches = professors.filter(prof =>
                        prof.toLowerCase().includes(query) && prof !== 'TBA'
                    ).slice(0, 10);

                    dropdown.innerHTML = matches.map(prof =>
                        `<div class="professor-option" data-professor="${prof}" data-filter="${filterId}">${prof}</div>`
                    ).join('');
                    dropdown.style.display = matches.length > 0 ? 'block' : 'none';
                } else {
                    dropdown.style.display = 'none';
                }
            });

            dropdown.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('professor-option')) {
                    const professor = target.dataset.professor!;
                    searchInput.value = '';
                    dropdown.style.display = 'none';

                    const currentFilter = filterService.getActiveFilters?.().find((f: any) => f.id === filterId);
                    const activeProfessors = currentFilter?.criteria?.professors || [];

                    if (!activeProfessors.includes(professor)) {
                        activeProfessors.push(professor);
                        updateFilter(activeProfessors);

                        const chip = document.createElement('span');
                        chip.className = 'filter-chip';
                        chip.innerHTML = `
                            ${professor}
                            <button class="filter-chip-remove" data-professor="${professor}" data-filter="${filterId}">×</button>
                        `;
                        chipsContainer?.appendChild(chip);
                    }
                }
            });

            chipsContainer?.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('filter-chip-remove')) {
                    const professor = target.dataset.professor!;
                    const currentFilter = filterService.getActiveFilters?.().find((f: any) => f.id === filterId);
                    const activeProfessors = (currentFilter?.criteria?.professors || []).filter((p: string) => p !== professor);

                    updateFilter(activeProfessors);
                    target.closest('.filter-chip')?.remove();
                }
            });
        }
    }

    static setupTermFilter(options: TermSetupOptions): void {
        const { modalElement, filterId, updateFilter } = options;

        const checkboxes = modalElement.querySelectorAll(`input[data-filter="${filterId}"]`);
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => updateFilter());
        });

        const selectAllBtn = modalElement.querySelector(`button[data-filter="${filterId}"]`);
        selectAllBtn?.addEventListener('click', () => {
            checkboxes.forEach(cb => (cb as HTMLInputElement).checked = true);
            updateFilter();
        });
    }

    static setupAvailabilityFilter(options: AvailabilitySetupOptions): void {
        const { modalElement, idPrefix, updateFilter } = options;
        const prefix = idPrefix ? `${idPrefix}-` : '';

        const availableOnlyCheckbox = modalElement.querySelector(`#${prefix}available-only-filter`) as HTMLInputElement;
        const minSeatsInput = modalElement.querySelector(`#${prefix}min-seats-filter`) as HTMLInputElement;

        if (availableOnlyCheckbox) {
            availableOnlyCheckbox.addEventListener('change', () => updateFilter());
        }

        if (minSeatsInput) {
            minSeatsInput.addEventListener('input', () => updateFilter());
        }
    }

    static setupConflictFilter(options: ConflictSetupOptions): void {
        const { modalElement, idPrefix, updateFilter } = options;
        const prefix = idPrefix ? `${idPrefix}-` : '';

        const avoidConflictsCheckbox = modalElement.querySelector(`#${prefix}avoid-conflicts-filter`) as HTMLInputElement;

        if (avoidConflictsCheckbox) {
            avoidConflictsCheckbox.addEventListener('change', () => updateFilter());
        }
    }
}
