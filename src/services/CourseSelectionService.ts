import { Course } from '../types/types'
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

    unselectCourse(courseId: string): void {
        if (!courseId || !Validators.validateCourseId(courseId)) {
            throw new Error('Invalid courseId provided');
        }
        this.courseManager.removeCourse(courseId);
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
        if (!courseId || !Validators.validateCourseId(courseId)) {
            throw new Error('Invalid courseId provided');
        }
        if (sectionNumber !== null && !Validators.validateSectionNumber(sectionNumber)) {
            throw new Error('Invalid sectionNumber provided');
        }
        this.courseManager.setSelectedSection(courseId, sectionNumber);
    }

    getSelectedSection(courseId: string): string | null {
        if (!courseId || !Validators.validateCourseId(courseId)) {
            throw new Error('Invalid courseId provided');
        }
        return this.courseManager.getSelectedSection(courseId);
    }

    setSectionPreference(courseId: string, sectionNumber: string, preference: 'preferred' | 'denied'): void {
        if (!courseId || !Validators.validateCourseId(courseId)) {
            throw new Error('Invalid courseId provided');
        }
        if (!sectionNumber || !Validators.validateSectionNumber(sectionNumber)) {
            throw new Error('Invalid sectionNumber provided');
        }
        if (!preference || !['preferred', 'denied'].includes(preference)) {
            throw new Error('Invalid preference provided. Must be "preferred" or "denied"');
        }
        this.courseManager.updateSectionPreference(courseId, sectionNumber, preference);
    }

    isCourseSelected(courseId: string): boolean {
        if (!courseId || !Validators.validateCourseId(courseId)) {
            return false;
        }
        return this.courseManager.isSelected(courseId);
    }

    getSelectedCourses(): SelectedCourse[] {
        return this.courseManager.getSelectedCourses();
    }

    getSelectedCourse(courseId: string): SelectedCourse | undefined {
        if (!courseId || !Validators.validateCourseId(courseId)) {
            return undefined;
        }
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