import { Course, Period, DayOfWeek } from '../../types/types';
import { CourseFilter, PeriodDaysFilterCriteria } from '../../types/filters';

export class PeriodDaysFilter implements CourseFilter {
    readonly id = 'periodDays';
    readonly name = 'Period Days';
    readonly description = 'Filter periods by days of week';
    
    apply(courses: Course[], criteria: PeriodDaysFilterCriteria): Course[] {
        // This filter works on periods, so it's handled by the service layer
        return courses;
    }
    
    applyToPeriods(periods: Period[], criteria: PeriodDaysFilterCriteria): Period[] {
        if (!criteria.days || criteria.days.length === 0) {
            return periods;
        }
        
        const selectedDays = new Set(criteria.days.map(day => day.toLowerCase()));
        
        return periods.filter(period => {
            // Check if period has any of the selected days
            return Array.from(period.days).some(day => 
                selectedDays.has(day.toLowerCase())
            );
        });
    }
    
    isValidCriteria(criteria: any): criteria is PeriodDaysFilterCriteria {
        return criteria && 
               typeof criteria === 'object' && 
               'days' in criteria && 
               Array.isArray(criteria.days) &&
               criteria.days.every((day: any) => typeof day === 'string');
    }
    
    getDisplayValue(criteria: PeriodDaysFilterCriteria): string {
        if (!criteria.days || criteria.days.length === 0) {
            return 'Any Day';
        }
        
        if (criteria.days.length === 1) {
            return this.formatDayName(criteria.days[0]);
        }
        
        const dayNames = criteria.days.map(day => this.formatDayName(day));
        return dayNames.join(', ');
    }
    
    private formatDayName(day: string): string {
        const dayMap: { [key: string]: string } = {
            'mon': 'Monday',
            'tue': 'Tuesday', 
            'wed': 'Wednesday',
            'thu': 'Thursday',
            'fri': 'Friday',
            'sat': 'Saturday',
            'sun': 'Sunday'
        };
        
        return dayMap[day.toLowerCase()] || day;
    }
}