import { Course, Section } from '../types/types'
import { SelectedCourse, Schedule } from '../types/schedule'

export class CourseManager {
    private selectedCourses: Map<string, SelectedCourse> = new Map();
    private listeners: Set<(courses: SelectedCourse[]) => void> = new Set();

    addCourse(course: Course, isRequired: boolean = false): void {
        const selectedCourse: SelectedCourse = {
            course,
            selectedSection: null,
            isRequired
        };
        
        this.selectedCourses.set(course.id, selectedCourse);
        this.notifyListeners();
    }

    removeCourse(courseId: string): void {
        this.selectedCourses.delete(courseId);
        this.notifyListeners();
    }


    getSelectedCourses(): SelectedCourse[] {
        return Array.from(this.selectedCourses.values());
    }

    getSelectedCourse(courseId: string): SelectedCourse | undefined {
        return this.selectedCourses.get(courseId);
    }

    isSelected(courseId: string): boolean {
        return this.selectedCourses.has(courseId);
    }

    getAvailableSections(courseId: string): Section[] {
        const selectedCourse = this.selectedCourses.get(courseId);
        if (!this.validateCourseExists(courseId, selectedCourse)) return [];

        return selectedCourse!.course.sections;
    }

    clearAll(): void {
        this.selectedCourses.clear();
        this.notifyListeners();
    }

    onSelectionChange(listener: (courses: SelectedCourse[]) => void): void {
        this.listeners.add(listener);
    }

    offSelectionChange(listener: (courses: SelectedCourse[]) => void): void {
        this.listeners.delete(listener);
    }

    setSelectedSection(courseId: string, sectionNumber: string | null): void {
        const selectedCourse = this.selectedCourses.get(courseId);
        if (!this.validateCourseExists(courseId, selectedCourse)) return;

        selectedCourse!.selectedSection = sectionNumber;
        this.notifyListeners();
    }

    getSelectedSection(courseId: string): string | null {
        const selectedCourse = this.selectedCourses.get(courseId);
        return selectedCourse?.selectedSection || null;
    }


    loadSelectedCourses(selectedCourses: SelectedCourse[]): void {
        this.selectedCourses.clear();
        selectedCourses.forEach(course => {
            this.selectedCourses.set(course.course.id, course);
        });
        this.notifyListeners();
    }

    private validateCourseExists(courseId: string, selectedCourse?: SelectedCourse): selectedCourse is SelectedCourse {
        if (!selectedCourse) {
            console.warn(`Course ${courseId} not found in selected courses`);
            return false;
        }
        return true;
    }

    private notifyListeners(): void {
        const courses = this.getSelectedCourses();
        this.listeners.forEach(listener => listener(courses));
    }
}