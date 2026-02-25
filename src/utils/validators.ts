import { Course, Section, Period, Department, PeriodType } from '../types/types'
import { Schedule, SelectedCourse, SchedulePreferences } from '../types/schedule'
import { getAllSections } from './courseUtils'

export class Validators {
    static isValidCourse(course: unknown): course is Course {
        if (!course || typeof course !== 'object') return false;

        const courseObj = course as Record<string, unknown>;

        if (typeof courseObj.id !== 'string' ||
            typeof courseObj.number !== 'string' ||
            typeof courseObj.name !== 'string' ||
            typeof courseObj.description !== 'string' ||
            !this.isValidDepartment(courseObj.department) ||
            typeof courseObj.minCredits !== 'number' ||
            typeof courseObj.maxCredits !== 'number') {
            return false;
        }

        // Validate sections from hierarchical structure
        const sections = getAllSections(courseObj as unknown as Course);
        return sections.every((s: unknown) => this.isValidSection(s));
    }

    static isValidDepartment(department: unknown): department is Department {
        if (!department || typeof department !== 'object') return false;

        const deptObj = department as Record<string, unknown>;

        return typeof deptObj.abbreviation === 'string' &&
            typeof deptObj.name === 'string' &&
            // Make courses array optional - it may not be present in serialized data
            (deptObj.courses === undefined || Array.isArray(deptObj.courses));
    }

    static isValidSection(section: unknown): section is Section {
        if (!section || typeof section !== 'object') return false;

        const sectionObj = section as Record<string, unknown>;

        return typeof sectionObj.crn === 'number' &&
            typeof sectionObj.number === 'string' &&
            typeof sectionObj.seats === 'number' &&
            typeof sectionObj.seatsAvailable === 'number' &&
            typeof sectionObj.actualWaitlist === 'number' &&
            typeof sectionObj.maxWaitlist === 'number' &&
            Array.isArray(sectionObj.periods) &&
            sectionObj.periods.every((p: unknown) => this.isValidPeriod(p));
    }

    static isValidPeriod(period: unknown): period is Period {
        if (!period || typeof period !== 'object') return false;

        const periodObj = period as Record<string, unknown>;

        return (typeof periodObj.type === 'string' || Object.values(PeriodType).includes(periodObj.type as PeriodType)) &&
            typeof periodObj.professor === 'string' &&
            this.isValidTime(periodObj.startTime) &&
            this.isValidTime(periodObj.endTime) &&
            typeof periodObj.location === 'string' &&
            typeof periodObj.building === 'string' &&
            typeof periodObj.room === 'string' &&
            typeof periodObj.seats === 'number' &&
            typeof periodObj.seatsAvailable === 'number' &&
            typeof periodObj.actualWaitlist === 'number' &&
            typeof periodObj.maxWaitlist === 'number' &&
            periodObj.days instanceof Set;
    }

    static isValidTime(time: unknown): boolean {
        if (!time || typeof time !== 'object') return false;

        const timeObj = time as Record<string, unknown>;

        return typeof timeObj.hours === 'number' &&
            typeof timeObj.minutes === 'number' &&
            typeof timeObj.displayTime === 'string' &&
            timeObj.hours >= 0 && timeObj.hours <= 23 &&
            timeObj.minutes >= 0 && timeObj.minutes <= 59;
    }

    static isValidSchedulePreferences(preferences: unknown): preferences is SchedulePreferences {
        if (!preferences || typeof preferences !== 'object') return false;

        const prefsObj = preferences as Record<string, unknown>;

        return this.isValidTimeRange(prefsObj.preferredTimeRange) &&
            prefsObj.preferredDays instanceof Set &&
            typeof prefsObj.avoidBackToBackClasses === 'boolean';
    }

    static isValidTimeRange(timeRange: unknown): boolean {
        if (!timeRange || typeof timeRange !== 'object') return false;

        const rangeObj = timeRange as Record<string, unknown>;

        return this.isValidTime(rangeObj.startTime) &&
            this.isValidTime(rangeObj.endTime);
    }

    static isValidSelectedCourse(selectedCourse: unknown): selectedCourse is SelectedCourse {
        if (!selectedCourse || typeof selectedCourse !== 'object') return false;

        const scObj = selectedCourse as Record<string, unknown>;

        return this.isValidCourse(scObj.course) &&
            typeof scObj.isRequired === 'boolean';
    }

    static isValidSchedule(schedule: unknown): schedule is Schedule {
        if (!schedule || typeof schedule !== 'object') return false;

        const schedObj = schedule as Record<string, unknown>;

        return typeof schedObj.id === 'string' &&
            typeof schedObj.name === 'string' &&
            Array.isArray(schedObj.selectedCourses) &&
            schedObj.selectedCourses.every((sc: unknown) => this.isValidSelectedCourse(sc)) &&
            Array.isArray(schedObj.generatedSchedules) &&
            this.isValidSchedulePreferences(schedObj.preferences);
    }

    static sanitizeString(input: string): string {
        return input.replace(/<[^>]*>/g, '').trim();
    }

    static escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static sanitizeClassName(className: string): string {
        return className.replace(/[^a-zA-Z0-9_\-\s]/g, '');
    }

    static sanitizeCourseData(course: unknown): Course | null {
        try {
            if (!this.isValidCourse(course)) return null;

            return {
                ...course,
                name: this.sanitizeString(course.name),
                description: this.sanitizeString(course.description)
            };
        } catch (error) {
            console.warn('Error sanitizing course data:', error);
            return null;
        }
    }

    static validateCourseId(courseId: string): boolean {
        // Format: DEPT-NUMBER (e.g., CS-1101, AB-1531, RBE-1001) 
        // Allow 2-4 letter department codes and 3-4 digit course numbers
        return /^[A-Z]{2,4}-\d{3,4}$/.test(courseId);
    }

    static validateSectionNumber(sectionNumber: string): boolean {
        // Very permissive section number validation - allow most printable characters
        // WPI has diverse section formats: A01, Lab1, "Interest List-A Term", "AL02/AD02/AX01", etc.
        // Just ensure it's a non-empty string with reasonable characters
        return typeof sectionNumber === 'string' && 
               sectionNumber.trim().length > 0 && 
               /^[\w\s\-/]+$/.test(sectionNumber);
    }

    static validateEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
}