/**
 * The course API over HTTP: catalog loading from disk, query-param mapping
 * onto the filter criteria, filtering/sort/paging through FilterService,
 * serialization, conflict detection and the year rule. The MCP tools'
 * renderings are in courseMcp.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { CatalogSource } from '../../src/api/catalog';
import { notice } from '../../src/api/notices';
import { canonicalWindows } from '../../src/utils/timeWindows';
import { DayOfWeek } from '../../src/types/types';
import {
  AFTER_A,
  BASE,
  BEFORE_A,
  IN_B,
  call,
  callOn,
  catalogJson,
  codes,
  endpoints,
  fixtureDirs,
  write,
} from './courseApiFixture';

describe('course search', () => {
  it('defaults to the current year, sorted by department then number', async () => {
    const { body } = await call('/courses');
    // MA 543 is DS 502 under another code, so it folds into DS 502's row.
    expect(codes(body)).toEqual([
      'CS-1101-2026',
      'CS-2102-2026',
      'CS-500-2026',
      'DS-502-2026',
      'MA-1021-2026',
      'PH-1110-2026',
      'PSY-1400-2026',
      'RBE-1001-2026',
    ]);
    expect(body.total).toBe(8);
    expect(body.year).toBe(2026);
  });

  it('takes year=all and pages with offset and limit', async () => {
    const { body } = await call('/courses?year=all&offset=5&limit=1');
    expect(body).toMatchObject({ total: 10, offset: 5, limit: 1 });
    expect(codes(body)).toEqual(['MA-1021-2026']);
  });

  it('matches terms exactly and keeps only the matching sections', async () => {
    const { body } = await call('/courses?term=a');
    // CS 1101 runs in F, which an A search does not match.
    expect(codes(body)).toEqual(['CS-2102-2026', 'MA-1021-2026']);
    expect(body.courses[1].terms).toEqual(['A']);
  });

  it('keeps relevance order for a text search', async () => {
    const { body } = await call('/courses/search', {
      filters: { searchText: { query: 'design' } },
    });
    // Names before descriptions: RBE 1001 only mentions design in its
    // description, so it comes last, where no sort by code would put it.
    expect(codes(body)).toEqual([
      'CS-1101-2026',
      'CS-2102-2026',
      'RBE-1001-2026',
    ]);
  });

  it('sorts by rating, difficulty, open seats or number', async () => {
    const sorted = async (sort: string, q = '') =>
      (await call(`/courses?sort=${sort}${q}`)).body;
    // Ada's 4.5 on 12 ratings outranks Alan's 4.9 on 3, so PH 1110's top
    // is Ada and courses with no rated instructor come last.
    const rating = await sorted('rating');
    const tops = rating.courses.map(
      (c: { topInstructor: { name: string } | null }) =>
        c.topInstructor?.name ?? null,
    );
    expect(tops.indexOf(null)).toBeGreaterThan(0);
    expect(
      tops.slice(tops.indexOf(null)).every((t: unknown) => t === null),
    ).toBe(true);
    expect(rating.notices).toContainEqual(
      notice(
        'sorted',
        'Sorted by the best-rated lecture instructor; averages on 5+ ratings rank above those on fewer, unrated last.',
      ),
    );
    const seats = await sorted('openSeats');
    const open = seats.courses.map(
      (c: { seats: { available: number } }) => c.seats.available,
    );
    expect(open).toEqual([...open].sort((a: number, b: number) => b - a));
    // A text search ranks by relevance unless asked to sort by number.
    const byNumber = await sorted('number', '&q=design');
    expect(codes(byNumber)).toEqual([
      'CS-1101-2026',
      'CS-2102-2026',
      'RBE-1001-2026',
    ]);
    expect((await call('/courses?sort=best')).status).toBe(400);
  });

  it('reads a spaced course code as a code', async () => {
    const { body } = await call(`/courses?q=${encodeURIComponent('MA 1021')}`);
    expect(codes(body)).toEqual(['MA-1021-2026']);
    const robotics = await call('/courses?q=robtics');
    expect(codes(robotics.body)[0]).toBe('RBE-1001-2026');
  });

  it('maps flat params onto the same criteria as the POST body', async () => {
    const get = await call(
      '/courses?department=CS,MA&availableOnly=true&level=undergraduate&minRating=4',
    );
    const post = await call('/courses/search', {
      filters: {
        department: { departments: ['CS', 'MA'] },
        availability: { availableOnly: true },
        graduateLevel: { level: 'undergraduate' },
        rmpRating: { minRating: 4 },
      },
    });
    expect(get.body).toEqual(post.body);
    // MA 1021's A section is full and Grace Hopper has no rating, but its C
    // section passes both.
    expect(codes(get.body)).toEqual([
      'CS-1101-2026',
      'CS-2102-2026',
      'MA-1021-2026',
    ]);
    expect(get.body.courses[2].terms).toEqual(['C']);
  });

  it('resolves full department names', async () => {
    const { body } = await call(
      `/courses?department=${encodeURIComponent('computer science')}`,
    );
    expect(codes(body)).toEqual([
      'CS-1101-2026',
      'CS-2102-2026',
      'CS-500-2026',
    ]);
  });

  it('filters by time windows given as JSON', async () => {
    const times = {
      mode: 'only',
      windows: [
        DayOfWeek.MONDAY,
        DayOfWeek.TUESDAY,
        DayOfWeek.THURSDAY,
        DayOfWeek.FRIDAY,
      ].flatMap(day => [
        // Touching bands, merged before they reach TimesFilter.
        { day, startMin: 600, endMin: 630 },
        { day, startMin: 630, endMin: 660 },
      ]),
    };
    const { body } = await call(
      `/courses?times=${encodeURIComponent(JSON.stringify(times))}`,
    );
    expect(codes(body)).toEqual(['CS-2102-2026', 'MA-1021-2026']);
  });

  it('expands earliestStart and latestEnd into windows on every day', async () => {
    const { body } = await call('/courses?earliestStart=10:00&latestEnd=12:00');
    // PH 1110's late-morning lecture needs a 14:00 lab, so it drops out.
    expect(codes(body)).toEqual([
      'CS-1101-2026',
      'CS-2102-2026',
      'MA-1021-2026',
    ]);
    const post = await call('/courses/search', {
      filters: { times: { earliestStart: '10:00', latestEnd: '12:00' } },
    });
    expect(codes(post.body)).toEqual(codes(body));
    // Windows given with the shorthand add to it.
    const both = await call('/courses/search', {
      filters: {
        times: {
          earliestStart: '10:00',
          latestEnd: '12:00',
          windows: [{ day: 'M', startMin: 1080, endMin: 1260 }],
        },
      },
    });
    expect(both.body.notices).toContainEqual(
      notice(
        'timesRead',
        'Times read as: only within every day 10:00-12:00; M 18:00-21:00.',
      ),
    );
  });

  it('applies the shorthand to the days given, and says how it read it', async () => {
    const avoid = (times: object) =>
      call('/courses/search', {
        filters: { times: { mode: 'avoid', ...times } },
      });
    // Avoiding 13:00-17:00 every day takes PH 1110's W and R labs with it.
    const everyDay = await avoid({
      earliestStart: '13:00',
      latestEnd: '17:00',
    });
    expect(codes(everyDay.body)).not.toContain('PH-1110-2026');
    expect(everyDay.body.notices).toContainEqual(
      notice(
        'timesRead',
        'Times read as: avoiding every day 13:00-17:00, sections with no set time kept.',
      ),
    );
    // A Tue/Thu shift leaves PH 1110's Wednesday lab, and drops RBE 1001.
    const shift = await avoid({
      days: ['T', 'R'],
      earliestStart: '13:00',
      latestEnd: '17:00',
    });
    expect(codes(shift.body)).toContain('PH-1110-2026');
    expect(codes(shift.body)).not.toContain('RBE-1001-2026');
    expect(shift.body.notices).toContainEqual(
      notice(
        'timesRead',
        'Times read as: avoiding T,R 13:00-17:00, sections with no set time kept.',
      ),
    );
    const get = await call(
      '/courses?earliestStart=13:00&latestEnd=17:00&days=T,R&times=' +
        encodeURIComponent('{"mode":"avoid"}'),
    );
    expect(codes(get.body)).toEqual(codes(shift.body));
    // Days alone: the whole day.
    const friday = await avoid({ days: ['F'] });
    expect(codes(friday.body)).not.toContain('RBE-1001-2026');
    expect(friday.body.notices).toContainEqual(
      notice(
        'timesRead',
        'Times read as: avoiding all of F, sections with no set time kept.',
      ),
    );
  });

  it('keeps async sections alongside the shorthand when asked', async () => {
    // "Evening or online": CS 500 is async, the other two meet at 18:00.
    const { body } = await call('/courses?earliestStart=18:00&includeAsync=1');
    expect(codes(body)).toEqual([
      'CS-500-2026',
      'DS-502-2026',
      'PSY-1400-2026',
    ]);
  });

  it('says where a misplaced or misspelt key belongs', async () => {
    const inFilters = await call('/courses/search', {
      filters: { earliestStart: '17:00' },
    });
    expect(inFilters.status).toBe(400);
    expect(inFilters.body.details[0].message).toContain(
      '"earliestStart" does not go in filters; it goes in filters.times.earliestStart.',
    );
    const top = await call('/courses/search', { query: 'robotics' });
    expect(top.body.details[0].message).toContain(
      'it goes in filters.searchText.query',
    );
    const typo = await call('/courses/search', { limt: 5 });
    expect(typo.body.details[0].message).toContain('did you mean "limit"?');
  });

  it('drops sections that clash with the CRNs the caller has', async () => {
    // CRN 3 is F term, M/R 10:00-11:20: it blocks CS 2102's A section and
    // not MA 1021's C one.
    const { body } = await call('/courses?avoidCrns=3&department=CS,MA');
    expect(codes(body)).toEqual([
      'CS-1101-2026',
      'CS-500-2026',
      'MA-1021-2026',
      'MA-543-2026',
    ]);
  });

  it('rejects bad input with zod issues', async () => {
    const term = await call('/courses?term=Q');
    expect(term.status).toBe(400);
    expect(term.body.details[0].path).toEqual(['filters', 'term', 'terms', 0]);
    expect((await call('/courses?limit=201')).status).toBe(400);
    expect((await call('/courses?colour=red')).status).toBe(400);
    expect((await call('/courses?avoidCrns=999')).body.details).toEqual({
      unknownCrns: [999],
    });
    expect((await call('/courses/search', { filter: {} })).status).toBe(400);
    const empty = await call('/courses/search', {
      filters: { times: { mode: 'only', windows: [] } },
    });
    expect(empty.status).toBe(400);
    expect(JSON.stringify(empty.body.details)).toContain('earliestStart');
  });
});

describe('new filters', () => {
  const search = (filters: unknown) =>
    call('/courses/search', { filters }).then(r => codes(r.body));

  it('filters by degree attribute, loosely named', async () => {
    expect(
      await search({ degreeAttribute: { attributes: ['social science'] } }),
    ).toEqual(['PSY-1400-2026']);
    const bad = await call('/courses/search', {
      filters: { degreeAttribute: { attributes: ['Basket Weaving'] } },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('Social Sciences');
  });

  it('filters by delivery mode per section', async () => {
    const { body } = await call('/courses?deliveryMode=Online');
    expect(codes(body)).toEqual(['PH-1110-2026']);
    // Only BL02 has an online lab to go with it.
    expect(
      body.courses[0].sections.map((s: { number: string }) => s.number),
    ).toEqual(['BL02']);
  });

  it('leaves interest lists out before matching, so no row is a placeholder', async () => {
    // MA 1021's C-term interest list is Online; its real C section is not.
    const online = {
      deliveryMode: { modes: ['Online'] },
      term: { terms: ['C'] },
    };
    const hidden = await call('/courses/search', { filters: online });
    expect(hidden.body.total).toBe(0);
    expect(hidden.body.courses).toEqual([]);
    expect(hidden.body.totals).toEqual({
      openSeats: 0,
      sections: 0,
      uncapped: 0,
      courses: 0,
      byTerm: [],
      seatsYear: null,
    });
    const shown = await call('/courses/search', {
      filters: online,
      includeInterestLists: true,
    });
    expect(codes(shown.body)).toEqual(['MA-1021-2026']);
    expect(
      shown.body.courses[0].sections.map((s: { crn: number }) => s.crn),
    ).toEqual([9]);
  });

  it('totals every matching section once, and seats per term', async () => {
    const { body } = await call('/courses?department=MA,DS');
    // DS 502 and MA 543 are one F section of 10 open seats, counted once.
    expect(body.totals).toEqual({
      openSeats: 20,
      sections: 3,
      uncapped: 0,
      courses: 2,
      byTerm: [
        { term: 'A', openSeats: 0, sections: 1, uncapped: 0 },
        { term: 'C', openSeats: 10, sections: 1, uncapped: 0 },
        { term: 'F', openSeats: 10, sections: 1, uncapped: 0 },
      ],
      seatsYear: null,
    });
    const ma = body.courses.find(
      (c: { id: string }) => c.id === 'MA-1021-2026',
    );
    expect(ma.seatsByTerm).toEqual([
      { term: 'A', capacity: 30, available: 0, waitlisted: 0, uncapped: 0 },
      { term: 'C', capacity: 30, available: 10, waitlisted: 0, uncapped: 0 },
    ]);
  });

  it('counts no seats for a section without a seat cap', async () => {
    // RBE 1001 BL02 is listed with Workday's 999 seats: no limit at all.
    const { body } = await call('/courses?department=RBE');
    expect(body.totals).toMatchObject({
      openSeats: 2,
      sections: 1,
      uncapped: 1,
    });
    expect(body.courses[0].seats).toEqual({
      capacity: 30,
      available: 2,
      waitlisted: 0,
      uncapped: 1,
    });
  });

  it('filters by course level and offering pattern', async () => {
    expect(await search({ courseLevel: { min: 5 } })).toEqual([
      'CS-500-2026',
      'DS-502-2026',
    ]);
    expect(await search({ offeringPattern: { categories: [1] } })).toEqual([
      'MA-1021-2026',
      'PH-1110-2026',
    ]);
    const unknown = await call('/courses?offeringPattern=2,unknown');
    expect(codes(unknown.body)).toContain('PSY-1400-2026');
    expect(codes(unknown.body)).toContain('CS-2102-2026');
  });

  it('bounds the waitlist', async () => {
    const { body } = await call('/courses?maxWaitlisted=0');
    // PSY 1400 has 5 waiting, CS 1101 2 beside its open seats.
    expect(codes(body)).not.toContain('PSY-1400-2026');
    expect(codes(body)).not.toContain('CS-1101-2026');
    expect(body.total).toBe(6);
    const two = await call('/courses?maxWaitlisted=2');
    expect(codes(two.body)).toContain('CS-1101-2026');
  });

  it('leaves unrated instructors out once a rating bound is given', async () => {
    // Grace Hopper is unrated: RBE 1001 drops out unless asked for.
    expect(await search({ rmpRating: { minRating: 4 } })).not.toContain(
      'RBE-1001-2026',
    );
    expect(
      await search({ rmpRating: { minRating: 4, includeWithoutData: true } }),
    ).toContain('RBE-1001-2026');
    // Ada's 12 ratings fall short of 20, which counts as no data.
    expect(
      await search({ rmpRating: { minRating: 4, minNumRatings: 20 } }),
    ).toEqual([]);
  });
});

describe('cross-listings', () => {
  it('shows a shared class once, unless one code is asked for', async () => {
    // Equal but for the number: DS 502 ranks first and takes the row.
    const all = await call('/courses?q=statistical');
    expect(codes(all.body)).toEqual(['DS-502-2026']);
    expect(all.body.courses[0]).toMatchObject({
      crossListedWith: ['MA 543'],
      seats: { capacity: 30 },
    });
    const ma = await call('/courses?department=MA&q=statistical');
    expect(codes(ma.body)).toEqual(['MA-543-2026']);
  });
});

describe('term awareness', () => {
  it('leaves out ended terms by default and says so', async () => {
    const { api } = endpoints(AFTER_A);
    const { body } = await callOn(api, '/courses');
    expect(codes(body)).not.toContain('CS-2102-2026');
    expect(body.excludedEndedTerms).toEqual(['A']);
    expect(body.notices).toContainEqual(
      notice(
        'endedTermsLeftOut',
        'Sections in terms that have ended (A) are left out; pass includeEndedTerms: true to include them.',
      ),
    );
    const ma = body.courses.find(
      (c: { id: string }) => c.id === 'MA-1021-2026',
    );
    expect(ma.terms).toEqual(['C']);

    const included = await callOn(api, '/courses?includeEndedTerms=true');
    expect(codes(included.body)).toContain('CS-2102-2026');
    // Naming the ended term keeps it, with a warning.
    const named = await callOn(api, '/courses?term=A');
    expect(codes(named.body)).toEqual(['CS-2102-2026', 'MA-1021-2026']);
    expect(named.body.notices[0].code).toBe('endedTermsListed');
    expect(named.body.notices[0].message).toContain('A term ended 2026-01-20');
  });

  it('reports today, the term and the years', async () => {
    const between = (await callOn(endpoints(AFTER_A).api, '/meta')).body;
    expect(between).toMatchObject({
      today: '2026-01-25',
      dataAsOf: '2026-09-02T00:00:00Z',
      currentAcademicYear: 2026,
      currentTerm: {
        term: null,
        previous: { term: 'A', end: '2026-01-20' },
        next: { term: 'B', start: '2026-02-01' },
      },
      years: [
        { year: 2026, courseCount: 9, status: 'current' },
        { year: 2027, courseCount: 2, status: 'not yet published' },
      ],
    });
    expect(between.termDates['2026'].F).toEqual({
      start: '2026-01-01',
      end: '2026-02-20',
    });
    expect(between.degreeAttributes).toEqual([
      { name: 'Social Sciences', courseCount: 1 },
    ]);
    const inB = (await callOn(endpoints(IN_B).api, '/meta')).body;
    expect(inB.currentTerm.term).toBe('B');
  });
});

describe('next year', () => {
  it('refuses to search an unpublished year, pointing to planning', async () => {
    const { status, body } = await call('/courses?year=2027');
    expect(status).toBe(422);
    expect(body.error).toContain('not published yet');
    expect(body.error).toContain('get_course with year 2027');
  });

  it('forecasts from the offering pattern, never a term or time', async () => {
    const { body } = await call('/courses/PH1110?year=2027');
    expect(body.forecast).toMatchObject({
      year: 2027,
      basedOn: 2026,
      category: 1,
      outlook: 'likely',
      termsInBaseYear: ['B'],
    });
    expect(body.forecast.summary).toBe(
      'Likely offered in 2027-28 (Cat. I: offered every year). Terms and times for 2027-28 are not published yet; in 2026-27 it runs in B.',
    );
    expect(body).not.toHaveProperty('sections');
  });

  it("adds next year's outlook to this year's course", async () => {
    const { body } = await call('/courses/PH-1110-2026');
    expect(body.nextYear.outlook).toBe('likely');
    // MA 1021 has an early 2027 entry, which is shown with a warning.
    const early = await call('/courses/MA1021?year=2027');
    expect(early.body.id).toBe('MA-1021-2027');
    expect(early.body.notices[0].code).toBe('earlyEntry');
    expect(early.body.notices[0].message).toContain('not published yet');
  });
});

describe('course detail', () => {
  it('finds a course by id, by code or by CRN', async () => {
    expect((await call('/courses/MA-1021-2027')).body.id).toBe('MA-1021-2027');
    expect((await call('/courses/MA1021')).body.id).toBe('MA-1021-2026');
    expect((await call('/courses/ma-1021?year=2026')).body.id).toBe(
      'MA-1021-2026',
    );
    const byCrn = await call('/courses/30');
    expect(byCrn.body.id).toBe('MA-543-2026');
    expect(byCrn.body.notices[0].code).toBe('crnRead');
    expect(byCrn.body.notices[0].message).toContain('also listed as DS 502');
  });

  it('explains what it could not find', async () => {
    const typo = await call('/courses/MA1022');
    expect(typo.status).toBe(404);
    expect(typo.body.error).toContain('Close codes: MA 1021');
    const past = await call('/courses/CS2102?year=2025');
    expect(past.body.error).toBe(
      '2025-26 is not in this catalog (it covers 2026-27 and early 2027-28 entries), so nothing can be said about it here.',
    );
    const dept = await call('/courses/XQ1000');
    expect(dept.body.error).toContain('no department XQ');
    expect((await call('/courses/999')).body.error).toContain(
      'No section has CRN 999',
    );
  });

  it('lists each section once and references them by CRN', async () => {
    const { body } = await call('/courses/PH-1110-2026');
    const crns = body.sections.map((s: { crn: number }) => s.crn);
    expect(crns).toEqual([20, 21, 22, 23]);
    expect(body.sections[2]).toMatchObject({
      kind: 'lab',
      pairsWith: [20, 21],
    });
    expect(body.lectureGroups).toEqual([
      { lecture: 20, discussions: [], labs: [22] },
      { lecture: 21, discussions: [], labs: [22, 23] },
    ]);
  });

  it('serializes days as arrays, times as HH:MM, and ratings inline', async () => {
    const { body } = await call('/courses/CS-2102-2026');
    expect(body.description).toBe('Object-Oriented Design Concepts & more');
    const [p] = body.sections[0].periods;
    expect(p).toMatchObject({
      days: ['M', 'T', 'R', 'F'],
      start: '10:00',
      end: '10:50',
      display: 'MTRF 10:00-10:50 AM',
    });
    expect(p.instructors).toEqual([
      {
        name: 'Ada Lovelace',
        rmp: {
          rating: 4.5,
          difficulty: 2.1,
          numRatings: 12,
          wouldTakeAgain: 91,
          url: 'https://example.test/ada',
        },
      },
    ]);
  });

  it('keeps everything over HTTP and trims on request', async () => {
    const all = (await callOn(endpoints(AFTER_A).api, '/courses/MA1021')).body;
    expect(all.sections.map((s: { number: string }) => s.number)).toEqual([
      'AL01',
      'CL01',
      'Interest List-C Term',
    ]);
    const trimmed = (
      await callOn(
        endpoints(AFTER_A).api,
        '/courses/MA1021?includeEndedTerms=false&includeInterestLists=false&includeFull=false',
      )
    ).body;
    expect(trimmed.sections.map((s: { number: string }) => s.number)).toEqual([
      'CL01',
    ]);
    expect(trimmed.omitted).toEqual({
      endedTerms: ['A'],
      otherTerms: [],
      interestLists: ['C'],
      fullSections: 0,
    });
  });

  it('gives an unrated instructor a null rating', async () => {
    const { body } = await call('/courses/MA-1021-2026');
    const al01 = body.sections.find(
      (s: { number: string }) => s.number === 'AL01',
    );
    expect(al01.periods[0].instructors).toEqual([
      { name: 'Grace Hopper', rmp: null },
    ]);
  });

  it('reports an async period with no days or times', async () => {
    const { body } = await call('/courses/CS-500-2026');
    expect(body.sections[0].periods[0]).toMatchObject({
      days: [],
      start: null,
      display: 'Async',
    });
  });
});

describe('conflicts', () => {
  it('pairs a semester section with the quarter it overlaps', async () => {
    const { body } = await call('/conflicts', { crns: [3, 1, 4] });
    expect(body.conflicts).toEqual([
      {
        a: { crn: 3, section: 'F01', term: 'F', courses: ['CS 1101'] },
        b: { crn: 1, section: 'AL01', term: 'A', courses: ['CS 2102'] },
        overlaps: [{ days: ['M', 'R'], start: '10:00', end: '10:50' }],
      },
    ]);
  });

  it('names the shared time, dedupes CRNs and takes a single one', async () => {
    const pair = await call('/conflicts', { crns: [30, 40, 40] });
    expect(pair.body).toMatchObject({ checked: [30, 40], duplicates: [40] });
    expect(pair.body.conflicts[0].overlaps).toEqual([
      { days: ['M'], start: '18:00', end: '20:50' },
    ]);
    const one = await call('/conflicts', { crns: [30] });
    expect(one.body).toEqual({
      checked: [30],
      duplicates: [],
      conflicts: [],
      busyConflicts: [],
      busyBlocks: 0,
      issues: [],
      dataAsOf: '2026-09-02T00:00:00Z',
      dataAgeDays: 0,
    });
  });

  it('checks the CRNs make a registrable set', async () => {
    const kinds = async (crns: number[], today = BEFORE_A) => {
      const { body } = await callOn(endpoints(today).api, '/conflicts', {
        crns,
      });
      return body.issues.map((i: { kind: string }) => i.kind);
    };
    // BX02 goes with BL02 only, so BL01 is still without a lab of its own.
    expect(await kinds([20, 23])).toEqual(['unpaired', 'missingCompanion']);
    expect(await kinds([21, 23])).toEqual([]);
    // A lab with no lecture, and a lecture with no lab.
    expect(await kinds([22])).toEqual(['unpaired']);
    expect(await kinds([20])).toEqual(['missingCompanion']);
    // Two lectures of one course, each still missing nothing: BX01 fits both.
    expect(await kinds([20, 21, 22])).toEqual(['sameCourse']);
    expect(await kinds([9])).toEqual(['interestList']);
    expect(await kinds([40])).toEqual(['full']);
    expect(await kinds([8])).toEqual(['lowSeats']);
    // MA 1021's AL01 is full, and in a term that has ended.
    expect(await kinds([5], AFTER_A)).toEqual(['ended', 'full']);
  });

  it('checks the known CRNs and lists unknown ones as problems', async () => {
    const { status, body } = await call('/conflicts', { crns: [3, 42, 1] });
    expect(status).toBe(200);
    expect(body.checked).toEqual([3, 1]);
    expect(body.conflicts).toHaveLength(1);
    expect(body.issues[0]).toMatchObject({
      severity: 'error',
      kind: 'unknownCrn',
      crns: [42],
    });
  });

  it('reports sections meeting during a busy block, in any term', async () => {
    const { body } = await call('/conflicts', {
      crns: [8, 40],
      busy: [{ days: ['T', 'R'], start: '13:00', end: '17:00', label: 'work' }],
    });
    // RBE 1001 BL01 meets T and F 13:00-14:50; PSY 1400 only Monday nights.
    expect(body.busyConflicts).toEqual([
      {
        section: { crn: 8, section: 'BL01', term: 'B', courses: ['RBE 1001'] },
        busy: { label: 'work', days: ['T', 'R'], start: '13:00', end: '17:00' },
        overlaps: [{ days: ['T'], start: '13:00', end: '14:50' }],
      },
    ]);
    const backwards = await call('/conflicts', {
      crns: [8],
      busy: [{ days: ['T'], start: '17:00', end: '13:00' }],
    });
    expect(backwards.status).toBe(400);
  });
});

describe('catalog', () => {
  it('lists departments, and explains an empty year', async () => {
    expect((await call('/departments?year=2027')).body.departments).toEqual([
      { abbr: 'DS', name: 'Data Science', courseCount: 1 },
      { abbr: 'MA', name: 'Mathematical Sciences', courseCount: 1 },
    ]);
    const none = await call('/departments?year=2030');
    expect(none.status).toBe(422);
    expect(none.body.error).toContain('not published yet');
  });

  it('reloads when the catalog file changes, serving the old data meanwhile', async () => {
    const { dir, dataDir } = fixtureDirs();
    const source = new CatalogSource({
      dataDir,
      publicDir: dir,
      checkIntervalMs: 0,
    });
    const first = await source.get();

    const file = join(dataDir, 'course-data-constructed.json');
    await write(dataDir, 'course-data-constructed.json', catalogJson(' (new)'));
    const later = new Date(Date.now() + 60_000);
    await utimes(file, later, later);

    // The check that spots the change still answers with the old catalog.
    expect(await source.get()).toBe(first);
    let second = first;
    for (let i = 0; i < 100 && second === first; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      second = await source.get();
    }
    expect(second).not.toBe(first);
    expect(second.courses.find(c => c.id === 'MA-1021-2026')?.name).toBe(
      'Calculus I (new)',
    );
    await write(dataDir, 'course-data-constructed.json', catalogJson());
  });

  it('answers 404 for unknown routes and ignores paths outside the API', async () => {
    const { api } = endpoints(BEFORE_A);
    expect((await callOn(api, '/nope')).status).toBe(404);
    expect(
      await api(new Request(`http://localhost${BASE}/index.html`)),
    ).toBeNull();
  });
});

describe('canonicalWindows', () => {
  it('sorts by weekday and merges overlapping or touching bands', () => {
    expect(
      canonicalWindows([
        { day: DayOfWeek.TUESDAY, startMin: 600, endMin: 660 },
        { day: DayOfWeek.MONDAY, startMin: 700, endMin: 760 },
        { day: DayOfWeek.MONDAY, startMin: 600, endMin: 700 },
        { day: DayOfWeek.MONDAY, startMin: 650, endMin: 680 },
      ]),
    ).toEqual([
      { day: DayOfWeek.MONDAY, startMin: 600, endMin: 760 },
      { day: DayOfWeek.TUESDAY, startMin: 600, endMin: 660 },
    ]);
  });
});

describe('HTTP edge cases', () => {
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await endpoints(BEFORE_A).api(
      new Request(`http://localhost${BASE}/api${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    return {
      status: response!.status,
      allow: response!.headers.get('Allow'),
      body: await response!.json(),
    };
  };

  it('answers a malformed percent-escape with 400, not 500', async () => {
    const { status, body } = await call('/courses/%ZZ');
    expect(status).toBe(400);
    expect(body.error).toContain('not valid URL encoding');
  });

  it('takes offeringPattern=unknown alone as the courses with no category', async () => {
    const { status, body } = await call('/courses?offeringPattern=unknown');
    expect(status).toBe(200);
    expect(body.total).toBeGreaterThan(0);
    for (const c of body.courses) expect(c.category).toBeNull();
    const none = await call('/courses/search', {
      filters: { offeringPattern: { categories: [] } },
    });
    expect(none.status).toBe(400);
  });

  it('reads terms, days and delivery modes in any case', async () => {
    const lower = await call('/courses/search', {
      filters: {
        term: { terms: ['b'] },
        deliveryMode: { modes: ['online'] },
        times: { days: ['m', 't', 'w', 'r', 'f'], earliestStart: '08:00' },
      },
    });
    expect(lower.status).toBe(200);
    const get = await call('/courses?term=b&deliveryMode=online');
    expect(get.status).toBe(200);
    expect(codes(get.body)).toEqual(['PH-1110-2026']);
    const busy = await call('/conflicts', {
      crns: [8],
      busy: [{ days: ['t'], start: '13:00', end: '17:00' }],
    });
    expect(busy.body.busyConflicts).toHaveLength(1);
  });

  it('takes numbers only as plain digits', async () => {
    for (const q of [
      'year=0x7EA',
      'year=2.026e3',
      'limit=1e1',
      'avoidCrns=0x55F79',
      'offset=',
      'offset=%20',
      'minAvailable=-1',
    ]) {
      const { status } = await call(`/courses?${q}`);
      expect(status, q).toBe(400);
    }
    expect((await call('/courses?minRating=3.5')).status).toBe(200);
    expect((await call('/courses?year=ALL')).body.year).toBe('all');
  });

  it('leaves an open credit bound open', async () => {
    const { status, body } = await call('/courses?minCredits=200');
    expect(status).toBe(200);
    expect(body.total).toBe(0);
  });

  it('refuses a qualifier without the parameter it qualifies', async () => {
    const prof = await call('/courses?professorOnly=true');
    expect(prof.status).toBe(400);
    expect(prof.body.error).toBe('professorOnly needs q: it qualifies it.');
    const spans = await call('/courses?semesterSpansQuarters=false');
    expect(spans.body.error).toBe(
      'semesterSpansQuarters needs avoidCrns: it qualifies it.',
    );
  });

  it('needs times to be a JSON object', async () => {
    const { status, body } = await call('/courses?times=%22x%22');
    expect(status).toBe(400);
    expect(body.error).toContain('times must be a JSON object');
  });

  it('refuses unknown parameters on every route', async () => {
    for (const path of ['/departments?foo=1', '/meta?foo=1', '/health?x=1']) {
      const { status, body } = await call(path);
      expect(status, path).toBe(400);
      expect(body.error).toContain('Unknown parameter');
    }
    expect((await call('/departments?year=2026')).status).toBe(200);
    expect((await call('/departments?year=0x7EA')).status).toBe(400);
  });

  it('answers a route asked with the wrong method with 405 and Allow', async () => {
    const search = await send('GET', '/courses/search');
    expect(search).toMatchObject({ status: 405, allow: 'POST, OPTIONS' });
    expect(search.body.error).toContain('GET /courses takes the search');
    expect(await send('POST', '/health', {})).toMatchObject({
      status: 405,
      allow: 'GET, OPTIONS',
    });
    expect(await send('GET', '/conflicts')).toMatchObject({
      status: 405,
      allow: 'POST, OPTIONS',
    });
    expect((await send('DELETE', '/courses/CS2102')).status).toBe(405);
  });

  it('refuses a course id too long to be one', async () => {
    const { status, body } = await call(`/courses/${'x'.repeat(300)}`);
    expect(status).toBe(400);
    expect(body.error.length).toBeLessThan(250);
  });
});
