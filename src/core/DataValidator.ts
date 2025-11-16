/**
 * Validates course data integrity and format consistency
 */
import { Schedule, SelectedCourse } from '../types/schedule'
import { SimpleTime } from '../types/types'
import { getAllSections } from '../utils/courseUtils'
import { DateUtils } from '../utils/dateUtils'

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    field: string;
    message: string;
    severity: 'error' | 'critical';
    code: string;
}

export interface ValidationWarning {
    field: string;
    message: string;
    suggestion?: string;
}

export interface SchemaValidationOptions {
    allowPartialData?: boolean;
    strict?: boolean;
    repairInPlace?: boolean;
}

export class DataValidator {
    // Schema validation for core data types
    validateSchedule(schedule: unknown, options: SchemaValidationOptions = {}): ValidationResult {
        const result: ValidationResult = { valid: true, errors: [], warnings: [] };

        if (!schedule || typeof schedule !== 'object') {
            result.errors.push({
                field: 'schedule',
                message: 'Schedule must be an object',
                severity: 'critical',
                code: 'INVALID_TYPE'
            });
            result.valid = false;
            return result;
        }

        const scheduleObj = schedule as Record<string, unknown>;

        // Validate required fields
        this.validateRequiredField(scheduleObj, 'id', 'string', result);
        this.validateRequiredField(scheduleObj, 'name', 'string', result);
        
        // Validate arrays
        this.validateArray(
            scheduleObj,
            'selectedCourses',
            result,
            (course: unknown, index: number) => {
                const courseValidation = this.validateSelectedCourse(course, { ...options, allowPartialData: true });
                if (!courseValidation.valid) {
                    courseValidation.errors.forEach(error => {
                        result.errors.push({
                            ...error,
                            field: `schedule.selectedCourses[${index}].${error.field}`
                        });
                    });
                    result.valid = false;
                }
                result.warnings.push(...courseValidation.warnings);
            }
        );

        if (!Array.isArray(scheduleObj.generatedSchedules)) {
            result.errors.push({
                field: 'schedule.generatedSchedules',
                message: 'generatedSchedules must be an array',
                severity: 'error',
                code: 'INVALID_ARRAY'
            });
            result.valid = false;
        }

        // Auto-repair missing fields if requested
        if (options.repairInPlace && result.valid) {
            this.repairSchedule(scheduleObj as any as Schedule);
        }

        return result;
    }

    validateSelectedCourse(selectedCourse: unknown, options: SchemaValidationOptions = {}): ValidationResult {
        const result: ValidationResult = { valid: true, errors: [], warnings: [] };

        if (!selectedCourse || typeof selectedCourse !== 'object') {
            result.errors.push({
                field: 'selectedCourse',
                message: 'SelectedCourse must be an object',
                severity: 'critical',
                code: 'INVALID_TYPE'
            });
            result.valid = false;
            return result;
        }

        const selectedCourseObj = selectedCourse as Record<string, unknown>;

        // Validate course object
        if (!selectedCourseObj.course) {
            result.errors.push({
                field: 'course',
                message: 'Course is required',
                severity: 'critical',
                code: 'MISSING_REQUIRED'
            });
            result.valid = false;
        } else {
            const courseValidation = this.validateCourse(selectedCourseObj.course, options);
            if (!courseValidation.valid) {
                courseValidation.errors.forEach(error => {
                    result.errors.push({
                        ...error,
                        field: `course.${error.field}`
                    });
                });
                result.valid = false;
            }
            result.warnings.push(...courseValidation.warnings);
        }

        // Validate isRequired field
        if (typeof selectedCourseObj.isRequired !== 'boolean') {
            if (options.repairInPlace) {
                selectedCourseObj.isRequired = false;
                result.warnings.push({
                    field: 'isRequired',
                    message: 'isRequired should be boolean, defaulted to false'
                });
            } else {
                result.errors.push({
                    field: 'isRequired',
                    message: 'isRequired must be a boolean',
                    severity: 'error',
                    code: 'INVALID_TYPE'
                });
                result.valid = false;
            }
        }

        // Validate section selection consistency
        const hasSelectedSection = selectedCourseObj.selectedSection !== null;
        const hasSelectedSectionNumber = selectedCourseObj.selectedSectionNumber !== null;

        if (hasSelectedSection !== hasSelectedSectionNumber) {
            result.warnings.push({
                field: 'selectedSection',
                message: 'selectedSection and selectedSectionNumber should be consistent',
                suggestion: 'Consider reconstructing section objects after data load'
            });
        }

        // Validate section number format if present
        if (selectedCourseObj.selectedSectionNumber && typeof selectedCourseObj.selectedSectionNumber !== 'string') {
            result.errors.push({
                field: 'selectedSectionNumber',
                message: 'selectedSectionNumber must be a string or null',
                severity: 'error',
                code: 'INVALID_TYPE'
            });
            result.valid = false;
        }

        return result;
    }

