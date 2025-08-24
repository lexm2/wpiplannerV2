import { Course, Period } from '../../types/types';
import { CourseFilter, PeriodTimeFilterCriteria } from '../../types/filters';

export class PeriodTimeFilter implements CourseFilter {
    readonly id = 'periodTime';
    readonly name = 'Period Time';
    readonly description = 'Filter periods by time range';
    
    apply(courses: Course[], criteria: PeriodTimeFilterCriteria): Course[] {
        // This filter works on periods, so it's handled by the service layer
        return courses;
    }
    
    applyToPeriods(periods: Period[], criteria: PeriodTimeFilterCriteria): Period[] {
        return periods.filter(period => {
            // Check start time constraint
            if (criteria.startTime) {
                const periodStartMinutes = period.startTime.hours * 60 + period.startTime.minutes;
                const filterStartMinutes = criteria.startTime.hours * 60 + criteria.startTime.minutes;
                if (periodStartMinutes < filterStartMinutes) {
                    return false;
                }
            }
            
            // Check end time constraint
            if (criteria.endTime) {
                const periodEndMinutes = period.endTime.hours * 60 + period.endTime.minutes;
                const filterEndMinutes = criteria.endTime.hours * 60 + criteria.endTime.minutes;
                if (periodEndMinutes > filterEndMinutes) {
                    return false;
                }
            }
            
            return true;
        });
    }
    
    isValidCriteria(criteria: any): criteria is PeriodTimeFilterCriteria {
        if (!criteria || typeof criteria !== 'object') return false;
        
        if (criteria.startTime) {
            if (!this.isValidTime(criteria.startTime)) return false;
        }
        
        if (criteria.endTime) {
            if (!this.isValidTime(criteria.endTime)) return false;
        }
        
        return true;
    }
    
    private isValidTime(time: any): boolean {
        return time &&
               typeof time.hours === 'number' &&
               typeof time.minutes === 'number' &&
               time.hours >= 0 && time.hours <= 23 &&
               time.minutes >= 0 && time.minutes <= 59;
    }
    
    getDisplayValue(criteria: PeriodTimeFilterCriteria): string {
        const parts: string[] = [];
        
        if (criteria.startTime) {
            const startTime = this.formatTime(criteria.startTime);
            parts.push(`After ${startTime}`);
        }
        
        if (criteria.endTime) {
            const endTime = this.formatTime(criteria.endTime);
            parts.push(`Before ${endTime}`);
        }
        
        return parts.length > 0 ? parts.join(', ') : 'Any Time';
    }
    
    private formatTime(time: { hours: number; minutes: number }): string {
        const displayHours = time.hours === 0 ? 12 : time.hours > 12 ? time.hours - 12 : time.hours;
        const ampm = time.hours >= 12 ? 'PM' : 'AM';
        const minutes = time.minutes.toString().padStart(2, '0');
        return `${displayHours}:${minutes} ${ampm}`;
    }
}