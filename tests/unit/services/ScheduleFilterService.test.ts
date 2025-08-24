import { describe, test, expect, beforeEach } from 'vitest';
import { ScheduleFilterService } from '../../../src/services/ScheduleFilterService';
import { SearchService } from '../../../src/services/searchService';
import { ConflictDetector } from '../../../src/core/ConflictDetector';
import { Course, Section, Period, Department } from '../../../src/types/types';
import { SelectedCourse } from '../../../src/types/schedule';

describe('ScheduleFilterService', () => {
    let scheduleFilterService: ScheduleFilterService;
    let searchService: SearchService;
    let conflictDetector: ConflictDetector;

    // Test data
    const department: Department = {
        abbreviation: 'CS',
        name: 'Computer Science',
        courses: []
    };

    const testPeriod1: Period = {
        type: 'Lecture',
        professor: 'Prof Smith',
        startTime: { hours: 9, minutes: 0 },
        endTime: { hours: 10, minutes: 50 },
        days: new Set(['mon', 'wed', 'fri']),
        location: 'SL 123',
        building: 'SL',
        room: '123'
    };

    const testPeriod2: Period = {
        type: 'Lab',
        professor: 'Prof Jones',
        startTime: { hours: 14, minutes: 0 },
        endTime: { hours: 15, minutes: 50 },
        days: new Set(['tue']),
        location: 'FL 320',
        building: 'FL',
        room: '320'
    };

    const testSection1: Section = {
        crn: 12345,
        number: 'A01',
        seats: 30,
        seatsAvailable: 5,
        actualWaitlist: 0,
        maxWaitlist: 10,
        description: 'Regular section',
        term: 'A',
        periods: [testPeriod1]
    };

    const testSection2: Section = {
        crn: 12346,
        number: 'AL01',
        seats: 30,
        seatsAvailable: 8,
        actualWaitlist: 0,
        maxWaitlist: 10,
        description: 'Lab section',
        term: 'A',
        periods: [testPeriod2]
    };

    const testSection3: Section = {
        crn: 12347,
        number: 'B01',
        seats: 25,
        seatsAvailable: 3,
        actualWaitlist: 0,
        maxWaitlist: 5,
        description: 'Alternative section',
        term: 'A',
        periods: [testPeriod1]
    };

    const testCourse: Course = {
        id: 'CS-101',
        name: 'Intro to Programming',
        number: '101',
        description: 'Basic programming course',
        credits: '3.0',
        minCredits: 3.0,
        maxCredits: 3.0,
        department: department,
        sections: [testSection1, testSection2, testSection3]
    };

    const selectedCourse: SelectedCourse = {
        course: testCourse,
        selectedSectionNumber: null,
        deniedSections: new Set(),
        preferredSections: new Set(),
        isRequired: false
    };

    beforeEach(() => {
        searchService = new SearchService();
        scheduleFilterService = new ScheduleFilterService(searchService);
        conflictDetector = new ConflictDetector();
        scheduleFilterService.setConflictDetector(conflictDetector);
    });

    describe('filterSections', () => {
        test('should return all sections when no filters are active', () => {
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            expect(result).toHaveLength(3);
            expect(result.map(r => r.section.number)).toEqual(['A01', 'AL01', 'B01']);
        });

        test('should filter sections by section code', () => {
            // Add section code filter for 'AL01'
            scheduleFilterService.addFilter('sectionCode', { codes: ['AL01'] });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            expect(result).toHaveLength(1);
            expect(result[0].section.number).toBe('AL01');
        });

        test('should filter sections by multiple section codes', () => {
            // Add section code filter for 'A01' and 'B01'
            scheduleFilterService.addFilter('sectionCode', { codes: ['A01', 'B01'] });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            expect(result).toHaveLength(2);
            const sectionNumbers = result.map(r => r.section.number).sort();
            expect(sectionNumbers).toEqual(['A01', 'B01']);
        });

        test('should filter sections by partial section code match', () => {
            // Add section code filter for 'A' (should match A01 and AL01)
            scheduleFilterService.addFilter('sectionCode', { codes: ['A'] });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            expect(result).toHaveLength(2);
            const sectionNumbers = result.map(r => r.section.number).sort();
            expect(sectionNumbers).toEqual(['A01', 'AL01']);
        });

        test('should return empty array for non-matching section codes', () => {
            // Add section code filter for non-existent code
            scheduleFilterService.addFilter('sectionCode', { codes: ['XYZ'] });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            expect(result).toHaveLength(0);
        });

        test('should work with search text filter on section numbers', () => {
            // Add search text filter for 'AL'
            scheduleFilterService.addFilter('searchText', { query: 'AL' });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            expect(result).toHaveLength(1);
            expect(result[0].section.number).toBe('AL01');
        });

        test('should work with search text filter on professor names', () => {
            // Add search text filter for professor
            scheduleFilterService.addFilter('searchText', { query: 'Smith' });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            expect(result).toHaveLength(2); // A01 and B01 both have Prof Smith
            const sectionNumbers = result.map(r => r.section.number).sort();
            expect(sectionNumbers).toEqual(['A01', 'B01']);
        });

        test('should combine multiple filters', () => {
            // Add both section code and search filters
            scheduleFilterService.addFilter('sectionCode', { codes: ['A'] });
            scheduleFilterService.addFilter('searchText', { query: 'Smith' });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            expect(result).toHaveLength(1);
            expect(result[0].section.number).toBe('A01'); // Only A01 matches both filters
        });

        test('should exclude sections with periods on Wednesday', () => {
            // Add day exclusion filter for Wednesday
            scheduleFilterService.addFilter('periodDays', { days: ['wed'] });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            // Should exclude A01 and B01 (both have periods on Wednesday)
            // Should keep AL01 (has periods only on Tuesday)
            expect(result).toHaveLength(1);
            expect(result[0].section.number).toBe('AL01');
        });

        test('should exclude sections with periods on Tuesday', () => {
            // Add day exclusion filter for Tuesday
            scheduleFilterService.addFilter('periodDays', { days: ['tue'] });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            // Should exclude AL01 (has periods on Tuesday)
            // Should keep A01 and B01 (have periods on Mon/Wed/Fri)
            expect(result).toHaveLength(2);
            const sectionNumbers = result.map(r => r.section.number).sort();
            expect(sectionNumbers).toEqual(['A01', 'B01']);
        });

        test('should exclude sections with periods on multiple days', () => {
            // Add day exclusion filter for Wednesday and Tuesday
            scheduleFilterService.addFilter('periodDays', { days: ['wed', 'tue'] });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            // Should exclude all sections (A01/B01 have Wed, AL01 has Tue)
            expect(result).toHaveLength(0);
        });

        test('should return all sections when excluding non-existent days', () => {
            // Add day exclusion filter for days not used by any section
            scheduleFilterService.addFilter('periodDays', { days: ['sat', 'sun'] });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            // Should return all sections since none have Saturday or Sunday periods
            expect(result).toHaveLength(3);
            expect(result.map(r => r.section.number)).toEqual(['A01', 'AL01', 'B01']);
        });

        test('should exclude sections with Lab period types', () => {
            // Add period type exclusion filter for Lab
            scheduleFilterService.addFilter('periodType', { types: ['lab'] });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            // Should exclude AL01 (has Lab periods)
            // Should keep A01 and B01 (have Lecture periods)
            expect(result).toHaveLength(2);
            const sectionNumbers = result.map(r => r.section.number).sort();
            expect(sectionNumbers).toEqual(['A01', 'B01']);
        });

        test('should exclude sections with Lecture period types', () => {
            // Add period type exclusion filter for Lecture
            scheduleFilterService.addFilter('periodType', { types: ['lecture'] });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            // Should exclude A01 and B01 (have Lecture periods)
            // Should keep AL01 (has Lab periods)
            expect(result).toHaveLength(1);
            expect(result[0].section.number).toBe('AL01');
        });

        test('should exclude sections with multiple period types', () => {
            // Add period type exclusion filter for both Lecture and Lab
            scheduleFilterService.addFilter('periodType', { types: ['lecture', 'lab'] });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            // Should exclude all sections (A01/B01 have Lecture, AL01 has Lab)
            expect(result).toHaveLength(0);
        });

        test('should return all sections when excluding non-existent period types', () => {
            // Add period type exclusion filter for types not used by any section
            scheduleFilterService.addFilter('periodType', { types: ['seminar', 'discussion'] });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            // Should return all sections since none have Seminar or Discussion periods
            expect(result).toHaveLength(3);
            expect(result.map(r => r.section.number)).toEqual(['A01', 'AL01', 'B01']);
        });

        test('should handle case insensitive period type exclusion', () => {
            // Add period type exclusion filter with various cases
            scheduleFilterService.addFilter('periodType', { types: ['LAB', 'lec'] });
            
            const result = scheduleFilterService.filterSections([selectedCourse]);
            
            // Should exclude all sections (LAB matches AL01's Lab, lec matches A01/B01's Lecture)
            expect(result).toHaveLength(0);
        });
    });

    describe('getAvailableSectionCodes', () => {
        test('should return available section codes', () => {
            const options = scheduleFilterService.getFilterOptions('sectionCode', [selectedCourse]);
            
            expect(options).toHaveLength(3);
            expect(options.map((opt: any) => opt.value)).toEqual(['A01', 'AL01', 'B01']);
            expect(options.map((opt: any) => opt.label)).toEqual(['A01', 'AL01', 'B01']);
        });
    });
});