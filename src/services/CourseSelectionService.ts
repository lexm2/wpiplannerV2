import { Course } from '../types/types'
import { SelectedCourse } from '../types/schedule'
import { CourseManager } from '../core/CourseManager'
import { StorageManager } from '../core/StorageManager'

export class CourseSelectionService {
    private courseManager: CourseManager;
    private storageManager: StorageManager;

    constructor() {
        this.courseManager = new CourseManager();
        this.storageManager = new StorageManager();
        
        this.loadPersistedSelections();
        this.setupPersistenceListener();
    }

    selectCourse(course: Course, isRequired: boolean = false): void {
        this.courseManager.addCourse(course, isRequired);
        this.persistSelections();
    }

    unselectCourse(courseId: string): void {
        this.courseManager.removeCourse(courseId);
        this.persistSelections();
    }

    toggleCourseSelection(course: Course, isRequired: boolean = false): boolean {
        const isSelected = this.isCourseSelected(course.id);
        
        if (isSelected) {
            this.unselectCourse(course.id);
            return false;
        } else {
            this.selectCourse(course, isRequired);
            return true;
        }
    }

    setSelectedSection(courseId: string, sectionNumber: string | null): void {
        this.courseManager.setSelectedSection(courseId, sectionNumber);
        this.persistSelections();
    }

    getSelectedSection(courseId: string): string | null {
        return this.courseManager.getSelectedSection(courseId);
    }

    setSectionPreference(courseId: string, sectionNumber: string, preference: 'preferred' | 'denied'): void {
        this.courseManager.updateSectionPreference(courseId, sectionNumber, preference);
        this.persistSelections();
    }

    isCourseSelected(courseId: string): boolean {
        return this.courseManager.isSelected(courseId);
    }

    getSelectedCourses(): SelectedCourse[] {
        return this.courseManager.getSelectedCourses();
    }

    getSelectedCourse(courseId: string): SelectedCourse | undefined {
        return this.courseManager.getSelectedCourse(courseId);
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
}