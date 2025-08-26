/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DepartmentSyncService - UI Component Synchronization & Coordination Hub
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ARCHITECTURE ROLE:
 * - Department selection synchronization coordinator preventing circular updates
 * - UI consistency guardian maintaining state synchronization across components
 * - Filter integration bridge connecting FilterService with UI controllers
 * - Multi-component state manager coordinating sidebar and modal interactions
 * - Event-driven synchronization hub preventing tight coupling between UI components
 * - Visual state management layer ensuring UI reflects filter state accurately
 * 
 * DEPENDENCIES:
 * - FilterService → Core filtering infrastructure for department filter management
 * - DepartmentController → Sidebar department selection UI controller
 * - FilterModalController → Modal-based advanced filtering interface
 * - DOM Element Management → Direct DOM manipulation for visual state updates
 * 
 * USED BY:
 * - DepartmentController → Sidebar department selection event coordination
 * - FilterModalController → Modal department filter synchronization
 * - MainController → Application-level department coordination setup
 * - FilterService event handlers → Automatic UI synchronization on filter changes
 * 
 * SYNCHRONIZATION ARCHITECTURE:
 * ```
 * User Interaction (Sidebar/Modal)
 *         ↓
 * DepartmentSyncService Coordination
 *         ↓
 * FilterService Update (Central State)
 *         ↓
 * Event-Driven UI Synchronization
 *         ↓
 * Visual State Update Across All Components
 * ```
 * 
 * KEY FEATURES:
 * Circular Update Prevention:
 * - isUpdating flag preventing infinite loops between UI components
 * - Controlled update sequences ensuring state consistency
 * - Event handler coordination preventing duplicate operations
 * - Transaction-like update patterns with try/finally blocks
 * 
 * Multi-Component Synchronization:
 * - syncSidebarToFilter() handles sidebar → filter state updates
 * - syncFilterToSidebar() handles filter → sidebar state updates
 * - syncFilterToModal() coordinates modal interface synchronization
 * - Bidirectional synchronization maintaining consistency across interfaces
 * 
 * Visual State Management:
 * - updateSidebarVisualState() with comprehensive DOM manipulation
 * - CSS class management for active/inactive department states
 * - Multi-selection indicators with count display
 * - Error-resilient visual updates with fallback strategies
 * 
 * Advanced Selection Modes:
 * - Single selection with toggle behavior
 * - Multi-selection with cumulative department addition
 * - "All Departments" special case handling
 * - Smart selection clearing and state reset
 * 
 * INTEGRATION PATTERNS:
 * FilterService Integration:
 * - Delegates department filtering to FilterService core infrastructure
 * - Leverages FilterService event system for change notifications
 * - Maintains separation between UI coordination and core filtering logic
 * - Provides FilterService with UI-specific department filter operations
 * 
 * UI Controller Coordination:
 * - DepartmentController event handling with sync service mediation
 * - FilterModalController state synchronization during modal operations
 * - Cross-controller communication through centralized sync service
 * - Event listener management preventing memory leaks
 * 
 * DOM Integration:
 * - Direct DOM element manipulation for performance optimization
 * - CSS class management for visual state indication
 * - Element finding strategies with fallback mechanisms
 * - Debug tooling for DOM state inspection and troubleshooting
 * 
 * SELECTION MANAGEMENT FEATURES:
 * Selection Operations:
 * - toggleDepartment() for interactive department selection
 * - selectDepartments() for programmatic multi-department selection
 * - clearAllDepartmentSelections() for state reset functionality
 * - getActiveDepartments() for current selection state access
 * 
 * Selection State Queries:
 * - isDepartmentSelected() for individual department status checking
 * - getSelectedDepartmentCount() for selection quantity tracking
 * - getSelectionDescription() for human-readable selection summaries
 * 
 * VISUAL STATE SYNCHRONIZATION:
 * DOM Element Management:
 * - updateSidebarVisualState() with comprehensive visual updates
 * - findDepartmentElement() with multiple search strategies
 * - normalizeDepartmentId() for consistent element matching
 * - updateMultiSelectionIndicators() for selection count display
 * 
 * Error Handling & Debugging:
 * - debugDepartmentElementSearch() for troubleshooting element issues
 * - debugVisualSync() for state consistency verification
 * - enableDebugMode() / disableDebugMode() for visual debugging
 * - Comprehensive logging for synchronization operation tracking
 * 
 * ELEMENT FINDING STRATEGIES:
 * - Exact case match for data-dept-id attributes
 * - Uppercase normalization for case-insensitive matching
 * - Lowercase fallback for alternative case patterns
 * - DOM traversal-based search for complex element structures
 * 
 * EVENT SYSTEM ARCHITECTURE:
 * - DepartmentSyncEventListener interface for external coordination
 * - addEventListener() / removeEventListener() for lifecycle management
 * - notifyListeners() for event propagation to registered components
 * - Event-driven architecture reducing tight coupling
 * 
 * INITIALIZATION & LIFECYCLE:
 * - initialize() method for service startup coordination
 * - setFilterModalController() for late controller binding
 * - forceVisualRefresh() for manual state synchronization
 * - Component lifecycle integration with proper cleanup
 * 
 * ARCHITECTURAL PATTERNS:
 * - Coordinator: Multi-component state synchronization
 * - Observer: Event-driven updates between components
 * - Strategy: Multiple element finding and update strategies
 * - State Machine: Selection state management with transitions
 * - Facade: Simplified interface hiding complex synchronization logic
 * 
 * BENEFITS ACHIEVED:
 * - Eliminated circular updates between sidebar and modal interfaces
 * - Consistent department selection state across all UI components
 * - Clean separation between UI coordination and core filtering logic
 * - Robust visual state management with error recovery
 * - Event-driven architecture enabling loose coupling between components
 * - Comprehensive debugging and troubleshooting capabilities
 * - Flexible selection modes supporting different user interaction patterns
 * 
 * INTEGRATION NOTES:
 * - Designed as coordination layer between FilterService and UI controllers
 * - Prevents tight coupling between sidebar and modal department interfaces
 * - Provides debugging capabilities for complex UI synchronization issues
 * - Supports both programmatic and user-driven department selection workflows
 * - Enables clean separation of concerns in multi-component filtering systems
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { CourseFilterService } from './CourseFilterService';
import { DepartmentController } from '../ui/controllers/DepartmentController';
import { FilterModalController } from '../ui/controllers/FilterModalController';

