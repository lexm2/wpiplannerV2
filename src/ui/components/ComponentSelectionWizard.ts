/**
 * ComponentSelectionWizard - Inline sidebar wizard for selecting course components
 *
 * Redesigned for sidebar integration with horizontal sliding panels.
 * Shows course list ↔ wizard steps (lectures → discussions → labs).
 *
 * Features:
 * - Inline rendering in sidebar (no overlay)
 * - Horizontal slide animations
 * - Smart step skipping (auto-skip if no options)
 * - Breadcrumb navigation
 * - Pre-selection support for editing
 */

import { Course, Section } from '../../types/types';
import { SelectedCourse } from '../../types/schedule';
import { CourseDataService } from '../../services/courseDataService';

type WizardStep = 'lecture' | 'discussion' | 'lab';

interface WizardSelections {
    lecture: Section | null;
    discussion: Section | null;
    lab: Section | null;
}

export class ComponentSelectionWizard {
    private course: Course;
    private courseDataService: CourseDataService;
    private currentStep: WizardStep;
    private selections: WizardSelections;
    private existingSelections: SelectedCourse | null;
    private onComplete: (selections: WizardSelections) => void;
    private onCancel: () => void;
    private container: HTMLElement | null = null;
    private availableSteps: WizardStep[] = [];
    private wizardPanel: HTMLElement | null = null;

    constructor(
        course: Course,
        courseDataService: CourseDataService,
        onComplete: (selections: WizardSelections) => void,
        onCancel: () => void,
        existingSelections?: SelectedCourse
    ) {
        this.course = course;
        this.courseDataService = courseDataService;
        this.onComplete = onComplete;
        this.onCancel = onCancel;
        this.existingSelections = existingSelections || null;

        // Initialize selections from existing if editing
        this.selections = {
            lecture: existingSelections?.selectedLecture || null,
            discussion: existingSelections?.selectedDiscussion || null,
            lab: existingSelections?.selectedLab || null
        };

        // Determine available steps based on course structure
        this.availableSteps = this.determineAvailableSteps();
        this.currentStep = this.determineStartStep();
    }

    /**
     * Determine which steps are available based on course structure
     */
    determineAvailableSteps(): WizardStep[] {
        const steps: WizardStep[] = [];
        const isHierarchical = this.courseDataService.isHierarchicalCourse(this.course);
        const isLabOnly = this.courseDataService.isLabOnlyCourse(this.course);

        if (isLabOnly) {
            // Lab-only course
            steps.push('lab');
        } else if (isHierarchical) {
            // Hierarchical course - check what's available
            const lectures = this.courseDataService.getLecturesForCourse(this.course);

            if (lectures.length > 0) {
                steps.push('lecture');

                // Check if any lecture has discussions or labs
                const hasDiscussions = lectures.some(lg => lg.compatibleDiscussions.length > 0);
                const hasLabs = lectures.some(lg => lg.compatibleLabs.length > 0);

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
        if (step === 'lecture') {
            // Lab-only course
            if (this.courseDataService.isLabOnlyCourse(this.course)) {
                return this.courseDataService.getStandaloneLabs(this.course);
            }

            // Regular hierarchical course
            const lectureGroups = this.courseDataService.getLecturesForCourse(this.course);
            return lectureGroups.map(lg => lg.section);
        }

        if (step === 'discussion') {
            if (!this.selections.lecture) return [];
            return this.courseDataService.getDiscussionsForLecture(this.course, this.selections.lecture);
        }

        if (step === 'lab') {
            // Lab-only course
            if (this.courseDataService.isLabOnlyCourse(this.course)) {
                return this.courseDataService.getStandaloneLabs(this.course);
            }

            // Regular course with selected lecture
            if (!this.selections.lecture) return [];
            return this.courseDataService.getLabsForLecture(this.course, this.selections.lecture);
        }

        return [];
    }

    /**
     * Open the wizard with slide-in animation in sidebar
     */
    open(): void {
        const sidebarContainer = document.getElementById('schedule-selected-courses');
        if (!sidebarContainer) {
            console.error('Sidebar container not found');
            return;
        }

        this.container = sidebarContainer;

        // Create wizard panel
        this.wizardPanel = document.createElement('div');
        this.wizardPanel.className = 'wizard-inline-panel';
        this.wizardPanel.innerHTML = this.renderWizardContent();

        // Add to sidebar
        sidebarContainer.appendChild(this.wizardPanel);

        // Trigger slide animation
        requestAnimationFrame(() => {
            this.wizardPanel?.classList.add('active');
        });

        // Attach event listeners
        this.attachEventListeners();

        // Add escape key handler
        document.addEventListener('keydown', this.handleEscapeKey);
    }

    /**
     * Close the wizard with slide-out animation
     */
    close(): void {
        if (!this.wizardPanel) return;

        this.wizardPanel.classList.remove('active');

        setTimeout(() => {
            if (this.wizardPanel && this.container) {
                this.container.removeChild(this.wizardPanel);
                this.wizardPanel = null;
                this.container = null;
            }
        }, 300); // Match CSS transition duration

        document.removeEventListener('keydown', this.handleEscapeKey);
    }

    /**
     * Handle escape key to close wizard
     */
    private handleEscapeKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            this.cancel();
        }
    };

