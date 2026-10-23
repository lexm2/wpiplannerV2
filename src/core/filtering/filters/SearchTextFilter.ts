import { SearchTextFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';
import type { Course, Section } from '../../../types/types';
import { keepMatchingGroups } from '../lectureGroupScope';
import {
  foldText,
  matchCourseWords,
  parseSearchQuery,
  namesHaveWord,
  prepareSearch,
  textHasWord,
  type CourseWordMatch,
} from '../../../utils/searchUtils';

/** The section's own searchable text: number, instructors, type, rooms. */
function sectionText(section: Section): string {
  return foldText(
    [
      section.number,
      ...section.periods.flatMap(p => [
        p.professor,
        p.type,
        p.building,
        p.room,
        p.location,
      ]),
    ].join(' '),
  );
}

/**
 * Matches the query against each lecture group as searchUtils describes:
 * a code query by course code, a word query word by word, where each word
 * may match the course or the section.
 */
export class SearchTextFilter implements SectionBasedFilter {
  readonly id = 'searchText';
  readonly name = 'Search Text';
  readonly description = 'Filter courses by search text';
  readonly priority = 1;

  apply(
    sections: FilterableSection[],
    criteria: SearchTextFilterCriteria,
  ): FilterableSection[] {
    if (!criteria.query?.trim()) return sections;
    // Before the query is read: a code like "CS2" needs the departments.
    prepareSearch(new Set(sections.map(fs => fs.course)));
    const query = parseSearchQuery(criteria.query);

    // A match anywhere in a lecture group keeps the whole group: searching
    // a lecturer's name has to bring their lecture's labs along with it.
    if (criteria.professorOnly) {
      return keepMatchingGroups(sections, fs => {
        const names = fs.section.periods
          .map(p => foldText(p.professor))
          .join(' ');
        return query.words.every(word => namesHaveWord(names, word));
      });
    }

    // The course-level verdict is the same for each of its sections.
    const byCourse = new Map<Course, CourseWordMatch>();
    const courseMatch = (course: Course) => {
      let result = byCourse.get(course);
      if (!result) {
        result = matchCourseWords(course, query);
        byCourse.set(course, result);
      }
      return result;
    };

    return keepMatchingGroups(sections, fs => {
      const course = courseMatch(fs.course);
      if (course.all) return true;
      // A code query is about the course alone.
      if (query.code) return false;
      // Each word from the section or the course; the section's short text
      // first, so the course's words are read only when it lacks them.
      const own = sectionText(fs.section);
      return query.words.every(
        (word, i) => textHasWord(own, word) || course.word(i),
      );
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
