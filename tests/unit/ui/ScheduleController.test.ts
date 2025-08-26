import { describe, test, expect, beforeEach } from 'vitest';
import { ScheduleController } from '../../../src/ui/controllers/ScheduleController';
import { CourseSelectionService } from '../../../src/services/CourseSelectionService';
import { ScheduleFilterService } from '../../../src/services/ScheduleFilterService';
import { SearchService } from '../../../src/services/searchService';
import { ConflictDetector } from '../../../src/core/ConflictDetector';
import { Course, Section, Period, Department } from '../../../src/types/types';
import { SelectedCourse } from '../../../src/types/schedule';

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