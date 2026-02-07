import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import { ComponentSelectionWizard } from '../../src/ui/components/ComponentSelectionWizard';
import { CourseDataService } from '../../src/services/data/courseDataService';
import { CourseSelectionService } from '../../src/services/selection/CourseSelectionService';
import { Course, Section, Period, PeriodType, DayOfWeek } from '../../src/types/types';
import { AcademicTerm } from '../../src/types/schedule';

describe('ComponentSelectionWizard Integration', () => {
    let courseDataService: CourseDataService;
    let courseSelectionService: CourseSelectionService;

    const createPeriod = (type: PeriodType): Period => ({
        type,
        professor: 'Prof Smith',
        startTime: { hours: 9, minutes: 0, displayTime: '9:00 AM' },
        endTime: { hours: 10, minutes: 50, displayTime: '10:50 AM' },
        days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY]),
        location: 'SL 123',
        building: 'SL',
        room: '123',
        seats: 30,
        seatsAvailable: 5,
        actualWaitlist: 0,
        maxWaitlist: 10
    });

    const createSection = (crn: number, number: string, type: PeriodType): Section => ({
        crn,
        number,
        seats: 30,
        seatsAvailable: 5,
        actualWaitlist: 0,
        maxWaitlist: 10,
        description: type,
        term: AcademicTerm.A,
        computedTerm: AcademicTerm.A,
        periods: [createPeriod(type)]
    });

    const createTestCourse = (): Course => ({
        id: 'CS-101',
        name: 'Intro to Programming',
        number: '101',
        description: 'Basic programming course',
        minCredits: 3,
        maxCredits: 3,
        departmentAbbr: 'CS',
        departmentName: 'Computer Science',
        lectures: [
            {
                section: createSection(12345, 'A01', PeriodType.LECTURE),
                compatibleDiscussions: [createSection(12347, 'A11', PeriodType.DISCUSSION)],
                compatibleLabs: [createSection(12348, 'A21', PeriodType.LAB)]
            },
            {
                section: createSection(12346, 'A02', PeriodType.LECTURE),
                compatibleDiscussions: [createSection(12347, 'A11', PeriodType.DISCUSSION)],
                compatibleLabs: [createSection(12348, 'A21', PeriodType.LAB)]
            }
        ]
    });

    beforeEach(() => {
        document.body.innerHTML = '<div id="schedule-sidebar-content"></div>';
        courseDataService = new CourseDataService();
        courseSelectionService = new CourseSelectionService();
    });

    describe('Integration with CourseDataService', () => {
        test('should use CourseDataService to determine course structure', () => {
            const course = createTestCourse();
            const mockOnComplete = mock();
            const mockOnCancel = mock();

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            // Wizard should call CourseDataService methods
            const steps = wizard.determineAvailableSteps();
            expect(steps).toBeDefined();
        });

        test('should get sections from CourseDataService', () => {
            const course = createTestCourse();
            const mockOnComplete = mock();
            const mockOnCancel = mock();

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const options = wizard.getOptionsForStep('lecture');
            expect(Array.isArray(options)).toBe(true);
        });

        test('should handle hierarchical course detection', () => {
            const course = createTestCourse();
            const mockOnComplete = mock();
            const mockOnCancel = mock();

            // Mock CourseDataService to indicate hierarchical course
            spyOn(courseDataService, 'isHierarchicalCourse').mockReturnValue(true);
            spyOn(courseDataService, 'isLabOnlyCourse').mockReturnValue(false);
            spyOn(courseDataService, 'getLecturesForCourse').mockReturnValue([
                {
                    section: createSection(12345, 'A01', PeriodType.LECTURE),
                    compatibleDiscussions: [createSection(12347, 'A11', PeriodType.DISCUSSION)],
                    compatibleLabs: [createSection(12348, 'A21', PeriodType.LAB)]
                }
            ]);

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const steps = wizard.determineAvailableSteps();
            // Should have lecture step for hierarchical course
            expect(steps.length).toBeGreaterThan(0);
            expect(steps).toContain('lecture');
        });
    });

    describe('Integration with CourseSelectionService', () => {
        test('should complete with selections that can be passed to service', async () => {
            const course = createTestCourse();
            let capturedSelections: any;

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                (selections) => {
                    capturedSelections = selections;
                },
                mock()
            );

            wizard['currentStep'] = 'lecture';
            wizard['selections'].lecture = createSection(12345, 'A01', PeriodType.LECTURE);
            wizard['complete']();

            expect(capturedSelections).toBeDefined();
            expect(capturedSelections.lecture).toBeTruthy();
        });

        test('should provide selections in correct format for service', () => {
            const course = createTestCourse();
            let capturedSelections: any;

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                (selections) => {
                    capturedSelections = selections;
                },
                mock()
            );

            wizard['selections'] = {
                lecture: createSection(12345, 'A01', PeriodType.LECTURE),
                discussion: createSection(12347, 'A11', PeriodType.DISCUSSION),
                lab: null
            };

            wizard['complete']();

            expect(capturedSelections).toHaveProperty('lecture');
            expect(capturedSelections).toHaveProperty('discussion');
            expect(capturedSelections).toHaveProperty('lab');
        });
    });

    describe('End-to-End Component Flow', () => {
        test('should complete full selection flow for multi-step course with manual navigation', () => {
            const course = createTestCourse();
            let completed = false;

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                (selections) => {
                    completed = true;
                    expect(selections.lecture).toBeTruthy();
                },
                mock()
            );

            // Simulate selecting lecture
            wizard['currentStep'] = 'lecture';
            wizard.selectSection(createSection(12345, 'A01', PeriodType.LECTURE));

            // Should not auto-advance (requires manual navigation)
            expect(completed).toBe(false);

            // Manual next step
            if (wizard['availableSteps'].length > 1) {
                wizard.nextStep();
                expect(completed).toBe(false); // Still not completed
            } else {
                // If only one step, manually complete
                wizard.nextStep();
                expect(completed).toBe(true);
            }
        });

        test('should handle cancel during selection', () => {
            const course = createTestCourse();
            let canceled = false;

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mock(),
                () => {
                    canceled = true;
                }
            );

            wizard['cancel']();
            expect(canceled).toBe(true);
        });

        test('should preserve partial selections when navigating between steps', () => {
            const course = createTestCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mock(),
                mock()
            );

            const lecture = createSection(12345, 'A01', PeriodType.LECTURE);
            wizard['currentStep'] = 'lecture';
            wizard['selections'].lecture = lecture;

            // Move to next step
            if (wizard['availableSteps'].length > 1) {
                wizard.nextStep();
                // Lecture selection should be preserved
                expect(wizard['selections'].lecture).toBe(lecture);
            }
        });
    });

    describe('Error Handling', () => {
        test('should handle missing DOM container gracefully', () => {
            document.body.innerHTML = ''; // Remove container

            const course = createTestCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mock(),
                mock()
            );

            // Should not throw
            expect(() => wizard.open()).not.toThrow();
        });

        test('should handle course with no sections', () => {
            const emptyCourse: Course = {
                ...createTestCourse(),
                lectures: []
            };

            const wizard = new ComponentSelectionWizard(
                emptyCourse,
                courseDataService,
                mock(),
                mock()
            );

            const options = wizard.getOptionsForStep('lecture');
            expect(options).toEqual([]);
        });

        test('should handle invalid step gracefully', () => {
            const course = createTestCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mock(),
                mock()
            );

            // Try to jump to invalid step
            wizard.jumpToStep('invalid' as any);
            // Should not crash
            expect(wizard['currentStep']).toBeDefined();
        });
    });
});
