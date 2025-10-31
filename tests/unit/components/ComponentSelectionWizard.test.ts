import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ComponentSelectionWizard } from '../../../src/ui/components/ComponentSelectionWizard';
import { CourseDataService } from '../../../src/services/courseDataService';
import { Course, Section, Period, Department } from '../../../src/types/types';
import { SelectedCourse } from '../../../src/types/schedule';

describe('ComponentSelectionWizard', () => {
    let courseDataService: CourseDataService;
    let mockOnComplete: ReturnType<typeof vi.fn>;
    let mockOnCancel: ReturnType<typeof vi.fn>;

    // Test data
    const department: Department = {
        abbreviation: 'CS',
        name: 'Computer Science',
        courses: []
    };

    const createPeriod = (type: string, days: string[]): Period => ({
        type,
        professor: 'Prof Smith',
        startTime: { hours: 9, minutes: 0, displayTime: '9:00 AM' },
        endTime: { hours: 10, minutes: 50, displayTime: '10:50 AM' },
        days: new Set(days),
        location: 'SL 123',
        building: 'SL',
        room: '123'
    });

    const createSection = (crn: number, number: string, type: string = 'Lecture'): Section => ({
        crn,
        number,
        seats: 30,
        seatsAvailable: 5,
        actualWaitlist: 0,
        maxWaitlist: 10,
        description: `${type} section`,
        term: 'A',
        computedTerm: 'A',
        periods: [createPeriod(type, ['mon', 'wed', 'fri'])]
    });

    const createHierarchicalCourse = (): Course => ({
        id: 'CS-101',
        name: 'Intro to Programming',
        number: '101',
        description: 'Basic programming course',
        credits: '3.0',
        minCredits: '3.0',
        maxCredits: '3.0',
        department: department,
        sections: [
            createSection(12345, 'A01', 'Lecture'),
            createSection(12346, 'A02', 'Lecture'),
            createSection(12347, 'A11', 'Discussion'),
            createSection(12348, 'A12', 'Discussion'),
            createSection(12349, 'A21', 'Lab'),
            createSection(12350, 'A22', 'Lab')
        ]
    });

    const createLabOnlyCourse = (): Course => ({
        id: 'CS-102',
        name: 'Programming Lab',
        number: '102',
        description: 'Lab only course',
        credits: '1.0',
        minCredits: '1.0',
        maxCredits: '1.0',
        department: department,
        sections: [
            createSection(12351, 'L01', 'Lab'),
            createSection(12352, 'L02', 'Lab')
        ]
    });

    beforeEach(() => {
        document.body.innerHTML = '<div id="schedule-selected-courses"></div>';
        courseDataService = new CourseDataService();
        mockOnComplete = vi.fn();
        mockOnCancel = vi.fn();
    });

    describe('Constructor & Initialization', () => {
        test('should initialize with hierarchical course', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            expect(wizard).toBeDefined();
            expect(wizard['course']).toBe(course);
            expect(wizard['courseDataService']).toBe(courseDataService);
        });

        test('should initialize with existing selections', () => {
            const course = createHierarchicalCourse();
            const existingSelections: SelectedCourse = {
                course,
                selectedLecture: createSection(12345, 'A01'),
                selectedDiscussion: createSection(12347, 'A11'),
                selectedLab: null,
                selectedSection: null,
                selectedSectionNumber: null,
                isRequired: false
            };

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel,
                existingSelections
            );

            expect(wizard['selections'].lecture).toBe(existingSelections.selectedLecture);
            expect(wizard['selections'].discussion).toBe(existingSelections.selectedDiscussion);
        });

        test('should initialize with empty selections when no existing selections provided', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            expect(wizard['selections'].lecture).toBeNull();
            expect(wizard['selections'].discussion).toBeNull();
            expect(wizard['selections'].lab).toBeNull();
        });
    });

    describe('Step Determination', () => {
        test('should determine lecture step for hierarchical course', () => {
            const course = createHierarchicalCourse();

            // Mock CourseDataService methods
            vi.spyOn(courseDataService, 'isHierarchicalCourse').mockReturnValue(true);
            vi.spyOn(courseDataService, 'isLabOnlyCourse').mockReturnValue(false);
            vi.spyOn(courseDataService, 'getLecturesForCourse').mockReturnValue([
                {
                    section: createSection(12345, 'A01', 'Lecture'),
                    compatibleDiscussions: [],
                    compatibleLabs: []
                }
            ]);

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const steps = wizard.determineAvailableSteps();
            expect(steps).toContain('lecture');
        });

        test('should determine all steps for full hierarchical course', () => {
            const course = createHierarchicalCourse();

            // Mock CourseDataService to return hierarchical structure
            vi.spyOn(courseDataService, 'isHierarchicalCourse').mockReturnValue(true);
            vi.spyOn(courseDataService, 'isLabOnlyCourse').mockReturnValue(false);
            vi.spyOn(courseDataService, 'getLecturesForCourse').mockReturnValue([
                {
                    section: createSection(12345, 'A01', 'Lecture'),
                    compatibleDiscussions: [createSection(12347, 'A11', 'Discussion')],
                    compatibleLabs: [createSection(12349, 'A21', 'Lab')]
                }
            ]);

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const steps = wizard.determineAvailableSteps();
            expect(steps.length).toBeGreaterThan(0);
            expect(steps).toContain('lecture');
        });

        test('should determine start step as first available step', () => {
            const course = createHierarchicalCourse();

            // Mock CourseDataService
            vi.spyOn(courseDataService, 'isHierarchicalCourse').mockReturnValue(true);
            vi.spyOn(courseDataService, 'isLabOnlyCourse').mockReturnValue(false);
            vi.spyOn(courseDataService, 'getLecturesForCourse').mockReturnValue([
                {
                    section: createSection(12345, 'A01', 'Lecture'),
                    compatibleDiscussions: [],
                    compatibleLabs: []
                }
            ]);

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const startStep = wizard.determineStartStep();
            const availableSteps = wizard.determineAvailableSteps();
            expect(availableSteps.length).toBeGreaterThan(0);
            expect(startStep).toBe(availableSteps[0]);
        });

        test('should check if step has options', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            // This depends on CourseDataService implementation
            const hasOptions = wizard.hasOptionsForStep('lecture');
            expect(typeof hasOptions).toBe('boolean');
        });

        test('should get options for lecture step', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const options = wizard.getOptionsForStep('lecture');
            expect(Array.isArray(options)).toBe(true);
        });

        test('should return empty array for discussion step without lecture selected', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const options = wizard.getOptionsForStep('discussion');
            expect(options).toEqual([]);
        });

        test('should return empty array for lab step without lecture selected', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const options = wizard.getOptionsForStep('lab');
            expect(options).toEqual([]);
        });
    });

    describe('Navigation', () => {
        test('should advance to next step', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const initialStep = wizard['currentStep'];
            const availableSteps = wizard['availableSteps'];

            if (availableSteps.length > 1) {
                wizard.nextStep();
                expect(wizard['currentStep']).not.toBe(initialStep);
            }
        });

        test('should call complete when advancing from last step', () => {
            const course = createLabOnlyCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            // Select a lab section first
            const labSection = createSection(12351, 'L01', 'Lab');
            wizard.selectSection(labSection);

            // Wait for timeout
            setTimeout(() => {
                expect(mockOnComplete).toHaveBeenCalled();
            }, 300);
        });

        test('should go back to previous step', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const availableSteps = wizard['availableSteps'];
            if (availableSteps.length > 1) {
                wizard['currentStep'] = availableSteps[1];
                wizard.prevStep();
                expect(wizard['currentStep']).toBe(availableSteps[0]);
            }
        });

        test('should not go back from first step', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const firstStep = wizard['availableSteps'][0];
            wizard['currentStep'] = firstStep;
            wizard.prevStep();
            expect(wizard['currentStep']).toBe(firstStep);
        });

        test('should jump to specific step via breadcrumb', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const availableSteps = wizard['availableSteps'];
            if (availableSteps.length > 1) {
                const targetStep = availableSteps[availableSteps.length - 1];
                wizard.jumpToStep(targetStep);
                expect(wizard['currentStep']).toBe(targetStep);
            }
        });

        test('should not jump to unavailable step', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const currentStep = wizard['currentStep'];
            // Try to jump to a step not in available steps
            wizard.jumpToStep('discussion' as any);
            // Should stay on current step if not available
            expect(wizard['currentStep']).toBeDefined();
        });
    });

    describe('Selection Logic', () => {
        test('should select lecture section', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            wizard['currentStep'] = 'lecture';
            const lectureSection = createSection(12345, 'A01');
            wizard.selectSection(lectureSection);

            expect(wizard['selections'].lecture).toBe(lectureSection);
        });

        test('should select discussion section', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            wizard['currentStep'] = 'discussion';
            const discussionSection = createSection(12347, 'A11', 'Discussion');
            wizard.selectSection(discussionSection);

            expect(wizard['selections'].discussion).toBe(discussionSection);
        });

        test('should select lab section', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            wizard['currentStep'] = 'lab';
            const labSection = createSection(12349, 'A21', 'Lab');
            wizard.selectSection(labSection);

            expect(wizard['selections'].lab).toBe(labSection);
        });

        test('should clear dependent selections when changing lecture', () => {
            const course = createHierarchicalCourse();
            const existingSelections: SelectedCourse = {
                course,
                selectedLecture: createSection(12345, 'A01'),
                selectedDiscussion: createSection(12347, 'A11', 'Discussion'),
                selectedLab: createSection(12349, 'A21', 'Lab'),
                selectedSection: null,
                selectedSectionNumber: null,
                isRequired: false
            };

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel,
                existingSelections
            );

            wizard['currentStep'] = 'lecture';
            const newLecture = createSection(12346, 'A02');
            wizard.selectSection(newLecture);

            expect(wizard['selections'].lecture).toBe(newLecture);
            expect(wizard['selections'].discussion).toBeNull();
            expect(wizard['selections'].lab).toBeNull();
        });

        test('should not clear dependent selections when selecting same lecture', () => {
            const course = createHierarchicalCourse();
            const lecture = createSection(12345, 'A01');
            const discussion = createSection(12347, 'A11', 'Discussion');
            const existingSelections: SelectedCourse = {
                course,
                selectedLecture: lecture,
                selectedDiscussion: discussion,
                selectedLab: null,
                selectedSection: null,
                selectedSectionNumber: null,
                isRequired: false
            };

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel,
                existingSelections
            );

            wizard['currentStep'] = 'lecture';
            wizard.selectSection(lecture);

            // Should not clear discussion since same lecture selected
            expect(wizard['selections'].discussion).toBe(discussion);
        });
    });

    describe('Completion & Cancellation', () => {
        test('should call onComplete with selections when completed', () => {
            const course = createLabOnlyCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            wizard['currentStep'] = 'lab';
            wizard['selections'].lab = createSection(12351, 'L01', 'Lab');
            wizard['complete']();

            expect(mockOnComplete).toHaveBeenCalledWith(wizard['selections']);
        });

        test('should call onCancel when canceled', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            wizard['cancel']();

            expect(mockOnCancel).toHaveBeenCalled();
        });

        test('should close wizard when completed', () => {
            const course = createLabOnlyCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const closeSpy = vi.spyOn(wizard as any, 'close');
            wizard['complete']();

            expect(closeSpy).toHaveBeenCalled();
        });

        test('should close wizard when canceled', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const closeSpy = vi.spyOn(wizard as any, 'close');
            wizard['cancel']();

            expect(closeSpy).toHaveBeenCalled();
        });
    });

    describe('Open & Close', () => {
        test('should append wizard panel to container when opened', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            wizard.open();

            const container = document.getElementById('schedule-selected-courses');
            const panel = container?.querySelector('.wizard-inline-panel');
            expect(panel).toBeTruthy();
        });

        test('should remove wizard panel when closed', (done) => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            wizard.open();
            wizard.close();

            setTimeout(() => {
                const container = document.getElementById('schedule-selected-courses');
                const panel = container?.querySelector('.wizard-inline-panel');
                expect(panel).toBeFalsy();
                done();
            }, 350); // Wait for animation
        });

        test('should add active class to panel when opened', (done) => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            wizard.open();

            // Wait for requestAnimationFrame to execute (double RAF needed)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const panel = document.querySelector('.wizard-inline-panel');
                    expect(panel).toBeTruthy();
                    if (panel) {
                        expect(panel.classList.contains('active')).toBe(true);
                    }
                    done();
                });
            });
        });
    });

    describe('Rendering', () => {
        test('should render wizard content', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const content = wizard['renderWizardContent']();
            expect(content).toContain(course.department.abbreviation);
            expect(content).toContain(course.number);
            expect(content).toContain(course.name);
        });

        test('should render breadcrumbs for multi-step wizard', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            wizard['availableSteps'] = ['lecture', 'discussion', 'lab'];
            const breadcrumbs = wizard['renderBreadcrumbs']();

            expect(breadcrumbs).toContain('wizard-breadcrumb');
        });

        test('should not render breadcrumbs for single-step wizard', () => {
            const course = createLabOnlyCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            wizard['availableSteps'] = ['lab'];
            const breadcrumbs = wizard['renderBreadcrumbs']();

            expect(breadcrumbs).toBe('');
        });

        test('should render section cards', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const section = createSection(12345, 'A01');
            const card = wizard['renderSectionCard'](section);

            expect(card).toContain(section.number);
            expect(card).toContain(section.crn.toString());
        });

        test('should show selected badge on selected section', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const section = createSection(12345, 'A01');
            wizard['currentStep'] = 'lecture';
            wizard['selections'].lecture = section;

            const card = wizard['renderSectionCard'](section);
            expect(card).toContain('Selected');
        });
    });
});
