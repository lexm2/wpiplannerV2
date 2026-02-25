// Sidebar wizard for selecting course components (lectures, discussions, labs)
// Supports inline rendering with horizontal slide animations and step skipping

import { Course, Section } from '../../types/types';
import { SelectedCourse } from '../../types/schedule';
import { CourseDataService } from '../../services/data/courseDataService';
import { ScheduleFilterService } from '../../services/filtering/ScheduleFilterService';
import { rateMyProfessorService } from '../../services/external/RateMyProfessorService';
import { getInlineSVG } from '../../utils/iconPaths';
import { logger } from '../../utils/logger';
import { Validators } from '../../utils/validators';
import { BaseSidebarPanel } from '../sidebar/BaseSidebarPanel';
import type { SidebarListItem, SidebarListGroup } from '../sidebar/types';
import '../../styles/components/component-wizard.css';

type WizardStep = 'lecture' | 'discussion' | 'lab';

interface WizardSelections {
    lecture: Section | null;
    discussion: Section | null;
    lab: Section | null;
}

/** List item representing a section card in the wizard */
interface WizardSectionItem extends SidebarListItem {
    section: Section;
}

/**
 * Sidebar wizard for selecting course components.
 * Extends BaseSidebarPanel for consistent lifecycle management.
 */
export class ComponentSelectionWizard extends BaseSidebarPanel {
    readonly panelId = 'component-wizard';
    readonly panelClass = 'wizard-active';
    private course: Course;
    private courseDataService: CourseDataService;
    private scheduleFilterService: ScheduleFilterService | null;
    private currentStep: WizardStep;
    private selections: WizardSelections;
    private onComplete: (selections: WizardSelections) => void;
    private onCancel: () => void;
    private onSelectionChange?: (selections: WizardSelections) => void;
    private onHoverPreview?: (selections: WizardSelections) => void;
    private availableSteps: WizardStep[] = [];
    private filterChangeHandler: (() => void) | null = null;
    private allSelectedCourses: SelectedCourse[] = [];

    constructor(
        course: Course,
        courseDataService: CourseDataService,
        onComplete: (selections: WizardSelections) => void,
        onCancel: () => void,
        existingSelections?: SelectedCourse,
        onSelectionChange?: (selections: WizardSelections) => void,
        scheduleFilterService?: ScheduleFilterService,
        allSelectedCourses?: SelectedCourse[],
        onHoverPreview?: (selections: WizardSelections) => void
    ) {
        // Initialize base panel with animated list support
        super({
            containerId: 'schedule-sidebar-content',
            animationDuration: 250,
            escapeToClose: false, // We handle escape key ourselves for custom cancel behavior
            animationType: 'fade',
            animatedList: {
                staggerDelay: 40,
                itemClass: 'wizard-section-card',
                listClass: 'wizard-sections-grid',
                groupClass: 'wizard-term-group',
                groupHeaderClass: 'wizard-term-separator',
            }
        });

        this.course = course;
        this.courseDataService = courseDataService;
        this.onComplete = onComplete;
        this.onCancel = onCancel;
        this.onSelectionChange = onSelectionChange;
        this.onHoverPreview = onHoverPreview;
        this.scheduleFilterService = scheduleFilterService || null;
        this.allSelectedCourses = allSelectedCourses || [];

        // Initialize selections from existing if editing
        this.selections = {
            lecture: existingSelections?.selectedLecture || null,
            discussion: existingSelections?.selectedDiscussion || null,
            lab: existingSelections?.selectedLab || null
        };

        // Determine available steps based on course structure
        this.availableSteps = this.determineAvailableSteps();
        this.currentStep = this.determineStartStep();

        // Set up filter change listener if filter service is available
        if (this.scheduleFilterService) {
            this.filterChangeHandler = () => this.onFilterChange();
            this.scheduleFilterService.addEventListener(this.filterChangeHandler);
        }

        // RMP data is loaded centrally by MainController during app initialization
        // No need to load it here - it's already available via the singleton
    }

