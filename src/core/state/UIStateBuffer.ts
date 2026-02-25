import { Course, Section } from '../../types/types'
import { SelectedCourse } from '../../types/schedule'
import { ProfileStateManager } from './ProfileStateManager'
import { getAllSections } from '../../utils/courseUtils'

export interface PendingOperation {
    id: string;
    type: 'select_course' | 'unselect_course' | 'set_section' | 'set_components';
    courseId: string;
    data: any;
    timestamp: number;
    retryCount: number;
}

export interface UIState {
    selectedCourses: SelectedCourse[];
    pendingOperations: PendingOperation[];
    lastSyncTimestamp: number;
}

export interface SyncResult {
    success: boolean;
    conflictsResolved: number;
    operationsApplied: number;
    error?: string;
}

export interface ConflictResolution {
    action: 'use_ui' | 'use_backend' | 'manual_merge';
    courseId: string;
    uiState: SelectedCourse;
    backendState: SelectedCourse;
}

/**
 * In-memory state buffer for instant UI updates (0ms) with background synchronization to backend
 */
export class UIStateBuffer {
    private uiState: UIState;
    private profileStateManager: ProfileStateManager;
    private listeners = new Set<(state: UIState) => void>();
    private operationIdCounter = 0;

    constructor(profileStateManager: ProfileStateManager) {
        this.profileStateManager = profileStateManager;
        this.uiState = {
            selectedCourses: [],
            pendingOperations: [],
            lastSyncTimestamp: Date.now()
        };
        
        this.initializeFromProfileState();
    }

    // Immediate UI state updates (0ms delay)
    selectCourse(course: Course, isRequired: boolean = false): void {
        const existingIndex = this.uiState.selectedCourses.findIndex(sc => sc.course.id === course.id);
        
        if (existingIndex >= 0) {
            // Update existing selection
            this.uiState.selectedCourses[existingIndex] = {
                ...this.uiState.selectedCourses[existingIndex],
                isRequired
            };
        } else {
            // Add new selection
            const selectedCourse: SelectedCourse = {
                course,
                selectedLecture: null,
                selectedDiscussion: null,
                selectedLab: null,
                isRequired,
                lockedSections: new Set()
            };
            this.uiState.selectedCourses.push(selectedCourse);
        }

        // Queue backend operation
        this.queueOperation({
            id: this.generateOperationId(),
            type: 'select_course',
            courseId: course.id,
            data: { course, isRequired },
            timestamp: Date.now(),
            retryCount: 0
        });

        this.notifyListeners();
    }

    unselectCourse(course: Course): void {
        const index = this.uiState.selectedCourses.findIndex(sc => sc.course.id === course.id);
        if (index >= 0) {
            this.uiState.selectedCourses.splice(index, 1);

            // Queue backend operation
            this.queueOperation({
                id: this.generateOperationId(),
                type: 'unselect_course',
                courseId: course.id,
                data: { course },
                timestamp: Date.now(),
                retryCount: 0
            });

            this.notifyListeners();
        }
    }

    setSelectedSection(course: Course, sectionNumber: string | null): void {
        const selectedCourse = this.uiState.selectedCourses.find(sc => sc.course.id === course.id);
        if (selectedCourse) {
            let sectionObject: Section | null = null;

            if (sectionNumber) {
                const allSections = getAllSections(course);
                sectionObject = allSections.find(s => s.number === sectionNumber) || null;
                if (sectionObject && !sectionObject.computedTerm) {
                    console.warn(`Section ${sectionNumber} missing computedTerm property`);
                    sectionObject = null;
                }
            }

            // Queue backend operation
            this.queueOperation({
                id: this.generateOperationId(),
                type: 'set_section',
                courseId: course.id,
                data: { course, sectionNumber },
                timestamp: Date.now(),
                retryCount: 0
            });

            this.notifyListeners();
        }
    }

    /**
     * Set selected components (lecture, discussion, lab) for hierarchical courses
     */
    setSelectedComponents(
        course: Course,
        lecture: Section | null,
        discussion: Section | null,
        lab: Section | null
    ): void {
        const selectedCourse = this.uiState.selectedCourses.find(sc => sc.course.id === course.id);
        if (selectedCourse) {
            // Update component selections
            selectedCourse.selectedLecture = lecture;
            selectedCourse.selectedDiscussion = discussion;
            selectedCourse.selectedLab = lab;

            // Queue backend operation
            this.queueOperation({
                id: this.generateOperationId(),
                type: 'set_components',
                courseId: course.id,
                data: { course, lecture, discussion, lab },
                timestamp: Date.now(),
                retryCount: 0
            });

            this.notifyListeners();
        }
    }

