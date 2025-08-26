import { describe, test, expect, beforeEach } from 'vitest';
import { PeriodConflictFilter } from '../../../src/core/filters/PeriodConflictFilter';
import { ConflictDetector } from '../../../src/core/ConflictDetector';
import { CourseFilterService } from '../../../src/services/CourseFilterService';
import { SearchService } from '../../../src/services/searchService';

describe('PeriodConflictFilter Registration', () => {
    let conflictDetector: ConflictDetector;
    let periodConflictFilter: PeriodConflictFilter;
    let filterService: CourseFilterService;
    let searchService: SearchService;

    beforeEach(() => {
        conflictDetector = new ConflictDetector();
        periodConflictFilter = new PeriodConflictFilter(conflictDetector);
        searchService = new SearchService();
        filterService = new CourseFilterService(searchService);
    });

    test('should implement CourseFilter interface correctly', () => {
        expect(periodConflictFilter.id).toBe('periodConflict');
        expect(periodConflictFilter.name).toBe('Schedule Conflicts');
        expect(periodConflictFilter.description).toBe('Hide periods that conflict with selected sections');
        
        expect(typeof periodConflictFilter.apply).toBe('function');
        expect(typeof periodConflictFilter.isValidCriteria).toBe('function');
        expect(typeof periodConflictFilter.getDisplayValue).toBe('function');
    });

    test('should register successfully with FilterService', () => {
        // This should not throw an error
        filterService.registerFilter(periodConflictFilter);
        
        // Verify it was registered by trying to add a filter
        const result = filterService.addFilter('periodConflict', { avoidConflicts: true });
        expect(result).toBe(true);
    });

    test('isValidCriteria should work correctly', () => {
        expect(periodConflictFilter.isValidCriteria({ avoidConflicts: true })).toBe(true);
        expect(periodConflictFilter.isValidCriteria({ avoidConflicts: false })).toBe(true);
        
        // Invalid cases
        expect(periodConflictFilter.isValidCriteria(null)).toBe(false);
        expect(periodConflictFilter.isValidCriteria(undefined)).toBe(false);
        expect(periodConflictFilter.isValidCriteria({})).toBe(false);
        expect(periodConflictFilter.isValidCriteria({ avoidConflicts: 'yes' })).toBe(false);
        expect(periodConflictFilter.isValidCriteria({ something: 'else' })).toBe(false);
    });

    test('getDisplayValue should work correctly', () => {
        expect(periodConflictFilter.getDisplayValue({ avoidConflicts: true })).toBe('Avoiding conflicts');
        expect(periodConflictFilter.getDisplayValue({ avoidConflicts: false })).toBe('Conflicts allowed');
    });

    test('apply method should return all courses (period filtering happens elsewhere)', () => {
        const courses = []; // Empty courses array for testing
        const result = periodConflictFilter.apply(courses, { avoidConflicts: true });
        expect(result).toEqual(courses);
    });

    test('should be able to add and remove filter through FilterService', () => {
        filterService.registerFilter(periodConflictFilter);
        
        // Add filter
        const addResult = filterService.addFilter('periodConflict', { avoidConflicts: true });
        expect(addResult).toBe(true);
        
        // Check it's active
        const activeFilters = filterService.getActiveFilters();
        expect(activeFilters).toHaveLength(1);
        expect(activeFilters[0].id).toBe('periodConflict');
        expect(activeFilters[0].displayValue).toBe('Avoiding conflicts');
        
        // Remove filter
        const removeResult = filterService.removeFilter('periodConflict');
        expect(removeResult).toBe(true);
        
        // Check it's gone
        const activeFiltersAfter = filterService.getActiveFilters();
        expect(activeFiltersAfter).toHaveLength(0);
    });
});