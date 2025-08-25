import { ActiveFilter, FilterChangeEvent, FilterEventListener, FilterCriteria } from '../types/filters';

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
                .filter(([id, filter]) => !excludeFilters.includes(id))
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