    /**
     * Determine which steps are available based on course structure
     * Only includes steps that have at least one option with a valid time slot
     */
    determineAvailableSteps(): WizardStep[] {
        const steps: WizardStep[] = [];
        const isHierarchical = this.courseDataService.isHierarchicalCourse(this.course);
        const isLabOnly = this.courseDataService.isLabOnlyCourse(this.course);

        if (isLabOnly) {
            // Lab-only course
            const labs = this.courseDataService.getStandaloneLabs(this.course);
            if (labs.length > 0) {
                steps.push('lab');
            }
        } else if (isHierarchical) {
            // Hierarchical course
            const lectures = this.courseDataService.getLecturesForCourse(this.course);

            if (lectures.length > 0) {
                steps.push('lecture');

                // Check if any lecture has discussions
                const hasDiscussions = lectures.some(lg =>
                    lg.compatibleDiscussions.length > 0
                );

                // Check if any lecture has labs
                const hasLabs = lectures.some(lg =>
                    lg.compatibleLabs.length > 0
                );

                if (hasDiscussions) steps.push('discussion');
                if (hasLabs) steps.push('lab');
            }
        }

        return steps;
    }

    /**
     * Determine the starting step (first available step)
     */
    determineStartStep(): WizardStep {
        return this.availableSteps[0] || 'lecture';
    }

    /**
     * Check if a section has at least one period with a valid time slot
     * Async sections are valid even with 12:00-12:00 times
     */
    private hasValidTimeSlot(section: Section): boolean {
        return section.periods.some(period => {
            // Async periods are always valid
            if (period.isAsync) {
                return true;
            }
            // Compare actual time values, not object references
            // A valid time slot has different start and end times
            return period.startTime.hours !== period.endTime.hours ||
                   period.startTime.minutes !== period.endTime.minutes;
        });
    }

    /**
     * Check if a specific step has options available
     */
    hasOptionsForStep(step: WizardStep): boolean {
        const options = this.getOptionsForStep(step);
        return options.length > 0;
    }

    /**
     * Get available sections for a specific step
     */
    getOptionsForStep(step: WizardStep): Section[] {
        let sections: Section[] = [];

        if (step === 'lecture') {
            // Lab-only course
            if (this.courseDataService.isLabOnlyCourse(this.course)) {
                sections = this.courseDataService.getStandaloneLabs(this.course);
            } else {
                // Regular hierarchical course
                const lectureGroups = this.courseDataService.getLecturesForCourse(this.course);
                sections = lectureGroups.map(lg => lg.section);
            }
        } else if (step === 'discussion') {
            if (!this.selections.lecture) {
                // No lecture selected - show ALL discussions from all lecture groups
                sections = this.getAllDiscussionsForCourse();
            } else {
                // Lecture selected - show only compatible discussions
                sections = this.courseDataService.getDiscussionsForLecture(this.course, this.selections.lecture);
            }
        } else if (step === 'lab') {
            // Lab-only course
            if (this.courseDataService.isLabOnlyCourse(this.course)) {
                sections = this.courseDataService.getStandaloneLabs(this.course);
            } else {
                // Regular course
                if (!this.selections.lecture) {
                    // No lecture selected - show ALL labs from all lecture groups
                    sections = this.getAllLabsForCourse();
                } else {
                    // Lecture selected - show only compatible labs
                    sections = this.courseDataService.getLabsForLecture(this.course, this.selections.lecture);
                }
            }
        }

        // Apply term filtering ONLY for child components (discussions/labs)
        // based on the selected lecture's term
        // NEVER filter lectures - users must be able to select any term freely
        if (step !== 'lecture' && this.selections.lecture && sections.length > 0) {
            const lectureTerm = this.selections.lecture.computedTerm;
            sections = this.filterSectionsByTerm(sections, lectureTerm);
        }

        // Filter out interest list placeholder sections
        sections = sections.filter(section => !section.isInterestList);

        // Apply schedule filters if available
        if (this.scheduleFilterService && sections.length > 0) {
            const filteredSections = this.applyScheduleFilters(sections, step);
            return filteredSections;
        }

        return sections;
    }

    /**
     * Filter sections to only include those matching the specified term
     * @param sections - Sections to filter
     * @param term - The term to filter by (e.g., 'A', 'B', 'C', 'D', 'E')
     * @returns Filtered sections matching the term
     */
    private filterSectionsByTerm(sections: Section[], term: string): Section[] {
        const filtered = sections.filter(section => section.computedTerm === term);
        return filtered;
    }

