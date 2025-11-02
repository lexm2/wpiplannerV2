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
import { ScheduleFilterService } from '../../services/ScheduleFilterService';
import { rateMyProfessorService } from '../../services/RateMyProfessorService';

type WizardStep = 'lecture' | 'discussion' | 'lab';

interface WizardSelections {
    lecture: Section | null;
    discussion: Section | null;
    lab: Section | null;
}

export class ComponentSelectionWizard {
    private course: Course;
    private courseDataService: CourseDataService;
    private scheduleFilterService: ScheduleFilterService | null;
    private currentStep: WizardStep;
    private selections: WizardSelections;
    private onComplete: (selections: WizardSelections) => void;
    private onCancel: () => void;
    private onSelectionChange?: (selections: WizardSelections) => void;
    private container: HTMLElement | null = null;
    private availableSteps: WizardStep[] = [];
    private wizardPanel: HTMLElement | null = null;
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
        allSelectedCourses?: SelectedCourse[]
    ) {
        this.course = course;
        this.courseDataService = courseDataService;
        this.onComplete = onComplete;
        this.onCancel = onCancel;
        this.onSelectionChange = onSelectionChange;
        this.scheduleFilterService = scheduleFilterService || null;
        this.allSelectedCourses = allSelectedCourses || [];

        console.log('[Wizard] Constructor called');
        console.log('[Wizard] Has onSelectionChange callback:', !!this.onSelectionChange);
        console.log('[Wizard] Has scheduleFilterService:', !!this.scheduleFilterService);
        console.log('[Wizard] Course:', course.department.abbreviation + course.number);
        console.log('[Wizard] All selected courses count:', this.allSelectedCourses.length);
        if (this.allSelectedCourses.length > 0) {
            console.log('[Wizard] Selected courses for conflict context:');
            this.allSelectedCourses.forEach(sc => {
                console.log(`  - ${sc.course.department.abbreviation}${sc.course.number}:`, {
                    lecture: sc.selectedLecture?.number,
                    discussion: sc.selectedDiscussion?.number,
                    lab: sc.selectedLab?.number
                });
            });
        }

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

        let sections: Section[] = [];

        if (step === 'lecture') {
            // Lab-only course
            if (this.courseDataService.isLabOnlyCourse(this.course)) {
                const labs = this.courseDataService.getStandaloneLabs(this.course);
                const validLabs = labs.filter(lab => this.hasValidTimeSlot(lab));
                console.log(`[Wizard] Lab-only course: ${labs.length} total, ${validLabs.length} with valid time slots`);
                sections = validLabs;
            } else {
                // Regular hierarchical course
                const lectureGroups = this.courseDataService.getLecturesForCourse(this.course);
                console.log(`[Wizard] Found ${lectureGroups.length} lecture groups`);

                // Filter out placeholder sections (those with start_time === end_time like 12:00-12:00)
                const validLectures = lectureGroups.filter(lg => this.hasValidTimeSlot(lg.section));
                console.log(`[Wizard] After filtering placeholders: ${validLectures.length} lectures with valid time slots`);

                sections = validLectures.map(lg => lg.section);

                // Apply reverse filtering if discussion or lab is selected
                if (this.selections.discussion || this.selections.lab) {
                    console.log(`[Wizard] Applying reverse filter based on selected child components`);
                    sections = this.filterLecturesByChildSelections(sections);
                    console.log(`[Wizard] After reverse filtering: ${sections.length} compatible lectures`);
                }

                console.log(`[Wizard] Before filters: ${sections.length} lecture sections`);
            }
        } else if (step === 'discussion') {
            if (!this.selections.lecture) {
                // No lecture selected - show ALL discussions from all lecture groups
                console.log(`[Wizard] No lecture selected, showing all discussions from all lecture groups`);
                sections = this.getAllDiscussionsForCourse();
                console.log(`[Wizard] Found ${sections.length} total discussions across all lecture groups`);
            } else {
                // Lecture selected - show only compatible discussions
                console.log(`[Wizard] Getting discussions for lecture ${this.selections.lecture.number} (CRN: ${this.selections.lecture.crn})`);
                const discussions = this.courseDataService.getDiscussionsForLecture(this.course, this.selections.lecture);

                // Filter out placeholder discussions
                const validDiscussions = discussions.filter(d => this.hasValidTimeSlot(d));
                console.log(`[Wizard] Before filters: ${discussions.length} discussions, ${validDiscussions.length} with valid time slots`);
                sections = validDiscussions;
            }
        } else if (step === 'lab') {
            // Lab-only course
            if (this.courseDataService.isLabOnlyCourse(this.course)) {
                const labs = this.courseDataService.getStandaloneLabs(this.course);
                const validLabs = labs.filter(lab => this.hasValidTimeSlot(lab));
                console.log(`[Wizard] Lab-only course: ${labs.length} total, ${validLabs.length} with valid time slots`);
                sections = validLabs;
            } else {
                // Regular course
                if (!this.selections.lecture) {
                    // No lecture selected - show ALL labs from all lecture groups
                    console.log(`[Wizard] No lecture selected, showing all labs from all lecture groups`);
                    sections = this.getAllLabsForCourse();
                    console.log(`[Wizard] Found ${sections.length} total labs across all lecture groups`);
                } else {
                    // Lecture selected - show only compatible labs
                    console.log(`[Wizard] Getting labs for lecture ${this.selections.lecture.number} (CRN: ${this.selections.lecture.crn})`);
                    const labs = this.courseDataService.getLabsForLecture(this.course, this.selections.lecture);

                    // Filter out placeholder labs
                    const validLabs = labs.filter(l => this.hasValidTimeSlot(l));
                    console.log(`[Wizard] Before filters: ${labs.length} labs, ${validLabs.length} with valid time slots`);
                    sections = validLabs;
                }
            }
        }

        // Apply term filtering ONLY for child components (discussions/labs)
        // based on the selected lecture's term
        // NEVER filter lectures - users must be able to select any term freely
        if (step !== 'lecture' && this.selections.lecture && sections.length > 0) {
            const lectureTerm = this.selections.lecture.computedTerm;
            console.log(`[Wizard] Filtering ${step} by lecture's term: ${lectureTerm}`);
            sections = this.filterSectionsByTerm(sections, lectureTerm);
        }

        // Apply schedule filters if available
        if (this.scheduleFilterService && sections.length > 0) {
            const filteredSections = this.applyScheduleFilters(sections, step);
            console.log(`[Wizard] After filters: ${filteredSections.length} sections`);
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
        console.log(`[Wizard] Filtering ${sections.length} sections by term: ${term}`);
        const filtered = sections.filter(section => section.computedTerm === term);
        console.log(`[Wizard] After term filtering: ${filtered.length} sections remain`);
        return filtered;
    }

    /**
     * Apply schedule filters to sections
     */
    private applyScheduleFilters(sections: Section[], step: WizardStep): Section[] {
        if (!this.scheduleFilterService) return sections;

        const activeFilters = this.scheduleFilterService.getActiveFilters();
        console.log(`[Wizard Filter] Filtering ${sections.length} ${step} sections`);
        console.log(`[Wizard Filter] Active filters (${activeFilters.length}):`, activeFilters);

        // Check for RMP filter specifically
        const rmpFilter = activeFilters.find(f => f.id === 'periodRmpRating');
        if (rmpFilter) {
            console.log(`[Wizard Filter] ✓ RMP filter is ACTIVE with criteria:`, rmpFilter.criteria);
            console.log(`[Wizard Filter] RMP service loaded:`, rateMyProfessorService.isLoaded());
        } else {
            console.log(`[Wizard Filter] ℹ RMP filter is NOT active`);
        }

        // Check for conflict filter specifically
        const conflictFilter = activeFilters.find(f => f.id === 'periodConflict');
        if (conflictFilter) {
            console.log(`[Wizard Filter] ✓ Conflict filter is ACTIVE`);
            console.log(`[Wizard Filter] All selected courses for context:`, this.allSelectedCourses.length);
        }

        // Filter sections individually through the schedule filter service
        const filteredSections = sections.filter(section => {
            // Create a temporary course object with ONLY the section being tested
            // This ensures filterSections only evaluates this single section
            const tempCourse: Course = {
                ...this.course,
                sections: [section]
            };

            // Create a temporary SelectedCourse with this section in the appropriate slot
            const tempSelectedCourse: SelectedCourse = {
                course: tempCourse,
                selectedLecture: step === 'lecture' ? section : (this.selections.lecture || null),
                selectedDiscussion: step === 'discussion' ? section : (this.selections.discussion || null),
                selectedLab: step === 'lab' ? section : (this.selections.lab || null),
                isRequired: false
            };

            console.log(`[Wizard Filter] Testing section ${section.number} (CRN: ${section.crn}, Term: ${section.computedTerm})`);
            console.log(`[Wizard Filter] Temp course structure:`, {
                lecture: tempSelectedCourse.selectedLecture?.number,
                discussion: tempSelectedCourse.selectedDiscussion?.number,
                lab: tempSelectedCourse.selectedLab?.number
            });

            // Combine the temp selected course with all other selected courses for context
            // This allows conflict detection to check against OTHER courses
            const allCoursesForFiltering = [tempSelectedCourse, ...this.allSelectedCourses];
            console.log(`[Wizard Filter] Passing ${allCoursesForFiltering.length} courses to filterSections (1 temp + ${this.allSelectedCourses.length} others)`);

            // Test if this section passes the filters
            const filtered = this.scheduleFilterService.filterSections(allCoursesForFiltering);
            const passes = filtered.length > 0;

            console.log(`[Wizard Filter] Section ${section.number} ${passes ? 'PASSES' : 'FAILS'} filters (filtered: ${filtered.length})`);
            if (!passes && conflictFilter) {
                console.log(`[Wizard Filter] Section ${section.number} was FILTERED OUT by conflict detection`);
            }

            return passes;
        });

        console.log(`[Wizard Filter] Result: ${filteredSections.length}/${sections.length} sections passed filters`);
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
                if (this.hasValidTimeSlot(discussion)) {
                    allDiscussions.set(discussion.crn, discussion);
                }
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
                if (this.hasValidTimeSlot(lab)) {
                    allLabs.set(lab.crn, lab);
                }
            }
        }

        return Array.from(allLabs.values());
    }

    /**
     * Filter lectures to show only those compatible with selected discussion/lab
     */
    private filterLecturesByChildSelections(lectures: Section[]): Section[] {
        const lectureGroups = this.courseDataService.getLecturesForCourse(this.course);

        // If a discussion is selected, filter to lectures that have this discussion
        if (this.selections.discussion) {
            const compatibleLectureGroups = lectureGroups.filter(lg =>
                lg.compatibleDiscussions.some(d => d.crn === this.selections.discussion!.crn)
            );
            const compatibleCRNs = new Set(compatibleLectureGroups.map(lg => lg.section.crn));
            lectures = lectures.filter(lecture => compatibleCRNs.has(lecture.crn));
        }

        // If a lab is selected, filter to lectures that have this lab
        if (this.selections.lab) {
            const compatibleLectureGroups = lectureGroups.filter(lg =>
                lg.compatibleLabs.some(l => l.crn === this.selections.lab!.crn)
            );
            const compatibleCRNs = new Set(compatibleLectureGroups.map(lg => lg.section.crn));
            lectures = lectures.filter(lecture => compatibleCRNs.has(lecture.crn));
        }

        return lectures;
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

        // Verify RMP data is loaded (should be loaded by MainController during app init)
        if (!rateMyProfessorService.isLoaded()) {
            console.warn('[Wizard] ⚠️ WARNING: RMP data is not loaded! RMP filters will not work properly.');
            console.warn('[Wizard] This may indicate a race condition - RMP data should be loaded during app initialization');
        } else {
            console.log('[Wizard] ✓ RMP data is loaded and ready');
        }

        this.container = sidebarContainer;

        // Create wizard panel
        this.wizardPanel = document.createElement('div');
        this.wizardPanel.className = 'wizard-inline-panel';
        this.wizardPanel.innerHTML = this.renderWizardContent();

        // Add to sidebar
        sidebarContainer.appendChild(this.wizardPanel);

        // Trigger fade-in for background (instant) and slide-in for cards
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

        // Get the active step and add slide-out-left animation
        const activeStep = this.wizardPanel.querySelector('.wizard-step.active');
        if (activeStep) {
            activeStep.classList.add('slide-out-left');
            activeStep.classList.remove('slide-in-right', 'slide-in-left');
        }

        // Immediately start fading out the background
        this.wizardPanel.classList.remove('active');

        // Wait for slide-out-left animation, then remove from DOM
        setTimeout(() => {
            if (this.wizardPanel && this.container && this.container.contains(this.wizardPanel)) {
                this.container.removeChild(this.wizardPanel);
                this.wizardPanel = null;
                this.container = null;
            }
        }, 250); // Match animation duration

        document.removeEventListener('keydown', this.handleEscapeKey);

        // Remove filter change listener
        if (this.scheduleFilterService && this.filterChangeHandler) {
            this.scheduleFilterService.removeEventListener(this.filterChangeHandler);
            this.filterChangeHandler = null;
        }
    }

    /**
     * Handle filter changes - refresh current step
     */
    private onFilterChange(): void {
        console.log('[Wizard] Filter changed, refreshing current step');
        if (!this.wizardPanel) return;

        // Re-render the current step with filtered sections
        this.wizardPanel.innerHTML = this.renderWizardContent();
        this.attachEventListeners();
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
            // Remove 'selected' class and badges from all section cards
            const allSections = this.wizardPanel.querySelectorAll('.wizard-section-card');
            allSections.forEach(el => {
                el.classList.remove('selected');
                // Remove any existing selected badge
                const badge = el.querySelector('.section-card-selected-badge');
                if (badge) {
                    badge.remove();
                }
            });

            // Add 'selected' class to the newly selected section and add badge
            const selectedSection = this.wizardPanel.querySelector(`.wizard-section-card[data-crn="${section.crn}"]`);
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
            const nextBtn = this.wizardPanel.querySelector('#wizard-next-btn');
            const skipBtn = this.wizardPanel.querySelector('#wizard-skip-btn');

            if (!hasSelection && nextBtn) {
                // Remove Next button and add Skip button (if not last step)
                nextBtn.remove();
                if (!isLastStep && !skipBtn) {
                    const footer = this.wizardPanel.querySelector('.wizard-footer');
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
                const footer = this.wizardPanel.querySelector('.wizard-footer');
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
        console.log('[Wizard] About to call onSelectionChange, exists:', !!this.onSelectionChange);
        if (this.onSelectionChange) {
            console.log('[Wizard] Calling onSelectionChange with selections:', this.selections);
            this.onSelectionChange(this.selections);
        } else {
            console.warn('[Wizard] onSelectionChange is undefined! Cannot trigger preview.');
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
    private transitionToStep(_toStep: WizardStep, direction: 'forward' | 'backward'): void {
        if (!this.wizardPanel) return;

        // Get current step element
        const currentStepElement = this.wizardPanel.querySelector('.wizard-step.active');

        if (currentStepElement) {
            // Add exit animation class based on direction
            const exitClass = direction === 'forward' ? 'slide-out-left' : 'slide-out-right';
            currentStepElement.classList.add(exitClass);
            currentStepElement.classList.remove('slide-in-right', 'slide-in-left');

            // Wait for exit animation to complete (250ms base + 250ms max stagger = 500ms)
            setTimeout(() => {
                // Re-render with new step (which includes slide-in-right by default)
                this.wizardPanel!.innerHTML = this.renderWizardContent();

                // Get the new step element and add appropriate slide-in animation
                const newStepElement = this.wizardPanel!.querySelector('.wizard-step.active');
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
            this.wizardPanel.innerHTML = this.renderWizardContent();
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
     * Render the complete wizard content
     */
    private renderWizardContent(): string {
        return `
            <div class="wizard-header">
                <button class="wizard-close-btn" id="wizard-close-btn">&times;</button>
                <h2>${this.course.department.abbreviation} ${this.course.number}</h2>
                <div class="wizard-course-name">${this.course.name}</div>
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
                const { minRating, maxRating, minDifficulty, maxDifficulty, minWouldTakeAgain, maxWouldTakeAgain } = filter.criteria;

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
                    filterDescriptions.push(`RMP: ${parts.join('<span class="filter-separator">●</span>')}`);
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
        const days = period ? Array.from(period.days).join('') : 'TBA';
        const time = period ? `${period.startTime.displayTime} - ${period.endTime.displayTime}` : 'TBA';
        const location = period?.location || 'TBA';
        const professor = period?.professor || 'Not Assigned';

        const isSelected = this.selections[this.currentStep]?.crn === section.crn;
        const seatsInfo = section.seatsAvailable > 0
            ? `${section.seatsAvailable}/${section.seats} seats`
            : `Full (${section.actualWaitlist}/${section.maxWaitlist} waitlist)`;

        // Get Rate My Professor data for this professor
        console.log('[Wizard] Rendering card - Professor:', professor, '| RMP loaded:', rateMyProfessorService.isLoaded());
        const rmpData = professor !== 'Not Assigned' ? rateMyProfessorService.getRatingDisplay(professor) : null;
        console.log('[Wizard] RMP data result:', rmpData ? `Rating: ${rmpData.rating}` : 'null');

        return `
            <div
                class="wizard-section-card ${isSelected ? 'selected' : ''}"
                data-crn="${section.crn}"
                style="--card-index: ${cardIndex}"
            >
                <div class="section-card-header">
                    <span class="section-card-number">${section.number}</span>
                </div>
                <div class="section-card-time">
                    <strong>${days}</strong> ${time}
                </div>
                <div class="section-card-location">${location}</div>
                <div class="section-card-professor">
                    ${professor}
                    ${rmpData ? this.renderRMPBadge(rmpData) : ''}
                </div>
                <div class="section-card-footer">
                    <span class="section-card-seats ${section.seatsAvailable === 0 ? 'full' : ''}">
                        ${seatsInfo}
                    </span>
                    <span class="section-card-crn">CRN: ${section.crn}</span>
                </div>
                ${isSelected ? '<div class="section-card-selected-badge">✓ Selected</div>' : ''}
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

        // Skip button (shown when no selection is made on non-last steps)
        const skipBtn = this.wizardPanel.querySelector('#wizard-skip-btn');
        skipBtn?.addEventListener('click', () => {
            this.nextStep();
        });

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
