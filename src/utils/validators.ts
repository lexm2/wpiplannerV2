import { Course, Section, Period, Department } from '../types/types'
import { Schedule, SelectedCourse, SchedulePreferences } from '../types/schedule'

export class Validators {
    static isValidCourse(course: any): course is Course {
        return course &&
            typeof course.id === 'string' &&
            typeof course.number === 'string' &&
            typeof course.name === 'string' &&
            typeof course.description === 'string' &&
            this.isValidDepartment(course.department) &&
            Array.isArray(course.sections) &&
            course.sections.every((s: any) => this.isValidSection(s)) &&
            typeof course.minCredits === 'number' &&
            typeof course.maxCredits === 'number';
    }

    static isValidDepartment(department: any): department is Department {
        return department &&
            typeof department.abbreviation === 'string' &&
            typeof department.name === 'string' &&
            Array.isArray(department.courses);
    }

    static isValidSection(section: any): section is Section {
        return section &&
            typeof section.crn === 'number' &&
            typeof section.number === 'string' &&
            typeof section.seats === 'number' &&
            typeof section.seatsAvailable === 'number' &&
            typeof section.actualWaitlist === 'number' &&
            typeof section.maxWaitlist === 'number' &&
            typeof section.description === 'string' &&
            typeof section.term === 'string' &&
            Array.isArray(section.periods) &&
            section.periods.every((p: any) => this.isValidPeriod(p));
    }

    static isValidPeriod(period: any): period is Period {
        return period &&
            typeof period.type === 'string' &&
            typeof period.professor === 'string' &&
            this.isValidTime(period.startTime) &&
            this.isValidTime(period.endTime) &&
            typeof period.location === 'string' &&
            typeof period.building === 'string' &&
            typeof period.room === 'string' &&
            typeof period.seats === 'number' &&
            typeof period.seatsAvailable === 'number' &&
            typeof period.actualWaitlist === 'number' &&
            typeof period.maxWaitlist === 'number' &&
            period.days instanceof Set;
    }

    static isValidTime(time: any): boolean {
        return time &&
            typeof time.hours === 'number' &&
            typeof time.minutes === 'number' &&
            typeof time.displayTime === 'string' &&
            time.hours >= 0 && time.hours <= 23 &&
            time.minutes >= 0 && time.minutes <= 59;
    }

    static isValidSchedulePreferences(preferences: any): preferences is SchedulePreferences {
        return preferences &&
            this.isValidTimeRange(preferences.preferredTimeRange) &&
            preferences.preferredDays instanceof Set &&
            typeof preferences.avoidBackToBackClasses === 'boolean' &&
            typeof preferences.maxDailyHours === 'number' &&
            Array.isArray(preferences.preferredBuildings);
    }

    static isValidTimeRange(timeRange: any): boolean {
        return timeRange &&
            this.isValidTime(timeRange.startTime) &&
            this.isValidTime(timeRange.endTime);
    }

    static isValidSelectedCourse(selectedCourse: any): selectedCourse is SelectedCourse {
        return selectedCourse &&
            this.isValidCourse(selectedCourse.course) &&
            Array.isArray(selectedCourse.preferredSections) &&
            Array.isArray(selectedCourse.deniedSections) &&
            typeof selectedCourse.isRequired === 'boolean';
    }

    static isValidSchedule(schedule: any): schedule is Schedule {
        return schedule &&
            typeof schedule.id === 'string' &&
            typeof schedule.name === 'string' &&
            Array.isArray(schedule.selectedCourses) &&
            schedule.selectedCourses.every((sc: any) => this.isValidSelectedCourse(sc)) &&
            Array.isArray(schedule.generatedSchedules) &&
            this.isValidSchedulePreferences(schedule.preferences);
    }

    static sanitizeString(input: string): string {
        return input.replace(/<[^>]*>/g, '').trim();
    }

    static sanitizeCourseData(course: any): Course | null {
        try {
            if (!this.isValidCourse(course)) return null;

            return {
                ...course,
                name: this.sanitizeString(course.name),
                description: this.sanitizeString(course.description),
                sections: course.sections.map((section: Section) => ({
                    ...section,
                    description: this.sanitizeString(section.description),
                    periods: section.periods.map((period: Period) => ({
                        ...period,
                        professor: this.sanitizeString(period.professor),
                        location: this.sanitizeString(period.location),
                        building: this.sanitizeString(period.building),
                        room: this.sanitizeString(period.room)
                    }))
                }))
            };
        } catch (error) {
            console.warn('Error sanitizing course data:', error);
            return null;
        }
    }

    static validateCourseId(courseId: string): boolean {
        // Format: DEPT-NUMBER (e.g., CS-1101, MA-2631)
        return /^[A-Z]{2,4}-\d{4}$/.test(courseId);
    }

    static validateSectionNumber(sectionNumber: string): boolean {
        // Alphanumeric section numbers
        return /^[A-Z0-9]+$/.test(sectionNumber);
    }

    static validateEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
}