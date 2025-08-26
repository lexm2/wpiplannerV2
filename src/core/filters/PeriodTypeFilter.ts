import { Period, Section } from '../../types/types';
import { SectionFilter, PeriodTypeFilterCriteria } from '../../types/filters';
import { SelectedCourse } from '../../types/schedule';

export class PeriodTypeFilter implements SectionFilter {
    readonly id = 'periodType';
    readonly name = 'Period Type';
    readonly description = 'Exclude sections with selected period types';
    readonly priority = 50; // Medium priority - Lab vs Lecture distinction
    
    applyToSections(sections: Section[], criteria: PeriodTypeFilterCriteria): Section[] {
        if (!criteria.types || criteria.types.length === 0) {
            return sections;
        }
        
        const excludedTypes = new Set(
            criteria.types.map(type => this.normalizeType(type))
        );
        
        return sections.filter(section => {
            // Exclude section if ANY period is of any of the excluded types
            return !section.periods.some(period => {
                const normalizedPeriodType = this.normalizeType(period.type);
                return excludedTypes.has(normalizedPeriodType);
            });
        });
    }

    applyToSectionsWithContext(sectionsWithContext: Array<{course: SelectedCourse, section: Section}>, criteria: PeriodTypeFilterCriteria): Array<{course: SelectedCourse, section: Section}> {
        if (!criteria.types || criteria.types.length === 0) {
            return sectionsWithContext;
        }
        
        const excludedTypes = new Set(
            criteria.types.map(type => this.normalizeType(type))
        );
        
        return sectionsWithContext.filter(item => {
            // Exclude section if ANY period is of any of the excluded types
            return !item.section.periods.some(period => {
                const normalizedPeriodType = this.normalizeType(period.type);
                return excludedTypes.has(normalizedPeriodType);
            });
        });
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