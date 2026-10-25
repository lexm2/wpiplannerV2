import { SearchTextFilterCriteria } from '../../../types/filters';
import { SectionBasedFilter } from '../SectionFilterPipeline';
import type { FilterableSection } from '../../../types/filterableUnit';
import type { Course, Section } from '../../../types/types';
import { keepMatchingGroups } from '../lectureGroupScope';
import {
  foldText,
  foldWords,
  namesHaveWord,
  textHasWord,
  type CourseWordMatch,
  type FoldedText,
  type SearchIndex,
} from '../../../utils/searchUtils';

/** The section's own searchable text: number, instructors, type. */
function sectionText(section: Section): string {
  return foldText(
    [
      section.number,
      ...section.periods.flatMap(p => [...p.instructors, p.type]),
    ].join(' '),
  );
}

/**
 * Where the section meets: the building names alone ("fuller labs", the
 * words before a room number), and everything with rooms and their names
 * ("fuller labs 222 imgd computer lab").
 */
function placeText(section: Section): { buildings: string; all: string } {
  const places = section.periods.map(p =>
    foldText([p.building, p.room, p.location].filter(Boolean).join(' ')),
  );
  const buildings = places.map(place => place.split(/\s+\S*\d/)[0]);
  return { buildings: buildings.join(' '), all: places.join(' ') };
}

/** A section's text as the filter reads it, folded and split into words. */
interface SectionWords {
  own: FoldedText;
  buildings: FoldedText;
  places: FoldedText;
  instructors: FoldedText;
}

// Built once per Section. Sections, like the courses holding them, are never
// mutated, and filtered course copies share their catalog course's.
const wordsCache = new WeakMap<Section, SectionWords>();

function sectionWords(section: Section): SectionWords {
  let words = wordsCache.get(section);
  if (words) return words;
  const place = placeText(section);
  words = {
    own: foldWords(sectionText(section)),
    buildings: foldWords(place.buildings),
    places: foldWords(place.all),
    instructors: foldWords(
      section.periods.flatMap(p => p.instructors.map(foldText)).join(' '),
    ),
  };
  wordsCache.set(section, words);
  return words;
}

/** Words naming a kind of place, not one: no sign a query is about rooms. */
const PLACE_WORDS = new Set(['lab', 'labs', 'hall', 'center', 'room']);

/**
 * Matches the query against each lecture group as searchUtils describes:
 * a code query by course code, a word query word by word, where each word
 * may match the course or the section.
 *
 * Rooms count only when the query names a building ("fuller labs",
 * "higgins labs 116"): room names are full of common words ("Computer Lab", "Music
 * Technology Lab"), and "physics with lab" should find physics with a lab
 * section, not a course meeting in Higgins Labs.
 */
export class SearchTextFilter implements SectionBasedFilter {
  readonly id = 'searchText';
  readonly name = 'Search Text';
  readonly description = 'Filter courses by search text';
  readonly priority = 1;

  /** `searchIndex`: the loaded catalog's, read anew each search. */
  constructor(private readonly searchIndex: () => SearchIndex) {}

  /** Courses best match first, by the same index the filter matches with. */
  rank(courses: Course[], query: string): Course[] {
    return this.searchIndex().rank(courses, query);
  }

  apply(
    sections: FilterableSection[],
    criteria: SearchTextFilterCriteria,
  ): FilterableSection[] {
    if (!criteria.query?.trim()) return sections;
    // Before the query is read: a code like "CS2" needs the departments.
    // The index has read the catalog's courses already; this reads any it
    // has not.
    const index = this.searchIndex();
    index.add(sections.map(fs => fs.course));
    const query = index.parse(criteria.query);

    // A match anywhere in a lecture group keeps the whole group: searching
    // a lecturer's name has to bring their lecture's labs along with it.
    if (criteria.professorOnly) {
      return keepMatchingGroups(sections, fs => {
        const { instructors } = sectionWords(fs.section);
        return query.words.every(word => namesHaveWord(instructors, word));
      });
    }

    // The course-level verdict is the same for each of its sections.
    const byCourse = new Map<Course, CourseWordMatch>();
    const courseMatch = (course: Course) => {
      let result = byCourse.get(course);
      if (!result) {
        result = index.matchCourseWords(course, query);
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
      const { own, buildings, places } = sectionWords(fs.section);
      const namesBuilding = query.words.some(
        word => !PLACE_WORDS.has(word) && textHasWord(buildings, word),
      );
      const ownHas = (word: string) =>
        textHasWord(own, word) || (namesBuilding && textHasWord(places, word));
      return query.words.every((word, i) => ownHas(word) || course.word(i));
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
