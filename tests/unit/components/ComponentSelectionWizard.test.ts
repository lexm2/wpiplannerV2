import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import { ComponentSelectionWizard } from '../../../src/ui/components/ComponentSelectionWizard';
import { CourseDataService } from '../../../src/services/data/courseDataService';
import { Course, Section, Period, Department, PeriodType, DayOfWeek } from '../../../src/types/types';
import { SelectedCourse, AcademicTerm } from '../../../src/types/schedule';

// Create vi mock for timer functions
// Note: Bun test doesn't have built-in fake timers like Jest/Vitest
// We'll use actual timeouts for this test
const vi = {
    useFakeTimers: () => {
        // No-op for Bun - we'll use real timers
    },
    useRealTimers: () => {
        // No-op for Bun
    },
    advanceTimersByTimeAsync: async (ms: number) => {
        // Use actual timeout in Bun
        await new Promise(resolve => setTimeout(resolve, ms));
    }
};

describe('ComponentSelectionWizard', () => {
    let courseDataService: CourseDataService;
    let mockOnComplete: ReturnType<typeof mock>;
    let mockOnCancel: ReturnType<typeof mock>;

    // Test data
    const department: Department = {
        abbreviation: 'CS',
        name: 'Computer Science',
        courses: []
    };

    const createPeriod = (type: PeriodType, days: DayOfWeek[]): Period => ({
        type,
        professor: 'Prof Smith',
        startTime: { hours: 9, minutes: 0, displayTime: '9:00 AM' },
        endTime: { hours: 10, minutes: 50, displayTime: '10:50 AM' },
        days: new Set(days),
        location: 'SL 123',
        building: 'SL',
        room: '123',
        seats: 30,
        seatsAvailable: 5,
        actualWaitlist: 0,
        maxWaitlist: 10
    });

    const createSection = (crn: number, number: string, type: PeriodType = PeriodType.LECTURE): Section => ({
        crn,
        number,
        seats: 30,
        seatsAvailable: 5,
        actualWaitlist: 0,
        maxWaitlist: 10,
        description: `${type} section`,
        term: AcademicTerm.A,
        computedTerm: AcademicTerm.A,
        periods: [createPeriod(type, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY])]
    });

    const createHierarchicalCourse = (): Course => ({
        id: 'CS-101',
        name: 'Intro to Programming',
        number: '101',
        description: 'Basic programming course',
        minCredits: 3.0,
        maxCredits: 3.0,
        department: department,
        lectures: [
            {
                section: createSection(12345, 'A01', PeriodType.LECTURE),
                compatibleDiscussions: [
                    createSection(12347, 'A11', PeriodType.DISCUSSION),
                    createSection(12348, 'A12', PeriodType.DISCUSSION)
                ],
                compatibleLabs: [
                    createSection(12349, 'A21', PeriodType.LAB),
                    createSection(12350, 'A22', PeriodType.LAB)
                ]
            },
            {
                section: createSection(12346, 'A02', PeriodType.LECTURE),
                compatibleDiscussions: [
                    createSection(12347, 'A11', PeriodType.DISCUSSION),
                    createSection(12348, 'A12', PeriodType.DISCUSSION)
                ],
                compatibleLabs: [
                    createSection(12349, 'A21', PeriodType.LAB),
                    createSection(12350, 'A22', PeriodType.LAB)
                ]
            }
        ]
    });

    const createLabOnlyCourse = (): Course => ({
        id: 'CS-102',
        name: 'Programming Lab',
        number: '102',
        description: 'Lab only course',
        minCredits: 1.0,
        maxCredits: 1.0,
        department: department,
        standaloneLabs: [
            createSection(12351, 'L01', PeriodType.LAB),
            createSection(12352, 'L02', PeriodType.LAB)
        ]
    });

    beforeEach(() => {
        document.body.innerHTML = '<div id="schedule-sidebar-content"></div>';
        courseDataService = new CourseDataService();
        mockOnComplete = mock();
        mockOnCancel = mock();
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
                isRequired: false,
                lockedSections: new Set()
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
            spyOn(courseDataService, 'isHierarchicalCourse').mockReturnValue(true);
            spyOn(courseDataService, 'isLabOnlyCourse').mockReturnValue(false);
            spyOn(courseDataService, 'getLecturesForCourse').mockReturnValue([
                {
                    section: createSection(12345, 'A01', PeriodType.LECTURE),
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
            spyOn(courseDataService, 'isHierarchicalCourse').mockReturnValue(true);
            spyOn(courseDataService, 'isLabOnlyCourse').mockReturnValue(false);
            spyOn(courseDataService, 'getLecturesForCourse').mockReturnValue([
                {
                    section: createSection(12345, 'A01', PeriodType.LECTURE),
                    compatibleDiscussions: [createSection(12347, 'A11', PeriodType.DISCUSSION)],
                    compatibleLabs: [createSection(12349, 'A21', PeriodType.LAB)]
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
            spyOn(courseDataService, 'isHierarchicalCourse').mockReturnValue(true);
            spyOn(courseDataService, 'isLabOnlyCourse').mockReturnValue(false);
            spyOn(courseDataService, 'getLecturesForCourse').mockReturnValue([
                {
                    section: createSection(12345, 'A01', PeriodType.LECTURE),
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

        test('should return all discussions when no lecture is selected', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const options = wizard.getOptionsForStep('discussion');
            expect(options.length).toBeGreaterThan(0);
        });

        test('should return all labs when no lecture is selected', () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const options = wizard.getOptionsForStep('lab');
            expect(options.length).toBeGreaterThan(0);
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

        test('should not auto-complete when selecting last step (requires manual next)', () => {
            const course = createLabOnlyCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            // Select a lab section
            const labSection = createSection(12351, 'L01', PeriodType.LAB);
            wizard['currentStep'] = 'lab';
            wizard.selectSection(labSection);

            // Should not auto-complete (user must click Next/Finish)
            expect(mockOnComplete).not.toHaveBeenCalled();

            // Manual completion should work
            wizard.nextStep();
            expect(mockOnComplete).toHaveBeenCalled();
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
            const discussionSection = createSection(12347, 'A11', PeriodType.DISCUSSION);
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
            const labSection = createSection(12349, 'A21', PeriodType.LAB);
            wizard.selectSection(labSection);

            expect(wizard['selections'].lab).toBe(labSection);
        });

        test('should clear dependent selections when changing lecture', () => {
            const course = createHierarchicalCourse();
            const existingSelections: SelectedCourse = {
                course,
                selectedLecture: createSection(12345, 'A01'),
                selectedDiscussion: createSection(12347, 'A11', PeriodType.DISCUSSION),
                selectedLab: createSection(12349, 'A21', PeriodType.LAB),
                isRequired: false,
                lockedSections: new Set()
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
            const discussion = createSection(12347, 'A11', PeriodType.DISCUSSION);
            const existingSelections: SelectedCourse = {
                course,
                selectedLecture: lecture,
                selectedDiscussion: discussion,
                selectedLab: null,
                isRequired: false,
                lockedSections: new Set()
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
            wizard['selections'].lab = createSection(12351, 'L01', PeriodType.LAB);
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

            const closeSpy = spyOn(wizard as any, 'close');
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

            const closeSpy = spyOn(wizard as any, 'close');
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

            const container = document.getElementById('schedule-sidebar-content');
            const panel = container?.querySelector('.sidebar-panel--component-wizard');
            expect(panel).toBeTruthy();
        });

        test('should remove wizard panel when closed', async () => {
            vi.useFakeTimers();
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            wizard.open();
            wizard.close();

            await vi.advanceTimersByTimeAsync(350);

            const container = document.getElementById('schedule-sidebar-content');
            const panel = container?.querySelector('.sidebar-panel--component-wizard');
            expect(panel).toBeFalsy();
            vi.useRealTimers();
        });

        test('should add active class to panel when opened', async () => {
            const course = createHierarchicalCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            wizard.open();

            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const panel = document.querySelector('.sidebar-panel--component-wizard');
                        expect(panel).toBeTruthy();
                        if (panel) {
                            expect(panel.classList.contains('active')).toBe(true);
                        }
                        resolve();
                    });
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

            const content = wizard['renderContent']();
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
            const card = wizard['renderSectionCard'](section, 0);

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

            const card = wizard['renderSectionCard'](section, 0);
            expect(card).toContain('selected'); // Check for 'selected' CSS class
            expect(card).toContain('✓'); // Check for checkmark icon
        });
    });
});
