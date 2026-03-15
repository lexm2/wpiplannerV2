import { ActiveFilter, FilterChangeEvent, FilterEventListener, FilterCriteria } from '../../types/filters';

/**
 * Manages active filters with event-driven state updates and selective serialization
 */
export class FilterState {
    private activeFilters: Map<string, ActiveFilter> = new Map();
    private listeners: FilterEventListener[] = [];
    
    addFilter(id: string, name: string, criteria: unknown, displayValue: string): void {
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
    
    updateFilter(id: string, criteria: unknown, displayValue: string): boolean {
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
}