import { SearchTextFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';
import type { Course, Section } from '../../../types/types';
import { keepMatchingGroups } from '../lectureGroupScope';

// Lowercased course-level search text, built once per Course rather than once
// per section per keystroke. Catalog Course objects are never mutated (a data
// refresh builds new ones), so entries cannot go stale.
const haystackCache = new WeakMap<Course, string>();

function courseHaystack(course: Course): string {
  let text = haystackCache.get(course);
  if (text === undefined) {
    const courseCode = `${course.departmentAbbr}${course.number}`;
    text = [
      course.id,
      course.name,
      course.description,
      course.departmentName,
      courseCode,
    ]
      .join(' ')
      .toLowerCase();
    haystackCache.set(course, text);
  }
  return text;
}

function sectionMatches(section: Section, query: string): boolean {
  if (section.number.toLowerCase().includes(query)) return true;

  return section.periods.some(
    period =>
      period.professor.toLowerCase().includes(query) ||
      period.type.toLowerCase().includes(query) ||
      period.building.toLowerCase().includes(query) ||
      period.room.toLowerCase().includes(query) ||
      period.location.toLowerCase().includes(query),
  );
}

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

    // A match anywhere in a lecture group keeps the whole group: searching
    // a lecturer's name has to bring their lecture's labs along with it.
    if (criteria.professorOnly) {
      return keepMatchingGroups(sections, fs =>
        fs.section.periods.some(p => p.professor.toLowerCase().includes(query)),
      );
    }

    return keepMatchingGroups(sections, fs => {
      const courseText = courseHaystack(fs.course);
      return (
        courseText.includes(query) ||
        this.fuzzyMatch(courseText, query) ||
        sectionMatches(fs.section, query)
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
