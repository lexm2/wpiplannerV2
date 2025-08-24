import { describe, test, expect, beforeEach } from 'vitest';
import { PeriodTermFilter } from '../../../src/core/filters/PeriodTermFilter';
import { Section } from '../../../src/types/types';

describe('PeriodTermFilter', () => {
    let periodTermFilter: PeriodTermFilter;

    beforeEach(() => {
        periodTermFilter = new PeriodTermFilter();
    });

    test('should implement CourseFilter interface correctly', () => {
        expect(periodTermFilter.id).toBe('periodTerm');
        expect(periodTermFilter.name).toBe('Term');
        expect(periodTermFilter.description).toBe('Show sections from selected academic terms');
        
        expect(typeof periodTermFilter.apply).toBe('function');
        expect(typeof periodTermFilter.isValidCriteria).toBe('function');
        expect(typeof periodTermFilter.getDisplayValue).toBe('function');
    });

    describe('isValidCriteria', () => {
        test('should validate correct criteria', () => {
            expect(periodTermFilter.isValidCriteria({ terms: ['A', 'B'] })).toBe(true);
            expect(periodTermFilter.isValidCriteria({ terms: [] })).toBe(true);
            expect(periodTermFilter.isValidCriteria({ terms: ['A'] })).toBe(true);
        });

        test('should reject invalid criteria', () => {
            expect(periodTermFilter.isValidCriteria(null)).toBe(false);
            expect(periodTermFilter.isValidCriteria(undefined)).toBe(false);
            expect(periodTermFilter.isValidCriteria({})).toBe(false);
            expect(periodTermFilter.isValidCriteria({ terms: 'A' })).toBe(false);
            expect(periodTermFilter.isValidCriteria({ terms: [123] })).toBe(false);
            expect(periodTermFilter.isValidCriteria({ something: 'else' })).toBe(false);
        });
    });

    describe('normalizeTerm', () => {
        test('should normalize terms to uppercase', () => {
            expect(periodTermFilter.normalizeTerm('a')).toBe('A');
            expect(periodTermFilter.normalizeTerm('A')).toBe('A');
            expect(periodTermFilter.normalizeTerm('b')).toBe('B');
            expect(periodTermFilter.normalizeTerm('B')).toBe('B');
        });

        test('should handle whitespace', () => {
            expect(periodTermFilter.normalizeTerm('  A  ')).toBe('A');
            expect(periodTermFilter.normalizeTerm(' b ')).toBe('B');
            expect(periodTermFilter.normalizeTerm('\tC\t')).toBe('C');
        });

        test('should handle empty or null terms', () => {
            expect(periodTermFilter.normalizeTerm('')).toBe('');
            expect(periodTermFilter.normalizeTerm(null as any)).toBe('');
            expect(periodTermFilter.normalizeTerm(undefined as any)).toBe('');
        });
    });

    describe('getDisplayValue', () => {
        test('should format single term selection', () => {
            expect(periodTermFilter.getDisplayValue({ terms: ['A'] })).toBe('Term: A Term');
            expect(periodTermFilter.getDisplayValue({ terms: ['B'] })).toBe('Term: B Term');
        });

        test('should format multiple terms selection', () => {
            expect(periodTermFilter.getDisplayValue({ terms: ['A', 'B'] })).toBe('Terms: A Term, B Term');
            expect(periodTermFilter.getDisplayValue({ terms: ['A', 'B', 'C'] })).toBe('Terms: A Term, B Term, C Term');
        });

        test('should handle empty terms', () => {
            expect(periodTermFilter.getDisplayValue({ terms: [] })).toBe('All terms');
        });

        test('should handle unknown terms', () => {
            expect(periodTermFilter.getDisplayValue({ terms: ['X'] })).toBe('Term: X');
            expect(periodTermFilter.getDisplayValue({ terms: ['CUSTOM'] })).toBe('Term: CUSTOM');
        });

        test('should format mixed known and unknown terms', () => {
            expect(periodTermFilter.getDisplayValue({ terms: ['A', 'CUSTOM'] })).toBe('Terms: A Term, CUSTOM');
        });

        test('should handle case variations', () => {
            expect(periodTermFilter.getDisplayValue({ terms: ['a'] })).toBe('Term: A Term');
            expect(periodTermFilter.getDisplayValue({ terms: ['b', 'C'] })).toBe('Terms: B Term, C Term');
        });
    });

    describe('applyToSections - Inclusion Logic', () => {
        const createSectionItem = (term: string, sectionNumber: string = 'A01'): { course: any, section: Section } => ({
            course: { 
                id: 'CS-101',
                course: { 
                    id: 'CS-101',
                    name: 'Test Course'
                }
            },
            section: {
                crn: 12345,
                number: sectionNumber,
                seats: 30,
                seatsAvailable: 5,
                actualWaitlist: 0,
                maxWaitlist: 10,
                description: 'Test section',
                term: term,
                computedTerm: term,
                periods: []
            } as Section
        });

        test('should return all sections when no terms are selected', () => {
            const sections = [
                createSectionItem('A'),
                createSectionItem('B'),
                createSectionItem('C')
            ];

            const result = periodTermFilter.applyToSections(sections, { terms: [] });
            expect(result).toHaveLength(3);
            expect(result).toEqual(sections);
        });

        test('should include sections from A term only', () => {
            const aTermSection = createSectionItem('A', 'A01');
            const bTermSection = createSectionItem('B', 'B01');
            const cTermSection = createSectionItem('C', 'C01');

            const sections = [aTermSection, bTermSection, cTermSection];

            const result = periodTermFilter.applyToSections(sections, { terms: ['A'] });

            // Should include only A term section
            expect(result).toHaveLength(1);
            expect(result).toContain(aTermSection);
            expect(result).not.toContain(bTermSection);
            expect(result).not.toContain(cTermSection);
        });

        test('should include sections from multiple selected terms', () => {
            const aTermSection = createSectionItem('A', 'A01');
            const bTermSection = createSectionItem('B', 'B01');
            const cTermSection = createSectionItem('C', 'C01');
            const dTermSection = createSectionItem('D', 'D01');

            const sections = [aTermSection, bTermSection, cTermSection, dTermSection];

            const result = periodTermFilter.applyToSections(sections, { terms: ['A', 'C'] });

            // Should include A and C term sections
            expect(result).toHaveLength(2);
            expect(result).toContain(aTermSection);
            expect(result).not.toContain(bTermSection);
            expect(result).toContain(cTermSection);
            expect(result).not.toContain(dTermSection);
        });

        test('should handle case insensitive term matching', () => {
            const sections = [
                createSectionItem('A'),
                createSectionItem('b'),
                createSectionItem('C')
            ];

            const result = periodTermFilter.applyToSections(sections, { terms: ['a', 'B'] });

            // Should match regardless of case
            expect(result).toHaveLength(2);
            expect(result.map(r => r.section.computedTerm)).toEqual(['A', 'b']);
        });

        test('should handle whitespace in term values', () => {
            const sections = [
                createSectionItem(' A '),
                createSectionItem('\tB\t'),
                createSectionItem('C')
            ];

            const result = periodTermFilter.applyToSections(sections, { terms: ['A', 'B'] });

            // Should match after normalization
            expect(result).toHaveLength(2);
            expect(result.map(r => r.section.computedTerm.trim())).toEqual(['A', 'B']);
        });

        test('should return empty array when no sections match selected terms', () => {
            const sections = [
                createSectionItem('A'),
                createSectionItem('B'),
                createSectionItem('C')
            ];

            const result = periodTermFilter.applyToSections(sections, { terms: ['X', 'Y'] });

            // Should return empty array for non-matching terms
            expect(result).toHaveLength(0);
        });

        test('should handle sections with empty or undefined terms', () => {
            const validSection = createSectionItem('A');
            const emptyTermSection = createSectionItem('');
            const sections = [validSection, emptyTermSection];

            const result = periodTermFilter.applyToSections(sections, { terms: ['A'] });

            // Should include only section with matching term
            expect(result).toHaveLength(1);
            expect(result).toContain(validSection);
        });

        test('should handle all terms being selected', () => {
            const sections = [
                createSectionItem('A'),
                createSectionItem('B'), 
                createSectionItem('C'),
                createSectionItem('D')
            ];

            const result = periodTermFilter.applyToSections(sections, { terms: ['A', 'B', 'C', 'D'] });

            // Should include all sections
            expect(result).toHaveLength(4);
            expect(result).toEqual(sections);
        });
    });

    describe('Section-Level Integration', () => {
        test('should provide correct inclusion behavior for section filtering', () => {
            const aTermSections = [
                { section: { term: 'A', computedTerm: 'A' } },
                { section: { term: 'A', computedTerm: 'A' } }
            ];

            const bTermSections = [
                { section: { term: 'B', computedTerm: 'B' } },
                { section: { term: 'B', computedTerm: 'B' } }
            ];

            // When filtering sections, only sections matching selected terms should be included
            const aTermResult = periodTermFilter.applyToSections(aTermSections, { terms: ['A'] });
            const bTermResult = periodTermFilter.applyToSections(bTermSections, { terms: ['A'] });

            // A term sections should all be included
            expect(aTermResult.length).toBe(aTermSections.length);
            
            // B term sections should be excluded when filtering for A term
            expect(bTermResult.length).toBe(0);
        });
    });

    test('apply method should return all courses (filtering happens in service)', () => {
        const courses: any[] = [];
        const result = periodTermFilter.apply(courses, { terms: ['A'] });
        expect(result).toEqual(courses);
    });
});