    /**
     * Apply schedule filters to sections
     */
    private applyScheduleFilters(sections: Section[], step: WizardStep): Section[] {
        if (!this.scheduleFilterService) return sections;

        const activeFilters = this.scheduleFilterService.getActiveFilters();

        // Check for RMP filter specifically
        const rmpFilter = activeFilters.find(f => f.id === 'periodRmpRating');

        // Check for conflict filter specifically
        const conflictFilter = activeFilters.find(f => f.id === 'periodConflict');

        // Filter sections individually through the schedule filter service
        const filteredSections = sections.filter(section => {
            // Create a temporary course object with ONLY the section being tested
            // This ensures filterSections only evaluates this single section
            const tempCourse: Course = {
                ...this.course
            };

            // Create a temporary SelectedCourse with this section in the appropriate slot
            const tempSelectedCourse: SelectedCourse = {
                course: tempCourse,
                selectedLecture: step === 'lecture' ? section : (this.selections.lecture || null),
                selectedDiscussion: step === 'discussion' ? section : (this.selections.discussion || null),
                selectedLab: step === 'lab' ? section : (this.selections.lab || null),
                isRequired: false,
                lockedSections: new Set()
            };

            // Combine the temp selected course with all other selected courses for context
            // This allows conflict detection to check against OTHER courses
            const allCoursesForFiltering = [tempSelectedCourse, ...this.allSelectedCourses];

            // Test if this section passes the filters
            const filtered = this.scheduleFilterService?.filterSections(allCoursesForFiltering);
            const passes = filtered ? filtered.some(item =>
                item.section.crn === section.crn &&
                item.course.course.id === this.course.id
            ) : true;

            return passes;
        });

        return filteredSections;
    }

    /**
     * Get all discussions across all lecture groups
     */
    private getAllDiscussionsForCourse(): Section[] {
        const lectureGroups = this.courseDataService.getLecturesForCourse(this.course);
        const allDiscussions = new Map<number, Section>(); // Use Map to deduplicate by CRN

        for (const lectureGroup of lectureGroups) {
            for (const discussion of lectureGroup.compatibleDiscussions) {
                allDiscussions.set(discussion.crn, discussion);
            }
        }

        return Array.from(allDiscussions.values());
    }

    /**
     * Get all labs across all lecture groups
     */
    private getAllLabsForCourse(): Section[] {
        const lectureGroups = this.courseDataService.getLecturesForCourse(this.course);
        const allLabs = new Map<number, Section>(); // Use Map to deduplicate by CRN

        for (const lectureGroup of lectureGroups) {
            for (const lab of lectureGroup.compatibleLabs) {
                allLabs.set(lab.crn, lab);
            }
        }

        return Array.from(allLabs.values());
    }

    /**
     * Open the wizard with slide-in animation in sidebar
     */
    open(): void {
        // Verify RMP data is loaded (should be loaded by MainController during app init)
        if (!rateMyProfessorService.isLoaded()) {
            logger.warn('[Wizard] WARNING: RMP data is not loaded! RMP filters will not work properly.');
            logger.warn('[Wizard] This may indicate a race condition - RMP data should be loaded during app initialization');
        }

        // Call base open() which handles container, panel creation, and animations
        super.open();

        // Add wizard-specific escape key handler for cancel behavior
        document.addEventListener('keydown', this.handleWizardEscapeKey);
    }

    /**
     * Close the wizard with slide-out animation
     */
    close(): void {
        if (!this.panel) return;

        // Get the active step and add slide-out-left animation for visual effect
        const activeStep = this.panel.querySelector('.wizard-step.active');
        if (activeStep) {
            activeStep.classList.add('slide-out-left');
            activeStep.classList.remove('slide-in-right', 'slide-in-left');
        }

        // Call base close() which handles panel removal and cleanup
        super.close();
    }

    /**
     * Called before the panel closes - cleanup wizard-specific resources
     */
    protected onClose(): void {
        document.removeEventListener('keydown', this.handleWizardEscapeKey);

        if (this.scheduleFilterService && this.filterChangeHandler) {
            this.scheduleFilterService.removeEventListener(this.filterChangeHandler);
            this.filterChangeHandler = null;
        }
    }

    /**
     * Handle filter changes - refresh current step
     */
    private onFilterChange(): void {
        if (!this.panel) return;

        // Re-render the panel with filtered sections
        this.rerender();
    }

