import { describe, test, expect, beforeEach } from 'vitest';
import { CourseDataService } from '../../src/services/courseDataService';
import { CourseSelectionService } from '../../src/services/CourseSelectionService';
import { ScheduleController } from '../../src/ui/controllers/ScheduleController';
import { ScheduleFilterService } from '../../src/services/ScheduleFilterService';
import { SearchService } from '../../src/services/searchService';
import { ProfileStateManager } from '../../src/core/ProfileStateManager';
import { extractTermLetter } from '../../src/utils/termUtils';
import { Course, Department, Section, Period } from '../../src/types/types';
import { SelectedCourse } from '../../src/types/schedule';

describe('Term Data Flow Integration Tests', () => {
    let courseDataService: CourseDataService;
    let courseSelectionService: CourseSelectionService;
    let scheduleController: ScheduleController;
    let scheduleFilterService: ScheduleFilterService;
    
    // Mock course data with problematic section patterns
    const createMockCourseData = () => {
        const department: Department = {
            abbreviation: 'MA',
            name: 'Mathematical Sciences',
            courses: []
        };

        const testPeriod: Period = {
            type: 'Lecture',
            professor: 'Prof Smith',
            startTime: { hours: 9, minutes: 0, displayTime: '9:00 AM' },
            endTime: { hours: 10, minutes: 50, displayTime: '10:50 AM' },
            days: new Set(['mon', 'wed', 'fri']),
            location: 'SL 123',
            building: 'SL',
            room: '123',
            seats: 30,
            seatsAvailable: 10,
            actualWaitlist: 0,
            maxWaitlist: 5
        };

        const problematicSections: Section[] = [
            {
                crn: 12345,
                number: 'DL01/DD01', // Should extract to 'D'
                seats: 30,
                seatsAvailable: 5,
                actualWaitlist: 0,
                maxWaitlist: 10,
                description: 'D Term section',
                term: '202201',
                computedTerm: 'undefined', // Simulates legacy data
                periods: [testPeriod]
            },
            {
                crn: 12346,
                number: 'AL06-ACL/AD06-ACL/AX05', // Should extract to 'A'
                seats: 30,
                seatsAvailable: 8,
                actualWaitlist: 0,
                maxWaitlist: 10,
                description: 'A Term section',
                term: '202201',
                computedTerm: 'undefined', // Simulates legacy data
                periods: [testPeriod]
            },
            {
                crn: 12347,
                number: 'BL01/BX03', // Should extract to 'B'
                seats: 25,
                seatsAvailable: 3,
                actualWaitlist: 0,
                maxWaitlist: 5,
                description: 'B Term section',
                term: '202201',
                computedTerm: 'undefined', // Simulates legacy data
                periods: [testPeriod]
            },
            {
                crn: 12348,
                number: 'C01', // Should extract to 'C'
                seats: 20,
                seatsAvailable: 10,
                actualWaitlist: 0,
                maxWaitlist: 5,
                description: 'C Term section',
                term: '202201',
                computedTerm: 'undefined', // Simulates legacy data
                periods: [testPeriod]
            }
        ];

        const course: Course = {
            id: 'MA-2621',
            name: 'Probability for Applications',
            number: '2621',
            description: 'Introduction to probability theory',
            minCredits: 3,
            maxCredits: 3,
            department: department,
            sections: problematicSections
        };

        department.courses = [course];
        
        return {
            departments: [department],
            generated: new Date().toISOString()
        };
    };

    beforeEach(() => {
        // Clear localStorage to start fresh
        localStorage.clear();
        
        // Initialize services
        const profileStateManager = new ProfileStateManager();
        courseSelectionService = new CourseSelectionService(profileStateManager);
        
        const searchService = new SearchService();
        scheduleFilterService = new ScheduleFilterService(searchService);
        
        scheduleController = new ScheduleController(courseSelectionService);
        
        // Mock DOM elements for schedule controller
        document.body.innerHTML = `
            <div id="schedule-grid-A"></div>
            <div id="schedule-grid-B"></div>
            <div id="schedule-grid-C"></div>
            <div id="schedule-grid-D"></div>
        `;
    });

    describe('End-to-End Course Data Processing', () => {
        test('should process mock course data and extract correct terms', () => {
            const mockData = createMockCourseData();
            const course = mockData.departments[0].courses[0];
            
            // Verify that our mock data has the problematic "undefined" computedTerm values
            expect(course.sections.every(s => s.computedTerm === 'undefined')).toBe(true);
            
            // Process each section through the term extraction logic
            const extractedTerms = course.sections.map(section => {
                return extractTermLetter(section.term, section.number);
            });
            
            expect(extractedTerms).toEqual(['D', 'A', 'B', 'C']);
        });

        test('should handle real-world problematic section patterns', () => {
            const testCases = [
                { sectionNumber: 'DL01/DD01', expected: 'D' },
                { sectionNumber: 'AL06-ACL/AD06-ACL/AX05', expected: 'A' },
                { sectionNumber: 'BL01/BX03', expected: 'B' },
                { sectionNumber: 'C01', expected: 'C' },
                { sectionNumber: 'AL01/AX01', expected: 'A' },
                { sectionNumber: 'AL01', expected: 'A' },
                { sectionNumber: 'D12', expected: 'D' }
            ];

            testCases.forEach(({ sectionNumber, expected }) => {
                const result = extractTermLetter('202201', sectionNumber);
                expect(result).toBe(expected);
            });
        });
    });

    describe('Data Migration Integration', () => {
        test('should migrate sections with invalid computedTerm during course selection', () => {
            const mockData = createMockCourseData();
            const course = mockData.departments[0].courses[0];
            
            // Select the course with problematic sections
            courseSelectionService.selectCourse(course);
            
            // Set a specific section with invalid computedTerm
            const problematicSection = course.sections[0]; // DL01/DD01 with "undefined"
            courseSelectionService.setSelectedSection(course, problematicSection.number);
            
            // Verify the section was selected
            const selectedCourses = courseSelectionService.getSelectedCourses();
            expect(selectedCourses).toHaveLength(1);
            expect(selectedCourses[0].selectedSection?.number).toBe('DL01/DD01');
            expect(selectedCourses[0].selectedSection?.computedTerm).toBe('undefined');
            
            // Simulate persistence and reload (this should trigger migration)
            const courseManager = courseSelectionService.getCourseManager();
            const serializedCourses = selectedCourses;
            
            // Clear and reload (triggers loadSelectedCourses which has migration logic)
            courseManager.clearAll();
            courseManager.loadSelectedCourses(serializedCourses);
            
            // Verify migration occurred
            const migratedCourses = courseManager.getSelectedCourses();
            expect(migratedCourses).toHaveLength(1);
            expect(migratedCourses[0].selectedSection?.computedTerm).toBe('D');
        });

        test('should migrate all problematic sections during bulk load', () => {
            const mockData = createMockCourseData();
            const course = mockData.departments[0].courses[0];
            
            // Create separate courses for each section to avoid CourseManager key collision
            const selectedCoursesWithProblematicSections: SelectedCourse[] = course.sections.map((section, index) => {
                const separateDepartment: Department = {
                    abbreviation: 'MA',
                    name: 'Mathematical Sciences',
                    courses: []
                };
                
                const separateCourse: Course = {
                    id: `MA-262${index + 1}`, // Unique ID for each course
                    name: `Probability for Applications ${index + 1}`,
                    number: `262${index + 1}`,
                    description: 'Introduction to probability theory',
                    minCredits: 3,
                    maxCredits: 3,
                    department: separateDepartment,
                    sections: [section] // Each course has one section
                };
                
                separateDepartment.courses = [separateCourse];
                
                return {
                    course: separateCourse,
                    selectedSection: section,
                    selectedSectionNumber: section.number,
                    isRequired: false
                };
            });
            
            // Verify all have "undefined" computedTerm before migration
            expect(selectedCoursesWithProblematicSections.every(sc => 
                sc.selectedSection?.computedTerm === 'undefined'
            )).toBe(true);
            
            // Load the courses (should trigger migration)
            const courseManager = new CourseManager();
            courseManager.loadSelectedCourses(selectedCoursesWithProblematicSections);
            
            // Verify all were migrated correctly
            const migratedCourses = courseManager.getSelectedCourses();
            expect(migratedCourses).toHaveLength(4);
            
            const computedTerms = migratedCourses.map(sc => sc.selectedSection?.computedTerm).sort();
            expect(computedTerms).toEqual(['A', 'B', 'C', 'D']);
        });
    });

    describe('Schedule Filter Integration', () => {
        test('should return available terms after migration', () => {
            const mockData = createMockCourseData();
            const course = mockData.departments[0].courses[0];
            
            // Create and migrate selected courses
            const selectedCourses: SelectedCourse[] = course.sections.map(section => ({
                course: course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }));
            
            const courseManager = new CourseManager();
            courseManager.loadSelectedCourses(selectedCourses);
            
            const migratedCourses = courseManager.getSelectedCourses();
            
            // Test schedule filter service
            const availableTerms = scheduleFilterService.getFilterOptions('periodTerm', migratedCourses);
            
            expect(availableTerms).toHaveLength(4);
            expect(availableTerms.map((term: any) => term.value).sort()).toEqual(['A', 'B', 'C', 'D']);
            expect(availableTerms.map((term: any) => term.label).sort()).toEqual(['A Term', 'B Term', 'C Term', 'D Term']);
        });

        test('should filter sections correctly by term after migration', () => {
            const mockData = createMockCourseData();
            const course = mockData.departments[0].courses[0];
            
            // Create and migrate selected courses
            const selectedCourses: SelectedCourse[] = course.sections.map(section => ({
                course: course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }));
            
            const courseManager = new CourseManager();
            courseManager.loadSelectedCourses(selectedCourses);
            
            const migratedCourses = courseManager.getSelectedCourses();
            
            // Test filtering by A term
            scheduleFilterService.addFilter('periodTerm', { terms: ['A'] });
            const aTermResults = scheduleFilterService.filterSections(migratedCourses);
            expect(aTermResults).toHaveLength(1);
            expect(aTermResults[0].section.number).toBe('AL06-ACL/AD06-ACL/AX05');
            
            // Test filtering by D term
            scheduleFilterService.clearAllFilters();
            scheduleFilterService.addFilter('periodTerm', { terms: ['D'] });
            const dTermResults = scheduleFilterService.filterSections(migratedCourses);
            expect(dTermResults).toHaveLength(1);
            expect(dTermResults[0].section.number).toBe('DL01/DD01');
            
            // Test filtering by multiple terms
            scheduleFilterService.clearAllFilters();
            scheduleFilterService.addFilter('periodTerm', { terms: ['B', 'C'] });
            const multiTermResults = scheduleFilterService.filterSections(migratedCourses);
            expect(multiTermResults).toHaveLength(2);
            const sectionNumbers = multiTermResults.map(r => r.section.number).sort();
            expect(sectionNumbers).toEqual(['BL01/BX03', 'C01']);
        });
    });

    describe('Schedule Controller Integration', () => {
        test('should handle defensive programming for invalid computedTerm', () => {
            const mockData = createMockCourseData();
            const course = mockData.departments[0].courses[0];
            
            // Select course with problematic section
            courseSelectionService.selectCourse(course);
            courseSelectionService.setSelectedSection(course, 'DL01/DD01');
            
            // Verify section still has invalid computedTerm before schedule rendering
            const selectedCourses = courseSelectionService.getSelectedCourses();
            expect(selectedCourses[0].selectedSection?.computedTerm).toBe('undefined');
            
            // Initialize schedule controller with filter service
            scheduleController.setScheduleFilterService(scheduleFilterService);
            
            // This should trigger defensive programming in renderScheduleGrids
            // Note: We can't easily test the console output, but we can verify the behavior
            scheduleController.renderScheduleGrids();
            
            // After rendering, the section should have been fixed by defensive programming
            const updatedSelectedCourses = courseSelectionService.getSelectedCourses();
            expect(updatedSelectedCourses[0].selectedSection?.computedTerm).toBe('D');
        });

        test('should display courses in correct term grids after defensive fix', () => {
            const mockData = createMockCourseData();
            const course = mockData.departments[0].courses[0];
            
            // Select multiple courses with different problematic sections
            courseSelectionService.selectCourse(course);
            
            // Test with different sections
            const testSections = ['DL01/DD01', 'AL06-ACL/AD06-ACL/AX05', 'BL01/BX03', 'C01'];
            
            for (const sectionNumber of testSections) {
                // Clear previous selection
                courseSelectionService.unselectCourse(course);
                courseSelectionService.selectCourse(course);
                courseSelectionService.setSelectedSection(course, sectionNumber);
                
                // Render schedules
                scheduleController.setScheduleFilterService(scheduleFilterService);
                scheduleController.renderScheduleGrids();
                
                // Verify the section was fixed during rendering
                const selectedCourses = courseSelectionService.getSelectedCourses();
                const computedTerm = selectedCourses[0].selectedSection?.computedTerm;
                
                expect(computedTerm).not.toBe('undefined');
                expect(['A', 'B', 'C', 'D']).toContain(computedTerm);
            }
        });
    });

    describe('Performance Tests', () => {
        test('should migrate large number of sections efficiently', () => {
            const startTime = performance.now();
            
            // Create a large dataset with many problematic sections
            const largeCourseData = [];
            for (let i = 0; i < 100; i++) {
                const section: Section = {
                    crn: 10000 + i,
                    number: `A${i.toString().padStart(2, '0')}`,
                    seats: 30,
                    seatsAvailable: Math.floor(Math.random() * 30),
                    actualWaitlist: 0,
                    maxWaitlist: 10,
                    description: `Section ${i}`,
                    term: '202201',
                    computedTerm: 'undefined', // All have invalid computedTerm
                    periods: []
                };
                largeCourseData.push(section);
            }
            
            const department: Department = { abbreviation: 'CS', name: 'Computer Science', courses: [] };
            const course: Course = {
                id: 'CS-101',
                name: 'Test Course',
                number: '101',
                description: 'Test course',
                minCredits: 3,
                maxCredits: 3,
                department: department,
                sections: largeCourseData
            };
            
            const selectedCourses: SelectedCourse[] = largeCourseData.map(section => ({
                course: course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }));
            
            // Measure migration time
            const courseManager = new CourseManager();
            courseManager.loadSelectedCourses(selectedCourses);
            
            const endTime = performance.now();
            const migrationTime = endTime - startTime;
            
            // Verify the course was processed (note: all SelectedCourse objects share the same Course, so we get 1 result)
            const migratedCourses = courseManager.getSelectedCourses();
            expect(migratedCourses).toHaveLength(1);
            
            // Verify the migration worked by checking that the last selected section was migrated
            // (since all SelectedCourse objects reference the same course, only the last selectedSection is kept)
            expect(migratedCourses[0].selectedSection?.computedTerm).toBe('A');
            
            // Performance check: should complete in reasonable time (less than 100ms for 100 sections)
            expect(migrationTime).toBeLessThan(100);
        });
    });
});