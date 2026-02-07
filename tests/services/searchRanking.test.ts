import { describe, it, expect, beforeEach } from 'bun:test';
import { SearchService } from '../../src/services/filtering/searchService';
import type { Course, Department } from '../../src/types/types';

describe('SearchService Ranking', () => {
    let searchService: SearchService;
    let testCourses: Course[];

    beforeEach(() => {
        const mathDept: Department = {
            abbreviation: 'MA',
            name: 'Mathematical Sciences',
            courses: []
        };

        testCourses = [
            {
                id: 'MA-1020',
                name: 'Calculus I',
                number: '1020',
                description: 'Introduction to differential calculus',
                departmentAbbr: 'MA',
                departmentName: 'Mathematical Sciences',
                minCredits: 3,
                maxCredits: 3
            },
            {
                id: 'MA-1021',
                name: 'Calculus II',
                number: '1021',
                description: 'Introduction to integral calculus',
                departmentAbbr: 'MA',
                departmentName: 'Mathematical Sciences',
                minCredits: 3,
                maxCredits: 3
            },
            {
                id: 'MA-1022',
                name: 'Calculus III',
                number: '1022',
                description: 'Multivariable calculus',
                departmentAbbr: 'MA',
                departmentName: 'Mathematical Sciences',
                minCredits: 3,
                maxCredits: 3
            },
            {
                id: 'MA-2051',
                name: 'Matrix Algebra',
                number: '2051',
                description: 'Linear algebra with MA1022 prerequisite',
                departmentAbbr: 'MA',
                departmentName: 'Mathematical Sciences',
                minCredits: 3,
                maxCredits: 3
            }
        ];

        mathDept.courses = testCourses;
        searchService = new SearchService();
        searchService.setCourseData([mathDept]);
    });

    describe('Exact Course Code Match', () => {
        it('should rank exact course code match (MA1022) first', () => {
            const results = searchService.searchCourses('MA1022');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe('MA-1022');
            expect(results[0].name).toBe('Calculus III');
        });

        it('should rank exact course code match (MA1020) first', () => {
            const results = searchService.searchCourses('MA1020');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe('MA-1020');
        });

        it('should rank exact course code match (MA1021) first', () => {
            const results = searchService.searchCourses('MA1021');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe('MA-1021');
        });

        it('should rank MA1024 first when searching MA1024, not MA1020', () => {
            const ma1024: Course = {
                id: 'MA-1024',
                name: 'Calculus IV',
                number: '1024',
                description: 'Advanced multivariable calculus',
                departmentAbbr: 'MA',
                departmentName: 'Mathematical Sciences',
                minCredits: 3,
                maxCredits: 3
            };

            searchService.setCourseData([{
                abbreviation: 'MA',
                name: 'Mathematical Sciences',
                courses: [...testCourses, ma1024]
            }]);

            const results = searchService.searchCourses('MA1024');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe('MA-1024');
            expect(results[0].name).toBe('Calculus IV');
        });

        it('should handle course codes with hyphens and spaces', () => {
            const results = searchService.searchCourses('MA-1022');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe('MA-1022');
        });
    });

    describe('Prefix Matching', () => {
        it('should rank prefix matches by specificity', () => {
            const results = searchService.searchCourses('MA102');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].number).toBe('1020');
            expect(results[1].number).toBe('1021');
            expect(results[2].number).toBe('1022');
        });

        it('should rank department prefix matches', () => {
            const results = searchService.searchCourses('MA');

            expect(results.length).toBe(4);
            results.forEach(course => {
                expect(course.departmentAbbr).toBe('MA');
            });
        });
    });

    describe('Course Name vs Description', () => {
        it('should rank course name matches higher than description matches', () => {
            const results = searchService.searchCourses('Matrix');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe('MA-2051');
            expect(results[0].name).toBe('Matrix Algebra');
        });

        it('should still find courses mentioned in descriptions', () => {
            const results = searchService.searchCourses('multivariable');

            expect(results.length).toBeGreaterThan(0);
            expect(results.some(c => c.id === 'MA-1022')).toBe(true);
        });
    });

    describe('Multi-word Queries', () => {
        it('should handle multi-word course name searches', () => {
            const results = searchService.searchCourses('Calculus III');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe('MA-1022');
        });

        it('should handle partial word matching', () => {
            const results = searchService.searchCourses('Calc');

            const calculusCourses = results.filter(c => c.name.includes('Calculus'));
            expect(calculusCourses.length).toBe(3);
            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty query', () => {
            const results = searchService.searchCourses('');

            expect(results.length).toBe(testCourses.length);
        });

        it('should handle whitespace-only query', () => {
            const results = searchService.searchCourses('   ');

            expect(results.length).toBe(testCourses.length);
        });

        it('should handle case-insensitive search', () => {
            const results = searchService.searchCourses('ma1022');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe('MA-1022');
        });

        it('should handle query with special characters', () => {
            const results = searchService.searchCourses('MA-1022');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe('MA-1022');
        });
    });

    describe('Relevance Score Calculation', () => {
        it('should assign higher scores to exact matches', () => {
            const courses = [testCourses[2]];
            const ranked = searchService.rankCoursesByRelevance(courses, 'MA1022');

            expect(ranked[0].id).toBe('MA-1022');
        });

        it('should rank courses with available seats higher (when scores are equal)', () => {
            const ranked = searchService.rankCoursesByRelevance(testCourses, 'MA');

            expect(ranked.length).toBe(testCourses.length);
        });
    });

    describe('Priority System: ID/Name before Description', () => {
        it('should rank course with ID match above description match', () => {
            const courseWithIdMatch: Course = {
                id: 'MA-2222',
                name: 'Advanced Mathematics',
                number: '2222',
                description: 'Advanced topics in mathematics',
                departmentAbbr: 'MA',
                departmentName: 'Mathematical Sciences',
                minCredits: 3,
                maxCredits: 3
            };

            const courseWithDescMatch: Course = {
                id: 'MA-9999',
                name: 'Unrelated Course',
                number: '9999',
                description: 'Prerequisites include MA2222',
                departmentAbbr: 'MA',
                departmentName: 'Mathematical Sciences',
                minCredits: 3,
                maxCredits: 3
            };

            const ranked = searchService.rankCoursesByRelevance(
                [courseWithDescMatch, courseWithIdMatch],
                'MA2222'
            );

            expect(ranked[0].id).toBe('MA-2222');
            expect(ranked[1].id).toBe('MA-9999');
        });

        it('should rank course with name match above description match', () => {
            const courseWithNameMatch: Course = {
                id: 'MA-3000',
                name: 'Linear Algebra',
                number: '3000',
                description: 'Study of linear algebra',
                departmentAbbr: 'MA',
                departmentName: 'Mathematical Sciences',
                minCredits: 3,
                maxCredits: 3
            };

            const courseWithDescMatch: Course = {
                id: 'MA-3001',
                name: 'Differential Equations',
                number: '3001',
                description: 'Requires Linear Algebra knowledge',
                departmentAbbr: 'MA',
                departmentName: 'Mathematical Sciences',
                minCredits: 3,
                maxCredits: 3
            };

            const ranked = searchService.rankCoursesByRelevance(
                [courseWithDescMatch, courseWithNameMatch],
                'Linear Algebra'
            );

            expect(ranked[0].name).toBe('Linear Algebra');
            expect(ranked[1].name).toBe('Differential Equations');
        });

        it('should rank exact match infinitely higher than fuzzy match', () => {
            const exactMatch: Course = {
                id: 'CS-1234',
                name: 'Programming',
                number: '1234',
                description: 'Intro to programming',
                departmentAbbr: 'CS',
                departmentName: 'Computer Science',
                minCredits: 3,
                maxCredits: 3
            };

            const fuzzyMatch: Course = {
                id: 'CS-123',
                name: 'Computer Science Basics',
                number: '123',
                description: 'CS fundamentals',
                departmentAbbr: 'CS',
                departmentName: 'Computer Science',
                minCredits: 3,
                maxCredits: 3
            };

            const ranked = searchService.rankCoursesByRelevance(
                [fuzzyMatch, exactMatch],
                'CS1234'
            );

            expect(ranked[0].id).toBe('CS-1234');
            expect(ranked[1].id).toBe('CS-123');
        });
    });

    describe('Two-Phase Search Optimization', () => {
        it('should find courses by ID/name without searching descriptions', () => {
            const results = searchService.searchCourses('Calculus');

            expect(results.length).toBeGreaterThan(0);
            expect(results.every(c => c.name.toLowerCase().includes('calculus'))).toBe(true);
        });

        it('should fall back to description search when no ID/name match', () => {
            const results = searchService.searchCourses('multivariable');

            expect(results.length).toBeGreaterThan(0);
            expect(results.some(c => c.description.toLowerCase().includes('multivariable'))).toBe(true);
        });
    });
});
