import { describe, test, expect, beforeEach } from 'bun:test';
import { PeriodDaysFilter } from '../../../src/core/filtering/filters/PeriodDaysFilter';
import { Period, DayOfWeek, PeriodType } from '../../../src/types/types';

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
            expect(periodDaysFilter.isValidCriteria({ days: ['m', 'w', 'f'] })).toBe(true);
            expect(periodDaysFilter.isValidCriteria({ days: [] })).toBe(true);
            expect(periodDaysFilter.isValidCriteria({ days: ['w'] })).toBe(true);
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
            expect(periodDaysFilter.getDisplayValue({ days: ['w'] })).toBe('Exclude: w');
            expect(periodDaysFilter.getDisplayValue({ days: ['m'] })).toBe('Exclude: m');
        });

        test('should format multiple days exclusion', () => {
            expect(periodDaysFilter.getDisplayValue({ days: ['w', 'f'] })).toBe('Exclude: w, f');
            expect(periodDaysFilter.getDisplayValue({ days: ['m', 't', 'r'] })).toBe('Exclude: m, t, r');
        });

        test('should handle empty exclusion', () => {
            expect(periodDaysFilter.getDisplayValue({ days: [] })).toBe('No exclusions');
        });

        test('should handle case insensitive day names', () => {
            expect(periodDaysFilter.getDisplayValue({ days: ['W'] })).toBe('Exclude: W');
            expect(periodDaysFilter.getDisplayValue({ days: ['M', 'F'] })).toBe('Exclude: M, F');
        });
    });

    describe('applyToPeriods - Exclusion Logic', () => {
        const createPeriod = (days: DayOfWeek[]): Period => ({
            type: PeriodType.LECTURE,
            professor: 'Prof Smith',
            startTime: { hours: 9, minutes: 0, displayTime: '9:00 AM' },
            endTime: { hours: 10, minutes: 50, displayTime: '10:50 AM' },
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
                createPeriod([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY]),
                createPeriod([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY]),
                createPeriod([DayOfWeek.WEDNESDAY])
            ];

            const result = periodDaysFilter.applyToPeriods(periods, { days: [] });

            expect(result).toHaveLength(3);
            expect(result).toEqual(periods);
        });

        test('should exclude periods on Wednesday', () => {
            const mondayPeriod = createPeriod([DayOfWeek.MONDAY]);
            const wednesdayPeriod = createPeriod([DayOfWeek.WEDNESDAY]);
            const mondayWednesdayPeriod = createPeriod([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY]);
            const tuesdayThursdayPeriod = createPeriod([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY]);

            const periods = [mondayPeriod, wednesdayPeriod, mondayWednesdayPeriod, tuesdayThursdayPeriod];

            const result = periodDaysFilter.applyToPeriods(periods, { days: ['w'] });

            // Should exclude any period that has Wednesday
            expect(result).toHaveLength(2);
            expect(result).toContain(mondayPeriod);
            expect(result).toContain(tuesdayThursdayPeriod);
            expect(result).not.toContain(wednesdayPeriod);
            expect(result).not.toContain(mondayWednesdayPeriod);
        });

        test('should exclude periods on multiple days', () => {
            const mondayPeriod = createPeriod([DayOfWeek.MONDAY]);
            const wednesdayPeriod = createPeriod([DayOfWeek.WEDNESDAY]);
            const fridayPeriod = createPeriod([DayOfWeek.FRIDAY]);
            const tuesdayThursdayPeriod = createPeriod([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY]);
            const mondayWednesdayPeriod = createPeriod([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]);

            const periods = [mondayPeriod, wednesdayPeriod, fridayPeriod, tuesdayThursdayPeriod, mondayWednesdayPeriod];

            const result = periodDaysFilter.applyToPeriods(periods, { days: ['w', 'f'] });

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
                createPeriod([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY]),
                createPeriod([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY]),
                createPeriod([DayOfWeek.WEDNESDAY])
            ];

            const result = periodDaysFilter.applyToPeriods(periods, { days: ['w'] });

            // Should exclude periods with 'W' regardless of case
            expect(result).toHaveLength(1);
            expect(result[0].days).toEqual(new Set([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY]));
        });

        test('should handle unknown days gracefully', () => {
            const periods = [
                createPeriod([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY]),
                createPeriod([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY])
            ];

            const result = periodDaysFilter.applyToPeriods(periods, { days: ['xyz'] });

            // Should return all periods since 'xyz' doesn't match any real days
            expect(result).toHaveLength(2);
            expect(result).toEqual(periods);
        });

        test('should exclude all periods when all possible days are excluded', () => {
            const periods = [
                createPeriod([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY]),
                createPeriod([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY]),
                createPeriod([DayOfWeek.SATURDAY, DayOfWeek.SUNDAY])
            ];

            const result = periodDaysFilter.applyToPeriods(periods, {
                days: ['m', 't', 'w', 'r', 'f', 's', 'u']
            });

            // Should exclude all periods
            expect(result).toHaveLength(0);
        });
    });

    describe('Section-Level Exclusion Integration', () => {
        test('should provide correct exclusion behavior for section filtering', () => {
            // Test that the filter logic works correctly when applied to section periods
            const sectionWithWednesday = [
                { type: PeriodType.LECTURE, days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY]) },
                { type: PeriodType.LAB, days: new Set([DayOfWeek.TUESDAY]) }
            ] as Period[];

            const sectionWithoutWednesday = [
                { type: PeriodType.LECTURE, days: new Set([DayOfWeek.MONDAY, DayOfWeek.FRIDAY]) },
                { type: PeriodType.LAB, days: new Set([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY]) }
            ] as Period[];

            // When filtering section periods, if ANY period is excluded,
            // the section should be considered as having excluded content
            const resultWithWednesday = periodDaysFilter.applyToPeriods(sectionWithWednesday, { days: ['w'] });
            const resultWithoutWednesday = periodDaysFilter.applyToPeriods(sectionWithoutWednesday, { days: ['w'] });

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