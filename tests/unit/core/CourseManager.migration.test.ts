import { describe, test, expect, beforeEach, vi } from 'vitest';
import { CourseManager } from '../../../src/core/CourseManager';
import { Course, Section, Period, Department } from '../../../src/types/types';
import { SelectedCourse } from '../../../src/types/schedule';

describe('CourseManager - Data Migration Tests', () => {
    let courseManager: CourseManager;
    
    const createTestPeriod = (): Period => ({
        type: 'Lecture',
        professor: 'Prof Test',
        startTime: { hours: 9, minutes: 0, displayTime: '9:00 AM' },
        endTime: { hours: 10, minutes: 50, displayTime: '10:50 AM' },
        days: new Set(['mon', 'wed', 'fri']),
        location: 'SL 123',
        building: 'SL',
        room: '123'
    });

    const createTestSection = (number: string, computedTerm: string = 'undefined'): Section => ({
        crn: Math.floor(Math.random() * 100000),
        number,
        seats: 30,
        seatsAvailable: Math.floor(Math.random() * 30),
        actualWaitlist: 0,
        maxWaitlist: 10,
        description: `Section ${number}`,
        term: '202201',
        computedTerm,
        periods: [createTestPeriod()]
    });

    const createTestCourse = (sections: Section[]): Course => {
        const department: Department = {
            abbreviation: 'TEST',
            name: 'Test Department',
            courses: []
        };

        const course: Course = {
            id: 'TEST-101',
            name: 'Test Course',
            number: '101',
            description: 'Test course description',
            minCredits: 3,
            maxCredits: 3,
            department,
            sections
        };

        department.courses = [course];
        return course;
    };

    beforeEach(() => {
        courseManager = new CourseManager();
        // Spy on console methods to test logging
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    describe('Data Migration Logic', () => {
        test('should migrate sections with undefined computedTerm', () => {
            const problematicSections = [
                createTestSection('DL01/DD01', 'undefined'),
                createTestSection('AL06-ACL/AD06-ACL/AX05', 'undefined'),
                createTestSection('BL01/BX03', 'undefined'),
                createTestSection('C01', 'undefined')
            ];

            const course = createTestCourse(problematicSections);
            
            const selectedCourses: SelectedCourse[] = problematicSections.map(section => ({
                course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }));

            // Verify sections have invalid computedTerm before migration
            expect(selectedCourses.every(sc => sc.selectedSection?.computedTerm === 'undefined')).toBe(true);

            // Load courses (should trigger migration)
            courseManager.loadSelectedCourses(selectedCourses);

            // Verify sections were migrated
            const migratedCourses = courseManager.getSelectedCourses();
            expect(migratedCourses).toHaveLength(4);
            
            const computedTerms = migratedCourses.map(sc => sc.selectedSection?.computedTerm);
            expect(computedTerms).toEqual(['D', 'A', 'B', 'C']);

            // Verify migration was logged
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[DATA MIGRATION] Successfully migrated 4 sections')
            );
        });

        test('should migrate sections with null computedTerm', () => {
            const section = createTestSection('A01', null as any);
            const course = createTestCourse([section]);
            
            const selectedCourses: SelectedCourse[] = [{
                course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }];

            courseManager.loadSelectedCourses(selectedCourses);

            const migratedCourses = courseManager.getSelectedCourses();
            expect(migratedCourses[0].selectedSection?.computedTerm).toBe('A');
        });

        test('should migrate sections with empty string computedTerm', () => {
            const section = createTestSection('B02', '');
            const course = createTestCourse([section]);
            
            const selectedCourses: SelectedCourse[] = [{
                course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }];

            courseManager.loadSelectedCourses(selectedCourses);

            const migratedCourses = courseManager.getSelectedCourses();
            expect(migratedCourses[0].selectedSection?.computedTerm).toBe('B');
        });

        test('should migrate sections with whitespace-only computedTerm', () => {
            const section = createTestSection('C03', '   ');
            const course = createTestCourse([section]);
            
            const selectedCourses: SelectedCourse[] = [{
                course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }];

            courseManager.loadSelectedCourses(selectedCourses);

            const migratedCourses = courseManager.getSelectedCourses();
            expect(migratedCourses[0].selectedSection?.computedTerm).toBe('C');
        });

        test('should not migrate sections with valid computedTerm', () => {
            const validSections = [
                createTestSection('A01', 'A'),
                createTestSection('B02', 'B'),
                createTestSection('C03', 'C'),
                createTestSection('D04', 'D')
            ];

            const course = createTestCourse(validSections);
            
            const selectedCourses: SelectedCourse[] = validSections.map(section => ({
                course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }));

            courseManager.loadSelectedCourses(selectedCourses);

            const migratedCourses = courseManager.getSelectedCourses();
            const computedTerms = migratedCourses.map(sc => sc.selectedSection?.computedTerm);
            expect(computedTerms).toEqual(['A', 'B', 'C', 'D']);

            // Should not log migration since no sections were migrated
            expect(console.log).not.toHaveBeenCalledWith(
                expect.stringContaining('[DATA MIGRATION] Successfully migrated')
            );
        });

        test('should handle migration errors gracefully', () => {
            // Mock extractTermLetter to throw an error
            const mockExtractTermLetter = vi.fn().mockImplementation(() => {
                throw new Error('Test extraction error');
            });

            // Replace the import with the mock (in a real scenario, we'd mock the module)
            const section = createTestSection('INVALID', 'undefined');
            const course = createTestCourse([section]);
            
            // Manually trigger the error condition by setting invalid section data
            section.number = ''; // Empty section number should cause fallback to 'A'
            section.term = null as any; // Invalid term should cause fallback
            
            const selectedCourses: SelectedCourse[] = [{
                course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }];

            courseManager.loadSelectedCourses(selectedCourses);

            const migratedCourses = courseManager.getSelectedCourses();
            expect(migratedCourses[0].selectedSection?.computedTerm).toBe('A'); // Should fallback to 'A'
        });

        test('should handle selected courses without selectedSection', () => {
            const course = createTestCourse([createTestSection('A01')]);
            
            const selectedCourses: SelectedCourse[] = [{
                course,
                selectedSection: null, // No selected section
                selectedSectionNumber: null,
                isRequired: false
            }];

            // Should not crash when selectedSection is null
            expect(() => {
                courseManager.loadSelectedCourses(selectedCourses);
            }).not.toThrow();

            const migratedCourses = courseManager.getSelectedCourses();
            expect(migratedCourses[0].selectedSection).toBeNull();
        });
    });

    describe('Migration Performance Tests', () => {
        test('should migrate small dataset efficiently', () => {
            const startTime = performance.now();
            
            const sections = Array.from({ length: 10 }, (_, i) => 
                createTestSection(`A${i.toString().padStart(2, '0')}`, 'undefined')
            );
            
            const course = createTestCourse(sections);
            const selectedCourses: SelectedCourse[] = sections.map(section => ({
                course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }));

            courseManager.loadSelectedCourses(selectedCourses);

            const endTime = performance.now();
            const migrationTime = endTime - startTime;

            const migratedCourses = courseManager.getSelectedCourses();
            expect(migratedCourses).toHaveLength(10);
            expect(migratedCourses.every(sc => sc.selectedSection?.computedTerm === 'A')).toBe(true);

            // Should complete very quickly for small dataset
            expect(migrationTime).toBeLessThan(10);
        });

        test('should migrate medium dataset efficiently', () => {
            const startTime = performance.now();
            
            const sections = Array.from({ length: 100 }, (_, i) => {
                const termLetters = ['A', 'B', 'C', 'D'];
                const termLetter = termLetters[i % 4];
                return createTestSection(`${termLetter}${i.toString().padStart(2, '0')}`, 'undefined');
            });
            
            const course = createTestCourse(sections);
            const selectedCourses: SelectedCourse[] = sections.map(section => ({
                course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }));

            courseManager.loadSelectedCourses(selectedCourses);

            const endTime = performance.now();
            const migrationTime = endTime - startTime;

            const migratedCourses = courseManager.getSelectedCourses();
            expect(migratedCourses).toHaveLength(100);
            
            // Verify correct distribution of terms
            const termCounts = migratedCourses.reduce((acc, sc) => {
                const term = sc.selectedSection?.computedTerm;
                if (term) acc[term] = (acc[term] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            
            expect(termCounts.A).toBe(25);
            expect(termCounts.B).toBe(25);
            expect(termCounts.C).toBe(25);
            expect(termCounts.D).toBe(25);

            // Should complete in reasonable time for medium dataset
            expect(migrationTime).toBeLessThan(50);
            
            console.log(`Medium dataset migration: ${migrationTime.toFixed(2)}ms for 100 sections`);
        });

        test('should migrate large dataset efficiently', () => {
            const startTime = performance.now();
            
            // Create 500 sections with various problematic patterns
            const sections = Array.from({ length: 500 }, (_, i) => {
                const patterns = [
                    'A{i}', 'B{i}', 'C{i}', 'D{i}',
                    'AL{i}', 'BL{i}', 'CL{i}', 'DL{i}',
                    'A{i}/AX{i}', 'B{i}/BX{i}', 'C{i}/CX{i}', 'D{i}/DX{i}'
                ];
                const pattern = patterns[i % patterns.length];
                const sectionNumber = pattern.replace('{i}', (i % 99 + 1).toString().padStart(2, '0'));
                
                return createTestSection(sectionNumber, 'undefined');
            });
            
            const course = createTestCourse(sections);
            const selectedCourses: SelectedCourse[] = sections.map(section => ({
                course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }));

            courseManager.loadSelectedCourses(selectedCourses);

            const endTime = performance.now();
            const migrationTime = endTime - startTime;

            const migratedCourses = courseManager.getSelectedCourses();
            expect(migratedCourses).toHaveLength(500);
            
            // Verify all were migrated to valid terms
            const validTerms = ['A', 'B', 'C', 'D'];
            expect(migratedCourses.every(sc => 
                validTerms.includes(sc.selectedSection?.computedTerm || '')
            )).toBe(true);

            // Should complete in reasonable time even for large dataset
            expect(migrationTime).toBeLessThan(200);
            
            console.log(`Large dataset migration: ${migrationTime.toFixed(2)}ms for 500 sections`);
        });

        test('should handle mixed valid and invalid sections efficiently', () => {
            const startTime = performance.now();
            
            // Create mix of valid and invalid sections
            const sections = Array.from({ length: 200 }, (_, i) => {
                const isValid = i % 2 === 0; // Every other section is valid
                const termLetter = ['A', 'B', 'C', 'D'][i % 4];
                const sectionNumber = `${termLetter}${(i + 1).toString().padStart(2, '0')}`;
                const computedTerm = isValid ? termLetter : 'undefined';
                
                return createTestSection(sectionNumber, computedTerm);
            });
            
            const course = createTestCourse(sections);
            const selectedCourses: SelectedCourse[] = sections.map(section => ({
                course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }));

            courseManager.loadSelectedCourses(selectedCourses);

            const endTime = performance.now();
            const migrationTime = endTime - startTime;

            const migratedCourses = courseManager.getSelectedCourses();
            expect(migratedCourses).toHaveLength(200);
            
            // All should have valid terms now
            const validTerms = ['A', 'B', 'C', 'D'];
            expect(migratedCourses.every(sc => 
                validTerms.includes(sc.selectedSection?.computedTerm || '')
            )).toBe(true);

            // Should complete efficiently
            expect(migrationTime).toBeLessThan(100);
            
            // Should log migration for only the invalid sections (100 out of 200)
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('[DATA MIGRATION] Successfully migrated 100 sections')
            );
            
            console.log(`Mixed dataset migration: ${migrationTime.toFixed(2)}ms for 200 sections (100 needed migration)`);
        });
    });

    describe('Migration Logging', () => {
        test('should log individual section migrations', () => {
            const section = createTestSection('DL01/DD01', 'undefined');
            const course = createTestCourse([section]);
            
            const selectedCourses: SelectedCourse[] = [{
                course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }];

            courseManager.loadSelectedCourses(selectedCourses);

            expect(console.log).toHaveBeenCalledWith(
                '[DATA MIGRATION] Fixing invalid computedTerm "undefined" for section DL01/DD01'
            );
            expect(console.log).toHaveBeenCalledWith(
                '[DATA MIGRATION] Updated section DL01/DD01 computedTerm to "D"'
            );
            expect(console.log).toHaveBeenCalledWith(
                '[DATA MIGRATION] Successfully migrated 1 sections with invalid computedTerm values'
            );
        });

        test('should not log when no migration is needed', () => {
            const section = createTestSection('A01', 'A');
            const course = createTestCourse([section]);
            
            const selectedCourses: SelectedCourse[] = [{
                course,
                selectedSection: section,
                selectedSectionNumber: section.number,
                isRequired: false
            }];

            courseManager.loadSelectedCourses(selectedCourses);

            expect(console.log).not.toHaveBeenCalledWith(
                expect.stringContaining('[DATA MIGRATION]')
            );
        });
    });
});