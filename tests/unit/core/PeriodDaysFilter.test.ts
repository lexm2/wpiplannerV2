import { describe, test, expect, beforeEach } from 'vitest';
import { PeriodDaysFilter } from '../../../src/core/filters/PeriodDaysFilter';
import { Period, DayOfWeek } from '../../../src/types/types';

describe('PeriodDaysFilter', () => {
    let periodDaysFilter: PeriodDaysFilter;

    beforeEach(() => {
        periodDaysFilter = new PeriodDaysFilter();
    });

    test('should implement CourseFilter interface correctly', () => {
        expect(periodDaysFilter.id).toBe('periodDays');
        expect(periodDaysFilter.name).toBe('Period Days');
        expect(periodDaysFilter.description).toBe('Exclude sections with classes on selected days');
        
        expect(typeof periodDaysFilter.apply).toBe('function');
        expect(typeof periodDaysFilter.isValidCriteria).toBe('function');
        expect(typeof periodDaysFilter.getDisplayValue).toBe('function');
    });

    describe('isValidCriteria', () => {
        test('should validate correct criteria', () => {
            expect(periodDaysFilter.isValidCriteria({ days: ['mon', 'wed', 'fri'] })).toBe(true);
            expect(periodDaysFilter.isValidCriteria({ days: [] })).toBe(true);
            expect(periodDaysFilter.isValidCriteria({ days: ['wed'] })).toBe(true);
        });

        test('should reject invalid criteria', () => {
            expect(periodDaysFilter.isValidCriteria(null)).toBe(false);
            expect(periodDaysFilter.isValidCriteria(undefined)).toBe(false);
            expect(periodDaysFilter.isValidCriteria({})).toBe(false);
            expect(periodDaysFilter.isValidCriteria({ days: 'wed' })).toBe(false);
            expect(periodDaysFilter.isValidCriteria({ days: [123] })).toBe(false);
            expect(periodDaysFilter.isValidCriteria({ something: 'else' })).toBe(false);
        });
    });

    describe('getDisplayValue', () => {
        test('should format single day exclusion', () => {
            expect(periodDaysFilter.getDisplayValue({ days: ['wed'] })).toBe('Exclude: Wednesday');
            expect(periodDaysFilter.getDisplayValue({ days: ['mon'] })).toBe('Exclude: Monday');
        });

        test('should format multiple days exclusion', () => {
            expect(periodDaysFilter.getDisplayValue({ days: ['wed', 'fri'] })).toBe('Exclude: Wednesday, Friday');
            expect(periodDaysFilter.getDisplayValue({ days: ['mon', 'tue', 'thu'] })).toBe('Exclude: Monday, Tuesday, Thursday');
        });

        test('should handle empty exclusion', () => {
            expect(periodDaysFilter.getDisplayValue({ days: [] })).toBe('No exclusions');
        });

        test('should handle case insensitive day names', () => {
            expect(periodDaysFilter.getDisplayValue({ days: ['WED'] })).toBe('Exclude: Wednesday');
            expect(periodDaysFilter.getDisplayValue({ days: ['Mon', 'FRI'] })).toBe('Exclude: Monday, Friday');
        });
    });

    describe('applyToPeriods - Exclusion Logic', () => {
        const createPeriod = (days: string[]): Period => ({
            type: 'Lecture',
            professor: 'Prof Smith',
            startTime: { hours: 9, minutes: 0 },
            endTime: { hours: 10, minutes: 50 },
            days: new Set(days),
            location: 'SL 123',
            building: 'SL',
            room: '123',
            seats: 30,
            seatsAvailable: 5,
            actualWaitlist: 0,
            maxWaitlist: 10
        });

        test('should return all periods when no days are excluded', () => {
            const periods = [
                createPeriod(['mon', 'wed', 'fri']),
                createPeriod(['tue', 'thu']),
                createPeriod(['wed'])
            ];

            const result = periodDaysFilter.applyToPeriods(periods, { days: [] });
            expect(result).toHaveLength(3);
            expect(result).toEqual(periods);
        });

        test('should exclude periods on Wednesday', () => {
            const mondayPeriod = createPeriod(['mon']);
            const wednesdayPeriod = createPeriod(['wed']);
            const mondayWednesdayPeriod = createPeriod(['mon', 'wed', 'fri']);
            const tuesdayThursdayPeriod = createPeriod(['tue', 'thu']);

            const periods = [mondayPeriod, wednesdayPeriod, mondayWednesdayPeriod, tuesdayThursdayPeriod];

            const result = periodDaysFilter.applyToPeriods(periods, { days: ['wed'] });

            // Should exclude any period that has Wednesday
            expect(result).toHaveLength(2);
            expect(result).toContain(mondayPeriod);
            expect(result).toContain(tuesdayThursdayPeriod);
            expect(result).not.toContain(wednesdayPeriod);
            expect(result).not.toContain(mondayWednesdayPeriod);
        });

        test('should exclude periods on multiple days', () => {
            const mondayPeriod = createPeriod(['mon']);
            const wednesdayPeriod = createPeriod(['wed']);
            const fridayPeriod = createPeriod(['fri']);
            const tuesdayThursdayPeriod = createPeriod(['tue', 'thu']);
            const mondayWednesdayPeriod = createPeriod(['mon', 'wed']);

            const periods = [mondayPeriod, wednesdayPeriod, fridayPeriod, tuesdayThursdayPeriod, mondayWednesdayPeriod];

            const result = periodDaysFilter.applyToPeriods(periods, { days: ['wed', 'fri'] });

            // Should exclude any period that has Wednesday OR Friday
            expect(result).toHaveLength(2);
            expect(result).toContain(mondayPeriod);
            expect(result).toContain(tuesdayThursdayPeriod);
            expect(result).not.toContain(wednesdayPeriod);
            expect(result).not.toContain(fridayPeriod);
            expect(result).not.toContain(mondayWednesdayPeriod);
        });

        test('should handle case insensitive day matching', () => {
            const periods = [
                createPeriod(['mon', 'WED', 'fri']),
                createPeriod(['TUE', 'thu']),
                createPeriod(['Wed'])
            ];

            const result = periodDaysFilter.applyToPeriods(periods, { days: ['wed'] });

            // Should exclude periods with 'WED', 'Wed' regardless of case
            expect(result).toHaveLength(1);
            expect(result[0].days).toEqual(new Set(['TUE', 'thu']));
        });

        test('should handle unknown days gracefully', () => {
            const periods = [
                createPeriod(['mon', 'wed', 'fri']),
                createPeriod(['tue', 'thu'])
            ];

            const result = periodDaysFilter.applyToPeriods(periods, { days: ['xyz'] });

            // Should return all periods since 'xyz' doesn't match any real days
            expect(result).toHaveLength(2);
            expect(result).toEqual(periods);
        });

        test('should exclude all periods when all possible days are excluded', () => {
            const periods = [
                createPeriod(['mon', 'wed', 'fri']),
                createPeriod(['tue', 'thu']),
                createPeriod(['sat', 'sun'])
            ];

            const result = periodDaysFilter.applyToPeriods(periods, { 
                days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] 
            });

            // Should exclude all periods
            expect(result).toHaveLength(0);
        });
    });

    describe('Section-Level Exclusion Integration', () => {
        test('should provide correct exclusion behavior for section filtering', () => {
            // Test that the filter logic works correctly when applied to section periods
            const sectionWithWednesday = [
                { type: 'Lecture', days: new Set(['mon', 'wed', 'fri']) },
                { type: 'Lab', days: new Set(['tue']) }
            ] as Period[];

            const sectionWithoutWednesday = [
                { type: 'Lecture', days: new Set(['mon', 'fri']) },
                { type: 'Lab', days: new Set(['tue', 'thu']) }
            ] as Period[];

            // When filtering section periods, if ANY period is excluded, 
            // the section should be considered as having excluded content
            const resultWithWednesday = periodDaysFilter.applyToPeriods(sectionWithWednesday, { days: ['wed'] });
            const resultWithoutWednesday = periodDaysFilter.applyToPeriods(sectionWithoutWednesday, { days: ['wed'] });

            // Section with Wednesday should have some periods filtered out
            expect(resultWithWednesday.length).toBeLessThan(sectionWithWednesday.length);
            
            // Section without Wednesday should have all periods remain
            expect(resultWithoutWednesday.length).toBe(sectionWithoutWednesday.length);
        });
    });

    test('apply method should return all courses (filtering happens in service)', () => {
        const courses: any[] = [];
        const result = periodDaysFilter.apply(courses, { days: ['wed'] });
        expect(result).toEqual(courses);
    });
});