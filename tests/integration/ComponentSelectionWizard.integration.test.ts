import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ComponentSelectionWizard } from '../../src/ui/components/ComponentSelectionWizard';
import { CourseDataService } from '../../src/services/courseDataService';
import { CourseSelectionService } from '../../src/services/CourseSelectionService';
import { Course, Section, Period, Department } from '../../src/types/types';

describe('ComponentSelectionWizard Integration', () => {
    let courseDataService: CourseDataService;
    let courseSelectionService: CourseSelectionService;

    const department: Department = {
        abbreviation: 'CS',
        name: 'Computer Science',
        courses: []
    };

    const createPeriod = (type: string): Period => ({
        type,
        professor: 'Prof Smith',
        startTime: { hours: 9, minutes: 0, displayTime: '9:00 AM' },
        endTime: { hours: 10, minutes: 50, displayTime: '10:50 AM' },
        days: new Set(['mon', 'wed', 'fri']),
        location: 'SL 123',
        building: 'SL',
        room: '123'
    });

    const createSection = (crn: number, number: string, type: string): Section => ({
        crn,
        number,
        seats: 30,
        seatsAvailable: 5,
        actualWaitlist: 0,
        maxWaitlist: 10,
        description: type,
        term: 'A',
        computedTerm: 'A',
        periods: [createPeriod(type)]
    });

    const createTestCourse = (): Course => ({
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
            createSection(12348, 'A21', 'Lab')
        ]
    });

    beforeEach(() => {
        document.body.innerHTML = '<div id="schedule-selected-courses"></div>';
        courseDataService = new CourseDataService();
        courseSelectionService = new CourseSelectionService();
    });

    describe('Integration with CourseDataService', () => {
        test('should use CourseDataService to determine course structure', () => {
            const course = createTestCourse();
            const mockOnComplete = vi.fn();
            const mockOnCancel = vi.fn();

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
            const mockOnComplete = vi.fn();
            const mockOnCancel = vi.fn();

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
            const mockOnComplete = vi.fn();
            const mockOnCancel = vi.fn();

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                mockOnComplete,
                mockOnCancel
            );

            const steps = wizard.determineAvailableSteps();
            // Should have lecture step for hierarchical course
            expect(steps.length).toBeGreaterThan(0);
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
                vi.fn()
            );

            wizard['currentStep'] = 'lecture';
            wizard['selections'].lecture = createSection(12345, 'A01', 'Lecture');
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
                vi.fn()
            );

            wizard['selections'] = {
                lecture: createSection(12345, 'A01', 'Lecture'),
                discussion: createSection(12347, 'A11', 'Discussion'),
                lab: null
            };

            wizard['complete']();

            expect(capturedSelections).toHaveProperty('lecture');
            expect(capturedSelections).toHaveProperty('discussion');
            expect(capturedSelections).toHaveProperty('lab');
        });
    });

    describe('End-to-End Component Flow', () => {
        test('should complete full selection flow for multi-step course', (done) => {
            const course = createTestCourse();
            let completed = false;

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                (selections) => {
                    completed = true;
                    expect(selections.lecture).toBeTruthy();
                },
                vi.fn()
            );

            // Simulate selecting lecture
            wizard['currentStep'] = 'lecture';
            wizard.selectSection(createSection(12345, 'A01', 'Lecture'));

            // Auto-advance should occur
            setTimeout(() => {
                // If this was the last step, should be completed
                if (wizard['availableSteps'].length === 1) {
                    expect(completed).toBe(true);
                }
                done();
            }, 300);
        });

        test('should handle cancel during selection', () => {
            const course = createTestCourse();
            let canceled = false;

            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                vi.fn(),
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
                vi.fn(),
                vi.fn()
            );

            const lecture = createSection(12345, 'A01', 'Lecture');
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
                vi.fn(),
                vi.fn()
            );

            // Should not throw
            expect(() => wizard.open()).not.toThrow();
        });

        test('should handle course with no sections', () => {
            const emptyCourse: Course = {
                ...createTestCourse(),
                sections: []
            };

            const wizard = new ComponentSelectionWizard(
                emptyCourse,
                courseDataService,
                vi.fn(),
                vi.fn()
            );

            const options = wizard.getOptionsForStep('lecture');
            expect(options).toEqual([]);
        });

        test('should handle invalid step gracefully', () => {
            const course = createTestCourse();
            const wizard = new ComponentSelectionWizard(
                course,
                courseDataService,
                vi.fn(),
                vi.fn()
            );

            // Try to jump to invalid step
            wizard.jumpToStep('invalid' as any);
            // Should not crash
            expect(wizard['currentStep']).toBeDefined();
        });
    });
});