    validateCourse(course: unknown, options: SchemaValidationOptions = {}): ValidationResult {
        const result: ValidationResult = { valid: true, errors: [], warnings: [] };

        if (!course || typeof course !== 'object') {
            result.errors.push({
                field: 'course',
                message: 'Course must be an object',
                severity: 'critical',
                code: 'INVALID_TYPE'
            });
            result.valid = false;
            return result;
        }

        const courseObj = course as Record<string, unknown>;

        // Validate required fields
        this.validateRequiredField(courseObj, 'id', 'string', result);
        this.validateRequiredField(courseObj, 'number', 'string', result);
        this.validateRequiredField(courseObj, 'name', 'string', result);

        // Validate credits (should be number)
        if (courseObj.credits !== undefined && (typeof courseObj.credits !== 'number' || courseObj.credits < 0)) {
            result.errors.push({
                field: 'credits',
                message: 'Credits must be a non-negative number',
                severity: 'error',
                code: 'INVALID_CREDITS'
            });
            result.valid = false;
        }

        // Validate department
        if (!courseObj.department || typeof courseObj.department !== 'object') {
            result.errors.push({
                field: 'department',
                message: 'Department must be an object',
                severity: 'error',
                code: 'MISSING_DEPARTMENT'
            });
            result.valid = false;
        } else {
            const deptValidation = this.validateDepartment(courseObj.department, options);
            if (!deptValidation.valid) {
                deptValidation.errors.forEach(error => {
                    result.errors.push({
                        ...error,
                        field: `department.${error.field}`
                    });
                });
                result.valid = false;
            }
        }

        // Validate sections (hierarchical structure)
        const allSections = getAllSections(courseObj as any);
        if (allSections.length === 0) {
            result.warnings.push({
                field: 'sections',
                message: 'Course has no sections',
                suggestion: 'Verify course data is complete'
            });
        }

        return result;
    }

    validateDepartment(department: unknown, _options: SchemaValidationOptions = {}): ValidationResult {
        const result: ValidationResult = { valid: true, errors: [], warnings: [] };

        if (!department || typeof department !== 'object') {
            result.errors.push({
                field: 'department',
                message: 'Department must be an object',
                severity: 'critical',
                code: 'INVALID_TYPE'
            });
            result.valid = false;
            return result;
        }

        const departmentObj = department as Record<string, unknown>;

        this.validateRequiredField(departmentObj, 'abbreviation', 'string', result);
        this.validateRequiredField(departmentObj, 'name', 'string', result);

        // Validate abbreviation format (should be uppercase letters)
        if (departmentObj.abbreviation && typeof departmentObj.abbreviation === 'string' && !/^[A-Z]{2,6}$/.test(departmentObj.abbreviation)) {
            result.warnings.push({
                field: 'abbreviation',
                message: 'Department abbreviation should be 2-6 uppercase letters',
                suggestion: 'Consider normalizing department abbreviations'
            });
        }

        return result;
    }

