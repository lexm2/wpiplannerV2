import { Course, Section, Department } from '../types/types'
import { SelectedCourse } from '../types/schedule'

export class CourseManager {
    private selectedCourses: Map<Course, SelectedCourse> = new Map();
    private listeners: Set<(courses: SelectedCourse[]) => void> = new Set();
    private allSections: Set<Section> = new Set();
    private allDepartments: Department[] = [];

    addCourse(course: Course, isRequired: boolean = false): void {
        const selectedCourse: SelectedCourse = {
            course,
            selectedSection: null,
            selectedSectionNumber: null,
            isRequired
        };
        
        this.selectedCourses.set(course, selectedCourse);
        this.notifyListeners();
    }

    removeCourse(course: Course): void {
        console.log(`🗑️ CourseManager: Removing course ${course.department.abbreviation}${course.number}`);
        this.selectedCourses.delete(course);
        this.notifyListeners();
    }


    getSelectedCourses(): SelectedCourse[] {
        return Array.from(this.selectedCourses.values());
    }

    getSelectedCourse(course: Course): SelectedCourse | undefined {
        return this.selectedCourses.get(course);
    }

    isSelected(course: Course): boolean {
        return this.selectedCourses.has(course);
    }

    getAvailableSections(course: Course): Section[] {
        const selectedCourse = this.selectedCourses.get(course);
        if (!this.validateCourseExists(course, selectedCourse)) return [];

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

    setSelectedSection(course: Course, sectionNumber: string | null): void {
        const selectedCourse = this.selectedCourses.get(course);
        if (!this.validateCourseExists(course, selectedCourse)) return;

        const previousSection = selectedCourse!.selectedSectionNumber;
        console.log(`📝 CourseManager: Setting section for ${course.department.abbreviation}${course.number} from "${previousSection}" to "${sectionNumber}"`);

        // Find the actual Section object
        const sectionObject = sectionNumber ? 
            course.sections.find(s => s.number === sectionNumber) || null : 
            null;

        selectedCourse!.selectedSection = sectionObject;
        selectedCourse!.selectedSectionNumber = sectionNumber;
        this.notifyListeners();
    }

    getSelectedSection(course: Course): string | null {
        const selectedCourse = this.selectedCourses.get(course);
        return selectedCourse?.selectedSectionNumber || null;
    }

    getSelectedSectionObject(course: Course): Section | null {
        const selectedCourse = this.selectedCourses.get(course);
        return selectedCourse?.selectedSection || null;
    }


    loadSelectedCourses(selectedCourses: SelectedCourse[]): void {
        this.selectedCourses.clear();
        
        selectedCourses.forEach(selectedCourse => {
            // Handle backward compatibility: if old format only has selectedSection as string
            if (selectedCourse.selectedSection && typeof selectedCourse.selectedSection === 'string') {
                const sectionNumber = selectedCourse.selectedSection as any as string;
                const sectionObject = selectedCourse.course.sections.find(s => s.number === sectionNumber) || null;
                
                selectedCourse.selectedSection = sectionObject;
                selectedCourse.selectedSectionNumber = sectionNumber;
            }
            // Ensure selectedSectionNumber is set if we have a Section object but no string
            else if (selectedCourse.selectedSection && !selectedCourse.selectedSectionNumber) {
                selectedCourse.selectedSectionNumber = selectedCourse.selectedSection.number;
            }
            
            // Note: computedTerm values are now pre-computed by Java backend - no migration needed
            
            this.selectedCourses.set(selectedCourse.course, selectedCourse);
        });
        
        this.notifyListeners();
    }

    private validateCourseExists(course: Course, selectedCourse?: SelectedCourse): selectedCourse is SelectedCourse {
        if (!selectedCourse) {
            console.warn(`Course ${course.id} not found in selected courses`);
            return false;
        }
        return true;
    }

    private notifyListeners(): void {
        const courses = this.getSelectedCourses();
        console.log(`🔔 CourseManager: Notifying ${this.listeners.size} listeners of course changes`);
        console.log(`📊 Current selected courses: ${courses.length} total`);
        courses.forEach(course => {
            const sectionInfo = course.selectedSectionNumber ? `section ${course.selectedSectionNumber}` : 'no section selected';
            console.log(`  • ${course.course.department.abbreviation}${course.course.number} (${sectionInfo})`);
        });
        this.listeners.forEach(listener => listener(courses));
    }

    // Section storage and access methods
    setAllDepartments(departments: Department[]): void {
        this.allDepartments = departments;
        this.populateAllSections();
        this.refreshSelectedCoursesWithFreshData();
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
        
    }

    getAllSections(): Section[] {
        return Array.from(this.allSections);
    }

    getAllSectionsForCourse(course: Course): Section[] {
        return course.sections;
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

    getAllDepartments(): Department[] {
        return this.allDepartments;
    }

    private refreshSelectedCoursesWithFreshData(): void {
        if (this.allDepartments.length === 0) {
            return;
        }
        
        let refreshedCount = 0;
        const updatedSelections = new Map<Course, SelectedCourse>();
        
        this.selectedCourses.forEach((selectedCourse, oldCourse) => {
            const freshCourse = this.findFreshCourse(oldCourse);
            
            if (freshCourse) {
                const updatedSelectedCourse: SelectedCourse = {
                    course: freshCourse,
                    selectedSection: null,
                    selectedSectionNumber: selectedCourse.selectedSectionNumber,
                    isRequired: selectedCourse.isRequired
                };
                
                if (selectedCourse.selectedSectionNumber) {
                    const freshSection = freshCourse.sections.find(s => 
                        s.number === selectedCourse.selectedSectionNumber
                    );
                    if (freshSection) {
                        updatedSelectedCourse.selectedSection = freshSection;
                    }
                }
                
                updatedSelections.set(freshCourse, updatedSelectedCourse);
                refreshedCount++;
            } else {
                updatedSelections.set(oldCourse, selectedCourse);
            }
        });
        
        this.selectedCourses = updatedSelections;
        
        if (refreshedCount > 0) {
            console.log(`[CourseManager] Refreshed ${refreshedCount} selected courses with fresh data`);
            this.notifyListeners();
        }
    }

    private findFreshCourse(oldCourse: Course): Course | null {
        for (const department of this.allDepartments) {
            for (const course of department.courses) {
                if (course.id === oldCourse.id && course.number === oldCourse.number) {
                    return course;
                }
            }
        }
        return null;
    }

    reconstructSectionObjects(): void {
        let reconstructedCount = 0;
        
        this.selectedCourses.forEach((selectedCourse, course) => {
            if (selectedCourse.selectedSectionNumber && !selectedCourse.selectedSection) {
                const sectionObject = course.sections.find(s => 
                    s.number === selectedCourse.selectedSectionNumber
                ) || null;
                
                if (sectionObject) {
                    selectedCourse.selectedSection = sectionObject;
                    reconstructedCount++;
                }
            }
        });
        
        if (reconstructedCount > 0) {
            this.notifyListeners(); // Trigger UI updates
        }
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