    clearAllSelections(): void {
        const previousCount = this.uiState.selectedCourses.length;
        this.uiState.selectedCourses = [];

        if (previousCount > 0) {
            // Queue backend operation for clearing all
            this.queueOperation({
                id: this.generateOperationId(),
                type: 'unselect_course',
                courseId: 'ALL',
                data: { clearAll: true },
                timestamp: Date.now(),
                retryCount: 0
            });

            this.notifyListeners();
        }
    }

    // State access methods
    getSelectedCourses(): SelectedCourse[] {
        return [...this.uiState.selectedCourses];
    }

    getSelectedCourse(course: Course): SelectedCourse | undefined {
        return this.uiState.selectedCourses.find(sc => sc.course.id === course.id);
    }

    isCourseSelected(course: Course): boolean {
        return this.uiState.selectedCourses.some(sc => sc.course.id === course.id);
    }

    getSelectedCoursesCount(): number {
        return this.uiState.selectedCourses.length;
    }

    hasPendingOperations(): boolean {
        return this.uiState.pendingOperations.length > 0;
    }

    getPendingOperationsCount(): number {
        return this.uiState.pendingOperations.length;
    }

    // Force refresh from backend (for schedule changes)
    refreshFromBackend(): void {
        const backendCourses = this.profileStateManager.getSelectedCourses();
        
        // Preserve pending operations to avoid losing optimistic updates
        const pendingOperations = [...this.uiState.pendingOperations];
        
        // Start with backend state as base
        this.uiState.selectedCourses = backendCourses.map(sc => ({ ...sc }));
        this.uiState.lastSyncTimestamp = Date.now();
        
        // Reapply pending operations to maintain optimistic updates
        for (const operation of pendingOperations) {
            try {
                this.reapplyPendingOperation(operation);
            } catch (error) {
                console.error(`Failed to reapply pending operation ${operation.id}:`, error);
            }
        }
        
        // Keep pending operations for background sync
        this.uiState.pendingOperations = pendingOperations;
        
        this.notifyListeners();
    }

