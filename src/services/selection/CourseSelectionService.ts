import { Course, Department, Section } from '../../types/types'
import { SelectedCourse } from '../../types/schedule'
import type { ComponentSelections, CourseComponentSelections } from '../../types/scheduling'
import { ProfileStateManager } from '../../core/state/ProfileStateManager'
import { DataValidator } from '../../core/validation/DataValidator'
import { Validators } from '../../utils/validators'

export interface CourseSelectionOptions {
    isRequired?: boolean;
    validateBeforeAdd?: boolean;
    autoSave?: boolean;
}

export interface CourseSelectionResult {
    success: boolean;
    course?: SelectedCourse;
    error?: string;
    warnings?: string[];
}

/**
 * Course selection API with synchronous persistence and validation.
 * Mutations flow through ProfileStateManager → appState runes; consumers react
 * to those runes directly (no event system here).
 */
export class CourseSelectionService {
    private profileStateManager: ProfileStateManager;
    private dataValidator: DataValidator;
    private isInitialized = false;
    private initializationPromise: Promise<boolean> | null = null;

    constructor(
        profileStateManager?: ProfileStateManager,
        dataValidator?: DataValidator
    ) {
        this.profileStateManager = profileStateManager || ProfileStateManager.getInstance();
        this.dataValidator = dataValidator || new DataValidator();
    }

    // Initialization
    async initialize(): Promise<boolean> {
        if (this.isInitialized) return true;
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = this.performInitialization();
        return this.initializationPromise;
    }

    private async performInitialization(): Promise<boolean> {
        try {
            console.log('Initializing CourseSelectionService...');

            // NOTE: ProfileStateManager is already initialized by StorageService before this service
            // Redundant loadFromStorage() call removed to prevent duplicate schedule creation race condition

            this.isInitialized = true;

            // Validate loaded data
            const healthCheck = await this.performHealthCheck();
            if (!healthCheck.healthy) {
                console.warn('Health check found issues:', healthCheck.issues);
                // Attempt repairs
                await this.attemptDataRepair();
            }

            console.log('CourseSelectionService initialized successfully');
            return true;

        } catch (error) {
            console.error('Failed to initialize CourseSelectionService:', error);
            this.isInitialized = false;
            return false;
        } finally {
            this.initializationPromise = null;
        }
    }

    // Core course selection methods
    async selectCourse(course: Course, options: CourseSelectionOptions = {}): Promise<CourseSelectionResult> {
        await this.ensureInitialized();

        const {
            isRequired = false,
            validateBeforeAdd = true
        } = options;

        try {
            let warnings: string[] | undefined;

            // Validate course if requested
            if (validateBeforeAdd) {
                const validation = this.dataValidator.validateCourse(course);
                if (!validation.valid) {
                    return {
                        success: false,
                        error: `Invalid course: ${validation.errors.map(e => e.message).join(', ')}`,
                        warnings: validation.warnings.map(w => w.message)
                    };
                }

                // Capture warnings even if validation passed
                if (validation.warnings.length > 0) {
                    warnings = validation.warnings.map(w => w.message);
                }
            }

            // Call ProfileStateManager directly - synchronous persistence
            this.profileStateManager.selectCourse(course, isRequired, 'service');

            // Get updated course
            const selectedCourse = this.profileStateManager.getSelectedCourse(course);

            return {
                success: true,
                course: selectedCourse,
                warnings
            };

        } catch (error) {
            console.error('Error selecting course:', error);
            return {
                success: false,
                error: `Error selecting course: ${error}`
            };
        }
    }

    async unselectCourse(course: Course): Promise<CourseSelectionResult> {
        await this.ensureInitialized();

        try {
            if (!this.isCourseSelected(course)) {
                return {
                    success: false,
                    error: 'Course is not currently selected'
                };
            }

            // Call ProfileStateManager directly - synchronous persistence
            this.profileStateManager.unselectCourse(course, 'service');

            return {
                success: true
            };

        } catch (error) {
            console.error('Error unselecting course:', error);
            return {
                success: false,
                error: `Error unselecting course: ${error}`
            };
        }
    }

    async toggleCourseSelection(course: Course, options: CourseSelectionOptions = {}): Promise<CourseSelectionResult> {
        const isSelected = this.isCourseSelected(course);

        if (isSelected) {
            return this.unselectCourse(course);
        } else {
            return this.selectCourse(course, options);
        }
    }

