import { describe, it, expect } from 'bun:test';
import { ICSGenerator } from '../../src/utils/icsGenerator';
import { createMockSchedule, createMockSelectedCourse, createMockCourse, createMockSection, createMockPeriod, createMockTime } from '../helpers/mockData';
import { DayOfWeek } from '../../src/types/types';
import { AcademicTerm } from '../../src/types/schedule';

describe('ICSGenerator', () => {
    describe('Basic Functionality', () => {
        it('should generate valid ICS for a single course', () => {
            const period = createMockPeriod({
                startTime: createMockTime(9, 0),
                endTime: createMockTime(10, 45),
                days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]),
            });

            const section = createMockSection({
                crn: 12345,
                number: 'A01',
                computedTerm: AcademicTerm.A,
                periods: [period],
            });

            const course = createMockCourse({
                id: 'CS-1101',
                number: '1101',
                name: 'Introduction to Programming',
            });

            const selectedCourse = createMockSelectedCourse({
                course,
                selectedLecture: section,
            });

            const schedule = createMockSchedule({
                name: 'Test Schedule',
                selectedCourses: [selectedCourse],
            });

            const result = ICSGenerator.generateICS(schedule, {
                academicYear: 2026,
                timezone: 'America/New_York',
            });

            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data).toContain('BEGIN:VCALENDAR');
            expect(result.data).toContain('BEGIN:VEVENT');
            expect(result.data).toContain('END:VEVENT');
            expect(result.data).toContain('END:VCALENDAR');
            expect(result.data).toContain('RRULE:FREQ=WEEKLY');
        });

        it('should generate correct summary and location', () => {
            const period = createMockPeriod({
                startTime: createMockTime(14, 0),
                endTime: createMockTime(15, 50),
                days: new Set([DayOfWeek.TUESDAY, DayOfWeek.FRIDAY]),
                location: 'Stratton Hall 201',
            });

            const section = createMockSection({
                crn: 54321,
                number: 'B02',
                computedTerm: AcademicTerm.B,
                periods: [period],
            });

            const maDept = {
                abbreviation: 'MA',
                name: 'Mathematical Sciences',
                courses: []
            };

            const course = createMockCourse({
                id: 'MA-1021',
                number: '1021',
                name: 'Calculus I',
                department: maDept,
            });

            const selectedCourse = createMockSelectedCourse({
                course,
                selectedLecture: section,
            });

            const schedule = createMockSchedule({
                name: 'Math Schedule',
                selectedCourses: [selectedCourse],
            });

            const result = ICSGenerator.generateICS(schedule, {
                academicYear: 2026,
                timezone: 'America/New_York',
            });

            expect(result.success).toBe(true);
            expect(result.data).toContain('SUMMARY:Lecture: MA-1021 Calculus I');
            expect(result.data).toContain('LOCATION:Stratton Hall 201');
        });
    });

    describe('Multiple Terms', () => {
        it('should handle multiple terms correctly', () => {
            const periodA = createMockPeriod({
                startTime: createMockTime(9, 0),
                endTime: createMockTime(10, 50),
                days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]),
            });

            const sectionA = createMockSection({
                crn: 11111,
                number: 'A01',
                computedTerm: AcademicTerm.A,
                periods: [periodA],
            });

            const periodB = createMockPeriod({
                startTime: createMockTime(14, 0),
                endTime: createMockTime(15, 50),
                days: new Set([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY]),
            });

            const sectionB = createMockSection({
                crn: 22222,
                number: 'B01',
                computedTerm: AcademicTerm.B,
                periods: [periodB],
            });

            const course1 = createMockCourse({
                id: 'CS-2011',
                number: '2011',
                name: 'Introduction to Machine Organization',
            });

            const course2 = createMockCourse({
                id: 'CS-2102',
                number: '2102',
                name: 'Object-Oriented Design',
            });

            const selectedCourse1 = createMockSelectedCourse({
                course: course1,
                selectedLecture: sectionA,
            });

            const selectedCourse2 = createMockSelectedCourse({
                course: course2,
                selectedLecture: sectionB,
            });

            const schedule = createMockSchedule({
                name: 'Multi-Term Schedule',
                selectedCourses: [selectedCourse1, selectedCourse2],
            });

            const result = ICSGenerator.generateICS(schedule, {
                academicYear: 2026,
                timezone: 'America/New_York',
            });

            expect(result.success).toBe(true);
            expect(result.data).toContain('CS-2011');
            expect(result.data).toContain('CS-2102');

            const eventCount = (result.data!.match(/BEGIN:VEVENT/g) || []).length;
            expect(eventCount).toBe(2);
        });
    });

    describe('Local Events', () => {
        it('should handle one-time local events', () => {
            const schedule = createMockSchedule({
                name: 'Schedule with Local Events',
                selectedCourses: [],
                localEvents: [
                    {
                        id: 'local-1',
                        title: 'Career Fair',
                        description: 'Annual career fair',
                        eventType: 'one-time',
                        date: '2026-09-15',
                        startTime: createMockTime(10, 0),
                        endTime: createMockTime(15, 0),
                        visible: true,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    },
                ],
            });

            const result = ICSGenerator.generateICS(schedule, {
                academicYear: 2026,
                timezone: 'America/New_York',
            });

            expect(result.success).toBe(true);
            expect(result.data).toContain('SUMMARY:Career Fair');
            expect(result.data).toContain('DESCRIPTION:Annual career fair');
            expect(result.data).not.toContain('RRULE');
        });

        it('should handle recurring local events', () => {
            const schedule = createMockSchedule({
                name: 'Schedule with Recurring Events',
                selectedCourses: [],
                localEvents: [
                    {
                        id: 'local-2',
                        title: 'Office Hours',
                        description: 'Weekly office hours',
                        eventType: 'recurring',
                        days: [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY],
                        startTime: createMockTime(16, 0),
                        endTime: createMockTime(17, 0),
                        terms: [AcademicTerm.A, AcademicTerm.B],
                        visible: true,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    },
                ],
            });

            const result = ICSGenerator.generateICS(schedule, {
                academicYear: 2026,
                timezone: 'America/New_York',
            });

            expect(result.success).toBe(true);
            expect(result.data).toContain('SUMMARY:Office Hours');
            expect(result.data).toContain('RRULE:FREQ=WEEKLY');

            const eventCount = (result.data!.match(/BEGIN:VEVENT/g) || []).length;
            expect(eventCount).toBe(2);
        });
    });

    describe('Edge Cases', () => {
        it('should return error for empty schedule', () => {
            const schedule = createMockSchedule({
                name: 'Empty Schedule',
                selectedCourses: [],
            });

            const result = ICSGenerator.generateICS(schedule);

            expect(result.success).toBe(false);
            expect(result.error).toBe('No valid courses to export');
        });

        it('should skip courses without selected sections', () => {
            const course = createMockCourse({
                id: 'CS-1101',
                number: '1101',
                name: 'Introduction to Programming',
            });

            const selectedCourse = createMockSelectedCourse({
                course,
                selectedLecture: undefined,
            });

            const schedule = createMockSchedule({
                name: 'Incomplete Schedule',
                selectedCourses: [selectedCourse],
            });

            const result = ICSGenerator.generateICS(schedule);

            expect(result.success).toBe(false);
            expect(result.skippedCourses).toBe(1);
        });

        it('should handle description and professor options', () => {
            const period = createMockPeriod({
                startTime: createMockTime(9, 0),
                endTime: createMockTime(10, 45),
                days: new Set([DayOfWeek.MONDAY]),
                professor: 'Dr. Smith',
            });

            const section = createMockSection({
                crn: 12345,
                number: 'A01',
                computedTerm: AcademicTerm.A,
                periods: [period],
            });

            const course = createMockCourse({
                id: 'CS-1101',
                number: '1101',
                name: 'Test Course',
                description: 'A test course description',
            });

            const selectedCourse = createMockSelectedCourse({
                course,
                selectedLecture: section,
            });

            const schedule = createMockSchedule({
                name: 'Test Schedule',
                selectedCourses: [selectedCourse],
            });

            const result = ICSGenerator.generateICS(schedule, {
                academicYear: 2026,
                includeDescription: true,
                includeProfessor: true,
            });

            expect(result.success).toBe(true);
            expect(result.data).toContain('DESCRIPTION:');
            expect(result.data).toContain('Professor: Dr. Smith');
            expect(result.data).toContain('CRN: 12345');
        });
    });
});
