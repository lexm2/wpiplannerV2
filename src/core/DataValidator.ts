import { Schedule, UserScheduleState, SchedulePreferences, SelectedCourse } from '../types/schedule'
import { Course, Section, Department } from '../types/types'

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
    private static readonly CURRENT_SCHEMA_VERSION = '2.0';
    
    // Schema validation for core data types
    validateSchedule(schedule: any, options: SchemaValidationOptions = {}): ValidationResult {
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

        // Validate required fields
        this.validateRequiredField(schedule, 'id', 'string', result);
        this.validateRequiredField(schedule, 'name', 'string', result);
        
        // Validate arrays
        if (!Array.isArray(schedule.selectedCourses)) {
            result.errors.push({
                field: 'schedule.selectedCourses',
                message: 'selectedCourses must be an array',
                severity: 'error',
                code: 'INVALID_ARRAY'
            });
            result.valid = false;
        } else {
            // Validate each selected course
            schedule.selectedCourses.forEach((course: any, index: number) => {
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
            });
        }

        if (!Array.isArray(schedule.generatedSchedules)) {
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
            this.repairSchedule(schedule);
        }

        return result;
    }

    validateSelectedCourse(selectedCourse: any, options: SchemaValidationOptions = {}): ValidationResult {
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

        // Validate course object
        if (!selectedCourse.course) {
            result.errors.push({
                field: 'course',
                message: 'Course is required',
                severity: 'critical',
                code: 'MISSING_REQUIRED'
            });
            result.valid = false;
        } else {
            const courseValidation = this.validateCourse(selectedCourse.course, options);
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
        if (typeof selectedCourse.isRequired !== 'boolean') {
            if (options.repairInPlace) {
                selectedCourse.isRequired = false;
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
        const hasSelectedSection = selectedCourse.selectedSection !== null;
        const hasSelectedSectionNumber = selectedCourse.selectedSectionNumber !== null;

        if (hasSelectedSection !== hasSelectedSectionNumber) {
            result.warnings.push({
                field: 'selectedSection',
                message: 'selectedSection and selectedSectionNumber should be consistent',
                suggestion: 'Consider reconstructing section objects after data load'
            });
        }

        // Validate section number format if present
        if (selectedCourse.selectedSectionNumber && typeof selectedCourse.selectedSectionNumber !== 'string') {
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

    validateCourse(course: any, options: SchemaValidationOptions = {}): ValidationResult {
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

        // Validate required fields
        this.validateRequiredField(course, 'id', 'string', result);
        this.validateRequiredField(course, 'number', 'string', result);
        this.validateRequiredField(course, 'name', 'string', result);

        // Validate credits (should be number)
        if (course.credits !== undefined && (typeof course.credits !== 'number' || course.credits < 0)) {
            result.errors.push({
                field: 'credits',
                message: 'Credits must be a non-negative number',
                severity: 'error',
                code: 'INVALID_CREDITS'
            });
            result.valid = false;
        }

        // Validate department
        if (!course.department || typeof course.department !== 'object') {
            result.errors.push({
                field: 'department',
                message: 'Department must be an object',
                severity: 'error',
                code: 'MISSING_DEPARTMENT'
            });
            result.valid = false;
        } else {
            const deptValidation = this.validateDepartment(course.department, options);
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

        // Validate sections array
        if (!Array.isArray(course.sections)) {
            result.errors.push({
                field: 'sections',
                message: 'Sections must be an array',
                severity: 'error',
                code: 'INVALID_ARRAY'
            });
            result.valid = false;
        } else if (course.sections.length === 0) {
            result.warnings.push({
                field: 'sections',
                message: 'Course has no sections',
                suggestion: 'Verify course data is complete'
            });
        }

        return result;
    }

    validateDepartment(department: any, options: SchemaValidationOptions = {}): ValidationResult {
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

        this.validateRequiredField(department, 'abbreviation', 'string', result);
        this.validateRequiredField(department, 'name', 'string', result);

        // Validate abbreviation format (should be uppercase letters)
        if (department.abbreviation && !/^[A-Z]{2,6}$/.test(department.abbreviation)) {
            result.warnings.push({
                field: 'abbreviation',
                message: 'Department abbreviation should be 2-6 uppercase letters',
                suggestion: 'Consider normalizing department abbreviations'
            });
        }

        return result;
    }

    validateSchedulePreferences(preferences: any, options: SchemaValidationOptions = {}): ValidationResult {
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

        // Validate preferredTimeRange
        if (preferences.preferredTimeRange) {
            const timeRange = preferences.preferredTimeRange;
            
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
                if (this.timeToMinutes(timeRange.startTime) >= this.timeToMinutes(timeRange.endTime)) {
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
        if (preferences.preferredDays) {
            if (!(preferences.preferredDays instanceof Set)) {
                // Try to convert if it's an array
                if (Array.isArray(preferences.preferredDays)) {
                    if (options.repairInPlace) {
                        preferences.preferredDays = new Set(preferences.preferredDays);
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

            if (preferences.preferredDays instanceof Set) {
                const validDays = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
                for (const day of preferences.preferredDays) {
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
        if (preferences.avoidBackToBackClasses !== undefined && typeof preferences.avoidBackToBackClasses !== 'boolean') {
            if (options.repairInPlace) {
                preferences.avoidBackToBackClasses = Boolean(preferences.avoidBackToBackClasses);
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

    validateUserScheduleState(userState: any, options: SchemaValidationOptions = {}): ValidationResult {
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

        // Validate savedSchedules
        if (!Array.isArray(userState.savedSchedules)) {
            result.errors.push({
                field: 'savedSchedules',
                message: 'savedSchedules must be an array',
                severity: 'error',
                code: 'INVALID_ARRAY'
            });
            result.valid = false;
        } else {
            userState.savedSchedules.forEach((schedule: any, index: number) => {
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
            });
        }

        // Validate preferences
        if (userState.preferences) {
            const preferencesValidation = this.validateSchedulePreferences(userState.preferences, options);
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

        // Check for duplicate schedule IDs
        const scheduleIds = data.schedules.map(s => s.id);
        const duplicateIds = scheduleIds.filter((id, index) => scheduleIds.indexOf(id) !== index);
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
            // Try to find the section object
            const section = selectedCourse.course.sections?.find(s => s.number === selectedCourse.selectedSectionNumber);
            selectedCourse.selectedSection = section || null;
        }

        if (selectedCourse.selectedSection && !selectedCourse.selectedSectionNumber) {
            selectedCourse.selectedSectionNumber = selectedCourse.selectedSection.number;
        }
    }

    // Schema migration utilities
    detectSchemaVersion(data: any): string {
        if (data.version) return data.version;
        
        // Try to detect version based on data structure
        if (data.selectedCourses && Array.isArray(data.selectedCourses)) {
            // Check if selectedCourses has both selectedSection and selectedSectionNumber
            const hasModernStructure = data.selectedCourses.some((sc: any) => 
                sc.hasOwnProperty('selectedSection') && sc.hasOwnProperty('selectedSectionNumber')
            );
            if (hasModernStructure) return '2.0';
        }

        return '1.0'; // Default to oldest version
    }

    // Helper methods
    private validateRequiredField(obj: any, field: string, expectedType: string, result: ValidationResult): void {
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

    private isValidTimeObject(time: any): boolean {
        return time && 
               typeof time === 'object' &&
               typeof time.hours === 'number' &&
               typeof time.minutes === 'number' &&
               time.hours >= 0 && time.hours < 24 &&
               time.minutes >= 0 && time.minutes < 60;
    }

    private timeToMinutes(time: { hours: number; minutes: number }): number {
        return time.hours * 60 + time.minutes;
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