    async setSelectedSection(course: Course, sectionNumber: string | null): Promise<CourseSelectionResult> {
        await this.ensureInitialized();

        try {
            if (!this.isCourseSelected(course)) {
                return {
                    success: false,
                    error: 'Course must be selected before setting a section'
                };
            }

            // Validate section number if provided
            if (sectionNumber !== null && !Validators.validateSectionNumber(sectionNumber)) {
                return {
                    success: false,
                    error: 'Invalid section number format'
                };
            }

            // Call ProfileStateManager directly - synchronous persistence
            this.profileStateManager.setSelectedSection(course, sectionNumber, 'service');

            // Get updated course
            const selectedCourse = this.profileStateManager.getSelectedCourse(course);

            return {
                success: true,
                course: selectedCourse
            };

        } catch (error) {
            console.error('Error setting selected section:', error);
            return {
                success: false,
                error: `Error setting selected section: ${error}`
            };
        }
    }

    async clearAllSelections(): Promise<{ success: boolean; error?: string }> {
        await this.ensureInitialized();

        try {
            // Call ProfileStateManager directly - synchronous persistence
            this.profileStateManager.clearAllSelections('service');

            return { success: true };

        } catch (error) {
            console.error('Error clearing selections:', error);
            return {
                success: false,
                error: `Error clearing selections: ${error}`
            };
        }
    }

    async clearCourseComponents(course: Course): Promise<CourseSelectionResult> {
        await this.ensureInitialized();

        try {
            if (!this.isCourseSelected(course)) {
                return {
                    success: false,
                    error: 'Course must be selected before clearing components'
                };
            }

            this.profileStateManager.setSelectedComponents(course, null, null, null, 'service');

            const selectedCourse = this.profileStateManager.getSelectedCourse(course);

            return {
                success: true,
                course: selectedCourse
            };

        } catch (error) {
            console.error('Error clearing course components:', error);
            return {
                success: false,
                error: `Error clearing course components: ${error}`
            };
        }
    }

    async clearAllComponents(): Promise<{ success: boolean; error?: string }> {
        await this.ensureInitialized();

        try {
            const selectedCourses = this.profileStateManager.getSelectedCourses();

            await this.profileStateManager.withBatch(async () => {
                for (const selectedCourse of selectedCourses) {
                    this.profileStateManager.setSelectedComponents(
                        selectedCourse.course,
                        null,
                        null,
                        null,
                        'service'
                    );
                }
            });

            return { success: true };

        } catch (error) {
            console.error('Error clearing components:', error);
            return {
                success: false,
                error: `Error clearing components: ${error}`
            };
        }
    }

    // Component-based selection for hierarchical course structure (lectures, discussions, labs)

    /**
     * Set selected components (lecture, discussion, lab) for a hierarchical course
     */
    async setSelectedComponents(
        course: Course,
        lecture: Section | null,
        discussion: Section | null,
        lab: Section | null
    ): Promise<CourseSelectionResult> {
        await this.ensureInitialized();

        try {
            if (!this.isCourseSelected(course)) {
                return {
                    success: false,
                    error: 'Course must be selected before setting components'
                };
            }

            // Call ProfileStateManager directly - synchronous persistence
            this.profileStateManager.setSelectedComponents(course, lecture, discussion, lab, 'service');

            // Get updated course
            const selectedCourse = this.profileStateManager.getSelectedCourse(course);

            return {
                success: true,
                course: selectedCourse
            };

        } catch (error) {
            console.error('Error setting selected components:', error);
            return {
                success: false,
                error: `Error setting selected components: ${error}`
            };
        }
    }

    /**
     * Batch set selected components for multiple courses
     * This is optimized for auto-scheduler to avoid triggering listeners on each update
     */
    async batchSetSelectedComponents(
        selections: CourseComponentSelections[],
        skipSnapshot = false
    ): Promise<CourseSelectionResult> {
        await this.ensureInitialized();

        try {
            for (const selection of selections) {
                if (!this.isCourseSelected(selection.course)) {
                    return {
                        success: false,
                        error: `Course ${selection.course.id} must be selected before setting components`
                    };
                }
            }

            await this.profileStateManager.withBatch(async () => {
                for (const selection of selections) {
                    this.profileStateManager.setSelectedComponents(
                        selection.course,
                        selection.lecture,
                        selection.discussion,
                        selection.lab,
                        'service'
                    );
                }
            }, skipSnapshot);

            return {
                success: true
            };

        } catch (error) {
            console.error('Error batch setting selected components:', error);
            return {
                success: false,
                error: `Error batch setting selected components: ${error}`
            };
        }
    }

    /**
     * Get the currently selected components for a course
     */
    getSelectedComponents(course: Course): ComponentSelections {
        if (!this.isInitialized) {
            return { lecture: null, discussion: null, lab: null };
        }

        const selectedCourse = this.profileStateManager.getSelectedCourses().find(
            sc => sc.course.id === course.id
        );

        return {
            lecture: selectedCourse?.selectedLecture || null,
            discussion: selectedCourse?.selectedDiscussion || null,
            lab: selectedCourse?.selectedLab || null
        };
    }

