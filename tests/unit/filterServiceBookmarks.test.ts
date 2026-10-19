/**
 * FilterService.filterCourses with only the bookmark filter active: no
 * section filter runs, but the result matches the section pipeline's -
 * bookmarked courses, without the ones that have no sections.
 */
import { describe, it, expect } from 'vitest';
import { FilterService } from '../../src/services/filtering/FilterService';
import { SearchTextFilter } from '../../src/core/filtering/filters/SearchTextFilter';
import type { Course } from '../../src/types/types';

function course(id: string, sections: number): Course {
  return {
    id,
    number: id.replace(/^\D+/, ''),
    name: id,
    description: '',
    departmentAbbr: id.replace(/\d+$/, ''),
    departmentName: '',
    degreeAttributes: [],
    courseTypes: [],
    minCredits: 3,
    maxCredits: 3,
    lectures: Array.from({ length: sections }, (_, i) => ({
      section: {
        crn: Number(id.replace(/\D/g, '')) * 10 + i,
        number: `L0${i}`,
        periods: [],
      },
      compatibleDiscussions: [],
      compatibleLabs: [],
    })) as unknown as Course['lectures'],
  };
}

describe('FilterService bookmark-only filtering', () => {
  const courses = [
    course('CS1101', 2),
    course('CS2102', 0),
    course('MA1021', 1),
    course('MA1022', 1),
  ];
  const service = new FilterService({
    getBookmarkedCourseIds: () => ['CS1101', 'CS2102', 'MA1022'],
  });
  service.registerFilter(new SearchTextFilter());

  it('keeps bookmarked courses that have sections, in order', () => {
    service.addFilter('bookmark', { showBookmarkedOnly: true });
    const kept = service.filterCourses(courses);
    const viaPipeline = service
      .resolveToCourses(service.apply(courses))
      .filter(c => ['CS1101', 'CS2102', 'MA1022'].includes(c.id));
    expect(kept.map(c => c.id)).toEqual(['CS1101', 'MA1022']);
    expect(kept).toEqual(viaPipeline);
  });

  it('drops only section-less courses when bookmarks are not limiting', () => {
    service.updateFilter('bookmark', { showBookmarkedOnly: false });
    expect(service.filterCourses(courses).map(c => c.id)).toEqual([
      'CS1101',
      'MA1021',
      'MA1022',
    ]);
  });

  it('still lets search narrow and rank alongside bookmarks', () => {
    service.updateFilter('bookmark', { showBookmarkedOnly: true });
    service.addFilter('searchText', { query: 'MA', professorOnly: false });
    expect(service.filterCourses(courses).map(c => c.id)).toEqual(['MA1022']);
  });
});