    /**
     * Handle escape key to cancel wizard
     */
    private handleWizardEscapeKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            this.cancel();
        }
    };

    /**
     * Select a section for the current step
     */
    selectSection(section: Section): void {
        // Get previous selection to check if we need to clear dependent selections
        const previousSelection = this.selections[this.currentStep];

        // Store selection
        if (this.currentStep === 'lecture') {
            // Clear dependent selections if changing to a different lecture
            if (previousSelection && previousSelection.crn !== section.crn) {
                this.selections.discussion = null;
                this.selections.lab = null;
            }
            this.selections.lecture = section;
        } else if (this.currentStep === 'discussion') {
            this.selections.discussion = section;
        } else if (this.currentStep === 'lab') {
            this.selections.lab = section;
        }

        // Update visual selection state without re-rendering
        if (this.panel) {
            // Remove 'selected' class and badges from all section cards
            const allSections = this.panel.querySelectorAll('.wizard-section-card');
            allSections.forEach(el => {
                el.classList.remove('selected');
                // Remove any existing selected badge
                const badge = el.querySelector('.section-card-selected-badge');
                if (badge) {
                    badge.remove();
                }
            });

            // Add 'selected' class to the newly selected section and add badge
            const selectedSection = this.panel.querySelector(`.wizard-section-card[data-crn="${section.crn}"]`);
            if (selectedSection) {
                selectedSection.classList.add('selected');
                // Add selected badge
                const badge = document.createElement('div');
                badge.className = 'section-card-selected-badge';
                badge.textContent = '✓ Selected';
                selectedSection.appendChild(badge);
            }

            // Update footer button visibility
            const hasSelection = this.selections[this.currentStep] !== null;
            const currentIndex = this.availableSteps.indexOf(this.currentStep);
            const isLastStep = currentIndex === this.availableSteps.length - 1;
            const nextBtn = this.panel.querySelector('#wizard-next-btn');
            const skipBtn = this.panel.querySelector('#wizard-skip-btn');

            if (!hasSelection && nextBtn) {
                // Remove Next button and add Skip button (if not last step)
                nextBtn.remove();
                if (!isLastStep && !skipBtn) {
                    const footer = this.panel.querySelector('.wizard-footer');
                    if (footer) {
                        const skipBtnHTML = `
                            <button class="wizard-btn wizard-btn-secondary" id="wizard-skip-btn">
                                Skip
                            </button>
                        `;
                        footer.insertAdjacentHTML('beforeend', skipBtnHTML);

                        const newSkipBtn = footer.querySelector('#wizard-skip-btn');
                        newSkipBtn?.addEventListener('click', () => this.nextStep());
                    }
                }
            } else if (hasSelection && !nextBtn) {
                // Remove Skip button and add Next button
                skipBtn?.remove();
                const footer = this.panel.querySelector('.wizard-footer');
                if (footer) {
                    const nextBtnHTML = `
                        <button class="wizard-btn wizard-btn-primary" id="wizard-next-btn">
                            ${isLastStep ? 'Finish' : 'Next'}
                        </button>
                    `;
                    footer.insertAdjacentHTML('beforeend', nextBtnHTML);

                    // Attach event listener to new button
                    const newNextBtn = footer.querySelector('#wizard-next-btn');
                    newNextBtn?.addEventListener('click', () => {
                        const currentIndex = this.availableSteps.indexOf(this.currentStep);
                        const isLastStep = currentIndex === this.availableSteps.length - 1;
                        if (isLastStep) {
                            this.complete();
                        } else {
                            this.nextStep();
                        }
                    });
                }
            }
        }

        // Trigger live preview callback
        if (this.onSelectionChange) {
            this.onSelectionChange(this.selections);
        } else {
            logger.warn('[Wizard] onSelectionChange is undefined! Cannot trigger preview.');
        }
    }

    /**
     * Move to the next step
     */
    nextStep(): void {
        const currentIndex = this.availableSteps.indexOf(this.currentStep);

        if (currentIndex < this.availableSteps.length - 1) {
            // Move to next step
            const nextStep = this.availableSteps[currentIndex + 1];
            this.currentStep = nextStep;  // Update state BEFORE rendering
            this.transitionToStep(nextStep, 'forward');
        } else {
            // Completed all steps
            this.complete();
        }
    }

    /**
     * Move to the previous step
     */
    prevStep(): void {
        const currentIndex = this.availableSteps.indexOf(this.currentStep);

        if (currentIndex > 0) {
            const prevStep = this.availableSteps[currentIndex - 1];
            this.currentStep = prevStep;  // Update state BEFORE rendering
            this.transitionToStep(prevStep, 'backward');
        }
    }

    /**
     * Jump to a specific step (from breadcrumb)
     */
    jumpToStep(step: WizardStep): void {
        if (!this.availableSteps.includes(step)) return;

        const currentIndex = this.availableSteps.indexOf(this.currentStep);
        const targetIndex = this.availableSteps.indexOf(step);

        const direction = targetIndex > currentIndex ? 'forward' : 'backward';
        this.currentStep = step;  // Update state BEFORE rendering
        this.transitionToStep(step, direction);
    }

    /**
     * Transition to a different step with animation
     */
    private transitionToStep(_toStep: WizardStep, direction: 'forward' | 'backward'): void {
        if (!this.panel) return;

        // Get current step element
        const currentStepElement = this.panel.querySelector('.wizard-step.active');

        if (currentStepElement) {
            // Add exit animation class based on direction
            const exitClass = direction === 'forward' ? 'slide-out-left' : 'slide-out-right';
            currentStepElement.classList.add(exitClass);
            currentStepElement.classList.remove('slide-in-right', 'slide-in-left');

            // Wait for exit animation to complete (250ms base + 250ms max stagger = 500ms)
            setTimeout(() => {
                // Re-render with new step (which includes slide-in-right by default)
                this.panel!.innerHTML = this.renderContent();

                // Get the new step element and add appropriate slide-in animation
                const newStepElement = this.panel!.querySelector('.wizard-step.active');
                if (newStepElement) {
                    // Remove default slide-in-right, add direction-specific animation
                    newStepElement.classList.remove('slide-in-right');
                    const enterClass = direction === 'forward' ? 'slide-in-right' : 'slide-in-left';
                    newStepElement.classList.add(enterClass);
                }

                this.attachEventListeners();
            }, 250); // Match base animation duration (stagger will happen automatically via CSS)
        } else {
            // No current step element, just render
            this.panel.innerHTML = this.renderContent();
            this.attachEventListeners();
        }
    }

    /**
     * Complete the wizard and return selections
     */
    private complete(): void {
        this.close();
        this.onComplete(this.selections);
    }

    /**
     * Cancel the wizard
     */
    private cancel(): void {
        this.close();
        this.onCancel();
    }

    /**
     * Render the complete wizard content.
     * Required by BaseSidebarPanel.
     */
    protected renderContent(): string {
        return `
            <div class="wizard-header">
                <button class="wizard-close-btn" id="wizard-close-btn">&times;</button>
                <h2>${Validators.escapeHtml(this.course.departmentAbbr)} ${Validators.escapeHtml(this.course.number)}</h2>
                <div class="wizard-course-name">${Validators.escapeHtml(this.course.name)}</div>
            </div>

            ${this.renderFilterStatus()}
            ${this.renderBreadcrumbs()}

            <div class="wizard-content">
                ${this.renderCurrentStep()}
            </div>

            <div class="wizard-footer">
                ${this.renderFooter()}
            </div>
        `;
    }

    /**
     * Render filter status indicator
     */
    private renderFilterStatus(): string {
        if (!this.scheduleFilterService || this.scheduleFilterService.isEmpty()) {
            return '';
        }

        const activeFilters = this.scheduleFilterService.getActiveFilters();
        const filterDescriptions: string[] = [];

        activeFilters.forEach(filter => {
            // Get display value from each filter
            if (filter.id === 'periodRmpRating' && filter.criteria) {
                const parts: string[] = [];
                const rmpCriteria = filter.criteria as {
                    minRating?: number;
                    maxRating?: number;
                    minDifficulty?: number;
                    maxDifficulty?: number;
                    minWouldTakeAgain?: number;
                    maxWouldTakeAgain?: number;
                };
                const { minRating, maxRating, minDifficulty, maxDifficulty, minWouldTakeAgain, maxWouldTakeAgain } = rmpCriteria;

                // Show rating range if not at defaults
                if ((minRating ?? 0) > 0 || (maxRating ?? 5) < 5) {
                    parts.push(`${(minRating ?? 0).toFixed(1)}-${(maxRating ?? 5).toFixed(1)} rating`);
                }
                // Show difficulty range if not at defaults
                if ((minDifficulty ?? 0) > 0 || (maxDifficulty ?? 5) < 5) {
                    parts.push(`${(minDifficulty ?? 0).toFixed(1)}-${(maxDifficulty ?? 5).toFixed(1)} difficulty`);
                }
                // Show retake range if not at defaults
                if ((minWouldTakeAgain ?? 0) > 0 || (maxWouldTakeAgain ?? 100) < 100) {
                    parts.push(`${minWouldTakeAgain ?? 0}-${maxWouldTakeAgain ?? 100}% retake`);
                }

                if (parts.length > 0) {
                    filterDescriptions.push(`RMP: ${parts.join(`<span class="filter-separator">●</span>`)}`);
                }
            } else if (filter.id !== 'searchText') {
                // Add other filters (excluding search text which is shown elsewhere)
                filterDescriptions.push(filter.name);
            }
        });

        if (filterDescriptions.length === 0) {
            return '';
        }

        // Create filter items with separators
        const filterItems = filterDescriptions.map((desc, index) => {
            if (index === 0) {
                return desc;
            }
            return `<span class="filter-separator">●</span>${desc}`;
        }).join('');

        return `
            <div class="wizard-filter-status">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="filter-icon">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <path d="M20 3h-16a1 1 0 0 0 -1 1v2.227l.008 .223a3 3 0 0 0 .772 1.795l4.22 4.641v8.114a1 1 0 0 0 1.316 .949l6 -2l.108 -.043a1 1 0 0 0 .576 -.906v-6.586l4.121 -4.12a3 3 0 0 0 .879 -2.123v-2.171a1 1 0 0 0 -1 -1z" />
                </svg>
                <span class="filter-text">Filters: ${filterItems}</span>
            </div>
        `;
    }

    /**
     * Render breadcrumb navigation
     */
    private renderBreadcrumbs(): string {
        if (this.availableSteps.length <= 1) return '';

        const stepLabels: Record<WizardStep, string> = {
            lecture: this.courseDataService.isLabOnlyCourse(this.course) ? 'Lab Section' : 'Lecture',
            discussion: 'Discussion',
            lab: 'Lab'
        };

        const breadcrumbs = this.availableSteps.map((step, index) => {
            const isActive = step === this.currentStep;
            const isCompleted = this.selections[step] !== null;

            return `
                <button
                    class="wizard-breadcrumb ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}"
                    data-step="${step}"
                    ${isActive ? 'disabled' : ''}
                >
                    <span class="breadcrumb-label">${stepLabels[step]}</span>
                    ${isCompleted ? `<span class="breadcrumb-check">✓</span>` : ''}
                </button>
            `;
        }).join(`<span class="breadcrumb-arrow">${getInlineSVG('ARROW_BAR_RIGHT', 'breadcrumb-arrow-icon')}</span>`);

        return `
            <div class="wizard-breadcrumbs">
                ${breadcrumbs}
            </div>
        `;
    }

    /**
     * Render the current step
     */
    private renderCurrentStep(): string {
        const options = this.getOptionsForStep(this.currentStep);

        if (options.length === 0) {
            return `
                <div class="wizard-step" data-step="${this.currentStep}">
                    <div class="wizard-empty-state">
                        <p>No ${this.currentStep}s available for this course.</p>
                    </div>
                </div>
            `;
        }

        const stepTitles: Record<WizardStep, string> = {
            lecture: this.courseDataService.isLabOnlyCourse(this.course) ? 'Select Lab Section' : 'Select Lecture',
            discussion: 'Select Discussion',
            lab: 'Select Lab'
        };

        // Group sections by academic term
        const sectionsByTerm = this.groupSectionsByTerm(options);

        // Render sections grouped by term
        let sectionsHTML = '';
        let cardIndex = 0; // Global card index for stagger animation
        for (const [term, sections] of sectionsByTerm) {
            const termName = this.getTermName(term);
            sectionsHTML += `
                <div class="wizard-term-separator">${termName}</div>
                <div class="wizard-sections-grid">
                    ${sections.map(section => this.renderSectionCard(section, cardIndex++)).join('')}
                </div>
            `;
        }

        return `
            <div class="wizard-step active slide-in-right" data-step="${this.currentStep}">
                <h3 class="wizard-step-title">${stepTitles[this.currentStep]}</h3>
                ${sectionsHTML}
            </div>
        `;
    }

    /**
     * Group sections by their academic term (computedTerm)
     * Returns a Map with term as key and sections array as value
     */
    private groupSectionsByTerm(sections: Section[]): Map<string, Section[]> {
        const grouped = new Map<string, Section[]>();

        for (const section of sections) {
            const term = section.computedTerm || 'Unknown';
            if (!grouped.has(term)) {
                grouped.set(term, []);
            }
            grouped.get(term)!.push(section);
        }

        // Sort by term order (A, B, C, D, E)
        const sortedMap = new Map(
            Array.from(grouped.entries()).sort((a, b) => {
                const termOrder = ['A', 'B', 'C', 'D', 'E'];
                return termOrder.indexOf(a[0]) - termOrder.indexOf(b[0]);
            })
        );

        return sortedMap;
    }

    /**
     * Get display name for academic term
     */
    private getTermName(term: string): string {
        const termNames: Record<string, string> = {
            'A': 'A Term (Fall 1)',
            'B': 'B Term (Fall 2)',
            'C': 'C Term (Spring 1)',
            'D': 'D Term (Spring 2)',
            'E': 'E Term (Summer)'
        };
        return termNames[term] || `${term} Term`;
    }

    /**
     * Render a single section card
     */
    private renderSectionCard(section: Section, cardIndex: number): string {
        const period = section.periods[0];

        // Check if async: either via isAsync flag or by detecting 12:00-12:00 times
        const isAsync = period?.isAsync || (period &&
            period.startTime.hours === 12 && period.startTime.minutes === 0 &&
            period.endTime.hours === 12 && period.endTime.minutes === 0);

        const professor = period?.professor || 'Not Assigned';

        const isSelected = this.selections[this.currentStep]?.crn === section.crn;
        const seatsInfo = section.seatsAvailable > 0
            ? `${section.seatsAvailable}/${section.seats} seats remaining`
            : `Full (${section.actualWaitlist}/${section.maxWaitlist} waitlist)`;

        // Get Rate My Professor data for this professor
        const rmpData = professor !== 'Not Assigned' ? rateMyProfessorService.getRatingDisplay(professor) : null;
        const rmpUrl = professor !== 'Not Assigned' ? rateMyProfessorService.getProfessorRMPUrl(professor) : null;

        const escapedProfessor = Validators.escapeHtml(professor);

        // Build time/location content based on async status
        let timeLocationContent: string;
        if (isAsync) {
            timeLocationContent = `
                <div class="section-card-async-badge">
                    ${getInlineSVG('CLOCK', 'async-icon')}
                    Asynchronous
                </div>
            `;
        } else {
            const days = period ? Array.from(period.days).join('') : 'TBA';
            const time = period ? `${period.startTime.displayTime} - ${period.endTime.displayTime}` : 'TBA';
            const location = period?.location || 'TBA';
            timeLocationContent = `
                <div class="section-card-time">
                    <strong>${Validators.escapeHtml(days)}</strong> ${Validators.escapeHtml(time)}
                </div>
                <div class="section-card-location">${Validators.escapeHtml(location)}</div>
            `;
        }

        return `
            <div
                class="wizard-section-card ${isSelected ? 'selected' : ''}"
                data-crn="${section.crn}"
                style="--card-index: ${cardIndex}"
            >
                <div class="section-card-header">
                    <span class="section-card-number">${Validators.escapeHtml(section.number)}</span>
                </div>
                ${timeLocationContent}
                <div class="section-card-professor">
                    ${rmpUrl ? `<a href="${Validators.escapeHtml(rmpUrl)}" target="_blank" rel="noopener noreferrer" class="professor-link">${escapedProfessor}</a>` : escapedProfessor}
                    ${rmpData ? this.renderRMPBadge(rmpData) : ''}
                </div>
                <div class="section-card-footer">
                    <span class="section-card-seats ${section.seatsAvailable === 0 ? 'full' : ''}">
                        ${seatsInfo}
                    </span>
                    <span class="section-card-crn">CRN: ${section.crn}</span>
                </div>
                ${isSelected ? `<div class="section-card-selected-badge">✓ Selected</div>` : ''}
            </div>
        `;
    }

    /**
     * Render Rate My Professor badge with rating info
     */
    private renderRMPBadge(rmpData: {
        rating: string;
        difficulty: string;
        numRatings: number;
        wouldTakeAgain: string | null;
        hasData: boolean;
    }): string {
        const ratingNum = parseFloat(rmpData.rating);
        const ratingClass = ratingNum >= 4.0 ? 'excellent' : ratingNum >= 3.0 ? 'good' : 'poor';

        return `
            <div class="rmp-badge" title="Rate My Professor: ${rmpData.rating}/5.0 (${rmpData.numRatings} ratings)">
                <span class="rmp-rating ${ratingClass}">★ ${rmpData.rating}</span>
                <span class="rmp-details">
                    ${rmpData.difficulty}/5 difficulty
                    ${rmpData.wouldTakeAgain ? ` • ${rmpData.wouldTakeAgain} would take again` : ''}
                </span>
            </div>
        `;
    }

    /**
     * Render footer with navigation buttons
     */
    private renderFooter(): string {
        const currentIndex = this.availableSteps.indexOf(this.currentStep);
        const isFirstStep = currentIndex === 0;
        const isLastStep = currentIndex === this.availableSteps.length - 1;
        const hasSelection = this.selections[this.currentStep] !== null;

        return `
            <button
                class="wizard-btn wizard-btn-secondary"
                id="wizard-back-btn"
                ${isFirstStep ? 'style="visibility: hidden"' : ''}
            >
                Back
            </button>
            <button class="wizard-btn wizard-btn-text" id="wizard-cancel-btn">
                Cancel
            </button>
            ${hasSelection ? `
                <button class="wizard-btn wizard-btn-primary" id="wizard-next-btn">
                    ${isLastStep ? 'Finish' : 'Next'}
                </button>
            ` : !isLastStep ? `
                <button class="wizard-btn wizard-btn-secondary" id="wizard-skip-btn">
                    Skip
                </button>
            ` : ''}
        `;
    }

    /**
     * Attach event listeners to wizard elements.
     * Required by BaseSidebarPanel.
     */
    protected attachEventListeners(): void {
        if (!this.panel) return;

        // Close button
        const closeBtn = this.panel.querySelector('#wizard-close-btn');
        closeBtn?.addEventListener('click', () => this.cancel());

        // Cancel button
        const cancelBtn = this.panel.querySelector('#wizard-cancel-btn');
        cancelBtn?.addEventListener('click', () => this.cancel());

        // Back button
        const backBtn = this.panel.querySelector('#wizard-back-btn');
        backBtn?.addEventListener('click', () => this.prevStep());

        // Next/Finish button
        const nextBtn = this.panel.querySelector('#wizard-next-btn');
        nextBtn?.addEventListener('click', () => {
            const currentIndex = this.availableSteps.indexOf(this.currentStep);
            const isLastStep = currentIndex === this.availableSteps.length - 1;
            if (isLastStep) {
                this.complete();
            } else {
                this.nextStep();
            }
        });

        // Skip button (shown when no selection is made on non-last steps)
        const skipBtn = this.panel.querySelector('#wizard-skip-btn');
        skipBtn?.addEventListener('click', () => {
            this.nextStep();
        });

        // Breadcrumb navigation
        const breadcrumbs = this.panel.querySelectorAll('.wizard-breadcrumb:not([disabled])');
        breadcrumbs.forEach(breadcrumb => {
            breadcrumb.addEventListener('click', (e) => {
                const step = (e.currentTarget as HTMLElement).dataset.step as WizardStep;
                this.jumpToStep(step);
            });
        });

        // Section cards
        const sectionCards = this.panel.querySelectorAll('.wizard-section-card');
        sectionCards.forEach(card => {
            card.addEventListener('click', (e) => {
                const crn = parseInt((e.currentTarget as HTMLElement).dataset.crn || '0');
                const options = this.getOptionsForStep(this.currentStep);
                const section = options.find(s => s.crn === crn);
                if (section) {
                    this.selectSection(section);
                }
            });

            // Add hover preview for section cards
            card.addEventListener('mouseenter', (e) => {
                const crn = parseInt((e.currentTarget as HTMLElement).dataset.crn || '0');
                const options = this.getOptionsForStep(this.currentStep);
                const section = options.find(s => s.crn === crn);
                if (section) {
                    this.showSectionPreview(section);
                }
            });

            card.addEventListener('mouseleave', () => {
                this.clearSectionPreview();
            });
        });
    }

    /**
     * Show preview of a section on the schedule grid (hover with dashed borders)
     */
    private showSectionPreview(section: Section): void {
        if (!this.onHoverPreview) return;

        // Create temporary selections including existing selections AND the hovered section
        // This ensures all components are visible, but only the new hover is marked as preview
        const tempSelections: WizardSelections = {
            lecture: this.currentStep === 'lecture' ? section : this.selections.lecture,
            discussion: this.currentStep === 'discussion' ? section : this.selections.discussion,
            lab: this.currentStep === 'lab' ? section : this.selections.lab
        };

        // Trigger hover preview (renders with dashed borders for only the new section)
        this.onHoverPreview(tempSelections);
    }

    /**
     * Clear preview by restoring actual selections
     */
    private clearSectionPreview(): void {
        if (!this.onSelectionChange) return;

        // Restore the actual selections (clears hover preview)
        this.onSelectionChange(this.selections);
    }
}
