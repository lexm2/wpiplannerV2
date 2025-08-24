import { describe, test, expect } from 'vitest';
import { SectionCodeFilter } from '../../../src/core/filters/SectionCodeFilter';

describe('SectionCodeFilter', () => {
    let sectionCodeFilter: SectionCodeFilter;

    beforeEach(() => {
        sectionCodeFilter = new SectionCodeFilter();
    });

    test('should implement CourseFilter interface correctly', () => {
        expect(sectionCodeFilter.id).toBe('sectionCode');
        expect(sectionCodeFilter.name).toBe('Section Code');
        expect(sectionCodeFilter.description).toBe('Filter by section codes (AL01, AX01, A01, etc.)');
        
        expect(typeof sectionCodeFilter.apply).toBe('function');
        expect(typeof sectionCodeFilter.isValidCriteria).toBe('function');
        expect(typeof sectionCodeFilter.getDisplayValue).toBe('function');
    });

    test('isValidCriteria should work correctly', () => {
        expect(sectionCodeFilter.isValidCriteria({ codes: ['AL01', 'AX01'] })).toBe(true);
        expect(sectionCodeFilter.isValidCriteria({ codes: [] })).toBe(true);
        expect(sectionCodeFilter.isValidCriteria({ codes: ['A01'] })).toBe(true);
        
        // Invalid cases
        expect(sectionCodeFilter.isValidCriteria(null)).toBe(false);
        expect(sectionCodeFilter.isValidCriteria(undefined)).toBe(false);
        expect(sectionCodeFilter.isValidCriteria({})).toBe(false);
        expect(sectionCodeFilter.isValidCriteria({ codes: 'AL01' })).toBe(false);
        expect(sectionCodeFilter.isValidCriteria({ codes: [123] })).toBe(false);
        expect(sectionCodeFilter.isValidCriteria({ something: 'else' })).toBe(false);
    });

    test('getDisplayValue should work correctly', () => {
        expect(sectionCodeFilter.getDisplayValue({ codes: [] })).toBe('No section codes');
        expect(sectionCodeFilter.getDisplayValue({ codes: ['AL01'] })).toBe('Section: AL01');
        expect(sectionCodeFilter.getDisplayValue({ codes: ['AL01', 'AX01'] })).toBe('Sections: AL01, AX01');
        expect(sectionCodeFilter.getDisplayValue({ codes: ['A01', 'B01', 'C01'] })).toBe('Sections: A01, B01, C01');
    });

    test('apply method should return all courses (section filtering happens elsewhere)', () => {
        const courses = []; // Empty courses array for testing
        const result = sectionCodeFilter.apply(courses, { codes: ['AL01'] });
        expect(result).toEqual(courses);
    });
});