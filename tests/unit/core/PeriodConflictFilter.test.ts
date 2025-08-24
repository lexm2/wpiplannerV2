import { describe, test, expect, beforeEach } from 'vitest';
import { PeriodConflictFilter, PeriodConflictCriteria } from '../../../src/core/filters/PeriodConflictFilter';
import { ConflictDetector } from '../../../src/core/ConflictDetector';
import { Period, Section, DayOfWeek, Time, Department, Course } from '../../../src/types/types';
import { SelectedCourse } from '../../../src/types/schedule';

// Helper function to create a time object
function createTime(hours: number, minutes: number = 0): Time {
    return {
        hours,
        minutes,
        displayTime: `${hours}:${minutes.toString().padStart(2, '0')}`
    };
}

// Helper function to create a period
function createPeriod(
    type: string,
    professor: string,
    startHour: number,
    endHour: number,
    days: DayOfWeek[]
): Period {
    return {
        type,
        professor,
        startTime: createTime(startHour),
        endTime: createTime(endHour),
        location: 'Test Building Room 101',
        building: 'Test Building',
        room: '101',
        seats: 30,
        seatsAvailable: 15,
        actualWaitlist: 0,
        maxWaitlist: 10,
        days: new Set(days),
        professorEmail: `${professor.toLowerCase().replace(' ', '.')}@wpi.edu`
    };
}

// Helper function to create a section
function createSection(crn: number, sectionNumber: string, periods: Period[]): Section {
    return {
        crn,
        number: sectionNumber,
        seats: 30,
        seatsAvailable: 15,
        actualWaitlist: 0,
        maxWaitlist: 10,
        description: `Test Section ${sectionNumber}`,
        term: 'A 2024',
        computedTerm: 'A',
        periods
    };
}

// Helper function to create a course
function createCourse(id: string, number: string, sections: Section[]): Course {
    const department: Department = {
        abbreviation: 'TEST',
        name: 'Test Department',
        courses: []
    };

    return {
        id,
        number,
        name: `Test Course ${number}`,
        description: 'Test course description',
        department,
        sections,
        minCredits: 3,
        maxCredits: 3
    };
}

// Helper function to create a selected course
function createSelectedCourse(course: Course, selectedSectionNumber: string | null = null): SelectedCourse {
    const selectedSection = selectedSectionNumber ? 
        course.sections.find(s => s.number === selectedSectionNumber) || null : null;

    return {
        course,
        selectedSection,
        selectedSectionNumber,
        isRequired: false
    };
}

