import { Course, Section } from '../../types/types'
import { SelectedCourse } from '../../types/schedule'
import type { CourseComponentSelections } from '../../types/scheduling'
import { ProfileStateManager } from '../../core/state/ProfileStateManager'
import { DataValidator } from '../../core/validation/DataValidator'
import { Validators } from '../../utils/validators'
import { logger } from '../../utils/logger'

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

    async initialize(): Promise<boolean> {
        if (this.isInitialized) return true;
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = this.performInitialization();
        return this.initializationPromise;
    }

    private async performInitialization(): Promise<boolean> {
        try {

            // NOTE: ProfileStateManager is already loaded by AppBootstrap before this service
            // Redundant loadFromStorage() call removed to prevent duplicate schedule creation race condition

            this.isInitialized = true;

            const healthCheck = await this.performHealthCheck();
            if (!healthCheck.healthy) {
                logger.warn('Health check found issues:', healthCheck.issues);
                await this.attemptDataRepair();
            }

            return true;

        } catch (error) {
            logger.error('Failed to initialize CourseSelectionService:', error);
            this.isInitialized = false;
            return false;
        } finally {
            this.initializationPromise = null;
        }
    }

    async selectCourse(course: Course, options: CourseSelectionOptions = {}): Promise<CourseSelectionResult> {
        await this.ensureInitialized();

        const {
            isRequired = false,
            validateBeforeAdd = true
        } = options;

        try {
            let warnings: string[] | undefined;

            if (validateBeforeAdd) {
                const validation = this.dataValidator.validateCourse(course);
                if (!validation.valid) {
                    return {
                        success: false,
                        error: `Invalid course: ${validation.errors.map(e => e.message).join(', ')}`,
                        warnings: validation.warnings.map(w => w.message)
                    };
                }

                if (validation.warnings.length > 0) {
                    warnings = validation.warnings.map(w => w.message);
                }
            }

            this.profileStateManager.selectCourse(course, isRequired, 'service');

            const selectedCourse = this.profileStateManager.getSelectedCourse(course);

            return {
                success: true,
                course: selectedCourse,
                warnings
            };

        } catch (error) {
            logger.error('Error selecting course:', error);
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

            this.profileStateManager.unselectCourse(course, 'service');

            return {
                success: true
            };

        } catch (error) {
            logger.error('Error unselecting course:', error);
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

            if (sectionNumber !== null && !Validators.validateSectionNumber(sectionNumber)) {
                return {
                    success: false,
                    error: 'Invalid section number format'
                };
            }

            this.profileStateManager.setSelectedSection(course, sectionNumber, 'service');

            const selectedCourse = this.profileStateManager.getSelectedCourse(course);

            return {
                success: true,
                course: selectedCourse
            };

        } catch (error) {
            logger.error('Error setting selected section:', error);
            return {
                success: false,
                error: `Error setting selected section: ${error}`
            };
        }
    }

    async clearAllSelections(): Promise<{ success: boolean; error?: string }> {
        await this.ensureInitialized();

        try {
            this.profileStateManager.clearAllSelections('service');

            return { success: true };

        } catch (error) {
            logger.error('Error clearing selections:', error);
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
            logger.error('Error clearing course components:', error);
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
            logger.error('Error clearing components:', error);
            return {
                success: false,
                error: `Error clearing components: ${error}`
            };
        }
    }

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

            this.profileStateManager.setSelectedComponents(course, lecture, discussion, lab, 'service');

            const selectedCourse = this.profileStateManager.getSelectedCourse(course);

            return {
                success: true,
                course: selectedCourse
            };

        } catch (error) {
            logger.error('Error setting selected components:', error);
            return {
                success: false,
                error: `Error setting selected components: ${error}`
            };
        }
    }

    /**
     * Batch set components for the auto-scheduler, avoiding a reactive update per course.
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
            logger.error('Error batch setting selected components:', error);
            return {
                success: false,
                error: `Error batch setting selected components: ${error}`
            };
        }
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
            logger.error('Error locking section:', error);
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
            logger.error('Error unlocking section:', error);
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


    getSelectedCoursesCount(): number {
        if (!this.isInitialized) return 0;

        return this.profileStateManager.getSelectedCourses().length;
    }

    getSelectedCourseIds(): string[] {
        return this.getSelectedCourses().map(sc => sc.course.id);
    }


    async performHealthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
        const issues: string[] = [];

        try {
            if (!this.isInitialized) {
                issues.push('Service not initialized');
            }

            const stateHealth = this.profileStateManager.isHealthy();
            if (!stateHealth.healthy) {
                issues.push(...stateHealth.issues.map(issue => `State: ${issue}`));
            }

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

    findCourseById(_courseId: string): Course | undefined {
        // This would need to be implemented with access to course data
        logger.warn('findCourseById: Course data access not implemented in this service');
        return undefined;
    }

    unselectCourseById(_courseId: string): void {
        logger.warn('unselectCourseById: Use unselectCourse with course object instead');
    }

    isCourseSelectedById(_courseId: string): boolean {
        logger.warn('isCourseSelectedById: Use isCourseSelected with course object instead');
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
            logger.error('Failed to reconstruct section objects:', error);
        }
    }

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
                this.dataValidator.repairSelectedCourse(selectedCourse);
                repairedCount++;
            });

            if (repairedCount > 0) {
                logger.warn(`Repaired ${repairedCount} selected courses`);
                this.profileStateManager.save();
            }

            return true;
        } catch (error) {
            logger.error('Data repair failed:', error);
            return false;
        }
    }


}