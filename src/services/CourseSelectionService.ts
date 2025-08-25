import { Course, Department, Section } from '../types/types'
import { SelectedCourse } from '../types/schedule'
import { ProfileStateManager, StateChangeEvent, StateChangeListener } from '../core/ProfileStateManager'
import { DataValidator, ValidationResult } from '../core/DataValidator'
import { RetryManager } from '../core/RetryManager'
import { ProfileMigrationService } from '../core/ProfileMigrationService'
import { Validators } from '../utils/validators'

export interface CourseSelectionOptions {
    isRequired?: boolean;
    autoSave?: boolean;
    validateBeforeAdd?: boolean;
}

export interface CourseSelectionResult {
    success: boolean;
    course?: SelectedCourse;
    error?: string;
    warnings?: string[];
}

export interface SelectionChangeEvent {
    type: 'course_added' | 'course_removed' | 'section_changed' | 'selection_cleared' | 'data_loaded';
    course?: Course;
    section?: string | null;
    selectedCourses: SelectedCourse[];
    timestamp: number;
}

export type SelectionChangeListener = (event: SelectionChangeEvent) => void;

export class CourseSelectionService {
    private profileStateManager: ProfileStateManager;
    private dataValidator: DataValidator;
    private retryManager: RetryManager;
    private migrationService: ProfileMigrationService;
    private selectionListeners = new Set<SelectionChangeListener>();
    private isInitialized = false;
    private initializationPromise: Promise<boolean> | null = null;

    constructor(
        profileStateManager?: ProfileStateManager,
        dataValidator?: DataValidator,
        retryManager?: RetryManager,
        migrationService?: ProfileMigrationService
    ) {
        this.profileStateManager = profileStateManager || new ProfileStateManager();
        this.dataValidator = dataValidator || new DataValidator();
        this.retryManager = retryManager || RetryManager.createStorageRetryManager();
        this.migrationService = migrationService || new ProfileMigrationService(
            this.dataValidator,
            this.profileStateManager['storageManager'],
            this.retryManager
        );

        this.setupStateManagerListeners();
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
            console.log('🚀 Initializing CourseSelectionService...');

            // Check and perform migrations if needed
            const migrationResult = await this.checkAndPerformMigrations();
            if (!migrationResult) {
                console.warn('⚠️ Migration check failed, proceeding with existing data');
            }

            // Load data from storage
            await this.profileStateManager.loadFromStorage();

            // Validate loaded data
            const healthCheck = await this.performHealthCheck();
            if (!healthCheck.healthy) {
                console.warn('⚠️ Health check found issues:', healthCheck.issues);
                // Attempt repairs
                await this.attemptDataRepair();
            }

            this.isInitialized = true;
            console.log('✅ CourseSelectionService initialized successfully');
            return true;

        } catch (error) {
            console.error('❌ Failed to initialize CourseSelectionService:', error);
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
            autoSave = true,
            validateBeforeAdd = true
        } = options;

        try {
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
            }

            // Execute with retry
            const result = await this.retryManager.executeWithRetry(
                () => {
                    this.profileStateManager.selectCourse(course, isRequired, 'api');
                    return this.profileStateManager.getSelectedCourse(course);
                },
                {
                    operationName: `select course ${course.department.abbreviation}${course.number}`,
                    onRetry: (attempt, error) => {
                        console.warn(`Course selection failed, retrying (attempt ${attempt}):`, error.message);
                    }
                }
            );

            if (!result.success) {
                return {
                    success: false,
                    error: `Failed to select course: ${result.error?.message || 'Unknown error'}`
                };
            }

            const selectedCourse = result.result;
            if (!selectedCourse) {
                return {
                    success: false,
                    error: 'Course selection succeeded but course not found in state'
                };
            }

            // Notify listeners
            this.notifySelectionListeners({
                type: 'course_added',
                course,
                selectedCourses: this.profileStateManager.getSelectedCourses(),
                timestamp: Date.now()
            });

