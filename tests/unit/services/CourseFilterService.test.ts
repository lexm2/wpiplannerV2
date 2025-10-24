import { describe, test, expect, beforeEach, vi } from 'vitest';
import { CourseFilterService } from '../../../src/services/CourseFilterService';
import { SearchService } from '../../../src/services/searchService';
import { DepartmentFilter } from '../../../src/core/filters/DepartmentFilter';
import { AvailabilityFilter } from '../../../src/core/filters/AvailabilityFilter';
import { SearchTextFilter } from '../../../src/core/filters/SearchTextFilter';
import { ProfessorFilter } from '../../../src/core/filters/ProfessorFilter';
import { Course, Department, Section, Period, DayOfWeek } from '../../../src/types/types';

describe('CourseFilterService', () => {
    let courseFilterService: CourseFilterService;
    let searchService: SearchService;
    let testCourses: Course[];
    let testDepartments: Department[];

    // Helper function to create test courses
    function createTestCourse(
        id: string,
        number: string,
        name: string,
        dept: string,
        professor: string = 'Prof Smith',
        seatsAvailable: number = 5
    ): Course {
        const department: Department = {
            abbreviation: dept,
            name: `${dept} Department`,
            courses: []
        };

        const period: Period = {
            type: 'Lecture',
            professor,
            startTime: { hours: 9, minutes: 0, displayTime: '9:00 AM' },
            endTime: { hours: 10, minutes: 50, displayTime: '10:50 AM' },
            days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]),
            location: 'SL 123',
            building: 'SL',
            room: '123',
            seats: 30,
            seatsAvailable: seatsAvailable,
            actualWaitlist: 0,
            maxWaitlist: 10
        };

        const section: Section = {
            crn: parseInt(id + '000'),
            number: 'A01',
            seats: 30,
            seatsAvailable,
            actualWaitlist: 0,
            maxWaitlist: 10,
            description: '',
            term: 'A',
            computedTerm: 'A',
            periods: [period]
        };

        return {
            id,
            number,
            name,
            description: `Description for ${name}`,
            department,
            sections: [section],
            minCredits: 3,
            maxCredits: 3
        };
    }

    beforeEach(() => {
        searchService = new SearchService();
        courseFilterService = new CourseFilterService(searchService);

        // Create a diverse set of test courses
        testCourses = [
            // CS courses
            createTestCourse('cs1101', '1101', 'Introduction to Programming', 'CS', 'Prof Smith', 10),
            createTestCourse('cs2102', '2102', 'Data Structures', 'CS', 'Prof Johnson', 0),
            createTestCourse('cs3133', '3133', 'Algorithms', 'CS', 'Prof Williams', 15),
            createTestCourse('cs4123', '4123', 'Machine Learning', 'CS', 'Prof Brown', 5),
            createTestCourse('cs5500', '5500', 'Advanced AI', 'CS', 'Prof Davis', 20),

            // Math courses
            createTestCourse('ma1021', '1021', 'Calculus I', 'MA', 'Prof Miller', 8),
            createTestCourse('ma1022', '1022', 'Calculus II', 'MA', 'Prof Wilson', 0),
            createTestCourse('ma2051', '2051', 'Linear Algebra', 'MA', 'Prof Moore', 12),
            createTestCourse('ma2071', '2071', 'Differential Equations', 'MA', 'Prof Taylor', 3),
            createTestCourse('ma3831', '3831', 'Probability', 'MA', 'Prof Anderson', 25),

            // ECE courses
            createTestCourse('ece2010', '2010', 'Digital Circuits', 'ECE', 'Prof Thomas', 0),
            createTestCourse('ece2049', '2049', 'Embedded Systems', 'ECE', 'Prof Jackson', 7),
            createTestCourse('ece3829', '3829', 'Computer Architecture', 'ECE', 'Prof White', 18),

            // Physics courses
            createTestCourse('ph1110', '1110', 'Mechanics', 'PH', 'Prof Harris', 2),
            createTestCourse('ph1120', '1120', 'Electricity & Magnetism', 'PH', 'Prof Martin', 0),
        ];

        // Initialize search service with courses
        const departments = testCourses.reduce((depts, course) => {
            const existingDept = depts.find(d => d.abbreviation === course.department.abbreviation);
            if (existingDept) {
                existingDept.courses.push(course);
            } else {
                const newDept = { ...course.department, courses: [course] };
                depts.push(newDept);
            }
            return depts;
        }, [] as Department[]);
        searchService.setCourseData(departments);

        // Register common filters
        courseFilterService.registerFilter(new DepartmentFilter());
        courseFilterService.registerFilter(new AvailabilityFilter());
        courseFilterService.registerFilter(new SearchTextFilter(searchService));
        courseFilterService.registerFilter(new ProfessorFilter(searchService));
    });

    describe('Basic Functionality', () => {
        test('should filter courses by department', () => {
            courseFilterService.addFilter('department', { departments: ['CS'] });
            const filtered = courseFilterService.filterCourses(testCourses);

            expect(filtered).toHaveLength(5);
            expect(filtered.every(c => c.department.abbreviation === 'CS')).toBe(true);
        });

        test('should filter courses by availability', () => {
            courseFilterService.addFilter('availability', { availableOnly: true });
            const filtered = courseFilterService.filterCourses(testCourses);

            expect(filtered).toHaveLength(11); // Courses with seatsAvailable > 0
            expect(filtered.every(c => c.sections.some(s => s.seatsAvailable > 0))).toBe(true);
        });

        test('should apply multiple filters', () => {
            courseFilterService.addFilter('department', { departments: ['CS'] });
            courseFilterService.addFilter('availability', { availableOnly: true });
            const filtered = courseFilterService.filterCourses(testCourses);

            expect(filtered).toHaveLength(4); // CS courses with available seats
            expect(filtered.every(c =>
                c.department.abbreviation === 'CS' &&
                c.sections.some(s => s.seatsAvailable > 0)
            )).toBe(true);
        });

        test('should clear all filters', () => {
            courseFilterService.addFilter('department', { departments: ['CS'] });
            courseFilterService.addFilter('availability', { availableOnly: true });

            courseFilterService.clearFilters();
            const filtered = courseFilterService.filterCourses(testCourses);

            expect(filtered).toHaveLength(testCourses.length);
        });
    });

    describe('Priority System', () => {
        test('should apply filters in priority order', () => {
            // Enable debug logging to verify filter order
            courseFilterService.setDebugLogging(true);

            // Add filters with different priorities
            courseFilterService.addFilter('department', { departments: ['CS'] }); // Priority 25
            courseFilterService.addFilter('availability', { availableOnly: true }); // Priority 100

            const consoleSpy = vi.spyOn(console, 'log');
            courseFilterService.filterCourses(testCourses);

            // Verify filter application order is logged
            const logs = consoleSpy.mock.calls.map(call => call[0]);
            const orderLog = logs.find(log => log.includes('Filter application order'));
            expect(orderLog).toBeTruthy();

            // Department filter should be applied first due to lower priority number
            const departmentLog = logs.find(log => log.includes('Department (priority: 25)'));
            expect(departmentLog).toBeTruthy();

            consoleSpy.mockRestore();
        });

        test('should handle multiple filters efficiently', () => {
            // Create a test dataset
            const largeCourseSet: Course[] = [];
            for (let i = 0; i < 500; i++) {
                const dept = ['CS', 'MA', 'ECE', 'PH'][i % 4];
                largeCourseSet.push(
                    createTestCourse(
                        `${dept}${i}`,
                        `${i}`,
                        `Course ${i}`,
                        dept,
                        `Prof ${i % 5}`,
                        i % 3 === 0 ? 0 : 5
                    )
                );
            }

            // Add multiple filters
            courseFilterService.addFilter('department', { departments: ['CS'] });
            courseFilterService.addFilter('availability', { availableOnly: true });
            courseFilterService.addFilter('professor', { professors: ['Prof 1'] });

            const start = performance.now();
            const result = courseFilterService.filterCourses(largeCourseSet);
            const time = performance.now() - start;

            console.log(`Filtered ${largeCourseSet.length} courses to ${result.length} in ${time.toFixed(2)}ms`);

            // Should be very fast
            expect(time).toBeLessThan(50);
            expect(result.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Filter Behavior', () => {
        test('should handle department filter correctly', () => {
            courseFilterService.addFilter('department', { departments: ['CS'] });
            const result = courseFilterService.filterCourses(testCourses);

            // Should return only CS courses
            expect(result.length).toBe(5); // 5 CS courses in test data
            expect(result.every(c => c.department.abbreviation === 'CS')).toBe(true);
        });

        test('should handle availability filter correctly', () => {
            courseFilterService.addFilter('availability', { availableOnly: true });
            const result = courseFilterService.filterCourses(testCourses);

            // Should return only courses with available seats
            expect(result.every(c => c.sections.some(s => s.seatsAvailable > 0))).toBe(true);
        });

        test('should handle professor filter correctly', () => {
            courseFilterService.addFilter('professor', { professors: ['Prof Smith'] });
            const result = courseFilterService.filterCourses(testCourses);

            // Should return only courses taught by Prof Smith
            expect(result.every(c =>
                c.sections.some(s =>
                    s.periods.some(p => p.professor === 'Prof Smith')
                )
            )).toBe(true);
        });
    });

    describe('Configuration', () => {
        test('should toggle debug logging', () => {
            courseFilterService.setDebugLogging(true);
            const consoleSpy = vi.spyOn(console, 'log');

            courseFilterService.addFilter('department', { departments: ['CS'] });
            courseFilterService.filterCourses(testCourses);

            // Should log when debug is enabled
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockClear();
            courseFilterService.setDebugLogging(false);
            courseFilterService.filterCourses(testCourses);

            // Should not log when debug is disabled
            expect(consoleSpy).not.toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });


    describe('Edge Cases', () => {
        test('should handle empty course list', () => {
            courseFilterService.addFilter('department', { departments: ['CS'] });
            const filtered = courseFilterService.filterCourses([]);

            expect(filtered).toEqual([]);
        });

        test('should handle no active filters', () => {
            const filtered = courseFilterService.filterCourses(testCourses);
            expect(filtered).toEqual(testCourses);
        });

        test('should handle filters that eliminate all courses', () => {
            courseFilterService.addFilter('department', { departments: ['NONEXISTENT'] });
            const filtered = courseFilterService.filterCourses(testCourses);

            expect(filtered).toEqual([]);
        });

        test('should handle rapid filter changes', () => {
            // Rapidly add and remove filters
            for (let i = 0; i < 10; i++) {
                courseFilterService.addFilter('department', { departments: ['CS'] });
                courseFilterService.removeFilter('department');
                courseFilterService.addFilter('availability', { availableOnly: true });
                courseFilterService.removeFilter('availability');
            }

            const filtered = courseFilterService.filterCourses(testCourses);
            expect(filtered).toEqual(testCourses); // No filters active
        });
    });
});