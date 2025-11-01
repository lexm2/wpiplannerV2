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
    private onComplete: (selections: WizardSelections) => void;
    private onCancel: () => void;
    private onSelectionChange?: (selections: WizardSelections) => void;
    private container: HTMLElement | null = null;
    private availableSteps: WizardStep[] = [];
    private wizardPanel: HTMLElement | null = null;

    constructor(
        course: Course,
        courseDataService: CourseDataService,
        onComplete: (selections: WizardSelections) => void,
        onCancel: () => void,
        existingSelections?: SelectedCourse,
        onSelectionChange?: (selections: WizardSelections) => void
    ) {
        this.course = course;
        this.courseDataService = courseDataService;
        this.onComplete = onComplete;
        this.onCancel = onCancel;
        this.onSelectionChange = onSelectionChange;

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
     * Only includes steps that have at least one option with a valid time slot
     */
    determineAvailableSteps(): WizardStep[] {
        const steps: WizardStep[] = [];
        const isHierarchical = this.courseDataService.isHierarchicalCourse(this.course);
        const isLabOnly = this.courseDataService.isLabOnlyCourse(this.course);

        if (isLabOnly) {
            // Lab-only course - check if any labs have valid time slots
            const labs = this.courseDataService.getStandaloneLabs(this.course);
            const hasValidLabs = labs.some(lab => this.hasValidTimeSlot(lab));
            if (hasValidLabs) {
                steps.push('lab');
            }
        } else if (isHierarchical) {
            // Hierarchical course - check what's available with valid time slots
            const lectures = this.courseDataService.getLecturesForCourse(this.course);

            // Check if any lectures have valid time slots
            const validLectures = lectures.filter(lg => this.hasValidTimeSlot(lg.section));

            if (validLectures.length > 0) {
                steps.push('lecture');

                // Check if any lecture has discussions with valid time slots
                const hasValidDiscussions = lectures.some(lg =>
                    lg.compatibleDiscussions.some(d => this.hasValidTimeSlot(d))
                );

                // Check if any lecture has labs with valid time slots
                const hasValidLabs = lectures.some(lg =>
                    lg.compatibleLabs.some(l => this.hasValidTimeSlot(l))
                );

                if (hasValidDiscussions) steps.push('discussion');
                if (hasValidLabs) steps.push('lab');
            }
        }

        console.log(`[Wizard] Available steps with valid options: ${steps.join(', ')}`);
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
     * Placeholder sections have start_time === end_time (e.g., "12:00" to "12:00")
     */
    private hasValidTimeSlot(section: Section): boolean {
        return section.periods.some(period => {
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
        console.log(`[Wizard] getOptionsForStep(${step})`);
        console.log(`[Wizard] Current selections:`, {
            lecture: this.selections.lecture?.number || null,
            discussion: this.selections.discussion?.number || null,
            lab: this.selections.lab?.number || null
        });
        console.log(`[Wizard] Course has ${this.course.lectures?.length || 0} lecture groups`);

        if (step === 'lecture') {
            // Lab-only course
            if (this.courseDataService.isLabOnlyCourse(this.course)) {
                const labs = this.courseDataService.getStandaloneLabs(this.course);
                const validLabs = labs.filter(lab => this.hasValidTimeSlot(lab));
                console.log(`[Wizard] Lab-only course: ${labs.length} total, ${validLabs.length} with valid time slots`);
                return validLabs;
            }

            // Regular hierarchical course
            const lectureGroups = this.courseDataService.getLecturesForCourse(this.course);
            console.log(`[Wizard] Found ${lectureGroups.length} lecture groups`);

            // Filter out placeholder sections (those with start_time === end_time like 12:00-12:00)
            const validLectures = lectureGroups.filter(lg => this.hasValidTimeSlot(lg.section));
            console.log(`[Wizard] After filtering placeholders: ${validLectures.length} lectures with valid time slots`);

            const sections = validLectures.map(lg => lg.section);
            console.log(`[Wizard] Returning ${sections.length} lecture sections`);
            return sections;
        }

        if (step === 'discussion') {
            if (!this.selections.lecture) {
                console.log(`[Wizard] No lecture selected, returning empty discussions`);
                return [];
            }
            console.log(`[Wizard] Getting discussions for lecture ${this.selections.lecture.number} (CRN: ${this.selections.lecture.crn})`);
            const discussions = this.courseDataService.getDiscussionsForLecture(this.course, this.selections.lecture);

            // Filter out placeholder discussions
            const validDiscussions = discussions.filter(d => this.hasValidTimeSlot(d));
            console.log(`[Wizard] Found ${discussions.length} discussions, ${validDiscussions.length} with valid time slots`);
            return validDiscussions;
        }

        if (step === 'lab') {
            // Lab-only course
            if (this.courseDataService.isLabOnlyCourse(this.course)) {
                const labs = this.courseDataService.getStandaloneLabs(this.course);
                const validLabs = labs.filter(lab => this.hasValidTimeSlot(lab));
                console.log(`[Wizard] Lab-only course: ${labs.length} total, ${validLabs.length} with valid time slots`);
                return validLabs;
            }

            // Regular course with selected lecture
            if (!this.selections.lecture) {
                console.log(`[Wizard] No lecture selected, returning empty labs`);
                return [];
            }
            console.log(`[Wizard] Getting labs for lecture ${this.selections.lecture.number} (CRN: ${this.selections.lecture.crn})`);
            const labs = this.courseDataService.getLabsForLecture(this.course, this.selections.lecture);

            // Filter out placeholder labs
            const validLabs = labs.filter(l => this.hasValidTimeSlot(l));
            console.log(`[Wizard] Found ${labs.length} labs, ${validLabs.length} with valid time slots`);
            return validLabs;
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
            if (this.wizardPanel && this.container && this.container.contains(this.wizardPanel)) {
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
        // Get previous selection to check if we need to clear dependent selections
        const previousSelection = this.selections[this.currentStep];
        console.log(`[Wizard] selectSection() - step: ${this.currentStep}, section: ${section.number}, previousSelection: ${previousSelection?.number || 'none'}`);

        // Store selection
        if (this.currentStep === 'lecture') {
            // Clear dependent selections if changing to a different lecture
            if (previousSelection && previousSelection.crn !== section.crn) {
                console.log(`[Wizard] Clearing dependent selections (discussion/lab) due to lecture change`);
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
        if (this.wizardPanel) {
            // Remove 'selected' class from all section options
            const allSections = this.wizardPanel.querySelectorAll('.section-option');
            allSections.forEach(el => {
                el.classList.remove('selected');
                const btn = el.querySelector('.section-select-btn');
                if (btn) {
                    btn.classList.remove('selected');
                    btn.textContent = '+';
                }
            });

            // Add 'selected' class to the newly selected section
            const selectedSection = this.wizardPanel.querySelector(`.section-option[data-crn="${section.crn}"]`);
            if (selectedSection) {
                selectedSection.classList.add('selected');
                const btn = selectedSection.querySelector('.section-select-btn');
                if (btn) {
                    btn.classList.add('selected');
                    btn.textContent = '✓';
                }
            }

            // Update footer button visibility
            const hasSelection = this.selections[this.currentStep] !== null;
            const nextBtn = this.wizardPanel.querySelector('#wizard-next-btn');

            if (!hasSelection && nextBtn) {
                // Hide Next button if no selection
                nextBtn.remove();
            } else if (hasSelection && !nextBtn) {
                // Show Next button if selection made but button doesn't exist
                const footer = this.wizardPanel.querySelector('.wizard-footer');
                if (footer) {
                    const currentIndex = this.availableSteps.indexOf(this.currentStep);
                    const isLastStep = currentIndex === this.availableSteps.length - 1;
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
        }
    }

    /**
     * Move to the next step
     */
    nextStep(): void {
        const currentIndex = this.availableSteps.indexOf(this.currentStep);
        console.log(`[Wizard] nextStep() called - current: ${this.currentStep}, index: ${currentIndex}`);

        if (currentIndex < this.availableSteps.length - 1) {
            // Move to next step
            const nextStep = this.availableSteps[currentIndex + 1];
            console.log(`[Wizard] Moving forward to: ${nextStep}`);
            this.currentStep = nextStep;  // Update state BEFORE rendering
            this.transitionToStep(nextStep, 'forward');
        } else {
            // Completed all steps
            console.log(`[Wizard] Completing wizard`);
            this.complete();
        }
    }

    /**
     * Move to the previous step
     */
    prevStep(): void {
        const currentIndex = this.availableSteps.indexOf(this.currentStep);
        console.log(`[Wizard] prevStep() called - current: ${this.currentStep}, index: ${currentIndex}`);

        if (currentIndex > 0) {
            const prevStep = this.availableSteps[currentIndex - 1];
            console.log(`[Wizard] Moving backward to: ${prevStep}`);
            this.currentStep = prevStep;  // Update state BEFORE rendering
            this.transitionToStep(prevStep, 'backward');
        } else {
            console.log(`[Wizard] Already at first step, cannot go back`);
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
    private transitionToStep(_toStep: WizardStep, _direction: 'forward' | 'backward'): void {
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
     * Render a single section card using section-option styling
     */
    private renderSectionCard(section: Section): string {
        const isSelected = this.selections[this.currentStep]?.crn === section.crn;
        const selectedClass = isSelected ? 'selected' : '';

        // Sort periods by type priority (lecture first, then lab, then discussion)
        const sortedPeriods = [...section.periods].sort((a, b) => {
            const typePriority = (type: string) => {
                const lower = type.toLowerCase();
                if (lower.includes('lec') || lower.includes('lecture')) return 1;
                if (lower.includes('lab')) return 2;
                if (lower.includes('dis') || lower.includes('discussion') || lower.includes('rec')) return 3;
                return 4;
            };
            return typePriority(a.type) - typePriority(b.type);
        });

        let periodsHTML = '';
        sortedPeriods.forEach(period => {
            const days = period ? Array.from(period.days).join('').toUpperCase() : 'TBA';
            const time = period ? `${period.startTime.displayTime} - ${period.endTime.displayTime}` : 'TBA';
            const professor = period.professor && period.professor !== 'TBA' && period.professor !== 'Not Assigned' && period.professor.trim() !== '' ? period.professor : 'TBA';
            const periodTypeLabel = this.getPeriodTypeLabel(period.type);

            periodsHTML += `
                <div class="period-info" data-period-type="${period.type.toLowerCase()}">
                    <div class="period-header">
                        <span class="period-type-label">${periodTypeLabel}</span>
                        <span class="period-schedule">${days} ${time} - ${professor}</span>
                    </div>
                </div>
            `;
        });

        return `
            <div class="section-option ${selectedClass}" data-crn="${section.crn}">
                <div class="section-info">
                    <div class="section-number">${section.number}</div>
                    <div class="section-periods">
                        ${periodsHTML}
                    </div>
                </div>
                <button class="section-select-btn ${selectedClass}">
                    ${isSelected ? '✓' : '+'}
                </button>
            </div>
        `;
    }

    /**
     * Get period type label (helper method)
     */
    private getPeriodTypeLabel(type: string): string {
        const lower = type.toLowerCase();

        if (lower.includes('lec') || lower.includes('lecture')) return 'LEC';
        if (lower.includes('lab')) return 'LAB';
        if (lower.includes('dis') || lower.includes('discussion')) return 'DIS';
        if (lower.includes('rec') || lower.includes('recitation')) return 'REC';
        if (lower.includes('sem') || lower.includes('seminar')) return 'SEM';
        if (lower.includes('studio')) return 'STU';
        if (lower.includes('conference') || lower.includes('conf')) return 'CONF';

        // Return abbreviated version for unknown types (first 3-4 chars)
        return type.substring(0, Math.min(4, type.length)).toUpperCase();
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

        // Next/Finish button
        const nextBtn = this.wizardPanel.querySelector('#wizard-next-btn');
        nextBtn?.addEventListener('click', () => {
            const currentIndex = this.availableSteps.indexOf(this.currentStep);
            const isLastStep = currentIndex === this.availableSteps.length - 1;
            if (isLastStep) {
                this.complete();
            } else {
                this.nextStep();
            }
        });

        // Breadcrumb navigation
        const breadcrumbs = this.wizardPanel.querySelectorAll('.wizard-breadcrumb:not([disabled])');
        breadcrumbs.forEach(breadcrumb => {
            breadcrumb.addEventListener('click', (e) => {
                const step = (e.currentTarget as HTMLElement).dataset.step as WizardStep;
                this.jumpToStep(step);
            });
        });

        // Section option cards
        const sectionOptions = this.wizardPanel.querySelectorAll('.section-option');
        sectionOptions.forEach(option => {
            option.addEventListener('click', (e) => {
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
