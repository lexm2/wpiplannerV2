import { describe, test, expect, beforeEach } from 'vitest';
import { PeriodTypeFilter } from '../../../src/core/filters/PeriodTypeFilter';
import { Period } from '../../../src/types/types';

describe('PeriodTypeFilter', () => {
    let periodTypeFilter: PeriodTypeFilter;

    beforeEach(() => {
        periodTypeFilter = new PeriodTypeFilter();
    });

    test('should implement CourseFilter interface correctly', () => {
        expect(periodTypeFilter.id).toBe('periodType');
        expect(periodTypeFilter.name).toBe('Period Type');
        expect(periodTypeFilter.description).toBe('Exclude sections with selected period types');
        
        expect(typeof periodTypeFilter.apply).toBe('function');
        expect(typeof periodTypeFilter.isValidCriteria).toBe('function');
        expect(typeof periodTypeFilter.getDisplayValue).toBe('function');
    });

    describe('isValidCriteria', () => {
        test('should validate correct criteria', () => {
            expect(periodTypeFilter.isValidCriteria({ types: ['lecture', 'lab'] })).toBe(true);
            expect(periodTypeFilter.isValidCriteria({ types: [] })).toBe(true);
            expect(periodTypeFilter.isValidCriteria({ types: ['lab'] })).toBe(true);
        });

        test('should reject invalid criteria', () => {
            expect(periodTypeFilter.isValidCriteria(null)).toBe(false);
            expect(periodTypeFilter.isValidCriteria(undefined)).toBe(false);
            expect(periodTypeFilter.isValidCriteria({})).toBe(false);
            expect(periodTypeFilter.isValidCriteria({ types: 'lab' })).toBe(false);
            expect(periodTypeFilter.isValidCriteria({ types: [123] })).toBe(false);
            expect(periodTypeFilter.isValidCriteria({ something: 'else' })).toBe(false);
        });
    });

    describe('normalizeType', () => {
        test('should normalize lecture variations', () => {
            expect(periodTypeFilter.normalizeType('Lecture')).toBe('lecture');
            expect(periodTypeFilter.normalizeType('LEC')).toBe('lecture');
            expect(periodTypeFilter.normalizeType('lec')).toBe('lecture');
            expect(periodTypeFilter.normalizeType('lecture')).toBe('lecture');
        });

        test('should normalize lab variations', () => {
            expect(periodTypeFilter.normalizeType('Lab')).toBe('lab');
            expect(periodTypeFilter.normalizeType('LAB')).toBe('lab');
            expect(periodTypeFilter.normalizeType('laboratory')).toBe('lab');
        });

        test('should normalize discussion variations', () => {
            expect(periodTypeFilter.normalizeType('Discussion')).toBe('discussion');
            expect(periodTypeFilter.normalizeType('DIS')).toBe('discussion');
            expect(periodTypeFilter.normalizeType('dis')).toBe('discussion');
        });

        test('should normalize other common types', () => {
            expect(periodTypeFilter.normalizeType('Recitation')).toBe('recitation');
            expect(periodTypeFilter.normalizeType('REC')).toBe('recitation');
            expect(periodTypeFilter.normalizeType('Seminar')).toBe('seminar');
            expect(periodTypeFilter.normalizeType('SEM')).toBe('seminar');
            expect(periodTypeFilter.normalizeType('Studio')).toBe('studio');
            expect(periodTypeFilter.normalizeType('Conference')).toBe('conference');
            expect(periodTypeFilter.normalizeType('CONF')).toBe('conference');
        });

        test('should handle unknown types', () => {
            expect(periodTypeFilter.normalizeType('Unknown')).toBe('unknown');
            expect(periodTypeFilter.normalizeType('CUSTOM')).toBe('custom');
        });

        test('should handle whitespace and case variations', () => {
            expect(periodTypeFilter.normalizeType('  Lecture  ')).toBe('lecture');
            expect(periodTypeFilter.normalizeType('LAB ')).toBe('lab');
            expect(periodTypeFilter.normalizeType(' discussion')).toBe('discussion');
        });
    });

    describe('getDisplayValue', () => {
        test('should format single type exclusion', () => {
            expect(periodTypeFilter.getDisplayValue({ types: ['lab'] })).toBe('Exclude: Lab');
            expect(periodTypeFilter.getDisplayValue({ types: ['lecture'] })).toBe('Exclude: Lecture');
        });

        test('should format multiple types exclusion', () => {
            expect(periodTypeFilter.getDisplayValue({ types: ['lab', 'discussion'] })).toBe('Exclude: Lab, Discussion');
            expect(periodTypeFilter.getDisplayValue({ types: ['lecture', 'lab', 'seminar'] })).toBe('Exclude: Lecture, Lab, Seminar');
        });

        test('should handle empty exclusion', () => {
            expect(periodTypeFilter.getDisplayValue({ types: [] })).toBe('No exclusions');
        });

        test('should format type names properly', () => {
            expect(periodTypeFilter.getDisplayValue({ types: ['lec'] })).toBe('Exclude: Lecture');
            expect(periodTypeFilter.getDisplayValue({ types: ['LAB'] })).toBe('Exclude: Lab');
            expect(periodTypeFilter.getDisplayValue({ types: ['discussion', 'REC'] })).toBe('Exclude: Discussion, Recitation');
        });
    });

    describe('applyToPeriods - Exclusion Logic', () => {
        const createPeriod = (type: string): Period => ({
            type,
            professor: 'Prof Smith',
            startTime: { hours: 9, minutes: 0 },
            endTime: { hours: 10, minutes: 50 },
            days: new Set(['mon', 'wed', 'fri']),
            location: 'SL 123',
            building: 'SL',
            room: '123',
            seats: 30,
            seatsAvailable: 5,
            actualWaitlist: 0,
            maxWaitlist: 10
        });

        test('should return all periods when no types are excluded', () => {
            const periods = [
                createPeriod('Lecture'),
                createPeriod('Lab'),
                createPeriod('Discussion')
            ];

            const result = periodTypeFilter.applyToPeriods(periods, { types: [] });
            expect(result).toHaveLength(3);
            expect(result).toEqual(periods);
        });

        test('should exclude Lab periods', () => {
            const lecturePeriod = createPeriod('Lecture');
            const labPeriod = createPeriod('Lab');
            const discussionPeriod = createPeriod('Discussion');

            const periods = [lecturePeriod, labPeriod, discussionPeriod];

            const result = periodTypeFilter.applyToPeriods(periods, { types: ['lab'] });

            // Should exclude Lab period only
            expect(result).toHaveLength(2);
            expect(result).toContain(lecturePeriod);
            expect(result).toContain(discussionPeriod);
            expect(result).not.toContain(labPeriod);
        });

        test('should exclude multiple period types', () => {
            const lecturePeriod = createPeriod('Lecture');
            const labPeriod = createPeriod('Lab');
            const discussionPeriod = createPeriod('Discussion');
            const seminarPeriod = createPeriod('Seminar');

            const periods = [lecturePeriod, labPeriod, discussionPeriod, seminarPeriod];

            const result = periodTypeFilter.applyToPeriods(periods, { types: ['lab', 'discussion'] });

            // Should exclude Lab and Discussion periods
            expect(result).toHaveLength(2);
            expect(result).toContain(lecturePeriod);
            expect(result).toContain(seminarPeriod);
            expect(result).not.toContain(labPeriod);
            expect(result).not.toContain(discussionPeriod);
        });

        test('should handle case insensitive type matching', () => {
            const periods = [
                createPeriod('LECTURE'),
                createPeriod('Lab'),
                createPeriod('discussion')
            ];

            const result = periodTypeFilter.applyToPeriods(periods, { types: ['lecture'] });

            // Should exclude LECTURE period regardless of case
            expect(result).toHaveLength(2);
            expect(result[0].type).toBe('Lab');
            expect(result[1].type).toBe('discussion');
        });

        test('should handle type normalization in exclusion', () => {
            const periods = [
                createPeriod('LEC'),      // normalizes to 'lecture'
                createPeriod('Laboratory'), // normalizes to 'lab'
                createPeriod('DIS'),      // normalizes to 'discussion'
                createPeriod('REC')       // normalizes to 'recitation'
            ];

            const result = periodTypeFilter.applyToPeriods(periods, { types: ['lecture', 'lab'] });

            // Should exclude LEC and Laboratory periods
            expect(result).toHaveLength(2);
            expect(result[0].type).toBe('DIS');
            expect(result[1].type).toBe('REC');
        });

        test('should handle unknown types gracefully', () => {
            const periods = [
                createPeriod('Lecture'),
                createPeriod('Lab'),
                createPeriod('CustomType')
            ];

            const result = periodTypeFilter.applyToPeriods(periods, { types: ['unknown'] });

            // Should return all periods since 'unknown' doesn't match any real types
            expect(result).toHaveLength(3);
            expect(result).toEqual(periods);
        });

        test('should exclude all periods when all types are excluded', () => {
            const periods = [
                createPeriod('Lecture'),
                createPeriod('Lab'),
                createPeriod('Discussion')
            ];

            const result = periodTypeFilter.applyToPeriods(periods, { 
                types: ['lecture', 'lab', 'discussion'] 
            });

            // Should exclude all periods
            expect(result).toHaveLength(0);
        });
    });

    describe('Section-Level Exclusion Integration', () => {
        test('should provide correct exclusion behavior for section filtering', () => {
            // Test that the filter logic works correctly when applied to section periods
            const sectionWithLab = [
                { type: 'Lecture' },
                { type: 'Lab' }
            ] as Period[];

            const sectionWithoutLab = [
                { type: 'Lecture' },
                { type: 'Discussion' }
            ] as Period[];

            // When filtering section periods, if ANY period is excluded, 
            // the section should be considered as having excluded content
            const resultWithLab = periodTypeFilter.applyToPeriods(sectionWithLab, { types: ['lab'] });
            const resultWithoutLab = periodTypeFilter.applyToPeriods(sectionWithoutLab, { types: ['lab'] });

            // Section with Lab should have some periods filtered out
            expect(resultWithLab.length).toBeLessThan(sectionWithLab.length);
            
            // Section without Lab should have all periods remain
            expect(resultWithoutLab.length).toBe(sectionWithoutLab.length);
        });
    });

    test('apply method should return all courses (filtering happens in service)', () => {
        const courses: any[] = [];
        const result = periodTypeFilter.apply(courses, { types: ['lab'] });
        expect(result).toEqual(courses);
    });
});