    validateSchedulePreferences(preferences: unknown, options: SchemaValidationOptions = {}): ValidationResult {
        const result: ValidationResult = { valid: true, errors: [], warnings: [] };

        if (!preferences || typeof preferences !== 'object') {
            result.errors.push({
                field: 'preferences',
                message: 'Preferences must be an object',
                severity: 'critical',
                code: 'INVALID_TYPE'
            });
            result.valid = false;
            return result;
        }

        const preferencesObj = preferences as Record<string, unknown>;

        // Validate preferredTimeRange
        if (preferencesObj.preferredTimeRange) {
            const timeRange = preferencesObj.preferredTimeRange as any;
            
            if (!timeRange.startTime || !timeRange.endTime) {
                result.errors.push({
                    field: 'preferredTimeRange',
                    message: 'Time range must have startTime and endTime',
                    severity: 'error',
                    code: 'MISSING_TIME_RANGE'
                });
                result.valid = false;
            } else {
                // Validate time format
                if (!this.isValidTimeObject(timeRange.startTime) || !this.isValidTimeObject(timeRange.endTime)) {
                    result.errors.push({
                        field: 'preferredTimeRange',
                        message: 'Time objects must have valid hours and minutes',
                        severity: 'error',
                        code: 'INVALID_TIME_FORMAT'
                    });
                    result.valid = false;
                }
                
                // Check logical time ordering
                if (DateUtils.timeToMinutes(timeRange.startTime) >= DateUtils.timeToMinutes(timeRange.endTime)) {
                    result.errors.push({
                        field: 'preferredTimeRange',
                        message: 'Start time must be before end time',
                        severity: 'error',
                        code: 'INVALID_TIME_ORDER'
                    });
                    result.valid = false;
                }
            }
        }

        // Validate preferredDays
        if (preferencesObj.preferredDays) {
            if (!(preferencesObj.preferredDays instanceof Set)) {
                // Try to convert if it's an array
                if (Array.isArray(preferencesObj.preferredDays)) {
                    if (options.repairInPlace) {
                        preferencesObj.preferredDays = new Set(preferencesObj.preferredDays);
                        result.warnings.push({
                            field: 'preferredDays',
                            message: 'Converted preferredDays array to Set'
                        });
                    } else {
                        result.errors.push({
                            field: 'preferredDays',
                            message: 'preferredDays must be a Set',
                            severity: 'error',
                            code: 'INVALID_SET'
                        });
                        result.valid = false;
                    }
                }
            }

            if (preferencesObj.preferredDays instanceof Set) {
                const validDays = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
                for (const day of preferencesObj.preferredDays) {
                    if (!validDays.has(day)) {
                        result.warnings.push({
                            field: 'preferredDays',
                            message: `Unknown day: ${day}`,
                            suggestion: 'Valid days are: mon, tue, wed, thu, fri, sat, sun'
                        });
                    }
                }
            }
        }

        // Validate boolean fields
        if (preferencesObj.avoidBackToBackClasses !== undefined && typeof preferencesObj.avoidBackToBackClasses !== 'boolean') {
            if (options.repairInPlace) {
                preferencesObj.avoidBackToBackClasses = Boolean(preferencesObj.avoidBackToBackClasses);
                result.warnings.push({
                    field: 'avoidBackToBackClasses',
                    message: 'Converted avoidBackToBackClasses to boolean'
                });
            } else {
                result.errors.push({
                    field: 'avoidBackToBackClasses',
                    message: 'avoidBackToBackClasses must be a boolean',
                    severity: 'error',
                    code: 'INVALID_TYPE'
                });
                result.valid = false;
            }
        }

        return result;
    }

