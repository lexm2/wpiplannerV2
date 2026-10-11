/**
 * Converter section parsing, run on Course_Section strings taken from the real
 * Workday feed (data/course-data.json) with the production converter config.
 * Section numbers and term letters come out of transformSection, since the
 * parsers behind them are module-private.
 */
import { describe, it, expect } from 'vitest';
import {
  transformSection,
  isSpecialSection,
} from '../../scripts/converter/transformers/sectionTransformer';
import { converterConfig } from '../../scripts/converter.config';
import type { WorkdaySection } from '../../scripts/converter/types/workdayTypes';

function row(courseSection: string): WorkdaySection {
  return {
    Course_Section: courseSection,
    Enrolled_Capacity: '21/20',
    Instructional_Format: 'Lecture',
    Instructors: 'Jane Doe',
    Section_Details: 'Fuller Labs 311 | M-T-R-F | 9:00 AM - 9:50 AM',
    Waitlist_Waitlist_Capacity: '0/9',
    cour_sec_def_referenceID: 'COURSE_SECTION_DEFINITION-3-348909',
  } as WorkdaySection;
}

function parse(courseSection: string) {
  const [section] = transformSection(row(courseSection), converterConfig);
  return section;
}

const numberOf = (cs: string) => parse(cs).number;
const termOf = (cs: string) => parse(cs).computedTerm;

describe('section numbers', () => {
  it.each([
    ['AB 1531-A01 - Elementary Arabic I', 'A01'],
    ['CS 1101-DL08 - Introduction To Program Design', 'DL08'],
    ['BB 501-S01 - Seminar', 'S01'],
    ['AREN 4010-F01 - Professional Engagement', 'F01'],
    // A parenthetical suffix is dropped.
    ['MA 1021-AD02 (group 2) - Calculus I', 'AD02'],
    // A title with no " - " after the section takes the rest of the string.
    ['MA 1024-AD03', 'AD03'],
  ])('%s -> %s', (cs, expected) => {
    expect(numberOf(cs)).toBe(expected);
  });

  it('does not split on a parenthesis inside the title', () => {
    expect(
      numberOf('AE 5431-C02 - Solid Mechanics for Aerospace Structures (2'),
    ).toBe('C02');
  });

  // Appendix sections (sectionNumberAppendices) keep just their code, the
  // way a plain "(group N)" suffix is dropped.
  it.each([
    ['MA 1024-AD03-ACL (group 2) - Calculus IV', 'AD03'],
    ['MA 1024-AL06-ACL (group 3) - Calculus IV', 'AL06'],
    ['PH 1110-AS01-Multipurpose - General Physics-Mechanics', 'AS01'],
    ['CS 1101-A01-Quiz - Introduction To Program Design', 'A01'],
    ['CS 1101-A01-Quiz', 'A01'],
  ])('appendix %s -> %s', (cs, expected) => {
    expect(numberOf(cs)).toBe(expected);
  });

  it.each([
    ['CS 1101-A01(Honors) - Intro', 'A01'],
    ['CS 1101-A01 (group 2)', 'A01'],
    ['CS 1101-A01', 'A01'],
  ])('reads %s as %s without losing a character', (cs, expected) => {
    expect(numberOf(cs)).toBe(expected);
  });

  it('keeps the full name of a special-topics or GPS section', () => {
    expect(
      numberOf('FY 1100-A01 - GPS: Climate Present, Climate Futures'),
    ).toBe('A01 - GPS: Climate Present, Climate Futures');
    expect(numberOf('AE 601-F01 - ST: AE System Design')).toBe(
      'F01 - ST: AE System Design',
    );
  });

  it('names and flags interest lists', () => {
    const s = parse(
      'CH 1010-AL-Interest List - Chemical Properties, Bonding, And Forces',
    );
    expect(s.number).toBe('Interest List-A Term');
    expect(s.isInterestList).toBe(true);
    expect(s.note).toBe('IntList');
  });
});

describe('cancelled sections', () => {
  it.each([
    'AB 2531-X-Cancel-Draft submission for AY 26-27 - Intermediate Arabic I',
    'AE 5093-X cancel 2.12.26 - ST: AE System Design',
    'AE 5233-X Cancel - 2/17/2026 - Combustion',
    'AE 6531-X-Canceled-1/28/26 - Scientific Deep Learning for Engineers',
  ])('drops %s', cs => {
    expect(transformSection(row(cs), converterConfig)).toEqual([]);
  });
});

describe('term letters', () => {
  it.each([
    ['AB 1531-A01 - Elementary Arabic I', 'A'],
    ['CH 1020-BL01 - Chemical Reactions', 'B'],
    ['CS 2303-CL01 - Systems Programming Concepts', 'C'],
    ['CS 1101-DL08 - Introduction To Program Design', 'D'],
    // Graduate semester sections keep F/S.
    ['AREN 4010-F01 - Professional Engagement', 'F'],
    ['BB 501-S01 - Seminar', 'S'],
    // Special sections read the letter off the kept full name.
    ['FY 1101-BX03-A - GPS: Shelter the World', 'B'],
  ])('%s -> %s', (cs, expected) => {
    expect(termOf(cs)).toBe(expected);
  });

  it('reads an appendix section by its leading letter', () => {
    expect(termOf('MA 1024-AD03-ACL (group 2) - Calculus IV')).toBe('A');
  });

  // The term comes from the list's code; Course_Section never names it.
  it.each([
    ['CH 1020-DL-Interest List - Chemical Reactions', 'D'],
    ['CS 3733-BL - Interest List - Software Engineering', 'B'],
    ['CS 2303-CX-Interest List - Systems Programming Concepts', 'C'],
  ])('places interest list %s in %s', (cs, expected) => {
    expect(termOf(cs)).toBe(expected);
  });
});

describe('isSpecialSection', () => {
  const special = (cs: string) =>
    isSpecialSection(cs, cs.slice(0, cs.indexOf('-')), converterConfig);

  it('matches configured special courses by subject and number', () => {
    expect(special('HU 3900-A01 - Inquiry Seminar')).toBe(true);
    expect(special('ID 2050-A01 - Social Science Research')).toBe(true);
  });

  it('matches configured title markers', () => {
    expect(special('FY 1100-A01 - GPS: Climate Present, Climate Futures')).toBe(
      true,
    );
    expect(special('AE 601-F01 - ST: AE System Design')).toBe(true);
  });

  it('leaves ordinary sections alone', () => {
    expect(special('AB 1531-A01 - Elementary Arabic I')).toBe(false);
    expect(special('MA 1021-AD02 (group 2) - Calculus I')).toBe(false);
  });
});