    /**
     * Check if a course has incomplete component selections
     * (i.e., course is selected but doesn't have all required components)
     */
    hasIncompleteSelections(course: Course): boolean {
        if (!this.isCourseSelected(course)) return false;

        const components = this.getSelectedComponents(course);

        // For hierarchical courses, lecture is always required
        if (!components.lecture) return true;

        // TODO: Add logic to check if discussion/lab are required based on course structure
        // For now, we'll consider it complete if lecture is selected
        return false;
    }

    /**
     * Get all courses with incomplete component selections
     */
    getIncompleteCourses(): SelectedCourse[] {
        if (!this.isInitialized) return [];

        const selectedCourses = this.profileStateManager.getSelectedCourses();
        return selectedCourses.filter(sc => {
            const hasAnyComponent = sc.selectedLecture || sc.selectedDiscussion || sc.selectedLab;
            return !hasAnyComponent;
        });
    }

    // Section locking methods to prevent auto-scheduler from changing manual selections

    async lockSection(course: Course, sectionCrn: string): Promise<CourseSelectionResult> {
        await this.ensureInitialized();

        try {
            if (!this.isCourseSelected(course)) {
                return {
                    success: false,
                    error: 'Course must be selected before locking a section'
                };
            }

            this.profileStateManager.lockSection(course, sectionCrn, 'service');

            const selectedCourse = this.profileStateManager.getSelectedCourse(course);

            return {
                success: true,
                course: selectedCourse
            };

        } catch (error) {
            console.error('Error locking section:', error);
            return {
                success: false,
                error: `Error locking section: ${error}`
            };
        }
    }

    async unlockSection(course: Course, sectionCrn: string): Promise<CourseSelectionResult> {
        await this.ensureInitialized();

        try {
            if (!this.isCourseSelected(course)) {
                return {
                    success: false,
                    error: 'Course must be selected before unlocking a section'
                };
            }

            this.profileStateManager.unlockSection(course, sectionCrn, 'service');

            const selectedCourse = this.profileStateManager.getSelectedCourse(course);

            return {
                success: true,
                course: selectedCourse
            };

        } catch (error) {
            console.error('Error unlocking section:', error);
            return {
                success: false,
                error: `Error unlocking section: ${error}`
            };
        }
    }

    isSectionLocked(course: Course, sectionCrn: string): boolean {
        if (!this.isInitialized) return false;
        return this.profileStateManager.isSectionLocked(course, sectionCrn);
    }

    getLockedSections(course: Course): Set<string> {
        if (!this.isInitialized) return new Set();
        return this.profileStateManager.getLockedSections(course);
    }

    setCourseColor(courseId: string, color: string): boolean {
        if (!this.isInitialized) return false;
        this.profileStateManager.setCourseColor(courseId, color, 'service');
        return true;
    }

    // Query methods
    isCourseSelected(course: Course): boolean {
        if (!this.isInitialized) return false;

        return this.profileStateManager.getSelectedCourse(course) !== undefined;
    }

    getSelectedCourse(course: Course): SelectedCourse | undefined {
        if (!this.isInitialized) return undefined;

        return this.profileStateManager.getSelectedCourse(course);
    }

    getSelectedCourses(): SelectedCourse[] {
        if (!this.isInitialized) return [];

        return this.profileStateManager.getSelectedCourses();
    }


    getSelectedSection(course: Course): string | null {
        const selectedCourse = this.getSelectedCourse(course);
        return selectedCourse?.selectedLecture?.number ||
               selectedCourse?.selectedDiscussion?.number ||
               selectedCourse?.selectedLab?.number ||
               null;
    }

    getSelectedSectionObject(course: Course): Section | null {
        const selectedCourse = this.getSelectedCourse(course);
        return selectedCourse?.selectedLecture ||
               selectedCourse?.selectedDiscussion ||
               selectedCourse?.selectedLab ||
               null;
    }

    getSelectedCoursesCount(): number {
        if (!this.isInitialized) return 0;

        return this.profileStateManager.getSelectedCourses().length;
    }

    getSelectedCourseIds(): string[] {
        return this.getSelectedCourses().map(sc => sc.course.id);
    }


    // Department and section management
    setAllDepartments(departments: Department[]): void {
        // This would typically be handled by a separate service
        // For now, we'll store it in the profile state manager if needed
        console.log(`Loaded ${departments.length} departments`);
    }