    validateUserScheduleState(userState: unknown, options: SchemaValidationOptions = {}): ValidationResult {
        const result: ValidationResult = { valid: true, errors: [], warnings: [] };

        if (!userState || typeof userState !== 'object') {
            result.errors.push({
                field: 'userState',
                message: 'UserScheduleState must be an object',
                severity: 'critical',
                code: 'INVALID_TYPE'
            });
            result.valid = false;
            return result;
        }

        const userStateObj = userState as Record<string, unknown>;

        // Validate savedSchedules
        this.validateArray(
            userStateObj,
            'savedSchedules',
            result,
            (schedule: unknown, index: number) => {
                const scheduleValidation = this.validateSchedule(schedule, options);
                if (!scheduleValidation.valid) {
                    scheduleValidation.errors.forEach(error => {
                        result.errors.push({
                            ...error,
                            field: `savedSchedules[${index}].${error.field}`
                        });
                    });
                    result.valid = false;
                }
                result.warnings.push(...scheduleValidation.warnings);
            }
        );

        // Validate preferences
        if (userStateObj.preferences) {
            const preferencesValidation = this.validateSchedulePreferences(userStateObj.preferences, options);
            if (!preferencesValidation.valid) {
                preferencesValidation.errors.forEach(error => {
                    result.errors.push({
                        ...error,
                        field: `preferences.${error.field}`
                    });
                });
                result.valid = false;
            }
            result.warnings.push(...preferencesValidation.warnings);
        }

        return result;
    }

    // Data integrity checks
    checkDataIntegrity(data: { schedules?: Schedule[], selectedCourses?: SelectedCourse[], activeScheduleId?: string | null }): ValidationResult {
        const result: ValidationResult = { valid: true, errors: [], warnings: [] };

        if (!data.schedules || !data.selectedCourses) {
            return result; // Can't check integrity without both pieces
        }

        // Check if active schedule ID references a valid schedule
        if (data.activeScheduleId) {
            const activeScheduleExists = data.schedules.some(s => s.id === data.activeScheduleId);
            if (!activeScheduleExists) {
                result.errors.push({
                    field: 'activeScheduleId',
                    message: 'Active schedule ID references non-existent schedule',
                    severity: 'error',
                    code: 'DANGLING_REFERENCE'
                });
                result.valid = false;
            }
        }

        // Check for duplicate schedule IDs using Map for O(n) performance
        const seenIds = new Map<string, number>();
        const duplicateIds: string[] = [];

        for (let i = 0; i < data.schedules.length; i++) {
            const id = data.schedules[i].id;
            if (seenIds.has(id)) {
                duplicateIds.push(id);
            } else {
                seenIds.set(id, i);
            }
        }

        if (duplicateIds.length > 0) {
            result.errors.push({
                field: 'schedules',
                message: `Duplicate schedule IDs found: ${duplicateIds.join(', ')}`,
                severity: 'critical',
                code: 'DUPLICATE_IDS'
            });
            result.valid = false;
        }

        // Check for orphaned selected courses (courses not in any schedule)
        const allScheduleCourses = new Set();
        data.schedules.forEach(schedule => {
            schedule.selectedCourses.forEach(sc => {
                allScheduleCourses.add(sc.course.id);
            });
        });

        const orphanedCourses = data.selectedCourses.filter(sc => !allScheduleCourses.has(sc.course.id));
        if (orphanedCourses.length > 0) {
            result.warnings.push({
                field: 'selectedCourses',
                message: `${orphanedCourses.length} selected courses are not in any schedule`,
                suggestion: 'Consider cleaning up orphaned course selections'
            });
        }

        return result;
    }

    // Repair functions
    repairSchedule(schedule: Schedule): void {
        // Ensure generatedSchedules is an array
        if (!Array.isArray(schedule.generatedSchedules)) {
            schedule.generatedSchedules = [];
        }

        // Ensure selectedCourses is an array
        if (!Array.isArray(schedule.selectedCourses)) {
            schedule.selectedCourses = [];
        }

        // Repair each selected course
        schedule.selectedCourses.forEach(selectedCourse => {
            this.repairSelectedCourse(selectedCourse);
        });
    }

