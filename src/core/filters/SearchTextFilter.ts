import { Course } from '../../types/types';
import { CourseFilter, SearchTextFilterCriteria } from '../../types/filters';

export class SearchTextFilter implements CourseFilter {
    readonly id = 'searchText';
    readonly name = 'Search Text';
    readonly description = 'Filter courses by search text';
    
    apply(courses: Course[], criteria: SearchTextFilterCriteria): Course[] {
        if (!criteria.query || !criteria.query.trim()) {
            return courses;
        }
        
        const query = criteria.query.trim().toLowerCase();
        
        return courses.filter(course => {
            const courseText = [
                course.id,
                course.name,
                course.description,
                course.department.abbreviation,
                course.department.name,
                course.number
            ].join(' ').toLowerCase();

            return courseText.includes(query) || this.fuzzyMatch(courseText, query);
        });
    }
    
    private fuzzyMatch(text: string, query: string): boolean {
        // Allow for partial matches for better search experience
        if (query.length <= 3) {
            return text.includes(query);
        }
        
        const words = query.split(/\s+/);
        return words.every(word => {
            if (word.length <= 2) return text.includes(word);
            
            // Allow partial matches for longer words
            const partial = word.substring(0, Math.floor(word.length * 0.8));
            return text.includes(partial);
        });
    }
    
    isValidCriteria(criteria: any): criteria is SearchTextFilterCriteria {
        return criteria && 
               typeof criteria === 'object' && 
               'query' in criteria && 
               typeof criteria.query === 'string';
    }
    
    getDisplayValue(criteria: SearchTextFilterCriteria): string {
        return `"${criteria.query.trim()}"`;
    }
}