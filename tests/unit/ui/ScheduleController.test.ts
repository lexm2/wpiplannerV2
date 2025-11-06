import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ScheduleController } from '../../../src/ui/controllers/ScheduleController';
import { CourseSelectionService } from '../../../src/services/CourseSelectionService';
import { ScheduleFilterService } from '../../../src/services/ScheduleFilterService';
import { SearchService } from '../../../src/services/searchService';
import { ConflictDetector } from '../../../src/core/ConflictDetector';
import { Course, Section, Period, Department, DayOfWeek } from '../../../src/types/types';
import { SelectedCourse } from '../../../src/types/schedule';
import {
    createMockCourse,
    createMockSection,
    createMockPeriod,
    createMockTime,
    createMockSelectedCourse
} from '../../helpers/mockData';

describe('ScheduleController Expansion State', () => {
    let scheduleController: ScheduleController;
    let courseSelectionService: CourseSelectionService;
    let scheduleFilterService: ScheduleFilterService;
    let searchService: SearchService;
    let conflictDetector: ConflictDetector;

    // Test data
    const department: Department = {
        abbreviation: 'CS',
        name: 'Computer Science',
        courses: []
    };

    const testPeriod: Period = {
        type: 'Lecture',
        professor: 'Prof Smith',
        startTime: { hours: 9, minutes: 0 },
        endTime: { hours: 10, minutes: 50 },
        days: new Set(['mon', 'wed', 'fri']),
        location: 'SL 123',
        building: 'SL',
        room: '123'
    };

    const testSection: Section = {
        crn: 12345,
        number: 'A01',
        seats: 30,
        seatsAvailable: 5,
        actualWaitlist: 0,
        maxWaitlist: 10,
        description: 'Regular section',
        term: 'A',
        computedTerm: 'A',
        periods: [testPeriod]
    };

    const testCourse: Course = {
        id: 'CS-101',
        name: 'Intro to Programming',
        number: '101',
        description: 'Basic programming course',
        credits: '3.0',
        minCredits: '3.0',
        maxCredits: '3.0',
        department: department,
        sections: [testSection]
    };

    const selectedCourse: SelectedCourse = {
        course: testCourse,
        selectedSectionNumber: null,
        deniedSections: new Set(),
        preferredSections: new Set(),
        isRequired: false
    };

    beforeEach(() => {
        // Set up DOM elements that the controller expects
        document.body.innerHTML = `
            <div id="schedule-selected-courses"></div>
            <div id="schedule-selected-count"></div>
        `;

        scheduleFilterService = new ScheduleFilterService();
        conflictDetector = new ConflictDetector();
        scheduleFilterService.setConflictDetector(conflictDetector);
        
        courseSelectionService = new CourseSelectionService();
        scheduleController = new ScheduleController(courseSelectionService);
        scheduleController.setScheduleFilterService(scheduleFilterService);
    });

    test('buildCourseHeaderHTML should create expanded class when isExpanded is true', () => {
        // Access the private method for testing
        const scheduleControllerAny = scheduleController as any;
        
        const expandedHTML = scheduleControllerAny.buildCourseHeaderHTML(testCourse, selectedCourse, true);
        const collapsedHTML = scheduleControllerAny.buildCourseHeaderHTML(testCourse, selectedCourse, false);
        
        expect(expandedHTML).toContain('schedule-course-item expanded');
        expect(collapsedHTML).toContain('schedule-course-item collapsed');
        expect(expandedHTML).not.toContain('collapsed');
        expect(collapsedHTML).not.toContain('expanded');
    });

    test('buildCourseHeaderHTML should default to collapsed when isExpanded is not provided', () => {
        const scheduleControllerAny = scheduleController as any;
        
        const defaultHTML = scheduleControllerAny.buildCourseHeaderHTML(testCourse, selectedCourse);
        
        expect(defaultHTML).toContain('schedule-course-item collapsed');
        expect(defaultHTML).not.toContain('expanded');
    });

    test('buildFilteredSectionsHTML should default to expanded when no previous state', () => {
        const scheduleControllerAny = scheduleController as any;
        
        // Mock filtered sections
        const filteredSections = [{
            course: selectedCourse,
            section: testSection
        }];
        
        // No previous state (undefined dropdownStates)
        const html = scheduleControllerAny.buildFilteredSectionsHTML(filteredSections, [selectedCourse], undefined);
        
        // Should default to expanded for filtering
        expect(html).toContain('schedule-course-item expanded');
        expect(html).not.toContain('collapsed');
    });

    test('buildFilteredSectionsHTML should preserve existing state when provided', () => {
        const scheduleControllerAny = scheduleController as any;
        
        const filteredSections = [{
            course: selectedCourse,
            section: testSection
        }];
        
        // Mock previous state where course was collapsed
        const mockDropdownStates = new Map<string, boolean>();
        mockDropdownStates.set(testCourse.id, false); // false = collapsed
        
        const html = scheduleControllerAny.buildFilteredSectionsHTML(filteredSections, [selectedCourse], mockDropdownStates);
        
        // Should preserve the collapsed state
        expect(html).toContain('schedule-course-item collapsed');
        expect(html).not.toContain('expanded');
    });

    test('buildFilteredSectionsHTML should preserve expanded state when provided', () => {
        const scheduleControllerAny = scheduleController as any;
        
        const filteredSections = [{
            course: selectedCourse,
            section: testSection
        }];
        
        // Mock previous state where course was expanded
        const mockDropdownStates = new Map<string, boolean>();
        mockDropdownStates.set(testCourse.id, true); // true = expanded
        
        const html = scheduleControllerAny.buildFilteredSectionsHTML(filteredSections, [selectedCourse], mockDropdownStates);
        
        // Should preserve the expanded state
        expect(html).toContain('schedule-course-item expanded');
        expect(html).not.toContain('collapsed');
    });
});

