/**
 * Validates course data integrity and format consistency
 */
import type { SelectedCourse } from '../../types/schedule';
import type { Course } from '../../types/types';
import { getAllSections } from '../../utils/courseUtils';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'critical';
  code: string;
}

interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

export class DataValidator {
  validateSchedule(schedule: unknown): ValidationResult {
    const result: ValidationResult = { valid: true, errors: [], warnings: [] };

    if (!schedule || typeof schedule !== 'object') {
      result.errors.push({
        field: 'schedule',
        message: 'Schedule must be an object',
        severity: 'critical',
        code: 'INVALID_TYPE',
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
        const courseValidation = this.validateSelectedCourse(course);
        if (!courseValidation.valid) {
          courseValidation.errors.forEach(error => {
            result.errors.push({
              ...error,
              field: `schedule.selectedCourses[${index}].${error.field}`,
            });
          });
          result.valid = false;
        }
        result.warnings.push(...courseValidation.warnings);
      },
    );

    if (!Array.isArray(scheduleObj.generatedSchedules)) {
      result.errors.push({
        field: 'schedule.generatedSchedules',
        message: 'generatedSchedules must be an array',
        severity: 'error',
        code: 'INVALID_ARRAY',
      });
      result.valid = false;
    }

    return result;
  }

  validateSelectedCourse(selectedCourse: unknown): ValidationResult {
    const result: ValidationResult = { valid: true, errors: [], warnings: [] };

    if (!selectedCourse || typeof selectedCourse !== 'object') {
      result.errors.push({
        field: 'selectedCourse',
        message: 'SelectedCourse must be an object',
        severity: 'critical',
        code: 'INVALID_TYPE',
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
        code: 'MISSING_REQUIRED',
      });
      result.valid = false;
    } else {
      const courseValidation = this.validateCourse(selectedCourseObj.course);
      if (!courseValidation.valid) {
        courseValidation.errors.forEach(error => {
          result.errors.push({
            ...error,
            field: `course.${error.field}`,
          });
        });
        result.valid = false;
      }
      result.warnings.push(...courseValidation.warnings);
    }

    if (typeof selectedCourseObj.isRequired !== 'boolean') {
      result.errors.push({
        field: 'isRequired',
        message: 'isRequired must be a boolean',
        severity: 'error',
        code: 'INVALID_TYPE',
      });
      result.valid = false;
    }

    return result;
  }

  validateCourse(course: unknown): ValidationResult {
    const result: ValidationResult = { valid: true, errors: [], warnings: [] };

    if (!course || typeof course !== 'object') {
      result.errors.push({
        field: 'course',
        message: 'Course must be an object',
        severity: 'critical',
        code: 'INVALID_TYPE',
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

    if (
      typeof courseObj.minCredits === 'number' &&
      typeof courseObj.maxCredits === 'number'
    ) {
      if (courseObj.minCredits < 0 || courseObj.maxCredits < 0) {
        result.errors.push({
          field: 'credits',
          message: 'Credits must be non-negative',
          severity: 'error',
          code: 'INVALID_CREDITS',
        });
        result.valid = false;
      }
      if (courseObj.minCredits > courseObj.maxCredits) {
        result.errors.push({
          field: 'credits',
          message: 'minCredits cannot be greater than maxCredits',
          severity: 'error',
          code: 'INVALID_CREDITS',
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
        suggestion: 'Verify course data is complete',
      });
    }

    return result;
  }

  /** Repairs `selectedCourse` in place; returns whether anything changed. */
  repairSelectedCourse(selectedCourse: SelectedCourse): boolean {
    if (typeof selectedCourse.isRequired !== 'boolean') {
      selectedCourse.isRequired = false;
      return true;
    }
    return false;
  }

  private validateRequiredField(
    obj: Record<string, unknown>,
    field: string,
    expectedType: string,
    result: ValidationResult,
  ): void {
    if (obj[field] === undefined || obj[field] === null) {
      result.errors.push({
        field,
        message: `${field} is required`,
        severity: 'error',
        code: 'MISSING_REQUIRED',
      });
      result.valid = false;
    } else if (typeof obj[field] !== expectedType) {
      result.errors.push({
        field,
        message: `${field} must be a ${expectedType}`,
        severity: 'error',
        code: 'INVALID_TYPE',
      });
      result.valid = false;
    }
  }

  private validateArray(
    obj: Record<string, unknown>,
    field: string,
    result: ValidationResult,
    validator: (item: unknown, index: number) => void,
  ): void {
    if (!Array.isArray(obj[field])) {
      result.errors.push({
        field,
        message: `${field} must be an array`,
        severity: 'error',
        code: 'INVALID_ARRAY',
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
    validator: (item: T) => ValidationResult,
  ): ValidationResult {
    const result: ValidationResult = { valid: true, errors: [], warnings: [] };

    items.forEach((item, index) => {
      const itemResult = validator(item);
      if (!itemResult.valid) {
        itemResult.errors.forEach(error => {
          result.errors.push({
            ...error,
            field: `[${index}].${error.field}`,
          });
        });
        result.valid = false;
      }
      result.warnings.push(
        ...itemResult.warnings.map(warning => ({
          ...warning,
          field: `[${index}].${warning.field}`,
        })),
      );
    });

    return result;
  }
}
