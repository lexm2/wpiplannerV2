import { ActiveFilter, FilterChangeEvent, FilterEventListener, FilterCriteria } from '../types/filters';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FilterState - Core Filter State Management & Selective Serialization Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ARCHITECTURE ROLE:
 * - Core state management foundation for the comprehensive filtering system
 * - Event-driven filter coordination hub with real-time notifications
 * - Selective serialization engine preventing transient filter persistence
 * - Foundation layer supporting CourseFilterService and UI filter interactions
 * - Centralized filter lifecycle management (add, update, remove, clear)
 * 
 * KEY DEPENDENCIES:
 * Type System:
 * - ActiveFilter interface → Runtime filter representation with criteria and display
 * - FilterChangeEvent interface → Event system for cross-component notifications
 * - FilterCriteria interface → Generic criteria storage for any filter type
 * - FilterEventListener type → Event handler contract for UI components
 * 
 * Integration Architecture:
 * - No external dependencies → Pure core state management
 * - Event-driven → Notifies all registered listeners of state changes
 * - Serialization → Supports selective persistence with exclusion lists
 * - Memory efficient → Map-based storage with proper cleanup
 * 
 * USED BY:
 * - CourseFilterService → Primary state coordinator and service layer bridge
 * - UI Controllers → Indirect access through CourseFilterService events
 * - FilterModalController → Real-time filter state updates and display
 * - ScheduleFilterService → Specialized schedule filter state management
 * - Persistence System → Selective serialization for localStorage operations
 * 
 * SELECTIVE SERIALIZATION ARCHITECTURE:
 * Standard Serialization (All Filters):
 * ```
 * serialize() → Includes all active filters in JSON output
 * Used for: Complete state snapshots, debugging, full exports
 * ```
 * 
 * Selective Serialization (Excludes Transient):
 * ```
 * serialize(['searchText', 'department']) → Excludes specified filter types
 * Used for: localStorage persistence, session state management
 * Benefits: Clean session starts, no transient filter pollution
 * ```
 * 
 * FILTER LIFECYCLE MANAGEMENT:
 * 1. Filter Addition:
 *    - addFilter() stores filter with criteria and display value
 *    - Event notification triggers UI updates across components
 *    - Map-based storage ensures O(1) lookup performance
 * 
 * 2. Filter Updates:
 *    - updateFilter() modifies existing filter criteria
 *    - Preserves filter identity while updating state
 *    - Event system notifies listeners of changes
 * 
 * 3. Filter Removal:
 *    - removeFilter() cleanly removes filter from state
 *    - Memory cleanup through Map.delete()
 *    - Event notification enables UI cleanup
 * 
 * 4. Bulk Operations:
 *    - clearFilters() removes all active filters
 *    - Single event notification for performance
 *    - Complete state reset for clean slate operations
 * 
 * EVENT-DRIVEN ARCHITECTURE:
 * ```
 * State Change Flow:
 * Filter Operation → State Update → Event Generation → Listener Notification
 * 
 * Event Types:
 * - 'add': New filter activated
 * - 'remove': Filter deactivated  
 * - 'update': Filter criteria modified
 * - 'clear': All filters removed
 * 
 * Cross-Component Updates:
 * FilterState Event → CourseFilterService → UI Controllers → DOM Updates
 * ```
 * 
 * DESERIALIZATION WITH EXCLUSION:
 * Enhanced deserialize() method with architectural benefits:
 * ```
 * deserialize(jsonData):
 *   1. Parse JSON filter data
 *   2. Filter out transient types (searchText, department)
 *   3. Rebuild Map with persistent filters only
 *   4. Notify listeners of restored state
 * ```
 * 
 * Benefits:
 * - Automatic cleanup of legacy transient filters
 * - Consistent session start behavior
 * - Prevents search/department filter accumulation
 * - Clean state restoration without manual intervention
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Map-based storage for O(1) filter access
 * - Event batching for bulk operations  
 * - Efficient serialization with selective filtering
 * - Memory cleanup through proper Map lifecycle
 * - Event listener management with add/remove support
 * 
 * STATE ACCESS PATTERNS:
 * ```
 * Query Operations:
 * - hasFilter(id) → O(1) existence check
 * - getFilter(id) → O(1) filter retrieval
 * - getActiveFilters() → Array conversion for iteration
 * - isEmpty() → Quick state check for performance
 * 
 * Aggregation Operations:
 * - getFilterCriteria() → Criteria extraction for processing
 * - getFilterCount() → State size monitoring
 * - getActiveFilterIds() → ID enumeration for operations
 * ```
 * 
 * INTEGRATION POINTS:
 * - CourseFilterService coordination through event system
 * - localStorage integration via selective serialization
 * - UI component updates through event notifications
 * - State validation through type-safe interfaces
 * - Performance monitoring through operation metrics
 * 
 * ARCHITECTURAL PATTERNS:
 * - State Management: Centralized filter state with event notifications
 * - Observer Pattern: Event-driven updates to registered listeners
 * - Strategy Pattern: Selective serialization based on exclusion criteria
 * - Command Pattern: Filter operations as discrete state changes
 * - Memento Pattern: Serialization supports state persistence and restoration
 * 
 * DESIGN BENEFITS:
 * - Transient Filter Exclusion: Clean session starts with no search/department persistence
 * - Event-Driven Updates: Loose coupling between state and UI components  
 * - Performance: Efficient Map-based storage and O(1) operations
 * - Memory Management: Proper cleanup and listener lifecycle management
 * - Type Safety: Strong typing throughout state operations
 * - Extensibility: Easy addition of new filter types and operations
 * 
 * CORE ARCHITECTURE SIGNIFICANCE:
 * FilterState serves as the foundational state management layer that enables:
 * - Consistent filter behavior across all application components
 * - Clean separation between transient (search) and persistent (preference) filters
 * - Real-time UI synchronization through event-driven architecture
 * - Reliable persistence with selective serialization strategies
 * - High-performance filtering operations on large course datasets
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export class FilterState {
    private activeFilters: Map<string, ActiveFilter> = new Map();
    private listeners: FilterEventListener[] = [];
    
    addFilter(id: string, name: string, criteria: any, displayValue: string): void {
        const filter: ActiveFilter = {
            id,
            name,
            criteria,
            displayValue
        };
        
        this.activeFilters.set(id, filter);
        this.notifyListeners({
            type: 'add',
            filterId: id,
            criteria,
            activeFilters: this.getActiveFilters()
        });
    }
    
    removeFilter(id: string): boolean {
        const removed = this.activeFilters.delete(id);
        if (removed) {
            this.notifyListeners({
                type: 'remove',
                filterId: id,
                activeFilters: this.getActiveFilters()
            });
        }
        return removed;
    }
    
    updateFilter(id: string, criteria: any, displayValue: string): boolean {
        const existing = this.activeFilters.get(id);
        if (existing) {
            existing.criteria = criteria;
            existing.displayValue = displayValue;
            this.notifyListeners({
                type: 'update',
                filterId: id,
                criteria,
                activeFilters: this.getActiveFilters()
            });
            return true;
        }
        return false;
    }
    
    clearFilters(): void {
        this.activeFilters.clear();
        this.notifyListeners({
            type: 'clear',
            activeFilters: []
        });
    }
    
    hasFilter(id: string): boolean {
        return this.activeFilters.has(id);
    }
    
    getFilter(id: string): ActiveFilter | undefined {
        return this.activeFilters.get(id);
    }
    
    getActiveFilters(): ActiveFilter[] {
        return Array.from(this.activeFilters.values());
    }
    
    getFilterCriteria(): FilterCriteria {
        const criteria: FilterCriteria = {};
        for (const [id, filter] of this.activeFilters) {
            criteria[id] = filter.criteria;
        }
        return criteria;
    }
    
    getActiveFilterIds(): string[] {
        return Array.from(this.activeFilters.keys());
    }
    
    getFilterCount(): number {
        return this.activeFilters.size;
    }
    
    isEmpty(): boolean {
        return this.activeFilters.size === 0;
    }
    
    addEventListener(listener: FilterEventListener): void {
        this.listeners.push(listener);
    }
    
    removeEventListener(listener: FilterEventListener): void {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }
    
    private notifyListeners(event: FilterChangeEvent): void {
        this.listeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error('Error in filter event listener:', error);
            }
        });
    }
    
    // Serialization for persistence
    serialize(excludeFilters: string[] = []): string {
        const data = {
            filters: Array.from(this.activeFilters.entries())
                .filter(([id]) => !excludeFilters.includes(id))
                .map(([id, filter]) => ({
                    id: filter.id,
                    name: filter.name,
                    criteria: filter.criteria,
                    displayValue: filter.displayValue
                }))
        };
        return JSON.stringify(data);
    }
    
    deserialize(data: string): boolean {
        try {
            const parsed = JSON.parse(data);
            this.activeFilters.clear();
            
            if (parsed.filters && Array.isArray(parsed.filters)) {
                parsed.filters.forEach((filter: ActiveFilter) => {
                    // Skip search and department filters during deserialization
                    if (filter.id !== 'searchText' && filter.id !== 'department') {
                        this.activeFilters.set(filter.id, filter);
                    }
                });
            }
            
            this.notifyListeners({
                type: 'clear',
                activeFilters: this.getActiveFilters()
            });
            
            return true;
        } catch (error) {
            console.error('Failed to deserialize filter state:', error);
            return false;
        }
    }
}