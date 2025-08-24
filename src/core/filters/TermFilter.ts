import { Course } from '../../types/types';
import { CourseFilter, TermFilterCriteria } from '../../types/filters';

export class TermFilter implements CourseFilter {
    readonly id = 'term';
    readonly name = 'Term';
    readonly description = 'Filter courses by academic term';
    
    apply(courses: Course[], criteria: TermFilterCriteria): Course[] {
        if (!criteria.terms || criteria.terms.length === 0) {
            return courses;
        }
        
        const termSet = new Set(
            criteria.terms.map(term => term.toUpperCase())
        );
        
        return courses.filter(course =>
            course.sections.some(section => {
                const extractedTerm = this.extractTermLetter(section.term, section.number);
                return termSet.has(extractedTerm);
            })
        );
    }
    
    private extractTermLetter(termString: string, sectionNumber?: string): string {
        // Extract term from section numbers like "A01" -> A, "D01" -> D
        if (sectionNumber) {
            const sectionMatch = sectionNumber.match(/^([ABCD])/i);
            if (sectionMatch) {
                return sectionMatch[1].toUpperCase();
            }
        }
        
        // Text format for future compatibility ("2025 Fall A Term", "2026 Spring C Term")
        if (termString) {
            const textMatch = termString.match(/\b([ABCD])\s+Term/i);
            if (textMatch) {
                return textMatch[1].toUpperCase();
            }
        }
        
        return 'A'; // fallback
    }
    
    isValidCriteria(criteria: any): criteria is TermFilterCriteria {
        return criteria && 
               Array.isArray(criteria.terms) &&
               criteria.terms.every((term: any) => typeof term === 'string');
    }
    
    getDisplayValue(criteria: TermFilterCriteria): string {
        if (criteria.terms.length === 1) {
            return `Term: ${criteria.terms[0]}`;
        }
        return `Terms: ${criteria.terms.join(', ')}`;
    }
}