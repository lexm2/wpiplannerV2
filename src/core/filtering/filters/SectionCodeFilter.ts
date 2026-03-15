import { SectionCodeFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

export class SectionCodeFilter implements SectionBasedFilter {
    readonly id = 'sectionCode';
    readonly name = 'Section Code';
    readonly description = 'Filter by section codes (AL01, AX01, A01, etc.)';
    readonly priority = 2;

    apply(sections: FilterableSection[], criteria: SectionCodeFilterCriteria): FilterableSection[] {
        if (!criteria.codes || criteria.codes.length === 0) {
            return sections;
        }

        const searchCodes = criteria.codes.map(code => code.toLowerCase().trim()).filter(code => code.length > 0);
        if (searchCodes.length === 0) {
            return sections;
        }

        return sections.filter(fs => {
            const sectionNumber = fs.section.number.toLowerCase();

            return searchCodes.some(searchCode => {
                if (sectionNumber === searchCode) {
                    return true;
                }

                if (sectionNumber.includes(searchCode)) {
                    return true;
                }

                const sectionParts = sectionNumber.split('/');
                return sectionParts.some(part =>
                    part.trim() === searchCode || part.trim().includes(searchCode)
                );
            });
        });
    }

    isValidCriteria(criteria: unknown): criteria is SectionCodeFilterCriteria {
        if (!criteria || typeof criteria !== 'object') {
            return false;
        }
        const c = criteria as SectionCodeFilterCriteria;
        return Array.isArray(c.codes) &&
               c.codes.every((code: unknown) => typeof code === 'string');
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