describe('PeriodConflictFilter', () => {
    let conflictDetector: ConflictDetector;
    let periodConflictFilter: PeriodConflictFilter;

    beforeEach(() => {
        conflictDetector = new ConflictDetector();
        periodConflictFilter = new PeriodConflictFilter(conflictDetector);
    });

    describe('Basic Functionality', () => {
        test('should return all periods when avoidConflicts is false', () => {
            const periods = [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]),
                createPeriod('Lab', 'Prof B', 14, 16, [DayOfWeek.TUESDAY])
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: false
            };

            const result = periodConflictFilter.applyToPeriods(periods, criteria);
            expect(result).toHaveLength(2);
            expect(result).toEqual(periods);
        });

        test('should return all periods when no selected courses provided', () => {
            const periods = [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]),
                createPeriod('Lab', 'Prof B', 14, 16, [DayOfWeek.TUESDAY])
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: []
            };

            const result = periodConflictFilter.applyToPeriods(periods, criteria);
            expect(result).toHaveLength(2);
            expect(result).toEqual(periods);
        });

        test('should return all periods when no sections are selected', () => {
            const section1 = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
            ]);
            const course1 = createCourse('CS-101', 'CS-101', [section1]);
            const selectedCourse1 = createSelectedCourse(course1, null); // No section selected

            const periods = [
                createPeriod('Lecture', 'Prof B', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]),
                createPeriod('Lab', 'Prof C', 14, 16, [DayOfWeek.TUESDAY])
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourse1]
            };

            const result = periodConflictFilter.applyToPeriods(periods, criteria);
            expect(result).toHaveLength(2);
            expect(result).toEqual(periods);
        });
    });

    describe('Conflict Detection', () => {
        test('should filter out periods that conflict with selected sections - same time overlap', () => {
            // Create a selected course with a section that has a period from 10-12 on M/W
            const selectedSection = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
            ]);
            const selectedCourse = createCourse('CS-101', 'CS-101', [selectedSection]);
            const selectedCourseObj = createSelectedCourse(selectedCourse, 'A01');

            // Test periods to filter
            const periods = [
                createPeriod('Lecture', 'Prof B', 10, 12, [DayOfWeek.MONDAY]), // Should conflict
                createPeriod('Lecture', 'Prof B', 11, 13, [DayOfWeek.WEDNESDAY]), // Should conflict (overlap)
                createPeriod('Lab', 'Prof C', 14, 16, [DayOfWeek.TUESDAY]), // Should NOT conflict (different day)
                createPeriod('Lab', 'Prof D', 8, 10, [DayOfWeek.MONDAY]) // Should NOT conflict (no overlap)
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourseObj]
            };

            const result = periodConflictFilter.applyToPeriods(periods, criteria);
            
            // Should only return the 2 non-conflicting periods
            expect(result).toHaveLength(2);
            expect(result[0].professor).toBe('Prof C'); // Tuesday period
            expect(result[1].professor).toBe('Prof D'); // 8-10 Monday period
        });

        test('should not filter periods on different days', () => {
            // Selected section: Monday/Wednesday 10-12
            const selectedSection = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
            ]);
            const selectedCourse = createCourse('CS-101', 'CS-101', [selectedSection]);
            const selectedCourseObj = createSelectedCourse(selectedCourse, 'A01');

            // Test periods on different days
            const periods = [
                createPeriod('Lecture', 'Prof B', 10, 12, [DayOfWeek.TUESDAY]), // Different day
                createPeriod('Lab', 'Prof C', 10, 12, [DayOfWeek.THURSDAY]), // Different day
                createPeriod('Lab', 'Prof D', 10, 12, [DayOfWeek.FRIDAY]) // Different day
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourseObj]
            };

            const result = periodConflictFilter.applyToPeriods(periods, criteria);
            
            // All periods should remain (no conflicts)
            expect(result).toHaveLength(3);
            expect(result).toEqual(periods);
        });

        test('should handle multiple selected courses', () => {
            // Selected Course 1: Monday/Wednesday 10-12
            const selectedSection1 = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
            ]);
            const selectedCourse1 = createCourse('CS-101', 'CS-101', [selectedSection1]);
            const selectedCourseObj1 = createSelectedCourse(selectedCourse1, 'A01');

            // Selected Course 2: Tuesday/Thursday 14-16
            const selectedSection2 = createSection(67890, 'B01', [
                createPeriod('Lecture', 'Prof B', 14, 16, [DayOfWeek.TUESDAY, DayOfWeek.THURSDAY])
            ]);
            const selectedCourse2 = createCourse('MATH-201', 'MATH-201', [selectedSection2]);
            const selectedCourseObj2 = createSelectedCourse(selectedCourse2, 'B01');

            // Test periods
            const periods = [
                createPeriod('Lecture', 'Prof C', 11, 13, [DayOfWeek.MONDAY]), // Conflicts with course 1
                createPeriod('Lab', 'Prof D', 15, 17, [DayOfWeek.TUESDAY]), // Conflicts with course 2
                createPeriod('Lab', 'Prof E', 8, 10, [DayOfWeek.FRIDAY]) // No conflicts
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourseObj1, selectedCourseObj2]
            };

            const result = periodConflictFilter.applyToPeriods(periods, criteria);
            
            // Should only return the non-conflicting period
            expect(result).toHaveLength(1);
            expect(result[0].professor).toBe('Prof E');
        });
    });

    describe('Same Course vs Different Course Conflicts', () => {
        test('should NOT filter periods from same course even with time conflicts', () => {
            // Create a course with multiple conflicting sections
            const section1 = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
            ]);
            const section2 = createSection(12346, 'B01', [
                createPeriod('Lecture', 'Prof B', 11, 13, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]) // Overlaps with A01
            ]);
            const course = createCourse('CS-101', 'CS-101', [section1, section2]);
            const selectedCourseObj = createSelectedCourse(course, 'A01'); // Select section A01

            // Test periods from the SAME course (including the conflicting B01 section)
            const periodsWithContext = [
                { course: selectedCourseObj, period: section1.periods[0] }, // A01 period (selected)
                { course: selectedCourseObj, period: section2.periods[0] }  // B01 period (conflicts but same course)
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourseObj]
            };

            const filter = new PeriodConflictFilter(conflictDetector);
            const result = filter.applyToPeriodsWithContext(periodsWithContext, criteria);
            
            // Both periods should remain - same course conflicts are allowed
            expect(result).toHaveLength(2);
            expect(result[0].period.professor).toBe('Prof A');
            expect(result[1].period.professor).toBe('Prof B');
        });

        test('should filter periods from different courses with time conflicts', () => {
            // Course 1 with selected section
            const course1Section = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
            ]);
            const course1 = createCourse('CS-101', 'CS-101', [course1Section]);
            const selectedCourse1 = createSelectedCourse(course1, 'A01');

            // Course 2 with conflicting periods
            const course2Section = createSection(67890, 'B01', [
                createPeriod('Lecture', 'Prof B', 11, 13, [DayOfWeek.MONDAY]) // Conflicts with Course 1
            ]);
            const course2 = createCourse('MATH-201', 'MATH-201', [course2Section]);
            const selectedCourse2 = createSelectedCourse(course2, null); // No section selected

            const periodsWithContext = [
                { course: selectedCourse2, period: course2Section.periods[0] } // Course 2 period that conflicts
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourse1, selectedCourse2] // Course 1 has selection
            };

            const filter = new PeriodConflictFilter(conflictDetector);
            const result = filter.applyToPeriodsWithContext(periodsWithContext, criteria);
            
            // Period should be filtered out due to conflict with different course
            expect(result).toHaveLength(0);
        });

        test('should allow periods from different courses with no time conflicts', () => {
            // Course 1 with selected section (Mon/Wed 10-12)
            const course1Section = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
            ]);
            const course1 = createCourse('CS-101', 'CS-101', [course1Section]);
            const selectedCourse1 = createSelectedCourse(course1, 'A01');

            // Course 2 with non-conflicting periods (Tue/Thu 10-12)
            const course2Section = createSection(67890, 'B01', [
                createPeriod('Lecture', 'Prof B', 10, 12, [DayOfWeek.TUESDAY, DayOfWeek.THURSDAY]) // No conflict (different days)
            ]);
            const course2 = createCourse('MATH-201', 'MATH-201', [course2Section]);
            const selectedCourse2 = createSelectedCourse(course2, null);

            const periodsWithContext = [
                { course: selectedCourse2, period: course2Section.periods[0] }
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourse1, selectedCourse2]
            };

            const filter = new PeriodConflictFilter(conflictDetector);
            const result = filter.applyToPeriodsWithContext(periodsWithContext, criteria);
            
            // Period should remain - no conflict with different course
            expect(result).toHaveLength(1);
            expect(result[0].period.professor).toBe('Prof B');
        });

        test('should handle mixed scenario: multiple courses with some selected sections', () => {
            // Course 1: Selected section Mon/Wed 10-12
            const course1Section = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
            ]);
            const course1 = createCourse('CS-101', 'CS-101', [course1Section]);
            const selectedCourse1 = createSelectedCourse(course1, 'A01');

            // Course 2: Selected section Tue/Thu 14-16
            const course2Section = createSection(67890, 'B01', [
                createPeriod('Lecture', 'Prof B', 14, 16, [DayOfWeek.TUESDAY, DayOfWeek.THURSDAY])
            ]);
            const course2 = createCourse('MATH-201', 'MATH-201', [course2Section]);
            const selectedCourse2 = createSelectedCourse(course2, 'B01');

            // Course 3: Multiple sections, some conflicting with Course 1, some with Course 2
            const course3Section1 = createSection(11111, 'C01', [
                createPeriod('Lab', 'Prof C1', 11, 13, [DayOfWeek.MONDAY]) // Conflicts with Course 1
            ]);
            const course3Section2 = createSection(11112, 'C02', [
                createPeriod('Lab', 'Prof C2', 15, 17, [DayOfWeek.TUESDAY]) // Conflicts with Course 2
            ]);
            const course3Section3 = createSection(11113, 'C03', [
                createPeriod('Lab', 'Prof C3', 8, 10, [DayOfWeek.FRIDAY]) // No conflicts
            ]);
            const course3 = createCourse('PHYS-301', 'PHYS-301', [course3Section1, course3Section2, course3Section3]);
            const selectedCourse3 = createSelectedCourse(course3, null);

            const periodsWithContext = [
                { course: selectedCourse3, period: course3Section1.periods[0] }, // Conflicts with Course 1
                { course: selectedCourse3, period: course3Section2.periods[0] }, // Conflicts with Course 2
                { course: selectedCourse3, period: course3Section3.periods[0] }  // No conflicts
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourse1, selectedCourse2, selectedCourse3]
            };

            const filter = new PeriodConflictFilter(conflictDetector);
            const result = filter.applyToPeriodsWithContext(periodsWithContext, criteria);
            
            // Only the non-conflicting period should remain
            expect(result).toHaveLength(1);
            expect(result[0].period.professor).toBe('Prof C3');
        });
    });

    describe('Section-Based Conflict Detection', () => {
        test('should filter entire section if ANY period conflicts', () => {
            // Course 1 with selected section (Mon/Wed 10-12)
            const course1Section = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
            ]);
            const course1 = createCourse('CS-101', 'CS-101', [course1Section]);
            const selectedCourse1 = createSelectedCourse(course1, 'A01');

            // Course 2 with section having multiple periods: one conflicts, one doesn't
            const course2Section = createSection(67890, 'B01', [
                createPeriod('Lecture', 'Prof B', 11, 13, [DayOfWeek.MONDAY]), // Conflicts with Course 1
                createPeriod('Lab', 'Prof B', 14, 16, [DayOfWeek.FRIDAY])      // No conflict
            ]);
            const course2 = createCourse('MATH-201', 'MATH-201', [course2Section]);
            const selectedCourse2 = createSelectedCourse(course2, null);

            const sectionsWithContext = [
                { course: selectedCourse2, section: course2Section }
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourse1, selectedCourse2]
            };

            const filter = new PeriodConflictFilter(conflictDetector);
            const result = filter.applyToSectionsWithContext(sectionsWithContext, criteria);
            
            // Entire section should be filtered out because ONE period conflicts
            expect(result).toHaveLength(0);
        });

        test('should keep section if NO periods conflict', () => {
            // Course 1 with selected section (Mon/Wed 10-12)
            const course1Section = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
            ]);
            const course1 = createCourse('CS-101', 'CS-101', [course1Section]);
            const selectedCourse1 = createSelectedCourse(course1, 'A01');

            // Course 2 with section having multiple periods: none conflict
            const course2Section = createSection(67890, 'B01', [
                createPeriod('Lecture', 'Prof B', 14, 16, [DayOfWeek.TUESDAY]), // No conflict (different day)
                createPeriod('Lab', 'Prof B', 8, 10, [DayOfWeek.FRIDAY])        // No conflict (different day)
            ]);
            const course2 = createCourse('MATH-201', 'MATH-201', [course2Section]);
            const selectedCourse2 = createSelectedCourse(course2, null);

            const sectionsWithContext = [
                { course: selectedCourse2, section: course2Section }
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourse1, selectedCourse2]
            };

            const filter = new PeriodConflictFilter(conflictDetector);
            const result = filter.applyToSectionsWithContext(sectionsWithContext, criteria);
            
            // Section should remain because no periods conflict
            expect(result).toHaveLength(1);
            expect(result[0].section.number).toBe('B01');
        });

        test('should NOT filter sections from same course even if they conflict', () => {
            // Create a course with multiple sections that conflict with each other
            const section1 = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
            ]);
            const section2 = createSection(12346, 'B01', [
                createPeriod('Lecture', 'Prof B', 11, 13, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]), // Conflicts with A01
                createPeriod('Lab', 'Prof B', 14, 16, [DayOfWeek.FRIDAY])
            ]);
            const course = createCourse('CS-101', 'CS-101', [section1, section2]);
            const selectedCourseObj = createSelectedCourse(course, 'A01'); // Select A01

            const sectionsWithContext = [
                { course: selectedCourseObj, section: section1 }, // A01 (selected)
                { course: selectedCourseObj, section: section2 }  // B01 (conflicts but same course)
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourseObj]
            };

            const filter = new PeriodConflictFilter(conflictDetector);
            const result = filter.applyToSectionsWithContext(sectionsWithContext, criteria);
            
            // Both sections should remain - same course conflicts are allowed
            expect(result).toHaveLength(2);
            expect(result[0].section.number).toBe('A01');
            expect(result[1].section.number).toBe('B01');
        });

        test('should handle multiple sections from different courses', () => {
            // Course 1: Selected section Mon/Wed 10-12
            const course1Section = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
            ]);
            const course1 = createCourse('CS-101', 'CS-101', [course1Section]);
            const selectedCourse1 = createSelectedCourse(course1, 'A01');

            // Course 2: Multiple sections
            const course2Section1 = createSection(67890, 'B01', [
                createPeriod('Lecture', 'Prof B1', 11, 13, [DayOfWeek.MONDAY]), // Conflicts with Course 1
                createPeriod('Lab', 'Prof B1', 14, 16, [DayOfWeek.FRIDAY])
            ]);
            const course2Section2 = createSection(67891, 'B02', [
                createPeriod('Lecture', 'Prof B2', 14, 16, [DayOfWeek.TUESDAY]), // No conflict
                createPeriod('Lab', 'Prof B2', 8, 10, [DayOfWeek.THURSDAY])     // No conflict
            ]);
            const course2 = createCourse('MATH-201', 'MATH-201', [course2Section1, course2Section2]);
            const selectedCourse2 = createSelectedCourse(course2, null);

            const sectionsWithContext = [
                { course: selectedCourse2, section: course2Section1 }, // Has conflict
                { course: selectedCourse2, section: course2Section2 }  // No conflict
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourse1, selectedCourse2]
            };

            const filter = new PeriodConflictFilter(conflictDetector);
            const result = filter.applyToSectionsWithContext(sectionsWithContext, criteria);
            
            // Only the non-conflicting section should remain
            expect(result).toHaveLength(1);
            expect(result[0].section.number).toBe('B02');
        });

        test('should work with complex multi-period sections', () => {
            // Course 1: Selected section with multiple periods
            const course1Section = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]),
                createPeriod('Lab', 'Prof A', 14, 16, [DayOfWeek.FRIDAY])
            ]);
            const course1 = createCourse('CS-101', 'CS-101', [course1Section]);
            const selectedCourse1 = createSelectedCourse(course1, 'A01');

            // Course 2: Section that conflicts with Course 1's lab (not lecture)
            const course2Section = createSection(67890, 'B01', [
                createPeriod('Seminar', 'Prof B', 8, 10, [DayOfWeek.TUESDAY]),   // No conflict
                createPeriod('Workshop', 'Prof B', 15, 17, [DayOfWeek.FRIDAY])   // Conflicts with Course 1 lab
            ]);
            const course2 = createCourse('PHYS-301', 'PHYS-301', [course2Section]);
            const selectedCourse2 = createSelectedCourse(course2, null);

            const sectionsWithContext = [
                { course: selectedCourse2, section: course2Section }
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourse1, selectedCourse2]
            };

            const filter = new PeriodConflictFilter(conflictDetector);
            const result = filter.applyToSectionsWithContext(sectionsWithContext, criteria);
            
            // Section should be filtered out because workshop conflicts with selected course's lab
            expect(result).toHaveLength(0);
        });
    });

    describe('Edge Cases', () => {
        test('should handle periods with no days', () => {
            const selectedSection = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY])
            ]);
            const selectedCourse = createCourse('CS-101', 'CS-101', [selectedSection]);
            const selectedCourseObj = createSelectedCourse(selectedCourse, 'A01');

            const periods = [
                createPeriod('Online', 'Prof B', 10, 12, []) // No days
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourseObj]
            };

            const result = periodConflictFilter.applyToPeriods(periods, criteria);
            
            // Period with no days should not conflict
            expect(result).toHaveLength(1);
        });

        test('should handle sections with multiple periods', () => {
            // Selected section with multiple periods
            const selectedSection = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]),
                createPeriod('Lab', 'Prof A', 14, 16, [DayOfWeek.FRIDAY])
            ]);
            const selectedCourse = createCourse('CS-101', 'CS-101', [selectedSection]);
            const selectedCourseObj = createSelectedCourse(selectedCourse, 'A01');

            const periods = [
                createPeriod('Lecture', 'Prof B', 11, 13, [DayOfWeek.MONDAY]), // Conflicts with lecture
                createPeriod('Lab', 'Prof C', 15, 17, [DayOfWeek.FRIDAY]), // Conflicts with lab
                createPeriod('Lab', 'Prof D', 8, 10, [DayOfWeek.TUESDAY]) // No conflicts
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourseObj]
            };

            const result = periodConflictFilter.applyToPeriods(periods, criteria);
            
            // Should only return the non-conflicting period
            expect(result).toHaveLength(1);
            expect(result[0].professor).toBe('Prof D');
        });

        test('should handle exact time boundaries (no overlap)', () => {
            // Selected section: 10:00-12:00
            const selectedSection = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY])
            ]);
            const selectedCourse = createCourse('CS-101', 'CS-101', [selectedSection]);
            const selectedCourseObj = createSelectedCourse(selectedCourse, 'A01');

            const periods = [
                createPeriod('Lab', 'Prof B', 8, 10, [DayOfWeek.MONDAY]), // 8-10 (no overlap)
                createPeriod('Lab', 'Prof C', 12, 14, [DayOfWeek.MONDAY]) // 12-14 (no overlap)
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourseObj]
            };

            const result = periodConflictFilter.applyToPeriods(periods, criteria);
            
            // Both periods should remain (no conflicts at boundaries)
            expect(result).toHaveLength(2);
        });

        test('should detect minimal overlaps', () => {
            // Selected section: 10:00-12:00
            const selectedSection = createSection(12345, 'A01', [
                createPeriod('Lecture', 'Prof A', 10, 12, [DayOfWeek.MONDAY])
            ]);
            const selectedCourse = createCourse('CS-101', 'CS-101', [selectedSection]);
            const selectedCourseObj = createSelectedCourse(selectedCourse, 'A01');

            const periods = [
                createPeriod('Lab', 'Prof B', 9, 11, [DayOfWeek.MONDAY]), // 9-11 (1 hour overlap)
                createPeriod('Lab', 'Prof C', 11, 13, [DayOfWeek.MONDAY]) // 11-13 (1 hour overlap)
            ];

            const criteria: PeriodConflictCriteria = {
                avoidConflicts: true,
                selectedCourses: [selectedCourseObj]
            };

            const result = periodConflictFilter.applyToPeriods(periods, criteria);
            
            // Both periods should be filtered out due to overlap
            expect(result).toHaveLength(0);
        });
    });
});