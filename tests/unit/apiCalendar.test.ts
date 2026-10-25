/**
 * The year rule as code: which terms have ended, which quarter is in
 * session, how complete each year's schedule is, and what the offering
 * category lets us say about a year WPI has not published.
 */
import { describe, expect, it } from 'vitest';
import type { Catalog } from '../../src/api/catalog';
import {
  endedTerms,
  termDates,
  termNow,
  yearInfo,
  yearLabel,
} from '../../src/api/calendar';
import { forecastCourse } from '../../src/api/forecast';
import {
  alternatesInto,
  readAlternatingYears,
} from '../../src/utils/alternatingYears';
import { TermBoundsService } from '../../src/utils/termBounds';
import { SearchIndex } from '../../src/utils/searchUtils';
import type { Course } from '../../src/types/types';

const bounds = new TermBoundsService();
bounds.loadFromData({
  generated: '2026-09-01T00:00:00.000Z',
  years: {
    '2026': {
      A: {
        startDate: '2026-08-20',
        endDate: '2026-10-09',
        offeringPeriod: 'A',
        sampleSize: 1,
      },
      B: {
        startDate: '2026-10-19',
        endDate: '2026-12-11',
        offeringPeriod: 'B',
        sampleSize: 1,
      },
      C: {
        startDate: '2027-01-13',
        endDate: '2027-03-05',
        offeringPeriod: 'C',
        sampleSize: 1,
      },
      D: {
        startDate: '2027-03-15',
        endDate: '2027-05-05',
        offeringPeriod: 'D',
        sampleSize: 1,
      },
    },
  },
});

function course(year: number, category: 1 | 2 | 3 | null = null): Course {
  return {
    id: `CS-2102-${year}`,
    number: '2102',
    name: 'Object-Oriented Design Concepts',
    description: '',
    departmentAbbr: 'CS',
    departmentName: 'Computer Science',
    category,
    degreeAttributes: [],
    courseTypes: [],
    crossListedWith: [],
    minCredits: 3,
    maxCredits: 3,
    academicYear: year,
  };
}

function catalog(today: string, counts: Record<number, number>): Catalog {
  const [y, m, d] = today.split('-').map(Number);
  return {
    departments: [],
    courses: Object.entries(counts).flatMap(([year, n]) =>
      Array.from({ length: n }, () => course(Number(year))),
    ),
    lastUpdated: null,
    years: Object.keys(counts).map(Number),
    sectionsByCrn: new Map(),
    rmp: {} as Catalog['rmp'],
    termBounds: bounds,
    search: new SearchIndex(),
    now: () => new Date(y, m - 1, d),
  };
}

describe('calendar', () => {
  it('derives the semesters from the quarters', () => {
    const dates = termDates(catalog('2026-10-18', { 2026: 1 }), 2026)!;
    expect(dates.F).toEqual({ start: '2026-08-20', end: '2026-12-11' });
    expect(dates.S).toEqual({ start: '2027-01-13', end: '2027-05-05' });
  });

  it('knows a term has ended only after its last day', () => {
    expect(endedTerms(catalog('2026-10-09', { 2026: 1 }), 2026)).toEqual([]);
    expect(endedTerms(catalog('2026-10-10', { 2026: 1 }), 2026)).toEqual(['A']);
    // F runs to B's end.
    expect(endedTerms(catalog('2026-12-12', { 2026: 1 }), 2026)).toEqual([
      'A',
      'B',
      'F',
    ]);
  });

  it('names the term in session, or the ones either side', () => {
    expect(termNow(catalog('2026-11-02', { 2026: 1 })).term).toBe('B');
    expect(termNow(catalog('2026-10-18', { 2026: 1 }))).toEqual({
      term: null,
      previous: { term: 'A', year: 2026, end: '2026-10-09' },
      next: { term: 'B', year: 2026, start: '2026-10-19' },
    });
  });

  it('calls a future year published only once it is mostly there', () => {
    const statuses = (counts: Record<number, number>) =>
      yearInfo(catalog('2026-10-18', counts)).map(y => [y.year, y.status]);
    expect(statuses({ 2025: 3, 2026: 100, 2027: 6 })).toEqual([
      [2025, 'past'],
      [2026, 'current'],
      [2027, 'not yet published'],
    ]);
    expect(statuses({ 2026: 100, 2027: 40 })).toEqual([
      [2026, 'current'],
      [2027, 'published'],
    ]);
  });

  it('labels a year by both halves', () => {
    expect(yearLabel(2026)).toBe('2026-27');
    expect(yearLabel(2099)).toBe('2099-00');
  });
});

