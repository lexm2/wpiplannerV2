/**
 * Validates course data integrity and format consistency
 */
import { Schedule, SelectedCourse } from '../../types/schedule'
import type { Course } from '../../types/types'
import { getAllSections } from '../../utils/courseUtils'

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

        this.validateRequiredField(scheduleObj, 'id', 'string', result);
        this.validateRequiredField(scheduleObj, 'name', 'string', result);

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
            this.repairSchedule(scheduleObj as unknown as Schedule);
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


        return result;
    }

    validateCourse(course: unknown, _options: SchemaValidationOptions = {}): ValidationResult {
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

        this.validateRequiredField(courseObj, 'id', 'string', result);
        this.validateRequiredField(courseObj, 'number', 'string', result);
        this.validateRequiredField(courseObj, 'name', 'string', result);

        this.validateRequiredField(courseObj, 'minCredits', 'number', result);
        this.validateRequiredField(courseObj, 'maxCredits', 'number', result);

        if (typeof courseObj.minCredits === 'number' && typeof courseObj.maxCredits === 'number') {
            if (courseObj.minCredits < 0 || courseObj.maxCredits < 0) {
                result.errors.push({
                    field: 'credits',
                    message: 'Credits must be non-negative',
                    severity: 'error',
                    code: 'INVALID_CREDITS'
                });
                result.valid = false;
            }
            if (courseObj.minCredits > courseObj.maxCredits) {
                result.errors.push({
                    field: 'credits',
                    message: 'minCredits cannot be greater than maxCredits',
                    severity: 'error',
                    code: 'INVALID_CREDITS'
                });
                result.valid = false;
            }
        }

        this.validateRequiredField(courseObj, 'departmentAbbr', 'string', result);
        this.validateRequiredField(courseObj, 'departmentName', 'string', result);

        const allSections = getAllSections(courseObj as unknown as Course);
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

    validateSchedulePreferences(preferences: unknown, _options: SchemaValidationOptions = {}): ValidationResult {
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

        // Preferences are minimal (theme + bookmarks); no further validation needed
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

    repairSchedule(schedule: Schedule): void {
        if (!Array.isArray(schedule.generatedSchedules)) {
            schedule.generatedSchedules = [];
        }

        if (!Array.isArray(schedule.selectedCourses)) {
            schedule.selectedCourses = [];
        }

        schedule.selectedCourses.forEach(selectedCourse => {
            this.repairSelectedCourse(selectedCourse);
        });
    }

    repairSelectedCourse(selectedCourse: SelectedCourse): void {
        if (typeof selectedCourse.isRequired !== 'boolean') {
            selectedCourse.isRequired = false;
        }
    }

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