describe('ScheduleController Auto-Schedule Cycling', () => {
    let scheduleController: ScheduleController;
    let courseSelectionService: CourseSelectionService;
    let scheduleFilterService: ScheduleFilterService;
    let conflictDetector: ConflictDetector;

    beforeEach(() => {
        // Set up DOM elements that the controller expects
        document.body.innerHTML = `
            <div id="schedule-selected-courses"></div>
            <div id="schedule-selected-count"></div>
            <div id="auto-schedule-btn"></div>
            <div id="schedule-grid-a"></div>
            <div id="schedule-grid-b"></div>
            <div id="schedule-grid-c"></div>
            <div id="schedule-grid-d"></div>
            <div id="schedule-grid-summer"></div>
        `;

        scheduleFilterService = new ScheduleFilterService();
        conflictDetector = new ConflictDetector();
        scheduleFilterService.setConflictDetector(conflictDetector);

        courseSelectionService = new CourseSelectionService();
        scheduleController = new ScheduleController(courseSelectionService);
        scheduleController.setScheduleFilterService(scheduleFilterService);
        scheduleController.setupCourseSelectionChangeListener();
    });

    test('should store multiple generated schedules without clearing on apply', async () => {
        const scheduleControllerAny = scheduleController as any;

        // Create courses with multiple scheduling options
        const lectureA1 = createMockSection({
            crn: 10001,
            number: 'A01',
            periods: [createMockPeriod({
                startTime: createMockTime(9, 0),
                endTime: createMockTime(10, 50),
                days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY])
            })]
        });

        const lectureA2 = createMockSection({
            crn: 10002,
            number: 'A02',
            periods: [createMockPeriod({
                startTime: createMockTime(14, 0),
                endTime: createMockTime(15, 50),
                days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY])
            })]
        });

        const lectureB1 = createMockSection({
            crn: 20001,
            number: 'B01',
            periods: [createMockPeriod({
                startTime: createMockTime(11, 0),
                endTime: createMockTime(12, 50),
                days: new Set([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY])
            })]
        });

        const lectureB2 = createMockSection({
            crn: 20002,
            number: 'B02',
            periods: [createMockPeriod({
                startTime: createMockTime(13, 0),
                endTime: createMockTime(14, 50),
                days: new Set([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY])
            })]
        });

        const course1 = createMockCourse({
            id: 'CS-1101',
            number: '1101',
            name: 'Programming',
            lectures: [
                { section: lectureA1, compatibleDiscussions: [], compatibleLabs: [] },
                { section: lectureA2, compatibleDiscussions: [], compatibleLabs: [] }
            ]
        });

        const course2 = createMockCourse({
            id: 'MA-1021',
            number: '1021',
            name: 'Calculus',
            lectures: [
                { section: lectureB1, compatibleDiscussions: [], compatibleLabs: [] },
                { section: lectureB2, compatibleDiscussions: [], compatibleLabs: [] }
            ]
        });

        // Simulate multiple schedules being generated
        const mockSchedules = [
            [
                { course: course1, combination: { lecture: lectureA1 }, isLocked: false },
                { course: course2, combination: { lecture: lectureB1 }, isLocked: false }
            ],
            [
                { course: course1, combination: { lecture: lectureA1 }, isLocked: false },
                { course: course2, combination: { lecture: lectureB2 }, isLocked: false }
            ],
            [
                { course: course1, combination: { lecture: lectureA2 }, isLocked: false },
                { course: course2, combination: { lecture: lectureB1 }, isLocked: false }
            ]
        ];

        // Set generated schedules directly (simulating what auto-scheduler would do)
        scheduleControllerAny.generatedSchedules = mockSchedules;
        scheduleControllerAny.currentScheduleIndex = 0;

        // Verify schedules were stored
        expect(scheduleControllerAny.generatedSchedules).toHaveLength(3);

        // Apply first schedule
        await scheduleControllerAny.applyScheduleAtIndex(0);

        // CRITICAL: Schedules should NOT be cleared after applying
        expect(scheduleControllerAny.generatedSchedules).toHaveLength(3);
        expect(scheduleControllerAny.currentScheduleIndex).toBe(0);
    });

    test('should allow cycling through multiple schedules', async () => {
        const scheduleControllerAny = scheduleController as any;

        // Create test schedules
        const lecture1 = createMockSection({ crn: 10001, number: 'A01' });
        const lecture2 = createMockSection({ crn: 10002, number: 'A02' });
        const lecture3 = createMockSection({ crn: 10003, number: 'A03' });

        const course = createMockCourse({
            id: 'CS-1101',
            lectures: [
                { section: lecture1, compatibleDiscussions: [], compatibleLabs: [] }
            ]
        });

        const mockSchedules = [
            [{ course, combination: { lecture: lecture1 }, isLocked: false }],
            [{ course, combination: { lecture: lecture2 }, isLocked: false }],
            [{ course, combination: { lecture: lecture3 }, isLocked: false }]
        ];

        scheduleControllerAny.generatedSchedules = mockSchedules;
        scheduleControllerAny.currentScheduleIndex = 0;

        // Apply first schedule
        await scheduleControllerAny.applyScheduleAtIndex(0);
        expect(scheduleControllerAny.generatedSchedules).toHaveLength(3);

        // Cycle to second schedule
        scheduleControllerAny.currentScheduleIndex = 1;
        await scheduleControllerAny.applyScheduleAtIndex(1);
        expect(scheduleControllerAny.generatedSchedules).toHaveLength(3);

        // Cycle to third schedule
        scheduleControllerAny.currentScheduleIndex = 2;
        await scheduleControllerAny.applyScheduleAtIndex(2);
        expect(scheduleControllerAny.generatedSchedules).toHaveLength(3);
    });

    test('should clear schedules when user manually changes selection', async () => {
        const scheduleControllerAny = scheduleController as any;

        // Create test schedules
        const lecture1 = createMockSection({ crn: 10001, number: 'A01' });
        const lecture2 = createMockSection({ crn: 10002, number: 'A02' });

        const course = createMockCourse({
            id: 'CS-1101',
            lectures: [
                { section: lecture1, compatibleDiscussions: [], compatibleLabs: [] },
                { section: lecture2, compatibleDiscussions: [], compatibleLabs: [] }
            ]
        });

        const mockSchedules = [
            [{ course, combination: { lecture: lecture1 }, isLocked: false }],
            [{ course, combination: { lecture: lecture2 }, isLocked: false }]
        ];

        scheduleControllerAny.generatedSchedules = mockSchedules;
        scheduleControllerAny.currentScheduleIndex = 0;
        scheduleControllerAny.lastAutoScheduleState = 'some-hash';

        // Verify schedules exist
        expect(scheduleControllerAny.generatedSchedules).toHaveLength(2);

        // Simulate manual user selection (not via auto-scheduler)
        // This is done WITHOUT the isApplyingAutoSchedule flag
        await courseSelectionService.selectCourse(course);

        // The selection change listener should have fired and cleared schedules
        expect(scheduleControllerAny.generatedSchedules).toHaveLength(0);
        expect(scheduleControllerAny.currentScheduleIndex).toBe(0);
        expect(scheduleControllerAny.lastAutoScheduleState).toBe('');
    });

    test('should not clear schedules when isApplyingAutoSchedule flag is true', async () => {
        const scheduleControllerAny = scheduleController as any;

        const lecture1 = createMockSection({ crn: 10001, number: 'A01' });
        const course = createMockCourse({
            id: 'CS-1101',
            lectures: [
                { section: lecture1, compatibleDiscussions: [], compatibleLabs: [] }
            ]
        });

        const mockSchedules = [
            [{ course, combination: { lecture: lecture1 }, isLocked: false }]
        ];

        scheduleControllerAny.generatedSchedules = mockSchedules;

        // Manually set the flag to simulate auto-scheduler applying
        scheduleControllerAny.isApplyingAutoSchedule = true;

        // Trigger a selection change
        await courseSelectionService.setSelectedComponents(course, lecture1, null, null);

        // Schedules should NOT be cleared because flag was true
        expect(scheduleControllerAny.generatedSchedules).toHaveLength(1);

        // Reset flag
        scheduleControllerAny.isApplyingAutoSchedule = false;
    });

    test('should preserve schedules when applying schedule with locked sections', async () => {
        const scheduleControllerAny = scheduleController as any;

        const lecture1 = createMockSection({ crn: 10001, number: 'A01' });
        const lecture2 = createMockSection({ crn: 20001, number: 'B01' });

        const course1 = createMockCourse({
            id: 'CS-1101',
            lectures: [{ section: lecture1, compatibleDiscussions: [], compatibleLabs: [] }]
        });

        const course2 = createMockCourse({
            id: 'MA-1021',
            lectures: [{ section: lecture2, compatibleDiscussions: [], compatibleLabs: [] }]
        });

        const mockSchedules = [
            [
                { course: course1, combination: { lecture: lecture1 }, isLocked: true },
                { course: course2, combination: { lecture: lecture2 }, isLocked: false }
            ]
        ];

        scheduleControllerAny.generatedSchedules = mockSchedules;

        // Apply schedule with a locked section
        await scheduleControllerAny.applyScheduleAtIndex(0);

        // Schedules should still be preserved
        expect(scheduleControllerAny.generatedSchedules).toHaveLength(1);
    });

    test('should reset isApplyingAutoSchedule flag even if error occurs', async () => {
        const scheduleControllerAny = scheduleController as any;

        // Create a mock that will throw an error
        const errorCourse = createMockCourse({ id: 'ERROR-1101' });
        const errorSection = createMockSection({ crn: 99999 });

        // Mock setSelectedComponents to throw error
        const originalMethod = courseSelectionService.setSelectedComponents;
        courseSelectionService.setSelectedComponents = vi.fn().mockRejectedValue(new Error('Test error'));

        const mockSchedules = [
            [{ course: errorCourse, combination: { lecture: errorSection }, isLocked: false }]
        ];

        scheduleControllerAny.generatedSchedules = mockSchedules;

        // Verify flag is initially false
        expect(scheduleControllerAny.isApplyingAutoSchedule).toBe(false);

        // Try to apply schedule (will throw error internally)
        try {
            await scheduleControllerAny.applyScheduleAtIndex(0);
        } catch (error) {
            // Expected to fail
        }

        // Flag should be reset to false even after error
        expect(scheduleControllerAny.isApplyingAutoSchedule).toBe(false);

        // Restore original method
        courseSelectionService.setSelectedComponents = originalMethod;
    });
});