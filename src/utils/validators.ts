/** Section-number format check used by CourseSelectionService. */
export class Validators {
  static validateSectionNumber(sectionNumber: string): boolean {
    // Permissive: WPI has diverse formats (A01, Lab1, "Interest List-A Term", "AL02/AD02/AX01")
    return (
      typeof sectionNumber === 'string' &&
      sectionNumber.trim().length > 0 &&
      /^[\w\s\-/]+$/.test(sectionNumber)
    );
  }
}
