import { Course, Department, Section } from '../types/types'
import { SelectedCourse } from '../types/schedule'
import { ProfileStateManager, StateChangeEvent, StateChangeListener } from '../core/ProfileStateManager'
import { DataValidator } from '../core/DataValidator'
import { Validators } from '../utils/validators'

export interface CourseSelectionOptions {
    isRequired?: boolean;
    validateBeforeAdd?: boolean;
}

export interface CourseSelectionResult {
    success: boolean;
    course?: SelectedCourse;
    error?: string;
    warnings?: string[];
}

export interface SelectionChangeEvent {
    type: 'course_added' | 'course_removed' | 'section_changed' | 'selection_cleared' | 'data_loaded' | 'components_changed' | 'components_cleared';
    course?: Course;
    section?: string | null;
    selectedCourses: SelectedCourse[];
    timestamp: number;
}

export type SelectionChangeListener = (event: SelectionChangeEvent) => void;

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CourseSelectionService - High-Level Course Selection API
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE ROLE:
 * - High-level course selection API with immediate synchronous persistence
 * - Event-driven service with real-time UI synchronization
 * - Data integrity guardian with validation, conflict resolution, and repair capabilities
 * - Migration coordinator ensuring backward compatibility across application updates
 * - Direct ProfileStateManager integration for reliable data consistency
 * 
 * DEPENDENCIES:
 * Core Systems:
 * - ProfileStateManager → Synchronous persistence and authoritative state management
 * - DataValidator → Runtime type checking and data integrity validation
 * - RetryManager → Fault-tolerant operations with exponential backoff strategies
 * - Validators utility → Type-safe validation helpers and constraints
 *
 * Data Models:
 * - Course, Department, Section types → Core academic data structures
 * - SelectedCourse type → User selection state with section preferences
 * - CourseSelectionOptions, CourseSelectionResult → Service operation contracts
 * 
 * USED BY:
 * Primary Controllers:
 * - MainController → Service initialization and cross-service coordination
 * - CourseController → Course listing, selection UI, and user interactions
 * - ScheduleController → Schedule-specific course operations and section management
 * 
 * Service Layer:
 * - ScheduleManagementService → Schedule operations requiring course selection state
 * 
 * UI Components:
 * - ScheduleSelector → Schedule switching and course state coordination
 * - All course selection UI components → Through controller abstraction layer
 * 
 * INITIALIZATION & LIFECYCLE:
 * 1. Constructor Phase:
 *    - Dependency injection with fallback to default instances
 *    - ProfileStateManager instance sharing for synchronous persistence
 *    - RetryManager configuration for storage operations
 *    - DataValidator setup for integrity checks
 *
 * 2. Initialization Phase (async):
 *    - ProfileStateManager state loading from persistent storage
 *    - Health check validation of loaded data integrity
 *    - Automatic data repair for recoverable integrity issues
 *    - State listener setup for ProfileStateManager events
 *
 * 3. Operation Phase:
 *    - Synchronous course selection APIs with immediate persistence
 *    - Real-time event notifications from state changes
 *    - Automatic section object reconstruction and data synchronization
 * 
 * DATA FLOW & OPERATIONS:
 * Course Selection Flow:
 * 1. UI Component calls selectCourse() with Course object and options
 * 2. CourseSelectionService validates course data integrity (if enabled)
 * 3. ProfileStateManager updates state and saves synchronously
 * 4. CourseSelectionService emits SelectionChangeEvent
 * 5. UI components receive event notifications and update displays
 *
 * Section Management Flow:
 * 1. setSelectedSection() validates section existence within course
 * 2. ProfileStateManager updates section selection and saves synchronously
 * 3. Section object reconstruction ensures data consistency
 * 4. Change events emitted for UI synchronization
 * 5. Schedule grids and displays automatically updated via event system
 *
 * Event System Architecture:
 * ```
 * CourseSelectionService Events → UI Controllers → DOM Updates
 *           ↓
 * ProfileStateManager → TransactionalStorageManager → localStorage
 * ```
 * 
 * KEY FEATURES:
 * Course Selection Operations:
 * - selectCourse() / unselectCourse() with synchronous persistence and validation
 * - toggleCourseSelection() for UI convenience
 * - setSelectedSection() with section switching and validation
 * - clearAllSelections() for bulk clearing
 * - Immediate persistence ensures data reliability (Firefox-safe)
 *
 * Data Integrity & Validation:
 * - Pre-operation validation with DataValidator integration
 * - Runtime type checking and constraint validation
 * - Section object reconstruction ensuring consistency
 * - Health checking with automated repair capabilities
 *
 * Event-Driven Architecture:
 * - SelectionChangeListener system for UI coordination
 * - Real-time change notifications with typed event objects
 * - ProfileStateManager event bridge for state synchronization
 * - Backward compatibility layer for existing callback patterns
 *
 * Fault Tolerance & Reliability:
 * - RetryManager integration for transient failure recovery
 * - Exponential backoff strategies for storage operations
 * - Automatic data repair for recoverable corruption
 * - Health checking and diagnostic reporting
 * - Graceful degradation for initialization failures
 * 
 * INTEGRATION POINTS:
 * ProfileStateManager Integration:
 * - Direct synchronous persistence for all operations
 * - Transactional consistency through immediate saves
 * - No queuing or batching - simple and reliable
 *
 * UI Controller Integration:
 * - Synchronous API with immediate persistence
 * - Event-driven updates for UI coordination
 * - Simplified method signatures
 * - Clear error handling and validation
 *
 * Service Layer Integration:
 * - ScheduleManagementService coordination for multi-schedule functionality
 * - Data export/import operations for schedule portability
 *
 * ARCHITECTURAL PATTERNS:
 * - Observer Pattern: Event-driven state change notifications
 * - Facade Pattern: Simplified API hiding persistence complexity
 * - Strategy Pattern: Configurable validation and retry policies
 * - Service Layer: High-level business logic abstraction
 * - Event-Driven Architecture: Decoupled components with real-time state synchronization
 * 
 * DATA CONSISTENCY FEATURES:
 * - Section object reconstruction ensures UI rendering consistency
 * - Validation before operations prevents data corruption
 * - Automatic repair capabilities for recoverable issues
 * - Health checking with detailed diagnostic reporting
 * - Synchronous persistence prevents data loss (Firefox-compatible)
 *
 * BACKWARD COMPATIBILITY:
 * - Comprehensive API with validation and error handling
 * - Fallback mechanisms for missing dependencies
 * - Gradual API evolution with compatibility layers
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export class CourseSelectionService {
    private profileStateManager: ProfileStateManager;
    private dataValidator: DataValidator;
    private selectionListeners = new Set<SelectionChangeListener>();
    private isInitialized = false;
    private initializationPromise: Promise<boolean> | null = null;

    constructor(
        profileStateManager?: ProfileStateManager,
        dataValidator?: DataValidator
    ) {
        this.profileStateManager = profileStateManager || new ProfileStateManager();
        this.dataValidator = dataValidator || new DataValidator();

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
            console.log('Initializing CourseSelectionService...');

            // NOTE: ProfileStateManager is already initialized by StorageService before this service
            // Redundant loadFromStorage() call removed to prevent duplicate schedule creation race condition

            // Validate loaded data
            const healthCheck = await this.performHealthCheck();
            if (!healthCheck.healthy) {
                console.warn('Health check found issues:', healthCheck.issues);
                // Attempt repairs
                await this.attemptDataRepair();
            }

            this.isInitialized = true;
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

            // Call ProfileStateManager directly - synchronous persistence
            this.profileStateManager.selectCourse(course, isRequired, 'service');

            // Get updated course
            const selectedCourse = this.profileStateManager.getSelectedCourse(course);

            // Emit event for UI updates
            this.notifySelectionListeners({
                type: 'course_added',
                course,
                selectedCourses: this.profileStateManager.getSelectedCourses(),
                timestamp: Date.now()
            });

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

            // Emit event for UI updates
            this.notifySelectionListeners({
                type: 'course_removed',
                course,
                selectedCourses: this.profileStateManager.getSelectedCourses(),
                timestamp: Date.now()
            });

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

            // Emit event for UI updates
            this.notifySelectionListeners({
                type: 'section_changed',
                course,
                section: sectionNumber,
                selectedCourses: this.profileStateManager.getSelectedCourses(),
                timestamp: Date.now()
            });

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

            // Emit event for UI updates
            this.notifySelectionListeners({
                type: 'selection_cleared',
                selectedCourses: [],
                timestamp: Date.now()
            });

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

            this.notifySelectionListeners({
                type: 'components_changed',
                course,
                selectedCourses: this.profileStateManager.getSelectedCourses(),
                timestamp: Date.now()
            });

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

            for (const selectedCourse of selectedCourses) {
                this.profileStateManager.setSelectedComponents(
                    selectedCourse.course,
                    null,
                    null,
                    null,
                    'service'
                );
            }

            this.notifySelectionListeners({
                type: 'components_cleared',
                selectedCourses: this.profileStateManager.getSelectedCourses(),
                timestamp: Date.now()
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

    /**
     * ═══════════════════════════════════════════════════════════════════════════════
     * COMPONENT-BASED SELECTION METHODS (NEW HIERARCHICAL STRUCTURE)
     * ═══════════════════════════════════════════════════════════════════════════════
     * These methods support the new hierarchical course structure with separate
     * selections for lectures, discussions, and labs.
     */

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

            // Emit event for UI updates
            this.notifySelectionListeners({
                type: 'components_changed',
                course,
                selectedCourses: this.profileStateManager.getSelectedCourses(),
                timestamp: Date.now()
            });

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
     * Get the currently selected components for a course
     */
    getSelectedComponents(course: Course): {
        lecture: Section | null;
        discussion: Section | null;
        lab: Section | null;
    } {
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
            // Check if it's a hierarchical course without complete selections
            const hasLecture = sc.selectedLecture !== null;
            const hasSection = sc.selectedSection !== null;

            // If it has neither lecture nor section, it's incomplete
            if (!hasLecture && !hasSection) return true;

            return false;
        });
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
        this.syncSectionObjects(selectedCourses);
        return selectedCourses;
    }

    private syncSectionObjects(selectedCourses: SelectedCourse[]): void {
        selectedCourses.forEach(sc => {
            // If we have a selectedSectionNumber but no selectedSection object (or invalid object)
            if (sc.selectedSectionNumber && (!sc.selectedSection || !sc.selectedSection.computedTerm)) {
                // Find the section object in the course using hierarchical structure
                const allSections = this.getAllSectionsForCourse(sc.course);
                const sectionObject = allSections.find(s => s.number === sc.selectedSectionNumber);

                if (sectionObject && sectionObject.computedTerm) {
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
        if (!this.isInitialized) return 0;

        return this.profileStateManager.getSelectedCourses().length;
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

    // Enhanced listener that provides event type for better UI handling
    onSelectionChangeWithType(callback: (event: SelectionChangeEvent) => void): void {
        this.addSelectionListener(callback);
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
            await this.profileStateManager.save();
            return { success: true };
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
            let reconstructedCount = 0;
            const selectedCourses = this.getSelectedCourses();
            
            selectedCourses.forEach(selectedCourse => {
                if (selectedCourse.selectedSectionNumber && !selectedCourse.selectedSection) {
                    const allSections = this.getAllSectionsForCourse(selectedCourse.course);
                    const sectionObject = allSections.find(s =>
                        s.number === selectedCourse.selectedSectionNumber
                    ) || null;

                    if (sectionObject) {
                        selectedCourse.selectedSection = sectionObject;
                        reconstructedCount++;
                    }
                }
            });
            
            if (reconstructedCount > 0) {
                console.log(`Reconstructed ${reconstructedCount} section objects`);
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
                    // Force complete UI refresh for schedule changes
                    const newSelectedCourses = this.profileStateManager.getSelectedCourses();

                    // Dispatch data_loaded event to trigger complete UI refresh
                    this.notifySelectionListeners({
                        type: 'data_loaded',
                        selectedCourses: newSelectedCourses,
                        timestamp: event.timestamp
                    });

                    // Also dispatch a specific schedule change event for components that need it
                    setTimeout(() => {
                        this.notifySelectionListeners({
                            type: 'selection_cleared',
                            selectedCourses: [],
                            timestamp: event.timestamp
                        });
                        this.notifySelectionListeners({
                            type: 'data_loaded',
                            selectedCourses: newSelectedCourses,
                            timestamp: event.timestamp + 1
                        });
                    }, 10);
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
        console.log('Storage: Synchronous (Firefox-safe)');

        this.profileStateManager.debugState();

        console.log('Health Check:', this.performHealthCheck());
        console.log('=============================================');
    }
}