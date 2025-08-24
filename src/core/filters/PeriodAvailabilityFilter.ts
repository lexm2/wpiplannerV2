import { Course, Period } from '../../types/types';
import { CourseFilter, PeriodAvailabilityFilterCriteria } from '../../types/filters';

export class PeriodAvailabilityFilter implements CourseFilter {
    readonly id = 'periodAvailability';
    readonly name = 'Period Availability';
    readonly description = 'Filter periods by seat availability';
    
    apply(courses: Course[], criteria: PeriodAvailabilityFilterCriteria): Course[] {
        // This filter works on periods, so it's handled by the service layer
        return courses;
    }
    
    applyToPeriods(periods: Period[], criteria: PeriodAvailabilityFilterCriteria): Period[] {
        return periods.filter(period => {
            // Filter by availability
            if (criteria.availableOnly && period.seatsAvailable <= 0) {
                return false;
            }
            
            // Filter by minimum available seats
            if (criteria.minAvailable && 
                typeof criteria.minAvailable === 'number' && 
                period.seatsAvailable < criteria.minAvailable) {
                return false;
            }
            
            return true;
        });
    }
    
    isValidCriteria(criteria: any): criteria is PeriodAvailabilityFilterCriteria {
        if (!criteria || typeof criteria !== 'object') return false;
        
        if ('availableOnly' in criteria && typeof criteria.availableOnly !== 'boolean') {
            return false;
        }
        
        if (criteria.minAvailable && 
            (typeof criteria.minAvailable !== 'number' || criteria.minAvailable < 0)) {
            return false;
        }
        
        return true;
    }
    
    getDisplayValue(criteria: PeriodAvailabilityFilterCriteria): string {
        const parts: string[] = [];
        
        if (criteria.availableOnly) {
            parts.push('Available Only');
        }
        
        if (criteria.minAvailable && criteria.minAvailable > 0) {
            parts.push(`Min ${criteria.minAvailable} Seats`);
        }
        
        return parts.length > 0 ? parts.join(', ') : 'Any Availability';
    }
}