    repairSelectedCourse(selectedCourse: SelectedCourse): void {
        // Ensure isRequired is boolean
        if (typeof selectedCourse.isRequired !== 'boolean') {
            selectedCourse.isRequired = false;
        }

        // Ensure section consistency
        if (selectedCourse.selectedSectionNumber && !selectedCourse.selectedSection) {
            // Try to find the section object from hierarchical structure
            const allSections = getAllSections(selectedCourse.course);
            const section = allSections.find(s => s.number === selectedCourse.selectedSectionNumber);
            selectedCourse.selectedSection = section || null;
        }

        if (selectedCourse.selectedSection && !selectedCourse.selectedSectionNumber) {
            selectedCourse.selectedSectionNumber = selectedCourse.selectedSection.number;
        }
    }

    // Schema migration utilities
    detectSchemaVersion(data: unknown): string {
        if (!data || typeof data !== 'object') return '1.0';

        const dataObj = data as Record<string, unknown>;
        if (dataObj.version && typeof dataObj.version === 'string') return dataObj.version;

        // Try to detect version based on data structure
        if (dataObj.selectedCourses && Array.isArray(dataObj.selectedCourses)) {
            // Check if selectedCourses has both selectedSection and selectedSectionNumber
            const hasModernStructure = dataObj.selectedCourses.some((sc: unknown) => {
                if (!sc || typeof sc !== 'object') return false;
                const scObj = sc as Record<string, unknown>;
                return scObj.hasOwnProperty('selectedSection') && scObj.hasOwnProperty('selectedSectionNumber');
            });
            if (hasModernStructure) return '2.0';
        }

        return '1.0'; // Default to oldest version
    }

    // Helper methods
    private validateRequiredField(obj: Record<string, unknown>, field: string, expectedType: string, result: ValidationResult): void {
        if (obj[field] === undefined || obj[field] === null) {
            result.errors.push({
                field,
                message: `${field} is required`,
                severity: 'error',
                code: 'MISSING_REQUIRED'
            });
            result.valid = false;
        } else if (typeof obj[field] !== expectedType) {
            result.errors.push({
                field,
                message: `${field} must be a ${expectedType}`,
                severity: 'error',
                code: 'INVALID_TYPE'
            });
            result.valid = false;
        }
    }

    private isValidTimeObject(time: unknown): boolean {
        if (!time || typeof time !== 'object') return false;
        const timeObj = time as Record<string, unknown>;
        return typeof timeObj.hours === 'number' &&
               typeof timeObj.minutes === 'number' &&
               timeObj.hours >= 0 && timeObj.hours < 24 &&
               timeObj.minutes >= 0 && timeObj.minutes < 60;
    }

    private validateArray(
        obj: Record<string, unknown>,
        field: string,
        result: ValidationResult,
        validator: (item: unknown, index: number) => void
    ): void {
        if (!Array.isArray(obj[field])) {
            result.errors.push({
                field,
                message: `${field} must be an array`,
                severity: 'error',
                code: 'INVALID_ARRAY'
            });
            result.valid = false;
        } else {
            obj[field].forEach((item: unknown, index: number) => {
                validator(item, index);
            });
        }
    }

    // Batch validation for multiple items
    validateBatch<T>(
        items: T[], 
        validator: (item: T, options?: SchemaValidationOptions) => ValidationResult,
        options: SchemaValidationOptions = {}
    ): ValidationResult {
        const result: ValidationResult = { valid: true, errors: [], warnings: [] };

        items.forEach((item, index) => {
            const itemResult = validator(item, options);
            if (!itemResult.valid) {
                itemResult.errors.forEach(error => {
                    result.errors.push({
                        ...error,
                        field: `[${index}].${error.field}`
                    });
                });
                result.valid = false;
            }
            result.warnings.push(...itemResult.warnings.map(warning => ({
                ...warning,
                field: `[${index}].${warning.field}`
            })));
        });

        return result;
    }
}