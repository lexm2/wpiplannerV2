import { Course, Section } from '../types/types'
import { SelectedCourse, Schedule } from '../types/schedule'

export class CourseManager {
    private selectedCourses: Map<string, SelectedCourse> = new Map();
    private listeners: Set<(courses: SelectedCourse[]) => void> = new Set();

    addCourse(course: Course, isRequired: boolean = false): void {
        const selectedCourse: SelectedCourse = {
            course,
            preferredSections: [],
            deniedSections: [],
            isRequired
        };
        
        this.selectedCourses.set(course.id, selectedCourse);
        this.notifyListeners();
    }

    removeCourse(courseId: string): void {
        this.selectedCourses.delete(courseId);
        this.notifyListeners();
    }

    updateSectionPreference(courseId: string, sectionNumber: string, preference: 'preferred' | 'denied'): void {
        const selectedCourse = this.selectedCourses.get(courseId);
        if (!selectedCourse) return;

        if (preference === 'preferred') {
            if (!selectedCourse.preferredSections.includes(sectionNumber)) {
                selectedCourse.preferredSections.push(sectionNumber);
            }
            const deniedIndex = selectedCourse.deniedSections.indexOf(sectionNumber);
            if (deniedIndex > -1) {
                selectedCourse.deniedSections.splice(deniedIndex, 1);
            }
        } else {
            if (!selectedCourse.deniedSections.includes(sectionNumber)) {
                selectedCourse.deniedSections.push(sectionNumber);
            }
            const preferredIndex = selectedCourse.preferredSections.indexOf(sectionNumber);
            if (preferredIndex > -1) {
                selectedCourse.preferredSections.splice(preferredIndex, 1);
            }
        }
        
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
        if (!selectedCourse) return [];

        return selectedCourse.course.sections.filter(section => 
            !selectedCourse.deniedSections.includes(section.number)
        );
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

    private notifyListeners(): void {
        const courses = this.getSelectedCourses();
        this.listeners.forEach(listener => listener(courses));
    }
}