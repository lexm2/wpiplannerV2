/**
 * Section-number format check used by CourseSelectionService.
 *
 * This class previously carried 15 further static validators (isValidCourse,
 * isValidSchedule, sanitizeCourseData, escapeHtml, …) that had no callers
 * anywhere and duplicated checks in utils/typeGuards.ts and
 * core/validation/DataValidator.ts. They were deleted in the audit cleanup;
 * recover from git history if one is ever needed.
 */
export class Validators {
    static validateSectionNumber(sectionNumber: string): boolean {
        // Permissive: WPI has diverse formats (A01, Lab1, "Interest List-A Term", "AL02/AD02/AX01")
        return typeof sectionNumber === 'string' &&
               sectionNumber.trim().length > 0 && 
               /^[\w\s\-/]+$/.test(sectionNumber);
    }
}
