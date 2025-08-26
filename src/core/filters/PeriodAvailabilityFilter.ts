import { Period, Section } from '../../types/types';
import { SectionFilter, PeriodAvailabilityFilterCriteria } from '../../types/filters';
import { SelectedCourse } from '../../types/schedule';

export class PeriodAvailabilityFilter implements SectionFilter {
    readonly id = 'periodAvailability';
    readonly name = 'Period Availability';
    readonly description = 'Filter periods by seat availability';
    
    applyToSections(sections: Section[], criteria: PeriodAvailabilityFilterCriteria): Section[] {
        return sections.filter(section => {
            // Include section if ANY period meets the availability criteria
            return section.periods.some(period => {
                // Filter by availability
                if (criteria.availableOnly && period.seatsAvailable <= 0) {
                    return false;
                }
                
                // Filter by minimum available seats
                if (criteria.minAvailable && period.seatsAvailable < criteria.minAvailable) {
                    return false;
                }
                
                return true;
            });
        });
    }

    applyToSectionsWithContext(sectionsWithContext: Array<{course: SelectedCourse, section: Section}>, criteria: PeriodAvailabilityFilterCriteria): Array<{course: SelectedCourse, section: Section}> {
        return sectionsWithContext.filter(item => {
            // Include section if ANY period meets the availability criteria
            return item.section.periods.some(period => {
                // Filter by availability
                if (criteria.availableOnly && period.seatsAvailable <= 0) {
                    return false;
                }
                
                // Filter by minimum available seats
                if (criteria.minAvailable && period.seatsAvailable < criteria.minAvailable) {
                    return false;
                }
                
                return true;
            });
        });
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