    /**
     * Select a section for the current step
     */
    selectSection(section: Section): void {
        // Store selection
        if (this.currentStep === 'lecture') {
            this.selections.lecture = section;
            // Clear dependent selections if changing lecture
            if (this.existingSelections && this.existingSelections.selectedLecture?.crn !== section.crn) {
                this.selections.discussion = null;
                this.selections.lab = null;
            }
        } else if (this.currentStep === 'discussion') {
            this.selections.discussion = section;
        } else if (this.currentStep === 'lab') {
            this.selections.lab = section;
        }

        // Auto-advance to next step
        setTimeout(() => {
            this.nextStep();
        }, 200); // Brief delay to show selection feedback
    }

    /**
     * Move to the next step
     */
    nextStep(): void {
        const currentIndex = this.availableSteps.indexOf(this.currentStep);

        if (currentIndex < this.availableSteps.length - 1) {
            // Move to next step
            const nextStep = this.availableSteps[currentIndex + 1];
            this.transitionToStep(nextStep, 'forward');
            this.currentStep = nextStep;
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
            this.transitionToStep(prevStep, 'backward');
            this.currentStep = prevStep;
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
        this.transitionToStep(step, direction);
        this.currentStep = step;
    }

    /**
     * Transition to a different step with animation
     */
    private transitionToStep(toStep: WizardStep, direction: 'forward' | 'backward'): void {
        if (!this.wizardPanel) return;

        // Re-render with new step
        this.wizardPanel.innerHTML = this.renderWizardContent();
        this.attachEventListeners();
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
     * Render the complete wizard content
     */
    private renderWizardContent(): string {
        return `
            <div class="wizard-header">
                <button class="wizard-close-btn" id="wizard-close-btn">&times;</button>
                <h2>${this.course.department.abbreviation} ${this.course.number}</h2>
                <div class="wizard-course-name">${this.course.name}</div>
            </div>

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
            const number = index + 1;

            return `
                <button
                    class="wizard-breadcrumb ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}"
                    data-step="${step}"
                    ${isActive ? 'disabled' : ''}
                >
                    <span class="breadcrumb-number">${number}</span>
                    <span class="breadcrumb-label">${stepLabels[step]}</span>
                    ${isCompleted ? '<span class="breadcrumb-check">✓</span>' : ''}
                </button>
            `;
        }).join('<span class="breadcrumb-arrow">→</span>');

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

        return `
            <div class="wizard-step active" data-step="${this.currentStep}">
                <h3 class="wizard-step-title">${stepTitles[this.currentStep]}</h3>
                <div class="wizard-sections-grid">
                    ${options.map(section => this.renderSectionCard(section)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render a single section card
     */
    private renderSectionCard(section: Section): string {
        const period = section.periods[0];
        const days = period ? Array.from(period.days).join('').toUpperCase() : 'TBA';
        const time = period ? `${period.startTime.displayTime} - ${period.endTime.displayTime}` : 'TBA';
        const location = period?.location || 'TBA';
        const professor = period?.professor || 'Not Assigned';

        const isSelected = this.selections[this.currentStep]?.crn === section.crn;
        const seatsInfo = section.seatsAvailable > 0
            ? `${section.seatsAvailable}/${section.seats} seats`
            : `Full (${section.actualWaitlist}/${section.maxWaitlist} waitlist)`;

        return `
            <div
                class="wizard-section-card ${isSelected ? 'selected' : ''}"
                data-crn="${section.crn}"
            >
                <div class="section-card-header">
                    <span class="section-card-number">${section.number}</span>
                    <span class="section-card-crn">CRN: ${section.crn}</span>
                </div>
                <div class="section-card-time">
                    <strong>${days}</strong> ${time}
                </div>
                <div class="section-card-location">${location}</div>
                <div class="section-card-professor">${professor}</div>
                <div class="section-card-seats ${section.seatsAvailable === 0 ? 'full' : ''}">
                    ${seatsInfo}
                </div>
                ${isSelected ? '<div class="section-card-selected-badge">✓ Selected</div>' : ''}
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
            ${!hasSelection && isLastStep ? `
                <button class="wizard-btn wizard-btn-primary" disabled>
                    Select a ${this.currentStep} to continue
                </button>
            ` : ''}
        `;
    }

    /**
     * Attach event listeners to wizard elements
     */
    private attachEventListeners(): void {
        if (!this.wizardPanel) return;

        // Close button
        const closeBtn = this.wizardPanel.querySelector('#wizard-close-btn');
        closeBtn?.addEventListener('click', () => this.cancel());

        // Cancel button
        const cancelBtn = this.wizardPanel.querySelector('#wizard-cancel-btn');
        cancelBtn?.addEventListener('click', () => this.cancel());

        // Back button
        const backBtn = this.wizardPanel.querySelector('#wizard-back-btn');
        backBtn?.addEventListener('click', () => this.prevStep());

        // Breadcrumb navigation
        const breadcrumbs = this.wizardPanel.querySelectorAll('.wizard-breadcrumb:not([disabled])');
        breadcrumbs.forEach(breadcrumb => {
            breadcrumb.addEventListener('click', (e) => {
                const step = (e.currentTarget as HTMLElement).dataset.step as WizardStep;
                this.jumpToStep(step);
            });
        });

        // Section cards
        const sectionCards = this.wizardPanel.querySelectorAll('.wizard-section-card');
        sectionCards.forEach(card => {
            card.addEventListener('click', (e) => {
                const crn = parseInt((e.currentTarget as HTMLElement).dataset.crn || '0');
                const options = this.getOptionsForStep(this.currentStep);
                const section = options.find(s => s.crn === crn);
                if (section) {
                    this.selectSection(section);
                }
            });
        });
    }
}
