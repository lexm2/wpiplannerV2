import { describe, test, expect, beforeEach } from 'bun:test';
import { SearchTextFilter } from '../../../src/core/filtering/filters/SearchTextFilter';
import { FilterableSection } from '../../../src/types/filterableUnit';
import { SectionType } from '../../../src/types/types';
import { createMockCourse, createMockSection, createMockDepartment } from '../../helpers/mockData';

describe('SearchTextFilter', () => {
    let searchTextFilter: SearchTextFilter;

    beforeEach(() => {
        searchTextFilter = new SearchTextFilter();
    });

    test('should implement SectionBasedFilter interface correctly', () => {
        expect(searchTextFilter.id).toBe('searchText');
        expect(searchTextFilter.name).toBe('Search Text');
        expect(searchTextFilter.description).toBe('Filter courses by search text');
        expect(searchTextFilter.priority).toBe(1);

        expect(typeof searchTextFilter.apply).toBe('function');
        expect(typeof searchTextFilter.isValidCriteria).toBe('function');
        expect(typeof searchTextFilter.getDisplayValue).toBe('function');
    });

    describe('isValidCriteria', () => {
        test('should validate correct criteria', () => {
            expect(searchTextFilter.isValidCriteria({ query: 'test' })).toBe(true);
            expect(searchTextFilter.isValidCriteria({ query: '' })).toBe(true);
            expect(searchTextFilter.isValidCriteria({ query: 'CS 1101' })).toBe(true);
        });

        test('should reject invalid criteria', () => {
            expect(searchTextFilter.isValidCriteria(null)).toBe(false);
            expect(searchTextFilter.isValidCriteria(undefined)).toBe(false);
            expect(searchTextFilter.isValidCriteria({})).toBe(false);
            expect(searchTextFilter.isValidCriteria({ query: 123 })).toBe(false);
            expect(searchTextFilter.isValidCriteria({ something: 'else' })).toBe(false);
        });
    });

    describe('getDisplayValue', () => {
        test('should format search query', () => {
            expect(searchTextFilter.getDisplayValue({ query: 'test' })).toBe('"test"');
            expect(searchTextFilter.getDisplayValue({ query: 'CS 1101' })).toBe('"CS 1101"');
        });

        test('should trim whitespace in display', () => {
            expect(searchTextFilter.getDisplayValue({ query: '  test  ' })).toBe('"test"');
            expect(searchTextFilter.getDisplayValue({ query: ' programming ' })).toBe('"programming"');
        });
    });

    describe('apply', () => {
        const createFilterableSection = (courseOverrides = {}, sectionOverrides = {}): FilterableSection => {
            const dept = createMockDepartment({ abbreviation: 'CS', name: 'Computer Science' });
            const course = createMockCourse({
                id: 'CS-1101',
                number: '1101',
                name: 'Introduction to Programming Design',
                description: 'An introduction to the design and analysis of algorithms and data structures.',
                department: dept,
                ...courseOverrides
            });
            const section = createMockSection(sectionOverrides);

            return {
                course,
                section,
                sectionType: SectionType.LECTURE
            };
        };

        test('should return all sections when query is empty', () => {
            const sections = [
                createFilterableSection(),
                createFilterableSection({ id: 'MA-1021', number: '1021' })
            ];

            const result = searchTextFilter.apply(sections, { query: '' });
            expect(result).toHaveLength(2);
            expect(result).toEqual(sections);
        });

        test('should return all sections when query is only whitespace', () => {
            const sections = [
                createFilterableSection(),
                createFilterableSection({ id: 'MA-1021', number: '1021' })
            ];

            const result = searchTextFilter.apply(sections, { query: '   ' });
            expect(result).toHaveLength(2);
            expect(result).toEqual(sections);
        });

        test('should filter by course number', () => {
            const cs1101 = createFilterableSection();
            const ma1021 = createFilterableSection({
                id: 'MA-1021',
                number: '1021',
                name: 'Calculus I'
            });
            const sections = [cs1101, ma1021];

            const result = searchTextFilter.apply(sections, { query: '1101' });
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(cs1101);
        });

        test('should filter by course code (department + number)', () => {
            const cs1101 = createFilterableSection();
            const ma1021 = createFilterableSection({
                id: 'MA-1021',
                number: '1021',
                name: 'Calculus I',
                department: createMockDepartment({ abbreviation: 'MA', name: 'Mathematical Sciences' })
            });
            const sections = [cs1101, ma1021];

            const resultCS = searchTextFilter.apply(sections, { query: 'CS1101' });
            expect(resultCS).toHaveLength(1);
            expect(resultCS[0]).toEqual(cs1101);

            const resultMA = searchTextFilter.apply(sections, { query: 'MA1021' });
            expect(resultMA).toHaveLength(1);
            expect(resultMA[0]).toEqual(ma1021);
        });

        test('should filter by course name', () => {
            const programming = createFilterableSection({
                name: 'Introduction to Programming Design'
            });
            const calculus = createFilterableSection({
                id: 'MA-1021',
                number: '1021',
                name: 'Calculus I',
                department: createMockDepartment({ abbreviation: 'MA', name: 'Mathematical Sciences' })
            });
            const sections = [programming, calculus];

            const result = searchTextFilter.apply(sections, { query: 'programming' });
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(programming);
        });

        test('should filter by course description', () => {
            const algorithms = createFilterableSection({
                description: 'An introduction to the design and analysis of algorithms and data structures.'
            });
            const calculus = createFilterableSection({
                id: 'MA-1021',
                number: '1021',
                name: 'Calculus I',
                description: 'Limits, derivatives, and integrals.',
                department: createMockDepartment({ abbreviation: 'MA', name: 'Mathematical Sciences' })
            });
            const sections = [algorithms, calculus];

            const result = searchTextFilter.apply(sections, { query: 'algorithms' });
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(algorithms);
        });

        test('should filter by department name', () => {
            const csSection = createFilterableSection();
            const maSection = createFilterableSection({
                id: 'MA-1021',
                number: '1021',
                name: 'Calculus I',
                department: createMockDepartment({ abbreviation: 'MA', name: 'Mathematical Sciences' })
            });
            const sections = [csSection, maSection];

            const result = searchTextFilter.apply(sections, { query: 'mathematical' });
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(maSection);
        });

        test('should be case insensitive', () => {
            const section = createFilterableSection({
                name: 'Introduction to Programming Design'
            });
            const sections = [section];

            expect(searchTextFilter.apply(sections, { query: 'PROGRAMMING' })).toHaveLength(1);
            expect(searchTextFilter.apply(sections, { query: 'Programming' })).toHaveLength(1);
            expect(searchTextFilter.apply(sections, { query: 'programming' })).toHaveLength(1);
        });

        test('should handle multiple word queries', () => {
            const section = createFilterableSection({
                name: 'Introduction to Programming Design',
                description: 'Learn programming and design patterns'
            });
            const sections = [section];

            const result = searchTextFilter.apply(sections, { query: 'programming design' });
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(section);
        });

        test('should use fuzzy matching for short queries', () => {
            const section = createFilterableSection({
                name: 'Introduction to Programming Design'
            });
            const sections = [section];

            // Short queries (<=3 chars) should use exact includes
            const result = searchTextFilter.apply(sections, { query: 'pro' });
            expect(result).toHaveLength(1);
        });

        test('should use fuzzy matching for longer queries', () => {
            const section = createFilterableSection({
                name: 'Introduction to Programming Design'
            });
            const sections = [section];

            // Longer queries allow partial matches (80% of word length)
            const result = searchTextFilter.apply(sections, { query: 'progra' });
            expect(result).toHaveLength(1);
        });

        test('should handle multi-word fuzzy matching', () => {
            const section = createFilterableSection({
                name: 'Advanced Database Management Systems',
                description: 'Study of database systems and management techniques'
            });
            const sections = [section];

            // Each word should match with fuzzy logic
            const result = searchTextFilter.apply(sections, { query: 'databa manage' });
            expect(result).toHaveLength(1);
        });

        test('should filter out non-matching sections', () => {
            const cs1101 = createFilterableSection({
                name: 'Introduction to Programming Design'
            });
            const ma1021 = createFilterableSection({
                id: 'MA-1021',
                number: '1021',
                name: 'Calculus I',
                description: 'Limits, derivatives, and integrals.',
                department: createMockDepartment({ abbreviation: 'MA', name: 'Mathematical Sciences' })
            });
            const sections = [cs1101, ma1021];

            const result = searchTextFilter.apply(sections, { query: 'physics' });
            expect(result).toHaveLength(0);
        });

        test('should search by course ID', () => {
            const section = createFilterableSection({
                id: 'CS-1101'
            });
            const sections = [section];

            const result = searchTextFilter.apply(sections, { query: 'CS-1101' });
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(section);
        });

        test('should handle special characters in query', () => {
            const section = createFilterableSection({
                name: 'C++ Programming',
                description: 'Learn C++ and object-oriented design'
            });
            const sections = [section];

            const result = searchTextFilter.apply(sections, { query: 'c++' });
            expect(result).toHaveLength(1);
        });

        test('should match partial department abbreviation', () => {
            const csSection = createFilterableSection();
            const sections = [csSection];

            const result = searchTextFilter.apply(sections, { query: 'cs' });
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(csSection);
        });
    });
});
