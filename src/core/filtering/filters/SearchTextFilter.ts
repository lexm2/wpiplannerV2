import { SearchTextFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';

export class SearchTextFilter implements SectionBasedFilter {
  readonly id = 'searchText';
  readonly name = 'Search Text';
  readonly description = 'Filter courses by search text';
  readonly priority = 1;

  apply(
    sections: FilterableSection[],
    criteria: SearchTextFilterCriteria,
  ): FilterableSection[] {
    if (!criteria.query || !criteria.query.trim()) {
      return sections;
    }

    const query = criteria.query.trim().toLowerCase();

    if (criteria.professorOnly) {
      return sections.filter(fs =>
        fs.section.periods.some(p => p.professor.toLowerCase().includes(query)),
      );
    }

    return sections.filter(fs => {
      const course = fs.course;
      const courseCode = `${course.departmentAbbr}${course.number}`;
      const courseText = [
        course.id,
        course.name,
        course.description,
        course.departmentName,
        courseCode,
      ]
        .join(' ')
        .toLowerCase();

      if (courseText.includes(query) || this.fuzzyMatch(courseText, query)) {
        return true;
      }

      const section = fs.section;
      if (section.number.toLowerCase().includes(query)) {
        return true;
      }

      return section.periods.some(
        period =>
          period.professor.toLowerCase().includes(query) ||
          period.type.toLowerCase().includes(query) ||
          period.building.toLowerCase().includes(query) ||
          period.room.toLowerCase().includes(query) ||
          period.location.toLowerCase().includes(query),
      );
    });
  }

  private fuzzyMatch(text: string, query: string): boolean {
    if (query.length <= 3) {
      return text.includes(query);
    }

    const words = query.split(/\s+/);
    return words.every(word => {
      if (word.length <= 2) return text.includes(word);

      const partial = word.substring(0, Math.floor(word.length * 0.8));
      return text.includes(partial);
    });
  }

  isValidCriteria(criteria: unknown): criteria is SearchTextFilterCriteria {
    return !!(
      criteria &&
      typeof criteria === 'object' &&
      'query' in criteria &&
      typeof criteria.query === 'string'
    );
  }

  getDisplayValue(criteria: SearchTextFilterCriteria): string {
    return `"${criteria.query.trim()}"`;
  }
}