            // Auto-save if requested
            if (autoSave) {
                const saveResult = await this.profileStateManager.save();
                if (!saveResult.success) {
                    console.warn('❌ Failed to auto-save after course selection:', saveResult.error);
                } else {
                    console.log('✅ Auto-save successful after course selection');
                }
            }

            return {
                success: true,
                course: selectedCourse
            };

        } catch (error) {
            console.error('Error selecting course:', error);
            return {
                success: false,
                error: `Error selecting course: ${error}`
            };
        }
    }

    async unselectCourse(course: Course, options: { autoSave?: boolean } = {}): Promise<CourseSelectionResult> {
        await this.ensureInitialized();
        const { autoSave = true } = options;

        try {
            if (!this.isCourseSelected(course)) {
                return {
                    success: false,
                    error: 'Course is not currently selected'
                };
            }

            const result = await this.retryManager.executeWithRetry(
                () => {
                    this.profileStateManager.unselectCourse(course, 'api');
                },
                {
                    operationName: `unselect course ${course.department.abbreviation}${course.number}`,
                }
            );

            if (!result.success) {
                return {
                    success: false,
                    error: `Failed to unselect course: ${result.error?.message || 'Unknown error'}`
                };
            }

            // Notify listeners
            this.notifySelectionListeners({
                type: 'course_removed',
                course,
                selectedCourses: this.profileStateManager.getSelectedCourses(),
                timestamp: Date.now()
            });

            // Auto-save if requested
            if (autoSave) {
                console.log('💾 CourseSelectionService: Auto-saving after course removal...');
                const saveResult = await this.profileStateManager.save();
                if (!saveResult.success) {
                    console.warn('❌ Failed to auto-save after course removal:', saveResult.error);
                } else {
                    console.log('✅ Auto-save successful after course removal');
                }
            }

            return { success: true };

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
            return this.unselectCourse(course, { autoSave: options.autoSave });
        } else {
            return this.selectCourse(course, options);
        }
    }

    async setSelectedSection(course: Course, sectionNumber: string | null, options: { autoSave?: boolean } = {}): Promise<CourseSelectionResult> {
        await this.ensureInitialized();
        const { autoSave = true } = options;

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

            // Check if section exists in course
            if (sectionNumber !== null) {
                const sectionExists = course.sections.some(s => s.number === sectionNumber);
                if (!sectionExists) {
                    return {
                        success: false,
                        error: `Section ${sectionNumber} not found in course ${course.department.abbreviation}${course.number}`
                    };
                }
            }

            const result = await this.retryManager.executeWithRetry(
                () => {
                    this.profileStateManager.setSelectedSection(course, sectionNumber, 'api');
                },
                {
                    operationName: `set section for ${course.department.abbreviation}${course.number}`,
                }
            );

            if (!result.success) {
                return {
                    success: false,
                    error: `Failed to set section: ${result.error?.message || 'Unknown error'}`
                };
            }

            // Notify listeners
            this.notifySelectionListeners({
                type: 'section_changed',
                course,
                section: sectionNumber,
                selectedCourses: this.profileStateManager.getSelectedCourses(),
                timestamp: Date.now()
            });

            // Auto-save if requested
            if (autoSave) {
                console.log('💾 CourseSelectionService: Auto-saving after section selection...');
                const saveResult = await this.profileStateManager.save();
                if (!saveResult.success) {
                    console.warn('❌ Failed to auto-save after section selection:', saveResult.error);
                } else {
                    console.log('✅ Auto-save successful after section selection');
                }
            }

            const updatedCourse = this.profileStateManager.getSelectedCourse(course);
            return {
                success: true,
                course: updatedCourse
            };

        } catch (error) {
            console.error('Error setting selected section:', error);
            return {
                success: false,
                error: `Error setting selected section: ${error}`
            };
        }
    }

    async clearAllSelections(options: { autoSave?: boolean } = {}): Promise<{ success: boolean; error?: string }> {
        await this.ensureInitialized();
        const { autoSave = true } = options;

        try {
            const result = await this.retryManager.executeWithRetry(
                () => {
                    this.profileStateManager.clearAllSelections('api');
                },
                {
                    operationName: 'clear all course selections',
                }
            );

            if (!result.success) {
                return {
                    success: false,
                    error: `Failed to clear selections: ${result.error?.message || 'Unknown error'}`
                };
            }

            // Notify listeners
            this.notifySelectionListeners({
                type: 'selection_cleared',
                selectedCourses: [],
                timestamp: Date.now()
            });

            // Auto-save if requested
            if (autoSave) {
                const saveResult = await this.profileStateManager.save();
                if (!saveResult.success) {
                    console.warn('Failed to auto-save after clearing selections:', saveResult.error);
                }
            }

            return { success: true };

        } catch (error) {
            console.error('Error clearing selections:', error);
            return {
                success: false,
                error: `Error clearing selections: ${error}`
            };
        }
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
        const selectedCourses = this.profileStateManager.getSelectedCourses();
        // Ensure section objects are synchronized
        this.syncSectionObjects(selectedCourses);
        return selectedCourses;
    }

    private syncSectionObjects(selectedCourses: SelectedCourse[]): void {
        selectedCourses.forEach(sc => {
            // If we have a selectedSectionNumber but no selectedSection object (or invalid object)
            if (sc.selectedSectionNumber && (!sc.selectedSection || !sc.selectedSection.computedTerm)) {
                // Find the section object in the course
                const sectionObject = sc.course.sections?.find(s => s.number === sc.selectedSectionNumber);
                
                if (sectionObject && sectionObject.computedTerm) {
                    console.log(`🔄 CourseSelectionService: Syncing section object for ${sc.course.department.abbreviation}${sc.course.number} section ${sc.selectedSectionNumber}`);
                    sc.selectedSection = sectionObject;
                }
            }
        });
    }

    getSelectedSection(course: Course): string | null {
        const selectedCourse = this.getSelectedCourse(course);
        return selectedCourse?.selectedSectionNumber || null;
    }

    getSelectedSectionObject(course: Course): Section | null {
        const selectedCourse = this.getSelectedCourse(course);
        return selectedCourse?.selectedSection || null;
    }

    getSelectedCoursesCount(): number {
        return this.getSelectedCourses().length;
    }

    getSelectedCourseIds(): string[] {
        return this.getSelectedCourses().map(sc => sc.course.id);
    }

    // Event handling
    addSelectionListener(listener: SelectionChangeListener): void {
        this.selectionListeners.add(listener);
    }

    removeSelectionListener(listener: SelectionChangeListener): void {
        this.selectionListeners.delete(listener);
    }

    removeAllSelectionListeners(): void {
        this.selectionListeners.clear();
    }

    // Convenience method for backward compatibility
    onSelectionChange(callback: (selectedCourses: SelectedCourse[]) => void): void {
        const listener: SelectionChangeListener = (event) => {
            callback(event.selectedCourses);
        };
        this.addSelectionListener(listener);
    }

    // Department and section management
    setAllDepartments(departments: Department[]): void {
        // This would typically be handled by a separate service
        // For now, we'll store it in the profile state manager if needed
        console.log(`📚 Loaded ${departments.length} departments`);
    }

    getAllSections(): Section[] {
        // This would be retrieved from the course data service
        return [];
    }

    getAllSectionsForCourse(course: Course): Section[] {
        return course.sections || [];
    }

    // Data management
    async exportSelections(): Promise<{ success: boolean; data?: string; error?: string }> {
        try {
            await this.ensureInitialized();
            const exportData = this.profileStateManager.exportData();
            
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
            
            if (result.success) {
                // Notify listeners about the data change
                this.notifySelectionListeners({
                    type: 'data_loaded',
                    selectedCourses: this.profileStateManager.getSelectedCourses(),
                    timestamp: Date.now()
                });
            }

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
            const result = await this.profileStateManager.save();
            return {
                success: result.success,
                error: result.error?.message
            };
        } catch (error) {
            return {
                success: false,
                error: `Save failed: ${error}`
            };
        }
    }

    hasUnsavedChanges(): boolean {
        if (!this.isInitialized) return false;
        return this.profileStateManager.hasUnsavedChanges();
    }

    // Backward compatibility methods
    findCourseById(courseId: string): Course | undefined {
        // This would need to be implemented with access to course data
        console.warn('findCourseById: Course data access not implemented in this service');
        return undefined;
    }

    // Legacy methods for compatibility
    unselectCourseById(courseId: string): void {
        console.warn('unselectCourseById: Use unselectCourse with course object instead');
    }

    isCourseSelectedById(courseId: string): boolean {
        console.warn('isCourseSelectedById: Use isCourseSelected with course object instead');
        return false;
    }

    reconstructSectionObjects(): void {
        try {
            let reconstructedCount = 0;
            const selectedCourses = this.getSelectedCourses();
            
            selectedCourses.forEach(selectedCourse => {
                if (selectedCourse.selectedSectionNumber && !selectedCourse.selectedSection) {
                    const sectionObject = selectedCourse.course.sections.find(s => 
                        s.number === selectedCourse.selectedSectionNumber
                    ) || null;
                    
                    if (sectionObject) {
                        selectedCourse.selectedSection = sectionObject;
                        reconstructedCount++;
                    }
                }
            });
            
            if (reconstructedCount > 0) {
                console.log(`🔗 Reconstructed ${reconstructedCount} section objects`);
                // Save changes and notify listeners
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

    private setupStateManagerListeners(): void {
        const stateListener: StateChangeListener = (event: StateChangeEvent) => {
            // Convert state manager events to selection events
            switch (event.type) {
                case 'courses_changed':
                    // Already handled in our methods where we emit events
                    break;
                case 'active_schedule_changed':
                    this.notifySelectionListeners({
                        type: 'data_loaded',
                        selectedCourses: this.profileStateManager.getSelectedCourses(),
                        timestamp: event.timestamp
                    });
                    break;
            }
        };

        this.profileStateManager.addListener(stateListener);
    }

    private notifySelectionListeners(event: SelectionChangeEvent): void {
        this.selectionListeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error('Error in selection change listener:', error);
            }
        });
    }

    private async checkAndPerformMigrations(): Promise<boolean> {
        try {
            // Export current data
            const currentData = this.profileStateManager.exportData();
            if (!currentData) {
                return true; // No data to migrate
            }

            const parsedData = JSON.parse(currentData);
            
            // Check if migration is needed
            const migrationResult = await this.migrationService.migrateToLatest(parsedData);
            
            if (migrationResult.success && migrationResult.itemsChanged > 0) {
                console.log(`✅ Migration completed: ${migrationResult.itemsChanged} items updated from ${migrationResult.fromVersion} to ${migrationResult.toVersion}`);
                
                // Import migrated data
                if (migrationResult.migratedData) {
                    await this.profileStateManager.importData(JSON.stringify(migrationResult.migratedData));
                }
            }

            return migrationResult.success;
        } catch (error) {
            console.error('Migration check failed:', error);
            return false;
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
                console.log(`🔧 Repaired ${repairedCount} selected courses`);
                await this.profileStateManager.save();
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
        console.log('Listeners:', this.selectionListeners.size);
        console.log('Has Unsaved Changes:', this.hasUnsavedChanges());
        
        this.profileStateManager.debugState();
        
        console.log('Health Check:', this.performHealthCheck());
        console.log('=============================================');
    }
}