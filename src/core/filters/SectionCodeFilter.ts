import { Section } from '../../types/types';
import { SectionFilter, SectionCodeFilterCriteria } from '../../types/filters';
import { SelectedCourse } from '../../types/schedule';

export class SectionCodeFilter implements SectionFilter {
    readonly id = 'sectionCode';
    readonly name = 'Section Code';
    readonly description = 'Filter by section codes (AL01, AX01, A01, etc.)';
    readonly priority = 2;

    applyToSections(sections: Section[], criteria: SectionCodeFilterCriteria): Section[] {
        if (!criteria.codes || criteria.codes.length === 0) {
            return sections;
        }
        
        const searchCodes = criteria.codes.map(code => code.toLowerCase().trim()).filter(code => code.length > 0);
        if (searchCodes.length === 0) {
            return sections;
        }
        
        return sections.filter(section => {
            const sectionNumber = section.number.toLowerCase();
            
            // Check if any of the search codes match this section
            return searchCodes.some(searchCode => {
                // Exact match
                if (sectionNumber === searchCode) {
                    return true;
                }
                
                // Partial match - section contains the search code
                if (sectionNumber.includes(searchCode)) {
                    return true;
                }
                
                // Pattern match for composite sections like "A01/AL01"
                const sectionParts = sectionNumber.split('/');
                return sectionParts.some(part => 
                    part.trim() === searchCode || part.trim().includes(searchCode)
                );
            });
        });
    }

    applyToSectionsWithContext(sectionsWithContext: Array<{course: SelectedCourse, section: Section}>, criteria: SectionCodeFilterCriteria): Array<{course: SelectedCourse, section: Section}> {
        if (!criteria.codes || criteria.codes.length === 0) {
            return sectionsWithContext;
        }
        
        const searchCodes = criteria.codes.map(code => code.toLowerCase().trim()).filter(code => code.length > 0);
        if (searchCodes.length === 0) {
            return sectionsWithContext;
        }
        
        return sectionsWithContext.filter(item => {
            const sectionNumber = item.section.number.toLowerCase();
            
            // Check if any of the search codes match this section
            return searchCodes.some(searchCode => {
                // Exact match
                if (sectionNumber === searchCode) {
                    return true;
                }
                
                // Partial match - section contains the search code
                if (sectionNumber.includes(searchCode)) {
                    return true;
                }
                
                // Pattern match for composite sections like "A01/AL01"
                const sectionParts = sectionNumber.split('/');
                return sectionParts.some(part => 
                    part.trim() === searchCode || part.trim().includes(searchCode)
                );
            });
        });
    }

    isValidCriteria(criteria: any): boolean {
        if (!criteria || typeof criteria !== 'object') {
            return false;
        }
        return Array.isArray(criteria.codes) && 
               criteria.codes.every((code: any) => typeof code === 'string');
    }

    getDisplayValue(criteria: SectionCodeFilterCriteria): string {
        if (!criteria.codes || criteria.codes.length === 0) {
            return 'No section codes';
        }
        
        if (criteria.codes.length === 1) {
            return `Section: ${criteria.codes[0]}`;
        }
        
        return `Sections: ${criteria.codes.join(', ')}`;
    }
}