    getAllSections(): Section[] {
        // This would be retrieved from the course data service
        return [];
    }

    getAllSectionsForCourse(course: Course): Section[] {
        const sections: Section[] = [];

        // Handle hierarchical lecture structure
        if (course.lectures) {
            course.lectures.forEach(lectureGroup => {
                sections.push(lectureGroup.section);
                sections.push(...lectureGroup.compatibleDiscussions);
                sections.push(...lectureGroup.compatibleLabs);
            });
        }

        // Handle standalone labs
        if (course.standaloneLabs) {
            sections.push(...course.standaloneLabs);
        }

        return sections;
    }

    // Data management
    async exportSelections(): Promise<{ success: boolean; data?: string; error?: string }> {
        try {
            await this.ensureInitialized();
            const exportData = await this.profileStateManager.exportData();

            if (exportData === null) {
                return {
                    success: false,
                    error: 'Failed to export data'
                };
            }

            return {
                success: true,
                data: exportData
            };
        } catch (error) {
            return {
                success: false,
                error: `Export failed: ${error}`
            };
        }
    }

    async importSelections(jsonData: string): Promise<{ success: boolean; error?: string }> {
        try {
            await this.ensureInitialized();
            
            const result = await this.profileStateManager.importData(jsonData);
            
            return {
                success: result.success,
                error: result.error?.message
            };
        } catch (error) {
            return {
                success: false,
                error: `Import failed: ${error}`
            };
        }
    }

    // Health and diagnostics
    async performHealthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
        const issues: string[] = [];

        try {
            // Check if initialized
            if (!this.isInitialized) {
                issues.push('Service not initialized');
            }

            // Check profile state manager health
            const stateHealth = this.profileStateManager.isHealthy();
            if (!stateHealth.healthy) {
                issues.push(...stateHealth.issues.map(issue => `State: ${issue}`));
            }

            // Validate current data
            const selectedCourses = this.getSelectedCourses();
            const validation = this.dataValidator.validateBatch(
                selectedCourses,
                (course) => this.dataValidator.validateSelectedCourse(course)
            );

            if (!validation.valid) {
                issues.push(`Data validation: ${validation.errors.length} errors found`);
            }

        } catch (error) {
            issues.push(`Health check error: ${error}`);
        }

        return {
            healthy: issues.length === 0,
            issues
        };
    }

    async save(): Promise<{ success: boolean; error?: string }> {
        try {
            await this.ensureInitialized();
            this.profileStateManager.save();
            return { success: true };
        } catch (error: unknown) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    hasUnsavedChanges(): boolean {
        if (!this.isInitialized) return false;
        return this.profileStateManager.hasUnsavedChanges();
    }

    // Backward compatibility methods
    findCourseById(_courseId: string): Course | undefined {
        // This would need to be implemented with access to course data
        console.warn('findCourseById: Course data access not implemented in this service');
        return undefined;
    }

    // Utility methods
    unselectCourseById(_courseId: string): void {
        console.warn('unselectCourseById: Use unselectCourse with course object instead');
    }

    isCourseSelectedById(_courseId: string): boolean {
        console.warn('isCourseSelectedById: Use isCourseSelected with course object instead');
        return false;
    }

    reconstructSectionObjects(): void {
        try {
            // No longer needed - component-based selection doesn't require reconstruction
            const selectedCourses = this.getSelectedCourses();

            if (selectedCourses.length > 0) {
                this.profileStateManager.save();
            }
        } catch (error) {
            console.error('Failed to reconstruct section objects:', error);
        }
    }

    // Private helper methods
    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    private async attemptDataRepair(): Promise<boolean> {
        try {
            const selectedCourses = this.getSelectedCourses();
            let repairedCount = 0;

            selectedCourses.forEach(selectedCourse => {
                // Repair each selected course
                this.dataValidator.repairSelectedCourse(selectedCourse);
                repairedCount++;
            });

            if (repairedCount > 0) {
                console.log(`Repaired ${repairedCount} selected courses`);
                this.profileStateManager.save();
            }

            return true;
        } catch (error) {
            console.error('Data repair failed:', error);
            return false;
        }
    }


    // Debug methods
    debugState(): void {
        console.log('=== COURSE SELECTION SERVICE DEBUG ===');
        console.log('Initialized:', this.isInitialized);
        console.log('Selected Courses:', this.getSelectedCoursesCount());
        console.log('Has Unsaved Changes:', this.hasUnsavedChanges());
        console.log('Storage: Synchronous (Firefox-safe)');

        this.profileStateManager.debugState();

        console.log('Health Check:', this.performHealthCheck());
        console.log('=============================================');
    }
}