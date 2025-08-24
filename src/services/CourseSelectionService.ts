import { Course, Department, Section } from '../types/types'
import { SelectedCourse } from '../types/schedule'
import { CourseManager } from '../core/CourseManager'
import { StorageManager } from '../core/StorageManager'
import { Validators } from '../utils/validators'

export class CourseSelectionService {
    private courseManager: CourseManager;
    private storageManager: StorageManager;

    constructor(courseManager?: CourseManager, storageManager?: StorageManager) {
        this.courseManager = courseManager || new CourseManager();
        this.storageManager = storageManager || new StorageManager();
        
        this.loadPersistedSelections();
        this.setupPersistenceListener();
    }

    selectCourse(course: Course, isRequired: boolean = false): void {
        if (!Validators.isValidCourse(course)) {
            throw new Error('Invalid course object provided');
        }
        this.courseManager.addCourse(course, isRequired);
    }

    unselectCourse(course: Course): void {
        if (!Validators.isValidCourse(course)) {
            throw new Error('Invalid course object provided');
        }
        this.courseManager.removeCourse(course);
    }

    toggleCourseSelection(course: Course, isRequired: boolean = false): boolean {
        const isSelected = this.isCourseSelected(course);
        
        if (isSelected) {
            this.unselectCourse(course);
            return false;
        } else {
            this.selectCourse(course, isRequired);
            return true;
        }
    }

    setSelectedSection(course: Course, sectionNumber: string | null): void {
        if (!Validators.isValidCourse(course)) {
            throw new Error('Invalid course object provided');
        }
        if (sectionNumber !== null && !Validators.validateSectionNumber(sectionNumber)) {
            throw new Error('Invalid sectionNumber provided');
        }
        this.courseManager.setSelectedSection(course, sectionNumber);
    }

    getSelectedSection(course: Course): string | null {
        if (!Validators.isValidCourse(course)) {
            throw new Error('Invalid course object provided');
        }
        return this.courseManager.getSelectedSection(course);
    }


    isCourseSelected(course: Course): boolean {
        if (!Validators.isValidCourse(course)) {
            return false;
        }
        return this.courseManager.isSelected(course);
    }

    getSelectedCourses(): SelectedCourse[] {
        return this.courseManager.getSelectedCourses();
    }

    getSelectedCourse(course: Course): SelectedCourse | undefined {
        if (!Validators.isValidCourse(course)) {
            return undefined;
        }
        return this.courseManager.getSelectedCourse(course);
    }

    clearAllSelections(): void {
        this.courseManager.clearAll();
        this.storageManager.clearSelectedCourses();
    }

    getSelectedCoursesCount(): number {
        return this.getSelectedCourses().length;
    }

    getSelectedCourseIds(): string[] {
        return this.getSelectedCourses().map(sc => sc.course.id);
    }

    onSelectionChange(listener: (courses: SelectedCourse[]) => void): void {
        this.courseManager.onSelectionChange(listener);
    }

    offSelectionChange(listener: (courses: SelectedCourse[]) => void): void {
        this.courseManager.offSelectionChange(listener);
    }

    private loadPersistedSelections(): void {
        const persistedCourses = this.storageManager.loadSelectedCourses();
        if (persistedCourses.length > 0) {
            this.courseManager.loadSelectedCourses(persistedCourses);
        }
    }

    private setupPersistenceListener(): void {
        this.courseManager.onSelectionChange((courses) => {
            this.storageManager.saveSelectedCourses(courses);
        });
    }

    private persistSelections(): void {
        const selectedCourses = this.getSelectedCourses();
        this.storageManager.saveSelectedCourses(selectedCourses);
    }

    exportSelections(): string {
        const selectedCourses = this.getSelectedCourses();
        return JSON.stringify({
            version: '1.0',
            timestamp: new Date().toISOString(),
            selectedCourses
        }, null, 2);
    }

    importSelections(jsonData: string): boolean {
        try {
            const data = JSON.parse(jsonData);
            if (data.selectedCourses && Array.isArray(data.selectedCourses)) {
                this.courseManager.loadSelectedCourses(data.selectedCourses);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to import selections:', error);
            return false;
        }
    }

    // Department and section management
    setAllDepartments(departments: Department[]): void {
        this.courseManager.setAllDepartments(departments);
    }

    getAllSections(): Section[] {
        return this.courseManager.getAllSections();
    }

    getAllSectionsForCourse(course: Course): Section[] {
        return this.courseManager.getAllSectionsForCourse(course);
    }

    getAllSectionsForDepartment(deptAbbreviation: string): Section[] {
        return this.courseManager.getAllSectionsForDepartment(deptAbbreviation);
    }

    // Helper methods for backward compatibility
    findCourseById(courseId: string): Course | undefined {
        for (const dept of this.courseManager.getAllDepartments()) {
            const course = dept.courses.find(c => c.id === courseId);
            if (course) return course;
        }
        return undefined;
    }

    // Legacy methods using courseId (for backward compatibility)
    unselectCourseById(courseId: string): void {
        const course = this.findCourseById(courseId);
        if (course) {
            this.unselectCourse(course);
        }
    }

    isCourseSelectedById(courseId: string): boolean {
        const course = this.findCourseById(courseId);
        return course ? this.isCourseSelected(course) : false;
    }

    setSelectedSectionById(courseId: string, sectionNumber: string | null): void {
        const course = this.findCourseById(courseId);
        if (course) {
            this.setSelectedSection(course, sectionNumber);
        }
    }

    getSelectedSectionById(courseId: string): string | null {
        const course = this.findCourseById(courseId);
        return course ? this.getSelectedSection(course) : null;
    }

    getSelectedCourseById(courseId: string): SelectedCourse | undefined {
        const course = this.findCourseById(courseId);
        return course ? this.getSelectedCourse(course) : undefined;
    }
}