    // Backend synchronization
    async syncWithBackend(): Promise<SyncResult> {
        try {
            const backendState = this.profileStateManager.getSelectedCourses();
            const conflicts = this.detectConflicts(backendState);
            
            let conflictsResolved = 0;
            let operationsApplied = 0;

            // Resolve conflicts first
            for (const conflict of conflicts) {
                const resolution = this.resolveConflict(conflict);
                if (resolution.action === 'use_backend') {
                    // Update UI state with backend data
                    const uiIndex = this.uiState.selectedCourses.findIndex(sc => sc.course.id === conflict.courseId);
                    if (uiIndex >= 0) {
                        this.uiState.selectedCourses[uiIndex] = { ...conflict.backendState };
                    }
                    conflictsResolved++;
                }
            }

            // Apply pending operations to backend
            const operationsToApply = [...this.uiState.pendingOperations];
            this.uiState.pendingOperations = [];

            for (const operation of operationsToApply) {
                try {
                    await this.applyOperationToBackend(operation);
                    operationsApplied++;
                } catch (error) {
                    console.error(`Failed to apply operation ${operation.id}:`, error);
                    // Re-queue failed operation with increased retry count
                    if (operation.retryCount < 3) {
                        operation.retryCount++;
                        this.uiState.pendingOperations.push(operation);
                    }
                }
            }

            this.uiState.lastSyncTimestamp = Date.now();
            this.notifyListeners();

            return {
                success: true,
                conflictsResolved,
                operationsApplied
            };

        } catch (error) {
            return {
                success: false,
                conflictsResolved: 0,
                operationsApplied: 0,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    // Event handling
    addListener(listener: (state: UIState) => void): void {
        this.listeners.add(listener);
    }

    removeListener(listener: (state: UIState) => void): void {
        this.listeners.delete(listener);
    }

    removeAllListeners(): void {
        this.listeners.clear();
    }

    // Debug methods
    debugState(): void {
        console.log('=== UI STATE BUFFER DEBUG ===');
        console.log('Selected Courses:', this.uiState.selectedCourses.length);
        console.log('Pending Operations:', this.uiState.pendingOperations.length);
        console.log('Last Sync:', new Date(this.uiState.lastSyncTimestamp).toISOString());
        console.log('Listeners:', this.listeners.size);
        
        if (this.uiState.pendingOperations.length > 0) {
            console.log('Pending Operations Details:');
            this.uiState.pendingOperations.forEach(op => {
                console.log(`  ${op.type} ${op.courseId} (retries: ${op.retryCount})`);
            });
        }
        console.log('================================');
    }

    // Private helper methods
    private initializeFromProfileState(): void {
        const backendCourses = this.profileStateManager.getSelectedCourses();
        this.uiState.selectedCourses = backendCourses.map(sc => ({ ...sc }));
        this.uiState.lastSyncTimestamp = Date.now();
    }

    private queueOperation(operation: PendingOperation): void {
        this.uiState.pendingOperations.push(operation);
    }

    private generateOperationId(): string {
        return `ui_op_${Date.now()}_${++this.operationIdCounter}`;
    }

    private reapplyPendingOperation(operation: PendingOperation): void {
        switch (operation.type) {
            case 'select_course':
                const course = operation.data.course;
                const isRequired = operation.data.isRequired;
                
                // Apply the same logic as selectCourse but without queuing another operation
                const existingIndex = this.uiState.selectedCourses.findIndex(sc => sc.course.id === course.id);
                
                if (existingIndex >= 0) {
                    // Update existing selection
                    this.uiState.selectedCourses[existingIndex] = {
                        ...this.uiState.selectedCourses[existingIndex],
                        isRequired
                    };
                } else {
                    // Add new selection
                    const selectedCourse: SelectedCourse = {
                        course,
                        selectedLecture: null,
                        selectedDiscussion: null,
                        selectedLab: null,
                        isRequired,
                        lockedSections: new Set()
                    };
                    this.uiState.selectedCourses.push(selectedCourse);
                }
                break;
                
            case 'unselect_course':
                if (operation.data.clearAll) {
                    this.uiState.selectedCourses = [];
                } else {
                    const course = operation.data.course;
                    const index = this.uiState.selectedCourses.findIndex(sc => sc.course.id === course.id);
                    if (index >= 0) {
                        this.uiState.selectedCourses.splice(index, 1);
                    }
                }
                break;
                
            case 'set_section':
                const sectionCourse = operation.data.course;
                const sectionNumber = operation.data.sectionNumber;
                const selectedCourse = this.uiState.selectedCourses.find(sc => sc.course.id === sectionCourse.id);
                if (selectedCourse) {
                    let sectionObject: Section | null = null;

                    if (sectionNumber) {
                        const allSections = getAllSections(sectionCourse);
                        sectionObject = allSections.find((s: Section) => s.number === sectionNumber) || null;
                        if (sectionObject && !sectionObject.computedTerm) {
                            console.warn(`Section ${sectionNumber} missing computedTerm property`);
                            sectionObject = null;
                        }
                    }

                }
                break;
                
            default:
                console.warn(`Unknown operation type for reapplication: ${operation.type}`);
        }
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => {
            try {
                listener({ ...this.uiState });
            } catch (error) {
                console.error('Error in UI state listener:', error);
            }
        });
    }

    private detectConflicts(backendState: SelectedCourse[]): ConflictResolution[] {
        const conflicts: ConflictResolution[] = [];

        // Check for courses that exist in both states but have different section selections
        for (const backendCourse of backendState) {
            const uiCourse = this.uiState.selectedCourses.find(sc => sc.course.id === backendCourse.course.id);
            if (uiCourse) {
                // Check if any component selection differs
                const hasConflict =
                    uiCourse.selectedLecture?.number !== backendCourse.selectedLecture?.number ||
                    uiCourse.selectedDiscussion?.number !== backendCourse.selectedDiscussion?.number ||
                    uiCourse.selectedLab?.number !== backendCourse.selectedLab?.number;

                if (hasConflict) {
                    conflicts.push({
                        action: 'use_ui', // Default to UI state (optimistic)
                        courseId: backendCourse.course.id,
                        uiState: uiCourse,
                        backendState: backendCourse
                    });
                }
            }
        }

        return conflicts;
    }

    private resolveConflict(conflict: ConflictResolution): ConflictResolution {
        // Simple conflict resolution: prefer UI state (optimistic approach)
        // In the future, this could be enhanced with more sophisticated strategies
        return { ...conflict, action: 'use_ui' };
    }

    private async applyOperationToBackend(operation: PendingOperation): Promise<void> {
        switch (operation.type) {
            case 'select_course':
                this.profileStateManager.selectCourse(
                    operation.data.course, 
                    operation.data.isRequired, 
                    'ui_buffer'
                );
                break;
                
            case 'unselect_course':
                if (operation.data.clearAll) {
                    this.profileStateManager.clearAllSelections('ui_buffer');
                } else {
                    this.profileStateManager.unselectCourse(operation.data.course, 'ui_buffer');
                }
                break;
                
            case 'set_section':
                this.profileStateManager.setSelectedSection(
                    operation.data.course,
                    operation.data.sectionNumber,
                    'ui_buffer'
                );
                break;

            case 'set_components':
                this.profileStateManager.setSelectedComponents(
                    operation.data.course,
                    operation.data.lecture,
                    operation.data.discussion,
                    operation.data.lab,
                    'ui_buffer'
                );
                break;

            default:
                throw new Error(`Unknown operation type: ${operation.type}`);
        }
    }
}