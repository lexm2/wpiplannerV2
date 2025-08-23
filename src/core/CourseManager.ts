import { Course, Section, Department } from '../types/types'
import { SelectedCourse, Schedule } from '../types/schedule'

export class CourseManager {
    private selectedCourses: Map<string, SelectedCourse> = new Map();
    private listeners: Set<(courses: SelectedCourse[]) => void> = new Set();
    private allSections: Set<Section> = new Set();
    private allDepartments: Department[] = [];

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

    // Section storage and access methods
    setAllDepartments(departments: Department[]): void {
        this.allDepartments = departments;
        this.populateAllSections();
    }

    private populateAllSections(): void {
        this.allSections.clear();
        
        for (const department of this.allDepartments) {
            for (const course of department.courses) {
                for (const section of course.sections) {
                    this.allSections.add(section);
                }
            }
        }
        
        console.log(`CourseManager: Populated ${this.allSections.size} sections from ${this.allDepartments.length} departments`);
    }

    getAllSections(): Section[] {
        return Array.from(this.allSections);
    }

    getAllSectionsForCourse(courseId: string): Section[] {
        return Array.from(this.allSections).filter(section => {
            const course = this.findCourseContainingSection(section);
            return course?.id === courseId;
        });
    }

    getAllSectionsForDepartment(deptAbbreviation: string): Section[] {
        const department = this.allDepartments.find(dept => dept.abbreviation === deptAbbreviation);
        if (!department) return [];
        
        const sections: Section[] = [];
        for (const course of department.courses) {
            sections.push(...course.sections);
        }
        return sections;
    }

    private findCourseContainingSection(section: Section): Course | undefined {
        for (const department of this.allDepartments) {
            for (const course of department.courses) {
                if (course.sections.includes(section)) {
                    return course;
                }
            }
        }
        return undefined;
    }
}