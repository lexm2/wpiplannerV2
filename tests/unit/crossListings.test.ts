/**
 * Cross-listings come from Workday listing one section (one CRN) under
 * several course codes; co-located sections are separate sections that meet
 * together, and stay on each section as meetsWith.
 */
import { describe, it, expect } from 'vitest';
import { indexCrossListings } from '../../scripts/converter/utils/crossListings';
import { transformSection } from '../../scripts/converter/transformers/sectionTransformer';
import { converterConfig } from '../../scripts/converter.config';
import type { WorkdaySection } from '../../scripts/converter/types/workdayTypes';

function row(
  courseSection: string,
  crn: number,
  extra: Partial<WorkdaySection> = {},
): WorkdaySection {
  return {
    Course_Section: courseSection,
    Enrolled_Capacity: '10/20',
    Instructional_Format: 'Lecture',
    Section_Details: 'Fuller Labs 311 | M-T-R-F | 9:00 AM - 9:50 AM',
    Waitlist_Waitlist_Capacity: '0/9',
    cour_sec_def_referenceID: `COURSE_SECTION_DEFINITION-3-${crn}`,
    ...extra,
  } as WorkdaySection;
}

describe('indexCrossListings', () => {
  const ds = row('DS 502-F01 - Statistical Methods', 350380);
  const ma = row('MA 543-F01 - Statistical Methods', 350380);
  const maSpring = row('MA 543-S02 - Statistical Methods', 350902);
  const other = row('CS 1101-A01 - Intro', 348909);
  const canceled = row('CS 1101-X Cancel - 1/1/26 - Intro', 350380);
  const crossListedWith = indexCrossListings([
    ds,
    ma,
    maSpring,
    other,
    canceled,
  ]);

  it('names the other codes sharing a CRN', () => {
    expect(crossListedWith([ds])).toEqual(['MA 543']);
    expect(crossListedWith([ma, maSpring])).toEqual(['DS 502']);
  });

  it('ignores canceled rows and unshared CRNs', () => {
    expect(crossListedWith([other])).toEqual([]);
  });
});

describe('meetsWith', () => {
  const meetsWith = (coLocated: string) =>
    transformSection(
      row('BB 4190-D01 - Regulation Of Gene Expression', 352000, {
        'Co-Located_Course_Sections': coLocated,
      }),
      converterConfig,
    )[0].meetsWith;

  it('lists each co-located section by code', () => {
    expect(
      meetsWith(
        'AS 2001-AX01 - Team and Leadership Fundamentals I (General Military Course); AS 3001-AX01 - Leading People - Part I',
      ),
    ).toEqual(['AS 2001-AX01', 'AS 3001-AX01']);
  });

  it('splits a cross-listed pair written as one entry', () => {
    expect(
      meetsWith('BB 4190-D01/ CH 4190-D01 - Regulation Of Gene Expression'),
    ).toEqual(['BB 4190-D01', 'CH 4190-D01']);
  });
});