export interface DepartmentSyncEventListener {
    (activeDepartments: string[]): void;
}

export class DepartmentSyncService {
    private filterService: CourseFilterService;
    private departmentController: DepartmentController;
    private filterModalController: FilterModalController | null = null;
    private listeners: DepartmentSyncEventListener[] = [];
    private isUpdating: boolean = false; // Prevent circular updates

    constructor(filterService: CourseFilterService, departmentController: DepartmentController) {
        this.filterService = filterService;
        this.departmentController = departmentController;
        
        // Listen to filter service changes to sync back to UI
        this.filterService.addEventListener(() => {
            if (!this.isUpdating) {
                this.syncFilterToSidebar();
                this.syncFilterToModal();
                this.notifyListeners();
            }
        });
    }

    setFilterModalController(filterModalController: FilterModalController): void {
        this.filterModalController = filterModalController;
    }

    // Add event listener for department sync changes
    addEventListener(listener: DepartmentSyncEventListener): void {
        this.listeners.push(listener);
    }

    removeEventListener(listener: DepartmentSyncEventListener): void {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    private notifyListeners(): void {
        const activeDepartments = this.getActiveDepartments();
        this.listeners.forEach(listener => listener(activeDepartments));
    }

    // Sync sidebar selection to filter (called when user clicks sidebar)
    syncSidebarToFilter(deptId: string, multiSelect: boolean = false): void {
        this.isUpdating = true;
        
        try {
            // Handle "All Departments" special case
            if (deptId === 'all') {
                this.clearAllDepartmentSelections();
                return;
            }

            const currentDepartments = this.getActiveDepartments();
            let newDepartments: string[];

            if (multiSelect) {
                // Add to existing selection
                if (currentDepartments.includes(deptId)) {
                    // Department already selected, remove it (toggle behavior)
                    newDepartments = currentDepartments.filter(id => id !== deptId);
                } else {
                    // Add to selection
                    newDepartments = [...currentDepartments, deptId];
                }
            } else {
                // Single select mode - replace current selection
                if (currentDepartments.length === 1 && currentDepartments[0] === deptId) {
                    // Same department clicked, clear selection (show all departments)
                    newDepartments = [];
                } else {
                    // Select only this department
                    newDepartments = [deptId];
                }
            }

            // Update filter service
            if (newDepartments.length > 0) {
                this.filterService.addFilter('department', { departments: newDepartments });
            } else {
                this.filterService.removeFilter('department');
            }

            // Clear the old department controller selection since we're using filters now
            this.departmentController.clearDepartmentSelection();

            // Update UI states
            this.updateSidebarVisualState(newDepartments);
            this.syncFilterToModal();
            
        } finally {
            this.isUpdating = false;
        }
    }

    // Sync filter modal selection to sidebar (called when filter modal changes)
    syncFilterToSidebar(): void {
        if (this.isUpdating) return;
        
        const activeDepartments = this.getActiveDepartments();
        this.updateSidebarVisualState(activeDepartments);
        
        // Clear the department controller's internal selection since we use filters now
        this.departmentController.clearDepartmentSelection();
    }

    // Sync current filter state to filter modal
    syncFilterToModal(): void {
        if (!this.filterModalController || this.isUpdating) return;

        // The FilterModalController will read the current filter state when it opens
        // We'll add a method to refresh it if it's currently open
        this.filterModalController.refreshDepartmentSelection();
        
        // Also ensure sidebar visual state is correct
        setTimeout(() => {
            const activeDepartments = this.getActiveDepartments();
            this.updateSidebarVisualState(activeDepartments);
        }, 50); // Small delay to ensure DOM updates have processed
    }

    // Get currently active departments from filter service
    getActiveDepartments(): string[] {
        const activeFilters = this.filterService.getActiveFilters();
        const deptFilter = activeFilters.find(f => f.id === 'department');
        return deptFilter?.criteria?.departments || [];
    }

    // Clear all department selections
    clearAllDepartmentSelections(): void {
        this.isUpdating = true;
        
        try {
            this.filterService.removeFilter('department');
            this.departmentController.clearDepartmentSelection();
            this.updateSidebarVisualState([]);
            this.syncFilterToModal();
        } finally {
            this.isUpdating = false;
        }
    }

    // Check if a specific department is currently selected
    isDepartmentSelected(deptId: string): boolean {
        const activeDepartments = this.getActiveDepartments();
        return activeDepartments.includes(deptId);
    }

    // Get count of selected departments
    getSelectedDepartmentCount(): number {
        return this.getActiveDepartments().length;
    }

    // Toggle department selection (for multi-select scenarios)
    toggleDepartment(deptId: string): void {
        const activeDepartments = this.getActiveDepartments();
        const isSelected = activeDepartments.includes(deptId);
        
        if (isSelected) {
            this.syncSidebarToFilter(deptId, true); // Will remove it
        } else {
            this.syncSidebarToFilter(deptId, true); // Will add it
        }
    }

    // Select only specific departments (replace current selection)
    selectDepartments(deptIds: string[]): void {
        this.isUpdating = true;
        
        try {
            if (deptIds.length > 0) {
                this.filterService.addFilter('department', { departments: deptIds });
            } else {
                this.filterService.removeFilter('department');
            }
            
            this.updateSidebarVisualState(deptIds);
            this.syncFilterToModal();
        } finally {
            this.isUpdating = false;
        }
    }

    // Update visual state of sidebar departments
    private updateSidebarVisualState(activeDepartments: string[]): void {
        console.log('🔄 Updating sidebar visual state for departments:', activeDepartments);
        
        // Debug: Check how many department items exist in DOM
        const allDeptItems = document.querySelectorAll('.department-item');
        console.log(`📊 Found ${allDeptItems.length} department items in DOM`);
        
        // Clear all active states first
        allDeptItems.forEach((item, index) => {
            const deptId = item.getAttribute('data-dept-id');
            if (item.classList.contains('active')) {
                console.log(`🔄 Removing active class from ${deptId || `item-${index}`}`);
            }
            item.classList.remove('active');
        });

        // If no departments are selected, show "All Departments" as active
        if (activeDepartments.length === 0) {
            const allDepartmentsElement = document.querySelector(`[data-dept-id="all"]`);
            if (allDepartmentsElement) {
                allDepartmentsElement.classList.add('active');
                console.log('✅ Set "All Departments" as active (no specific departments selected)');
            }
            return;
        }

        // Set active states for selected departments with enhanced error checking
        let successCount = 0;
        activeDepartments.forEach(deptId => {
            const normalizedId = this.normalizeDepartmentId(deptId);
            const element = this.findDepartmentElement(normalizedId);
            
            if (element) {
                element.classList.add('active');
                successCount++;
                console.log(`✅ Applied active styling to ${deptId} (normalized: ${normalizedId})`);
            } else {
                console.warn(`❌ Could not find department element for ${deptId} (normalized: ${normalizedId})`);
                this.debugDepartmentElementSearch(deptId);
            }
        });

        console.log(`📈 Successfully applied active styling to ${successCount}/${activeDepartments.length} departments`);

        // Update any multi-selection indicators
        this.updateMultiSelectionIndicators(activeDepartments);
    }

    // Normalize department ID for consistent matching
    private normalizeDepartmentId(deptId: string): string {
        return deptId.trim().toUpperCase();
    }

    // Enhanced department element finding with multiple strategies
    private findDepartmentElement(deptId: string): Element | null {
        const normalizedId = this.normalizeDepartmentId(deptId);
        
        // Strategy 1: Exact match with original case
        let element = document.querySelector(`[data-dept-id="${deptId}"]`);
        if (element) return element;

        // Strategy 2: Uppercase match
        element = document.querySelector(`[data-dept-id="${normalizedId}"]`);
        if (element) return element;

        // Strategy 3: Lowercase match
        element = document.querySelector(`[data-dept-id="${normalizedId.toLowerCase()}"]`);
        if (element) return element;

        // Strategy 4: Case-insensitive attribute search
        const allDeptItems = document.querySelectorAll('.department-item');
        for (const item of allDeptItems) {
            const itemDeptId = item.getAttribute('data-dept-id');
            if (itemDeptId && itemDeptId.toUpperCase() === normalizedId) {
                return item;
            }
        }

        return null;
    }

    // Debug method to help identify why a department element wasn't found
    private debugDepartmentElementSearch(deptId: string): void {
        const allDeptItems = document.querySelectorAll('.department-item');
        console.log(`🔍 Debug search for ${deptId}:`);
        console.log(`   Available department items:`);
        
        allDeptItems.forEach((item, index) => {
            const itemDeptId = item.getAttribute('data-dept-id');
            const textContent = item.textContent?.trim() || 'No text';
            console.log(`   ${index + 1}. data-dept-id="${itemDeptId}" text="${textContent}"`);
        });
        
        // Also check if the department list container exists
        const departmentList = document.getElementById('department-list');
        if (!departmentList) {
            console.error('❌ Department list container (#department-list) not found in DOM!');
        } else {
            console.log('✅ Department list container exists');
        }
    }

    // Update visual indicators for multi-selection
    private updateMultiSelectionIndicators(activeDepartments: string[]): void {
        const sidebarHeader = document.querySelector('.sidebar-header h2');
        if (sidebarHeader) {
            if (activeDepartments.length === 0) {
                sidebarHeader.textContent = 'Departments';
            } else if (activeDepartments.length === 1) {
                sidebarHeader.textContent = `Departments (1 selected)`;
            } else {
                sidebarHeader.textContent = `Departments (${activeDepartments.length} selected)`;
            }
        }

        // Add visual indicator for multi-select state
        const departmentList = document.getElementById('department-list');
        if (departmentList) {
            if (activeDepartments.length > 1) {
                departmentList.classList.add('multi-select-active');
            } else {
                departmentList.classList.remove('multi-select-active');
            }
        }
    }

    // Initialize synchronization (called after all components are set up)
    initialize(): void {
        // Sync any existing filter state to sidebar
        this.syncFilterToSidebar();
        
        // Load any persisted department filters
        const activeDepartments = this.getActiveDepartments();
        if (activeDepartments.length > 0) {
            this.updateSidebarVisualState(activeDepartments);
        }
    }

    // Get human-readable description of current selection
    getSelectionDescription(): string {
        const activeDepartments = this.getActiveDepartments();
        
        if (activeDepartments.length === 0) {
            return 'No departments selected';
        } else if (activeDepartments.length === 1) {
            return `${activeDepartments[0]} selected`;
        } else if (activeDepartments.length <= 3) {
            return `${activeDepartments.join(', ')} selected`;
        } else {
            return `${activeDepartments.length} departments selected`;
        }
    }

    // Force a complete visual refresh of department states
    forceVisualRefresh(): void {
        console.log('🔄 Forcing complete visual refresh of department states');
        const activeDepartments = this.getActiveDepartments();
        this.updateSidebarVisualState(activeDepartments);
    }

    // Debug method to verify visual state matches filter state
    debugVisualSync(): void {
        const activeDepartments = this.getActiveDepartments();
        const visuallyActiveDepartments: string[] = [];
        
        document.querySelectorAll('.department-item.active').forEach(item => {
            const deptId = item.getAttribute('data-dept-id');
            if (deptId) {
                visuallyActiveDepartments.push(deptId);
            }
        });
        
        console.log('🔍 Department Sync Debug:');
        console.log('  Filter state departments:', activeDepartments);
        console.log('  Visually active departments:', visuallyActiveDepartments);
        
        const missingVisual = activeDepartments.filter(id => !visuallyActiveDepartments.includes(id));
        const extraVisual = visuallyActiveDepartments.filter(id => !activeDepartments.includes(id));
        
        if (missingVisual.length > 0) {
            console.warn('  ❌ Departments missing visual active state:', missingVisual);
        }
        if (extraVisual.length > 0) {
            console.warn('  ❌ Departments with incorrect visual active state:', extraVisual);
        }
        if (missingVisual.length === 0 && extraVisual.length === 0) {
            console.log('  ✅ Visual state perfectly synced with filter state');
        }
    }

    // Temporary debug method to add visual debugging classes
    enableDebugMode(): void {
        console.log('🐛 Enabling department selection debug mode');
        const activeDepartments = this.getActiveDepartments();
        
        // Add debug outline to all selected departments
        activeDepartments.forEach(deptId => {
            const element = this.findDepartmentElement(deptId);
            if (element) {
                element.classList.add('debug-selected');
            }
        });
        
        // Auto-disable after 10 seconds
        setTimeout(() => {
            this.disableDebugMode();
        }, 10000);
    }

    // Remove debug visual classes
    disableDebugMode(): void {
        console.log('🐛 Disabling department selection debug mode');
        document.querySelectorAll('.department-item.debug-selected').forEach(item => {
            item.classList.remove('debug-selected');
        });
    }
}