import { Course, Period } from '../../types/types';
import { CourseFilter, PeriodTypeFilterCriteria } from '../../types/filters';

export class PeriodTypeFilter implements CourseFilter {
    readonly id = 'periodType';
    readonly name = 'Period Type';
    readonly description = 'Exclude sections with selected period types';
    
    apply(courses: Course[], criteria: PeriodTypeFilterCriteria): Course[] {
        // This filter works on periods, so it's handled by the service layer
        return courses;
    }
    
    applyToPeriods(periods: Period[], criteria: PeriodTypeFilterCriteria): Period[] {
        if (!criteria.types || criteria.types.length === 0) {
            return periods;
        }
        
        const selectedTypes = new Set(
            criteria.types.map(type => this.normalizeType(type))
        );
        
        return periods.filter(period => {
            const normalizedType = this.normalizeType(period.type);
            return !selectedTypes.has(normalizedType);
        });
    }
    
    public normalizeType(type: string): string {
        const lower = type.toLowerCase().trim();
        
        // Normalize common type variations
        if (lower.includes('lec') || lower.includes('lecture')) return 'lecture';
        if (lower.includes('lab')) return 'lab';
        if (lower.includes('dis') || lower.includes('discussion')) return 'discussion';
        if (lower.includes('rec') || lower.includes('recitation')) return 'recitation';
        if (lower.includes('sem') || lower.includes('seminar')) return 'seminar';
        if (lower.includes('studio')) return 'studio';
        if (lower.includes('conference') || lower.includes('conf')) return 'conference';
        
        return lower;
    }
    
    isValidCriteria(criteria: any): criteria is PeriodTypeFilterCriteria {
        return !!(criteria && 
                 typeof criteria === 'object' && 
                 'types' in criteria && 
                 Array.isArray(criteria.types) &&
                 criteria.types.every((type: any) => typeof type === 'string'));
    }
    
    getDisplayValue(criteria: PeriodTypeFilterCriteria): string {
        if (!criteria.types || criteria.types.length === 0) {
            return 'No exclusions';
        }
        
        if (criteria.types.length === 1) {
            return `Exclude: ${this.formatTypeName(criteria.types[0])}`;
        }
        
        const typeNames = criteria.types.map(type => this.formatTypeName(type));
        return `Exclude: ${typeNames.join(', ')}`;
    }
    
    private formatTypeName(type: string): string {
        const normalized = this.normalizeType(type);
        
        const typeMap: { [key: string]: string } = {
            'lecture': 'Lecture',
            'lab': 'Lab',
            'discussion': 'Discussion',
            'recitation': 'Recitation',
            'seminar': 'Seminar',
            'studio': 'Studio',
            'conference': 'Conference'
        };
        
        return typeMap[normalized] || type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    }
}