describe('forecastCourse', () => {
  it('says likely for Cat. I and names only the terms it ran in', () => {
    const f = forecastCourse(course(2026, 1), 2027, 2026, ['B', 'D']);
    expect(f).toMatchObject({ outlook: 'likely', category: 1 });
    expect(f.summary).toBe(
      'Likely offered in 2027-28 (Cat. I: offered every year). Terms and times for 2027-28 are not published yet; in 2026-27 it runs in B and D.',
    );
  });

  it('hedges Cat. II and III, and says unknown without a category', () => {
    expect(
      forecastCourse(course(2026, 2), 2027, 2026, ['C']).summary,
    ).toContain(
      'May or may not be offered in 2027-28 (Cat. II: offered at least every other year)',
    );
    expect(forecastCourse(course(2026, 3), 2027, 2026, []).summary).toContain(
      'it has no sections in 2026-27',
    );
    expect(forecastCourse(course(2026), 2027, 2026, ['F']).outlook).toBe(
      'unknown',
    );
  });
});

describe('alternating years', () => {
  it('reads the statement in its variants, and nothing looser', () => {
    const cases: [string, number | null][] = [
      [
        'This course will be offered in 2020-21, and in alternating years thereafter.',
        2020,
      ],
      [
        'This course is offered in 2019-20, and in alternating years thereafter.',
        2019,
      ],
      [
        'This course will be first offered in 2024-2025 and alternate years thereafter.',
        2024,
      ],
      [
        'This course will be offered in 2022- 23, and in alternating years thereafter.',
        2022,
      ],
      [
        'This course will be taught in 2025-26, and in alternating years thereafter.',
        2025,
      ],
      [
        'This course will be offered in 2020-21, and in alternating years thereafter',
        2020,
      ],
      ['Offered in 2018 and each year thereafter.', null],
      [
        'This course will be offered in 2020-22, and in alternating years thereafter.',
        null,
      ],
      ['Topics alternate from year to year.', null],
    ];
    for (const [text, year] of cases) {
      expect(
        readAlternatingYears(`Intro. ${text} More.`)?.firstYear ?? null,
        text,
      ).toBe(year);
    }
    expect(
      readAlternatingYears(
        'This course will be offered in 2020-21, and in alternating years thereafter',
      )?.statement,
    ).toBe(
      'This course will be offered in 2020-21, and in alternating years thereafter.',
    );
    const a = { firstYear: 2020, statement: '' };
    expect([2020, 2021, 2026, 2027].map(y => alternatesInto(a, y))).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  const alternating = (
    firstYear: number,
    category: 1 | 2 | null = 2,
  ): Course => ({
    ...course(2026, category),
    alternatingYears: {
      firstYear,
      statement: `This course will be offered in ${firstYear}-${String((firstYear + 1) % 100).padStart(2, '0')}, and in alternating years thereafter.`,
    },
  });

  it('calls next year off when the statement fits this year, quoting it', () => {
    const f = forecastCourse(alternating(2020), 2027, 2026, ['D']);
    expect(f.outlook).toBe('unlikely');
    expect(f.summary).toBe(
      'Alternating years; runs in 2026-27, so likely not offered in 2027-28 (the catalog description: "This course will be offered in 2020-21, and in alternating years thereafter."). Terms and times for 2027-28 are not published yet; in 2026-27 it runs in D.',
    );
  });

  it('distrusts a statement this year contradicts', () => {
    const f = forecastCourse(alternating(2019), 2027, 2026, ['D']);
    expect(f.outlook).toBe('possible');
    expect(f.alternating).toEqual({
      statement: expect.stringContaining('2019-20'),
      fitsBaseYear: false,
    });
    expect(f.summary).toContain(
      'That would skip 2026-27, yet it runs in 2026-27; the statement looks out of date',
    );
  });

  it('keeps Cat. I and notes the disagreement; hedges Cat. II without one', () => {
    const cat1 = forecastCourse(alternating(2020, 1), 2027, 2026, ['A']);
    expect(cat1.outlook).toBe('likely');
    expect(cat1.summary).toContain(
      'The description, though, says it alternates years',
    );
    const plain = forecastCourse(course(2026, 2), 2027, 2026, ['C']);
    expect(plain.outlook).toBe('possible');
    expect(plain.summary).toContain(
      'It runs in 2026-27, and a course offered every other year is less likely to run again in 2027-28.',
    );
  });
});
