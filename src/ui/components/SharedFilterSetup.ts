import { DualRangeSlider } from './DualRangeSlider';
import { RMPRatingFilterCriteria } from '../../types/filters';

export interface FilterServiceLike {
    addFilter(filterId: string, criteria: unknown): boolean;
    removeFilter(filterId: string): boolean;
    getFilterOptions(filterId: string, data: unknown): unknown;
    getActiveFilters?: () => unknown[];
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
        const prefix = idPrefix ? `${idPrefix}-` : '';

        // Get current filter values
        const activeFilterRaw = filterService.getActiveFilters?.().find((f: unknown) => {
            if (!f || typeof f !== 'object') return false;
            return (f as Record<string, unknown>).id === filterId;
        });
        const activeFilter = activeFilterRaw && typeof activeFilterRaw === 'object' ? activeFilterRaw as Record<string, unknown> : null;
        const criteria = activeFilter?.criteria && typeof activeFilter.criteria === 'object' ? activeFilter.criteria as Record<string, unknown> : null;

        const minRating = typeof criteria?.minRating === 'number' ? criteria.minRating : 0;
        const maxRating = typeof criteria?.maxRating === 'number' ? criteria.maxRating : 5;
        const minDifficulty = typeof criteria?.minDifficulty === 'number' ? criteria.minDifficulty : 0;
        const maxDifficulty = typeof criteria?.maxDifficulty === 'number' ? criteria.maxDifficulty : 5;
        const minRetake = typeof criteria?.minWouldTakeAgain === 'number' ? criteria.minWouldTakeAgain : 0;
        const maxRetake = typeof criteria?.maxWouldTakeAgain === 'number' ? criteria.maxWouldTakeAgain : 100;

        const ratingMinValue = modalElement.querySelector(`#${prefix}rmp-rating-min-value`);
        const ratingMaxValue = modalElement.querySelector(`#${prefix}rmp-rating-max-value`);
        const difficultyMinValue = modalElement.querySelector(`#${prefix}rmp-difficulty-min-value`);
        const difficultyMaxValue = modalElement.querySelector(`#${prefix}rmp-difficulty-max-value`);
        const retakeMinValue = modalElement.querySelector(`#${prefix}rmp-retake-min-value`);
        const retakeMaxValue = modalElement.querySelector(`#${prefix}rmp-retake-max-value`);

        const ratingContainer = modalElement.querySelector(`#${prefix}rmp-rating-slider-container`);
        const difficultyContainer = modalElement.querySelector(`#${prefix}rmp-difficulty-slider-container`);
        const retakeContainer = modalElement.querySelector(`#${prefix}rmp-retake-slider-container`);

        let debounceTimer: number | undefined;

        const updateFilter = () => {
            if (!sliderRefs.rating || !sliderRefs.difficulty || !sliderRefs.retake) return;

            const minRating = sliderRefs.rating.getMinValue();
            const maxRating = sliderRefs.rating.getMaxValue();
            const minDifficulty = sliderRefs.difficulty.getMinValue();
            const maxDifficulty = sliderRefs.difficulty.getMaxValue();
            const minRetake = sliderRefs.retake.getMinValue();
            const maxRetake = sliderRefs.retake.getMaxValue();
            const includeCheckbox = modalElement.querySelector(`#${prefix}rmp-include-without-data`) as HTMLInputElement;
            const includeWithoutData = includeCheckbox?.checked ?? true;

            const isDefaultRating = minRating === 0 && maxRating === 5;
            const isDefaultDifficulty = minDifficulty === 0 && maxDifficulty === 5;
            const isDefaultRetake = minRetake === 0 && maxRetake === 100;
            const isDefaultInclude = includeWithoutData === true;

            // Only remove filter if ALL settings are at defaults (including the checkbox)
            if (isDefaultRating && isDefaultDifficulty && isDefaultRetake && isDefaultInclude) {
                filterService.removeFilter(filterId);
            } else {
                const criteria: RMPRatingFilterCriteria = {
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

        const includeCheckbox = modalElement.querySelector(`#${prefix}rmp-include-without-data`) as HTMLInputElement;
        includeCheckbox?.addEventListener('change', () => {
            debouncedUpdateFilter();
        });
    }

    static setupProfessorFilter(options: ProfessorSetupOptions): void {
        const { modalElement, filterService, idPrefix, filterId, professors, updateFilter } = options;

        const prefix = idPrefix ? `${idPrefix}-` : '';
        const searchInput = modalElement.querySelector(`.${prefix}professor-search`) as HTMLInputElement;
        const dropdown = modalElement.querySelector(`#${prefix}professor-dropdown`) as HTMLElement;
        const chipsContainer = modalElement.querySelector(`#${prefix}professor-chips`) as HTMLElement;

        if (!searchInput || !dropdown || !chipsContainer) {
            console.warn('Professor filter elements not found', { prefix, searchInput: !!searchInput, dropdown: !!dropdown, chipsContainer: !!chipsContainer });
            return;
        }

        // Helper to get current active professors from filter service
        const getActiveProfessors = (): string[] => {
            const filter = filterService.getActiveFilters?.().find((f: unknown) => {
                return f && typeof f === 'object' && (f as Record<string, unknown>).id === filterId;
            });
            if (!filter) return [];
            const criteria = (filter as Record<string, unknown>).criteria as Record<string, unknown> | undefined;
            return Array.isArray(criteria?.professors) ? criteria.professors as string[] : [];
        };

        // Helper to create a chip element
        const createChip = (professor: string): HTMLSpanElement => {
            const chip = document.createElement('span');
            chip.className = 'filter-chip';
            chip.innerHTML = `${professor}<button class="filter-chip-remove" data-professor="${professor}">×</button>`;
            return chip;
        };

        // Search input - show dropdown with matching professors
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase();
            if (query.length > 0) {
                const matches = professors.filter(prof =>
                    prof.toLowerCase().includes(query) && prof !== 'TBA'
                ).slice(0, 10);

                dropdown.innerHTML = matches.map(prof =>
                    `<div class="professor-option" data-professor="${prof}">${prof}</div>`
                ).join('');
                dropdown.style.display = matches.length > 0 ? 'block' : 'none';
            } else {
                dropdown.style.display = 'none';
            }
        });

        // Dropdown click - add professor chip
        dropdown.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('professor-option')) {
                const professor = target.dataset.professor!;
                searchInput.value = '';
                dropdown.style.display = 'none';

                const activeProfessors = getActiveProfessors();
                if (!activeProfessors.includes(professor)) {
                    activeProfessors.push(professor);
                    updateFilter(activeProfessors);

                    // Add chip to container and make visible
                    const chip = createChip(professor);
                    chipsContainer.appendChild(chip);
                    chipsContainer.style.display = 'flex';
                }
            }
        });

        // Chips container click - remove professor chip
        chipsContainer.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('filter-chip-remove')) {
                const professor = target.dataset.professor!;
                const activeProfessors = getActiveProfessors().filter(p => p !== professor);

                updateFilter(activeProfessors);
                target.closest('.filter-chip')?.remove();

                // Hide container if empty
                if (chipsContainer.children.length === 0) {
                    chipsContainer.style.display = 'none';
                }
            }
        });
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
