/**
 * The course MCP server: its tools, and the compact text each returns for a
 * model to read (src/mcp/render.ts), over the same fixture as the HTTP
 * tests.
 */
import { describe, expect, it, vi } from 'vitest';
import { createApiHandler } from '../../src/api/http';
import { createMcpEndpoint } from '../../src/mcp/server';
import {
  AFTER_A,
  BASE,
  BEFORE_A,
  callOn,
  course,
  customEndpoints,
  endpoints,
  IN_B,
  period,
  rpcOn,
  section,
  tool,
  toolOn,
} from './courseApiFixture';

describe('MCP server', () => {
  it('lists the tools', async () => {
    const { tools } = await rpcOn(endpoints(BEFORE_A).mcp, 'tools/list', {});
    expect(tools.map((t: { name: string }) => t.name)).toEqual([
      'search_courses',
      'get_course',
      'list_departments',
      'get_catalog_info',
      'check_conflicts',
    ]);
  });

  it('renders search rows as text, with matching sections when filtered', async () => {
    const result = await tool('search_courses', {
      filters: { term: { terms: ['B'] }, department: { departments: ['PH'] } },
    });
    expect(result.data.total).toBe(1);
    expect(result.text).not.toContain('{');
    expect(result.text).toContain('Seat data is under a day old (2026-09-02).');
    expect(result.text).toContain('1. PH 1110 General Physics | 3 cr | B');
    expect(result.text).toContain(
      'BL01 CRN 20 B | MTRF 09:00-09:50 | Ada Lovelace RMP 4.5, diff 2.1, 91% again (12) | 10/30 open',
    );
    // Ada's 4.5 on 12 ratings outranks Alan's 4.9 on 3.
    expect(result.text).toContain(
      '| Cat. I | top Ada Lovelace RMP 4.5, diff 2.1 (12)\n',
    );
    expect(result.text).toContain(
      'BL02 CRN 21 B | MTRF 11:00-11:50 | Alan Turing RMP 4.9, diff 3.2 (3, few ratings) | 10/30 open | Online',
    );
    expect(result.data.courses[0].topInstructor).toEqual({
      name: 'Ada Lovelace',
      rating: 4.5,
      difficulty: 2.1,
      wouldTakeAgain: 91,
      numRatings: 12,
    });
    // Without section-level filters, rows stay one line.
    const plain = await tool('search_courses', { filters: {} });
    expect(plain.text).not.toContain('CRN');
  });

  it('lists the labs that passed under their lectures, and why a course went', async () => {
    const { text, data } = await tool('search_courses', {
      filters: { term: { terms: ['B'] }, department: { departments: ['PH'] } },
    });
    // BX02 goes with BL02 alone; BX01 with either lecture, so once.
    expect(text).toContain(
      '| 10/30 open | Online\n     + lab BX02 CRN 23 R 14:00-14:50 (10/30 open)\n     + lab (any B lecture) BX01 CRN 22 W 14:00-14:50 (10/30 open)\n',
    );
    expect(data.courses[0].companions).toHaveLength(2);
    // Both labs meet in the avoided hour, so PH 1110 goes though its
    // lectures fit: the notice says so.
    const avoided = await tool('search_courses', {
      filters: {
        department: { departments: ['PH'] },
        times: {
          mode: 'avoid',
          days: ['W', 'R'],
          earliestStart: '14:00',
          latestEnd: '15:00',
        },
      },
    });
    expect(avoided.data.total).toBe(0);
    expect(avoided.text).toContain(
      '1 course dropped because its labs fall in your avoided times (filters.times): PH 1110.',
    );
    // A lab with no open seat drops it the same way.
    const full = await tool('search_courses', {
      filters: {
        department: { departments: ['PH'] },
        availability: { minAvailable: 11 },
      },
    });
    expect(full.text).not.toContain('dropped because');
  });

  it('splits seats by term, totals every page, and warns of low counts', async () => {
    const { text } = await tool('search_courses', {
      filters: { department: { departments: ['MA', 'DS'] } },
    });
    expect(text).toContain(
      '2. MA 1021 Calculus I | 3 cr | A,C | A FULL 30/30 · C 10/30 open',
    );
    expect(text).toContain(
      'All 2 matching courses, every page: A: 0 open in 1 section · C: 10 open in 1 section · F: 10 open in 1 section (cross-listed sections counted once).',
    );
    const one = await tool('search_courses', {
      filters: { department: { departments: ['DS'] } },
    });
    expect(one.text).toContain(
      'All 1 matching course, every page: 10 open in 1 section (cross-listed sections counted once).',
    );
    expect(text).not.toContain('low counts');
    const low = await tool('search_courses', {
      filters: { department: { departments: ['RBE'] } },
      includeSections: true,
    });
    // BL02's 999 seats are Workday's mark for no limit, not seats.
    expect(low.text).toContain('| B | 2/30 open + 1 with no seat cap\n');
    expect(low.text).toContain('TF 16:00-17:50 | Grace Hopper | no seat cap');
    expect(low.text).toContain('2 open in 1 section + 1 with no seat cap');
    expect(low.text).toContain(
      'Seat data is under a day old (2026-09-02); low counts (3 or fewer) may already be gone.',
    );
  });

  it('flags matches that only mention the words or the code', async () => {
    const weak = await tool('search_courses', {
      filters: { searchText: { query: 'procedural generation' } },
    });
    expect(weak.text).toContain(
      'No course is mainly about this; these only mention the words in their descriptions:',
    );
    expect(weak.text).toContain('1. CS 1101 Introduction to Program Design |');
    const code = await tool('search_courses', {
      filters: { searchText: { query: 'CS 2102' } },
    });
    expect(code.text).toContain('1. CS 2102 Object-Oriented Design Concepts |');
    expect(code.text).toContain(
      '2. CS 1101 Introduction to Program Design | (mentions CS 2102) |',
    );
    expect(code.text).not.toContain('mainly about');
    // An instructor match is not a mere mention.
    const person = await tool('search_courses', {
      filters: { searchText: { query: 'Hopper' } },
    });
    expect(person.text).toContain('(matched an instructor or room)');
    expect(person.text).not.toContain('mainly about');
    const prefix = await tool('search_courses', {
      filters: { searchText: { query: 'Hop', professorOnly: true } },
    });
    expect(prefix.data.total).toBeGreaterThan(0);
  });

  it('leaves out unknown rooms and explains a waitlist beside open seats', async () => {
    const async = await tool('get_course', { course: 'CS 500' });
    expect(async.text).toContain('S01 CRN 7 | Async | Ada Lovelace');
    expect(async.text).not.toContain('Unknown');
    const waitlist = await tool('get_course', { course: 'CS 1101' });
    expect(waitlist.text).toContain('10/30 open, waitlist 2');
    expect(waitlist.text).toContain(
      'A waitlist beside open seats is as Workday reports it: students on it may be waiting for a different section or time.',
    );
    const none = await tool('get_course', { course: 'CS 2102' });
    expect(none.text).not.toContain('A waitlist beside');
    // A row without its sections shows the waitlist in its totals.
    const row = await tool('search_courses', {
      filters: { searchText: { query: 'CS 1101' } },
    });
    expect(row.text).toContain('10/30 open, waitlist 2');
    expect(row.text).toContain('A waitlist beside open seats');
  });

  it('says which delivery modes asked for have nothing', async () => {
    const { text } = await tool('search_courses', {
      filters: { deliveryMode: { modes: ['Online', 'Hybrid'] } },
    });
    expect(text).toContain(
      'Hybrid: none in 2026-27 matching the other filters.',
    );
    expect(text).not.toContain('Online: none');
  });

  it('points to Workday only when the search asks to register', async () => {
    const asked = await tool('search_courses', {
      filters: { searchText: { query: 'register robotics' } },
    });
    expect(asked.text).toContain('Registration is in WPI Workday');
    const topic = await tool('search_courses', {
      filters: { searchText: { query: 'robotics' } },
    });
    expect(topic.text).not.toContain('Registration is in WPI Workday');
  });

  it('says what the MQP and IQP are rather than guess at courses', async () => {
    const { text, data } = await tool('search_courses', {
      filters: { searchText: { query: 'major qualifying project' } },
    });
    expect(data.total).toBe(0);
    expect(text).toContain(
      'The MQP (Major Qualifying Project) is a WPI degree project, arranged with a project advisor or department and registered separately, not a regular catalog section. No catalog course is named for it; any rows below only mention it.',
    );
    // Leaving out the only filter would find everything: not said.
    expect(text).not.toContain('Most restrictive');
    const iqp = await tool('search_courses', {
      filters: { searchText: { query: 'IQP' } },
    });
    expect(iqp.text).toContain('The IQP (Interactive Qualifying Project)');
    const plain = await tool('search_courses', {
      filters: { searchText: { query: 'robotics' } },
    });
    expect(plain.text).not.toContain('degree project');
  });

  it('suggests the instructor a misspelt name means', async () => {
    for (const query of ['Grace Hoper', 'Hoppr']) {
      const { text, data } = await tool('search_courses', {
        filters: { searchText: { query, professorOnly: true } },
      });
      expect(data.total).toBe(0);
      expect(text).toContain(
        `No instructor is named "${query}"; did you mean Grace Hopper?`,
      );
    }
    const found = await tool('search_courses', {
      filters: { searchText: { query: 'Grace Hopper', professorOnly: true } },
    });
    expect(found.text).not.toContain('did you mean');
  });

  it('names the right place for a key given in the wrong one', async () => {
    const { text, isError } = await tool('search_courses', {
      filters: { earliestStart: '17:00' },
    });
    expect(isError).toBe(true);
    expect(text).toContain('it goes in filters.times.earliestStart');
  });

  it('names the filter that emptied a search', async () => {
    const { text, data } = await tool('search_courses', {
      filters: {
        department: { departments: ['PSY'] },
        term: { terms: ['C'] },
        times: { earliestStart: '17:00' },
      },
    });
    expect(data.total).toBe(0);
    // PSY 1400 meets Monday evenings, in B term.
    expect(data.relaxations).toEqual([
      { filter: 'term', total: 1, terms: ['B'], restores: [] },
      { filter: 'department', total: 0, terms: [], restores: [] },
      { filter: 'times', total: 0, terms: [], restores: [] },
    ]);
    expect(text).toContain(
      'Most restrictive: filters.term. Leaving out one filter at a time: without term, 1 course (in B).',
    );
    expect(text).toContain(
      'Leaving out department or times alone still finds nothing.',
    );
  });

  it('blames the filter that keeps out the course a code names', async () => {
    const { text, data } = await tool('search_courses', {
      filters: {
        searchText: { query: 'PH 1110' },
        term: { terms: ['B'] },
        times: {
          mode: 'avoid',
          days: ['W', 'R'],
          earliestStart: '14:00',
          latestEnd: '15:00',
        },
      },
    });
    expect(data.total).toBe(0);
    // Leaving out the search finds more courses, but the student asked
    // for PH 1110: the times are what keep it out.
    expect(data.relaxations.map((r: { filter: string }) => r.filter)).toEqual([
      'times',
      'searchText',
      'term',
    ]);
    expect(text).toContain(
      'Most restrictive: filters.times; without it, PH 1110 is back.',
    );
    expect(text).not.toContain('Most restrictive: filters.searchText');
    // A topic search, too, comes after the filters that narrow it.
    const topic = await tool('search_courses', {
      filters: {
        searchText: { query: 'physics' },
        times: {
          mode: 'avoid',
          days: ['W', 'R'],
          earliestStart: '14:00',
          latestEnd: '15:00',
        },
        department: { departments: ['PH'] },
      },
    });
    expect(topic.data.relaxations[0].filter).toBe('times');
  });

  it('says when the offset runs past the end', async () => {
    const result = await tool('search_courses', { offset: 50 });
    expect(result.text).toContain(
      'Offset 50 is past the end: there are only 8 matching courses.',
    );
  });

  it('renders a course once per section, noting what each lab pairs with', async () => {
    const { text, data } = await tool('get_course', { course: 'PH 1110' });
    expect(text.match(/BX01/g)).toHaveLength(1);
    expect(text).toContain(
      'BX01 CRN 22 | W 14:00-14:50 | 10/30 open | any lecture',
    );
    expect(text).toContain(
      'BX02 CRN 23 | R 14:00-14:50 | 10/30 open | Online | with BL02',
    );
    expect(text).toContain('Take one lecture plus one of each companion kind');
    expect(text).toContain('Ada Lovelace RMP 4.5, diff 2.1, 91% again (12)');
    // Absent facts are said, not left out.
    expect(text).toContain(
      'Degree attributes: none on record (tags are incomplete; see the degree audit) | Cross-listed: none',
    );
    expect(text).toContain(
      'Prerequisites: none in a separate field; see the description.',
    );
    expect(text).toContain(
      'Recommended background: none in a separate field; see the description.',
    );
    expect(text.length).toBeLessThan(1500);
    expect(data.sections).toHaveLength(4);
  });

  it('takes a "CRN" prefix and a course title', async () => {
    const crn = await tool('get_course', { course: 'CRN 22' });
    expect(crn.text).toContain('CRN 22 is PH 1110 section BX01 (B term).');
    const title = await tool('get_course', {
      course: 'introduction to robotics',
    });
    expect(title.text).toContain(
      '"introduction to robotics" read as RBE 1001 Introduction To Robotics.',
    );
    // Half a word is not near enough to resolve, but is suggested.
    const start = await tool('get_course', { course: 'General Phys' });
    expect(start.text).toContain('Closest: PH 1110 General Physics.');
    // DS 502 and MA 543 are one class: its title resolves, once.
    const shared = await tool('get_course', { course: 'Statistical Methods' });
    expect(shared.isError).toBe(false);
    const several = await tool('get_course', { course: 'Calculus I' });
    expect(several.isError).toBe(false);
    const vague = await tool('get_course', { course: 'Introduction' });
    expect(vague.isError).toBe(true);
    expect(vague.text).toContain(
      '"Introduction" fits 2 course titles. Closest:',
    );
  });

  it('hides interest lists unless asked', async () => {
    const hidden = await tool('get_course', { course: 'MA 1021' });
    expect(hidden.text).toContain('interest lists for C');
    expect(hidden.text).not.toContain('Interest List-C Term');
    const shown = await tool('get_course', {
      course: 'MA 1021',
      includeInterestLists: true,
    });
    expect(shown.text).toContain('Interest List-C Term');
  });

  it('reports lookup and input errors as tool errors', async () => {
    const crn = await tool('search_courses', {
      filters: { periodConflict: { crns: [1, 42] } },
    });
    expect(crn.isError).toBe(true);
    expect(crn.text).toContain('Unknown CRN: 42');
    const dept = await tool('search_courses', {
      filters: { department: { departments: ['Computr Science'] } },
    });
    expect(dept.isError).toBe(false);
    expect(dept.text).toContain(
      'Department "Computr Science" read as CS (Computer Science).',
    );
    // "Science" is in several names: name them rather than guess.
    const vague = await tool('search_courses', {
      filters: { department: { departments: ['Science'] } },
    });
    expect(vague.isError).toBe(true);
    expect(vague.text).toContain(
      'could be CS (Computer Science), MA (Mathematical Sciences), DS (Data Science)',
    );
    const unknown = await tool('search_courses', {
      filters: { department: { departments: ['Quux'] } },
    });
    expect(unknown.text).toContain('Unknown department "Quux"');
    expect(unknown.text).toContain('list_departments');
    const course = await tool('get_course', { course: 'CS 2012' });
    expect(course.isError).toBe(true);
    expect(course.text).toContain('Close codes: CS 2102');
  });

  it('notes the ended terms a course detail leaves out', async () => {
    const text = (await tool('get_course', { course: 'MA 1021' }, AFTER_A))
      .text;
    expect(text).toContain('Not shown: A term (ended');
    expect(text).not.toContain('AL01');
    expect(text).toContain('interest lists for C');
  });

  it('marks an ended term it was asked to show', async () => {
    const { text } = await tool(
      'get_course',
      { course: 'MA 1021', includeEndedTerms: true },
      AFTER_A,
    );
    expect(text).toContain(
      'A term (2026-01-01 to 2026-01-20), ENDED: can no longer be taken:',
    );
  });

  it('tells the date and the term between terms', async () => {
    const info = await tool('get_catalog_info', {}, AFTER_A);
    expect(info.text).toContain(
      'between terms; A ended 2026-01-20; B starts 2026-02-01',
    );
    expect(info.text).toContain('2027 = 2027-28 not yet published');
  });

  it('refuses an unpublished year and plans it instead', async () => {
    const result = await tool('search_courses', {
      filters: { academicYear: { year: 2027 } },
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('offeringPattern');
    const psy = await tool('get_course', { course: 'PSY 1400', year: 2027 });
    expect(psy.text).toContain('May or may not be offered in 2027-28');
    const cs = await tool('get_course', { course: 'CS 2102', year: 2027 });
    expect(cs.text).toContain('is unknown');
  });

  it('names the shared time, dedupes CRNs and handles a single one', async () => {
    const pair = await tool('check_conflicts', { crns: [30, 40, 40] });
    expect(pair.text).toContain('CRN 40 given more than once; checked once.');
    expect(pair.text).toContain(
      'CONFLICT MA 543/DS 502 F01 (CRN 30, F) and PSY 1400 B01 (CRN 40, B): both meet M 18:00-20:50.',
    );
    const one = await tool('check_conflicts', { crns: [30] });
    expect(one.isError).toBe(false);
    expect(one.text).toContain(
      'One section, so no times to compare. No time conflicts or section problems found; prerequisites and eligibility are not checked.',
    );
  });

  it('checks the CRNs it knows against each other and the busy times', async () => {
    const { text, isError } = await tool('check_conflicts', {
      crns: [8, 42, 40],
      busy: [{ days: ['T', 'R'], start: '13:00', end: '17:00', label: 'work' }],
    });
    expect(isError).toBe(false);
    expect(text).toContain(
      'PROBLEM: CRN 42 is not a section in the catalog; get CRNs from get_course or search_courses.',
    );
    expect(text).toContain(
      'BUSY RBE 1001 BL01 (CRN 8, B) meets during "work" (T,R 13:00-17:00): T 13:00-14:50.',
    );
    expect(text).toContain(
      'No time conflicts among these 2 sections. 1 section meets during your busy times. 1 problem to fix before registering.',
    );
    const free = await tool('check_conflicts', {
      crns: [40],
      busy: [{ days: ['T'], start: '13:00', end: '17:00' }],
    });
    expect(free.text).toContain('None meets during your busy times.');
  });

  it('says how old the seat data is, and to check Workday when stale', async () => {
    // 47 days after the 2026-09-02 refresh.
    const late = new Date(2026, 9, 19);
    const check = await tool('check_conflicts', { crns: [40] }, late);
    expect(check.text).toContain(
      'Seat data is 47 days old (2026-09-02): check live seats in Workday before registering.',
    );
    expect(check.data.dataAgeDays).toBe(47);
    const info = await tool('get_catalog_info', {}, late);
    expect(info.text).toContain(
      'Data as of 2026-09-02T00:00:00Z (47 days old)',
    );
  });

  it('says what keeps a set of CRNs from being registered', async () => {
    const bad = await tool('check_conflicts', { crns: [20, 23, 40] });
    expect(bad.text).toContain(
      'PROBLEM: PH 1110 lab BX02 (CRN 23) does not go with lecture BL01 (CRN 20); it goes with BL02 (CRN 21).',
    );
    expect(bad.text).toContain(
      'Note: PSY 1400 B01 (CRN 40) is FULL (30/30, 5 on the waitlist); registering means joining the waitlist.',
    );
    expect(bad.text).toContain('1 problem to fix before registering.');
    const missing = await tool('check_conflicts', { crns: [20, 8] });
    expect(missing.text).toContain(
      'Note: PH 1110 BL01 (CRN 20) needs a lab: none chosen (1 goes with it; get_course "PH 1110").',
    );
    expect(missing.text).toContain(
      'Note: RBE 1001 BL01 (CRN 8) had only 2 open seats as of 2026-09-02; they may already be gone.',
    );
    expect(missing.text).toContain(
      'Not a complete set yet: add the labs or discussions noted.',
    );
  });

  it('explains an empty or early year of departments', async () => {
    const none = await tool('list_departments', { year: 2030 });
    expect(none.isError).toBe(true);
    expect(none.text).toContain('not published yet');
    const early = await tool('list_departments', { year: 2027 });
    expect(early.text).toContain('only early entries (2 courses)');
  });
});

describe('adversarial input', () => {
  it('refuses a search with no searchable words rather than match everything', async () => {
    for (const query of [
      '&',
      '(',
      '\\',
      '\u2014',
      '\u200b',
      '\u0639\u0644\u0648\u0645',
    ]) {
      const result = await tool('search_courses', {
        filters: { searchText: { query } },
      });
      expect(result.isError).toBe(true);
      expect(result.text).toContain(
        'has no searchable words; the catalog is searched in English (letters and digits).',
      );
    }
  });

  it('trims whitespace-only names to nothing and refuses them', async () => {
    expect((await tool('get_course', { course: '   ' })).isError).toBe(true);
    const dept = await tool('search_courses', {
      filters: { department: { departments: ['  '] } },
    });
    expect(dept.isError).toBe(true);
  });

  it('caps long input, and echoes only the start of it', async () => {
    const long = 'x'.repeat(201);
    expect(
      (
        await tool('search_courses', {
          filters: { searchText: { query: long } },
        })
      ).isError,
    ).toBe(true);
    expect((await tool('get_course', { course: long })).isError).toBe(true);
    const crns = Array.from({ length: 101 }, (_, i) => i + 1);
    expect(
      (await tool('search_courses', { filters: { periodConflict: { crns } } }))
        .isError,
    ).toBe(true);
    const title = await tool('get_course', { course: 'q'.repeat(150) });
    expect(title.isError).toBe(true);
    expect(title.text).toContain(`"${'q'.repeat(60)}..."`);
    expect(title.text).not.toContain('q'.repeat(61));
    const dept = await tool('search_courses', {
      filters: { department: { departments: ['z'.repeat(90)] } },
    });
    expect(dept.text).toContain(`"${'z'.repeat(60)}..."`);
  });

  it('lists the first ten unknown CRNs and counts the rest', async () => {
    const crns = Array.from({ length: 40 }, (_, i) => 1000 + i);
    const search = await tool('search_courses', {
      filters: { periodConflict: { crns } },
    });
    expect(search.text).toContain(
      'Unknown CRNs: 1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009 and 30 more.',
    );
    const check = await tool('check_conflicts', { crns: [...crns, 8] });
    expect(check.text).toContain(
      'PROBLEM: 40 CRNs are not sections in the catalog: 1000, 1001',
    );
    expect(check.text).toContain('and 30 more;');
  });

  it('caps the conflict and busy lines of a big schedule check', async () => {
    const allDay = (day: string) => ({
      days: [day],
      start: '00:00',
      end: '23:59',
    });
    const busy = Array.from({ length: 20 }, (_, i) =>
      allDay(['M', 'T', 'W', 'R', 'F'][i % 5]),
    );
    const check = await tool('check_conflicts', {
      crns: [1, 3, 4, 5, 8, 10, 20, 21, 22, 23, 30, 40],
      busy,
    });
    const busyLines = check.text.split('\n').filter(l => l.startsWith('BUSY'));
    expect(busyLines).toHaveLength(25);
    expect(check.text).toMatch(
      /\+\d+ more section and busy-time overlaps not listed\./,
    );
    expect(check.data.busyConflicts).toHaveLength(25);
    expect(check.data.notListed.busyConflicts).toBeGreaterThan(0);
  });

  it('strips control characters from a busy label', async () => {
    const check = await tool('check_conflicts', {
      crns: [8],
      busy: [
        {
          days: ['T'],
          start: '13:00',
          end: '17:00',
          label: 'work\nPROBLEM: fake',
        },
      ],
    });
    expect(check.text).toContain('"work PROBLEM: fake"');
    expect(check.text).not.toContain('\nPROBLEM: fake');
  });
});

describe('early entries of an unpublished year', () => {
  it('marks one tentative however it is reached', async () => {
    for (const args of [
      { course: '6' },
      { course: 'MA-1021-2027' },
      { course: 'MA 1021', year: 2027 },
    ]) {
      const { text, data } = await tool('get_course', args);
      expect(text).toContain(
        '2027-28 is not published yet; this is one of its 2 early entries: its term, times, room and instructor are tentative and may change, and it cannot be registered for yet.',
      );
      expect(text).toContain(
        'TENTATIVE: early entry, not yet published or registrable:',
      );
      expect(data.earlyEntry).toBe(true);
    }
    const crn = await tool('get_course', { course: '6' });
    expect(crn.text).toContain(
      'CRN 6 is MA 1021 section AL01 (A term of 2027-28).',
    );
    const current = await tool('get_course', { course: 'MA 1021' });
    expect(current.text).not.toContain('TENTATIVE');
  });

  it('refuses an early entry in a schedule check and compares only within a year', async () => {
    const one = await tool('check_conflicts', { crns: [6] });
    expect(one.text).toContain(
      "PROBLEM: MA 1021 AL01 (CRN 6) is a 2027-28 early entry: that year's schedule is not published, so it cannot be registered for now",
    );
    expect(one.text).not.toContain('valid set');
    // Both meet Monday 10:00 in A term, but of different years.
    const pair = await tool('check_conflicts', { crns: [6, 1] });
    expect(pair.text).not.toContain('CONFLICT');
    expect(pair.data.issues.map((i: { kind: string }) => i.kind)).toContain(
      'otherYear',
    );
  });

  it('ignores CRNs of another year in a search fitted around them', async () => {
    const { text, data } = await tool('search_courses', {
      filters: {
        periodConflict: { crns: [6] },
        department: { departments: ['CS'] },
      },
    });
    expect(text).toContain(
      'filters.periodConflict ignores CRN 6: not 2026-27 sections, so they cannot clash with the ones searched.',
    );
    expect(data.courses.map((c: { code: string }) => c.code)).toContain(
      'CS 2102',
    );
  });

  it('searches every year with the ended-term rule, per-year cross-listings and early entries labelled', async () => {
    const { text, data } = await tool(
      'search_courses',
      { filters: { academicYear: { year: 'all' } }, includeSections: true },
      AFTER_A,
    );
    // CS 2102 runs only in this year's A, which has ended; next year's A
    // early entry stays, labelled.
    const ids = data.courses.map((c: { id: string }) => c.id);
    expect(ids).not.toContain('CS-2102-2026');
    expect(ids).toContain('MA-1021-2027');
    expect(data.excludedEndedTerms).toEqual(['A']);
    expect(text).toContain(
      'Sections in 2026-27 terms that have ended (A) are left out',
    );
    // DS 502 and MA 543 are one class this year: one row, beside next
    // year's own DS 502.
    expect(ids).toContain('DS-502-2026');
    expect(ids).toContain('DS-502-2027');
    expect(ids).not.toContain('MA-543-2026');
    const early = data.courses.find(
      (c: { id: string }) => c.id === 'MA-1021-2027',
    );
    expect(early.earlyEntry).toBe(true);
    expect(early.sections).toBeUndefined();
    expect(text).toContain(
      'MA 1021 Calculus I | 3 cr | A (tentative) | 2027-28 early entry: not published, cannot be scheduled yet',
    );
    expect(data.totals.seatsYear).toBe(2026);
    expect(text).toContain(
      '; seats in 2026-27 only, the year that can be scheduled:',
    );
  });
});

describe('sections off their term dates', () => {
  const lab = (crn: number, number: string, start: string, end: string) =>
    section(crn, number, 'B', [period(['T', 'F'], '14:00', '16:50')], 5, {
      seats: 5,
      startDate: start,
      endDate: end,
    });
  const own = () =>
    customEndpoints([
      {
        abbreviation: 'BB',
        name: 'Biology and Biotechnology',
        courses: [
          // Two runs of one half-unit lab, in each half of B term.
          course('BB-3813-2026', 'Cell Culture Laboratory', [], {
            standaloneLabs: [
              lab(50, 'BX01', '2026-02-01', '2026-02-10'),
              lab(51, 'BX02', '2026-02-11', '2026-02-20'),
            ],
          }),
          // The first half of the F semester only (F runs Jan 1 to Feb 20).
          course('BB-504-2026', 'Biomanufacturing', [
            section(52, 'F01', 'F', [period(['M'], '09:00', '09:50')], 10, {
              startDate: '2026-01-01',
              endDate: '2026-01-30',
            }),
          ]),
          course('BB-505-2026', 'Bioprocessing', [
            section(53, 'B01', 'B', [period(['M'], '09:00', '09:50')], 10, {
              startDate: '2026-02-01',
              endDate: '2026-02-20',
            }),
          ]),
        ],
      },
    ]);

  it('shows a section its own dates when they are not its term', async () => {
    const { mcp } = await own();
    const course = await toolOn(mcp, 'get_course', { course: 'BB 504' });
    expect(course.text).toContain(
      'F01 CRN 52 | runs 2026-01-01 to 2026-01-30 | M 09:00-09:50',
    );
    expect(course.data.sections[0]).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-01-30',
    });
    const whole = await toolOn(mcp, 'get_course', { course: 'BB 505' });
    expect(whole.text).not.toContain('runs 2026');
    expect(whole.data.sections[0].startDate).toBeUndefined();
    const search = await toolOn(mcp, 'search_courses', {
      filters: { department: { departments: ['BB'] } },
      includeSections: true,
    });
    expect(search.text).toContain(
      'BX01 CRN 50 B | runs 2026-02-01 to 2026-02-10 | TF 14:00-16:50',
    );
  });

  it('finds no clash between sections whose dates never meet', async () => {
    const { mcp } = await own();
    const labs = await toolOn(mcp, 'check_conflicts', { crns: [50, 51] });
    expect(labs.text).not.toContain('CONFLICT');
    // Still two runs of one lab: take one.
    expect(labs.text).toContain('PROBLEM: 2 BB 3813 labs chosen');
    const halves = await toolOn(mcp, 'check_conflicts', { crns: [52, 53] });
    expect(halves.text).not.toContain('CONFLICT');
    expect(halves.data.conflicts).toEqual([]);
  });
});

describe('full sections left out', () => {
  it('counts each hidden full section once, under a hidden lecture too, and no placeholder', async () => {
    const { mcp, api } = await customEndpoints([
      {
        abbreviation: 'MA',
        name: 'Mathematical Sciences',
        courses: [
          course('MA-1022-2026', 'Calculus II', [
            {
              section: section(
                60,
                'BL01',
                'B',
                [period(['M'], '09:00', '09:50')],
                0,
              ),
              compatibleLabs: [
                section(61, 'BD01', 'B', [period(['T'], '09:00', '09:50')], 0),
              ],
            },
            {
              section: section(62, 'BL02', 'B', [
                period(['M'], '11:00', '11:50'),
              ]),
              compatibleLabs: [
                section(63, 'BD02', 'B', [period(['T'], '11:00', '11:50')], 0),
                section(64, 'BD03', 'B', [period(['T'], '12:00', '12:50')]),
              ],
            },
            section(65, 'Interest List-B Term', 'B', [], 0, {
              isInterestList: true,
            }),
          ]),
        ],
      },
    ]);
    const args = { course: 'MA 1022', includeFull: false, terms: ['B'] };
    const tool = await toolOn(mcp, 'get_course', args);
    // BL01, its lab BD01, and BD02; never the interest list.
    expect(tool.data.omitted.fullSections).toBe(3);
    expect(tool.text).toContain('3 full sections (includeFull: true)');
    const http = await callOn(
      api,
      '/courses/MA1022?includeFull=false&terms=B&includeInterestLists=true',
    );
    expect(http.body.omitted.fullSections).toBe(3);
    expect(http.body.sections.map((s: { crn: number }) => s.crn)).toEqual([
      62, 65, 64,
    ]);
  });
});

describe('sections that read as something else', () => {
  const at = (p: ReturnType<typeof period>, location: string) => ({
    ...p,
    location,
  });
  const own = () =>
    customEndpoints([
      {
        abbreviation: 'WPE',
        name: 'Wellness and Physical Education',
        courses: [
          // A varsity team: Workday's 999 seats, no practice times listed.
          course('WPE-2001-2026', 'Varsity Basketball', [
            section(
              70,
              'B01',
              'B',
              [{ ...period([], '', ''), isAsync: true, location: 'Unknown' }],
              990,
              { seats: 999 },
            ),
          ]),
        ],
      },
      {
        abbreviation: 'HU',
        name: 'Humanities and Arts',
        courses: [
          course('HU-3900-2026', 'Inquiry Seminar', [
            section(71, 'B01', 'B', [
              at(period(['M'], '10:00', '10:50'), 'Daniels Hall 102E'),
              at(period(['T'], '10:00', '11:50'), 'Salisbury Labs 226'),
              at(period(['R'], '10:00', '10:50'), 'Daniels Hall 102E'),
            ]),
          ]),
        ],
      },
      {
        abbreviation: 'CS',
        name: 'Computer Science',
        courses: [
          course('CS-3733-2026', 'Software Engineering', [
            section(72, 'BL01', 'B', [period(['M'], '12:00', '12:50')], -7),
          ]),
        ],
      },
      {
        abbreviation: 'CP',
        name: 'Career Preparation',
        courses: [
          course('CP-1001-2026', 'Career Preparation', [
            section(73, 'B101', 'B', [period(['W'], '12:00', '12:50')], -1, {
              seats: 0,
            }),
          ]),
        ],
      },
    ]);

  it('says a team enrolls by membership, and has no listed practice times', async () => {
    const { mcp } = await own();
    const team = await toolOn(mcp, 'get_course', { course: 'WPE 2001' });
    expect(team.text).toContain(
      'B01 CRN 70 | no set meeting times listed | Ada Lovelace',
    );
    expect(team.text).toContain(
      '"No seat cap" sections (varsity and club teams, ensembles) enroll by team or ensemble membership; the seat count is a placeholder, not open seats.',
    );
    expect(team.text).toContain(
      'Degree attributes: none on record (tags are incomplete; see the degree audit)',
    );
    const search = await toolOn(mcp, 'search_courses', {
      filters: { department: { departments: ['WPE'] } },
    });
    expect(search.text).toContain('enroll by team or ensemble membership');
    const check = await toolOn(mcp, 'check_conflicts', { crns: [70] });
    expect(check.text).toContain(
      'Note: WPE 2001 B01 (CRN 70) enrolls by team or ensemble membership; its seat count (999) is a placeholder, not open seats.',
    );
    // Undergraduate: no "usual for graduate courses".
    const plan = await toolOn(mcp, 'get_course', {
      course: 'WPE 2001',
      year: 2027,
    });
    expect(plan.text).toContain(
      'No offering pattern on record, so whether it runs in 2027-28 is unknown.',
    );
  });

  it('gives each meeting its room when the rooms differ', async () => {
    const { mcp } = await own();
    const { text, data } = await toolOn(mcp, 'get_course', {
      course: 'HU 3900',
    });
    expect(text).toContain(
      'B01 CRN 71 | M 10:00-10:50 (Daniels Hall 102E); T 10:00-11:50 (Salisbury Labs 226); R 10:00-10:50 (Daniels Hall 102E) | Ada Lovelace',
    );
    expect(data.sections[0].location).toBeUndefined();
  });

  it('never sends negative open seats, and reads a capacity of 0 as listed', async () => {
    const { mcp, api } = await own();
    const over = await toolOn(mcp, 'get_course', { course: 'CS 3733' });
    expect(over.text).toContain('FULL 37/30');
    expect(over.data.sections[0]).toMatchObject({
      seatsAvailable: 0,
      overEnrolled: 7,
    });
    const http = await callOn(api, '/courses/CS3733');
    expect(http.body.sections[0]).toMatchObject({
      seatsAvailable: 0,
      overEnrolled: 7,
    });
    const zero = await toolOn(mcp, 'get_course', { course: 'CP 1001' });
    expect(zero.text).toContain('capacity 0 listed');
    expect(zero.text).not.toContain('FULL 1/0');
  });
});

describe('terms in progress', () => {
  it('says adding late may need approval, in each tool', async () => {
    const course = await tool('get_course', { course: 'PH 1110' }, IN_B);
    expect(course.text).toContain(
      'B term (2026-02-01 to 2026-02-20), in progress (started 2026-02-01): adding late may need instructor or registrar approval:',
    );
    const check = await tool('check_conflicts', { crns: [20, 22] }, IN_B);
    expect(check.text).toContain(
      'Note: B term is in progress (started 2026-02-01): adding PH 1110 BL01, PH 1110 BX01 now is late and may need instructor or registrar approval.',
    );
    const info = await tool('get_catalog_info', {}, IN_B);
    expect(info.text).toContain('B 2026-02-01 to 2026-02-20 (in progress)');
    expect(info.text).toContain(
      'B and F are in progress: adding a section late may need instructor or registrar approval.',
    );
    expect(info.text).toContain('Degree attribute tags are incomplete');
  });

  it('never counts an interest list as a second lecture', async () => {
    const { data } = await tool('check_conflicts', { crns: [9, 4] });
    expect(data.issues.map((i: { kind: string }) => i.kind)).toEqual([
      'interestList',
    ]);
  });
});

describe('statements without a colon', () => {
  it('cuts a statement headed without a colon from the description', async () => {
    const { mcp, api } = await customEndpoints([
      {
        abbreviation: 'PH',
        name: 'Physics',
        courses: [
          course(
            'PH-1110-2026',
            'General Physics',
            [section(80, 'BL01', 'B', [period(['M'], '09:00', '09:50')])],
            {
              description:
                '<p>Mechanics for engineers. Recommended Background Working knowledge of differential calculus (MA 1021), and concurrent study of MA 1022. Students may not receive credit for both PH 1110 and PH 1111.</p>',
              // As the converter lifts it (extractPrerequisites).
              recommendedBackground:
                'Working knowledge of differential calculus (MA 1021), and concurrent study of MA 1022.',
            },
          ),
          course(
            'PH-594-2026',
            'Graduate Project',
            [section(81, 'F01', 'F', [period(['T'], '09:00', '09:50')])],
            {
              isGraduate: true,
              description:
                '<p>A capstone project. Prerequisites Completion of at least 24 credits, or consent of the instructor. It may be repeated.</p>',
              prerequisites:
                'Completion of at least 24 credits, or consent of the instructor.',
            },
          ),
        ],
      },
    ]);
    const ph = await toolOn(mcp, 'get_course', { course: 'PH 1110' });
    expect(ph.text).toContain(
      'Recommended background: Working knowledge of differential calculus (MA 1021), and concurrent study of MA 1022.',
    );
    // Cut from the description so it is not read twice, the rest kept.
    expect(ph.text).toContain(
      'Description: Mechanics for engineers. Students may not receive credit for both PH 1110 and PH 1111.',
    );
    expect(ph.text).toContain(
      'Prerequisites: none in a separate field; see the description.',
    );
    const project = await toolOn(mcp, 'get_course', { course: 'PH 594' });
    expect(project.text).toContain(
      'Prerequisites (as the description states): Completion of at least 24 credits, or consent of the instructor',
    );
    expect(project.text).toContain(
      'Description: A capstone project. It may be repeated.',
    );
    const http = await callOn(api, '/courses/PH1110');
    expect(http.body.recommendedBackground).toBe(
      'Working knowledge of differential calculus (MA 1021), and concurrent study of MA 1022.',
    );
    const plan = await toolOn(mcp, 'get_course', {
      course: 'PH 1110',
      year: 2027,
    });
    expect(plan.text).toContain(
      'Recommended background: Working knowledge of differential calculus',
    );
  });
});

describe('sorted searches', () => {
  const liskov = {
    id: '3',
    legacyId: 3,
    firstName: 'Barbara',
    lastName: 'Liskov',
    department: 'Mathematics',
    avgRating: 3.0,
    avgDifficulty: 1.5,
    numRatings: 20,
    wouldTakeAgainPercent: 60,
    profileUrl: 'https://example.test/barbara',
  };
  const own = () =>
    customEndpoints(
      [
        {
          abbreviation: 'MA',
          name: 'Mathematical Sciences',
          courses: [
            // Best rated: Ada; easiest: Barbara.
            course('MA-1022-2026', 'Calculus II', [
              section(90, 'BL01', 'B', [
                period(['M'], '09:00', '09:50', ['Ada Lovelace']),
              ]),
              section(91, 'BL02', 'B', [
                period(['M'], '11:00', '11:50', ['Barbara Liskov']),
              ]),
            ]),
            // Names MA 1022 in its description, taught by a better-rated
            // instructor than anyone teaching MA 1022... and an easier one.
            course(
              'MA-1023-2026',
              'Calculus III',
              [section(92, 'CL01', 'C', [period(['M'], '09:00', '09:50')])],
              { description: '<p>Follows MA 1022.</p>' },
            ),
          ],
        },
      ],
      BEFORE_A,
      [liskov],
    );

  it('shows the easiest-rated instructor under the difficulty sort', async () => {
    const { mcp } = await own();
    const easy = await toolOn(mcp, 'search_courses', {
      filters: { department: { departments: ['MA'] } },
      sort: 'difficulty',
    });
    expect(easy.text).toContain(
      'MA 1022 Calculus II | 3 cr | B | 20/60 open | easiest rated Barbara Liskov RMP 3, diff 1.5 (20)',
    );
    expect(easy.data.courses[0].topInstructor.name).toBe('Barbara Liskov');
    const best = await toolOn(mcp, 'search_courses', {
      filters: { department: { departments: ['MA'] } },
      sort: 'rating',
    });
    expect(best.text).toContain('| top Ada Lovelace RMP 4.5');
  });

  it("keeps a code search's own course first whatever the sort", async () => {
    const { mcp } = await own();
    for (const sort of ['rating', 'openSeats', 'difficulty']) {
      const { text, data } = await toolOn(mcp, 'search_courses', {
        filters: { searchText: { query: 'MA 1022' } },
        sort,
      });
      expect(
        data.courses.map((c: { code: string }) => c.code),
        sort,
      ).toEqual(['MA 1022', 'MA 1023']);
      expect(text).toContain(
        'The course the code names comes first, then the rest in that order.',
      );
    }
  });
});

describe('a code search the defaults empty', () => {
  it('says the course ran only in an ended term', async () => {
    const { text, data } = await tool(
      'search_courses',
      { filters: { searchText: { query: 'CS 2102' } } },
      AFTER_A,
    );
    expect(text).toContain(
      'CS 2102 ran only in A term, which has ended; includeEndedTerms: true shows it.',
    );
    expect(text).not.toContain('No matching courses');
    expect(data.leftOut).toEqual([
      { reason: 'endedTerms', codes: ['CS 2102'], terms: ['A'] },
    ]);
  });

  it('says the course is only an interest list so far', async () => {
    const { mcp } = await customEndpoints([
      {
        abbreviation: 'MA',
        name: 'Mathematical Sciences',
        courses: [
          course('MA-1024-2026', 'Calculus IV', [
            section(95, 'Interest List-D Term', 'D', [], 0, {
              isInterestList: true,
            }),
          ]),
        ],
      },
    ]);
    const { text } = await toolOn(mcp, 'search_courses', {
      filters: { searchText: { query: 'MA 1024' } },
    });
    expect(text).toContain(
      'MA 1024 has only an interest list so far (D term: a placeholder to join before sections open); includeInterestLists: true shows it.',
    );
  });
});

describe('an empty search with many filters', () => {
  it('tries every filter that can narrow, and names those that cannot', async () => {
    const { text, data } = await tool('search_courses', {
      filters: {
        department: { departments: ['CS'] },
        creditRange: { min: 0, max: 100 },
        graduateLevel: { level: 'all' },
        courseLevel: { min: 1, max: 9 },
        deliveryMode: { modes: ['In-Person', 'Online', 'Hybrid'] },
        offeringPattern: { categories: [1, 2, 3], includeUnknown: true },
        term: { terms: ['A'] },
        times: { mode: 'only', earliestStart: '22:00' },
      },
    });
    expect(data.total).toBe(0);
    expect(data.relaxations[0]).toMatchObject({ filter: 'times', total: 1 });
    expect(data.unrestrictive).toEqual([
      'creditRange',
      'graduateLevel',
      'courseLevel',
      'deliveryMode',
      'offeringPattern',
    ]);
    expect(text).toContain('Most restrictive: filters.times.');
    expect(text).toContain(
      'filters.creditRange, filters.graduateLevel, filters.courseLevel, filters.deliveryMode, filters.offeringPattern let every course through as given, so they are not to blame.',
    );
    expect(text).not.toContain('No single filter');
  });
});

describe('a filter that looks unrestrictive', () => {
  it('is tried when it drops a course the whole range would seem to keep', async () => {
    // A level range of 1-9 reads as every level, but a course number
    // without digits has no level and never passes it.
    const { mcp } = await customEndpoints([
      {
        abbreviation: 'ID',
        name: 'Interdisciplinary',
        courses: [
          course('ID-ISP-2026', 'Independent Study', [
            section(70, 'A01', 'A', []),
          ]),
          course('ID-2050-2026', 'Seminar', [section(71, 'A01', 'A', [])]),
        ],
      },
    ]);
    const { data } = await toolOn(mcp, 'search_courses', {
      filters: {
        searchText: { query: 'independent study' },
        courseLevel: { min: 1, max: 9 },
        graduateLevel: { level: 'all' },
      },
    });
    expect(data.total).toBe(0);
    expect(data.unrestrictive).toEqual(['graduateLevel']);
    expect(data.relaxations[0]).toMatchObject({
      filter: 'courseLevel',
      total: 1,
    });
  });
});

describe('courses lost through their labs', () => {
  const own = () =>
    customEndpoints([
      {
        abbreviation: 'ECE',
        name: 'Electrical and Computer Engineering',
        courses: [
          course('ECE-3849-2026', 'Real-Time Systems', [
            {
              section: section(100, 'BL01', 'B', [
                period(['M'], '09:00', '09:50'),
              ]),
              compatibleLabs: [
                // Clashes with CRN 102; the other has too few seats.
                section(103, 'BX01', 'B', [period(['T'], '14:00', '14:50')]),
                section(104, 'BX02', 'B', [period(['W'], '14:00', '14:50')], 1),
              ],
            },
          ]),
          course('ECE-2010-2026', 'Circuits', [
            {
              section: section(105, 'BL01', 'B', [
                period(['M'], '11:00', '11:50'),
              ]),
              compatibleLabs: [
                section(106, 'BX01', 'B', [
                  { ...period([], '', ''), isAsync: true },
                ]),
              ],
            },
          ]),
          course('ECE-1000-2026', 'Seminar', [
            section(102, 'B01', 'B', [period(['T'], '14:00', '14:50')]),
          ]),
        ],
      },
    ]);

  it('says when each lab fails a different filter', async () => {
    const { mcp } = await own();
    const { text, data } = await toolOn(mcp, 'search_courses', {
      filters: {
        availability: { minAvailable: 5 },
        periodConflict: { crns: [102] },
        department: { departments: ['ECE'] },
      },
    });
    expect(data.courses.map((c: { code: string }) => c.code)).not.toContain(
      'ECE 3849',
    );
    expect(text).toContain(
      '1 course dropped because none of its labs passes all of these filters together (filters.availability, filters.periodConflict): ECE 3849.',
    );
  });

  it('says a lab with no set times failed for having none', async () => {
    const { mcp } = await own();
    const { text } = await toolOn(mcp, 'search_courses', {
      filters: {
        times: { earliestStart: '08:00' },
        department: { departments: ['ECE'] },
      },
    });
    expect(text).toContain(
      '1 course dropped because its labs have no set meeting times (filters.times.includeAsync: true keeps them) (filters.times): ECE 2010.',
    );
  });
});

describe('years a course lookup cannot answer', () => {
  it('says which year a CRN is from when another is asked for', async () => {
    const past = await tool('get_course', { course: '1', year: 2025 });
    expect(past.isError).toBe(true);
    expect(past.text).toContain(
      'CRN 1 is CS 2102 section AL01 of 2026-27, not 2025-26.',
    );
    const early = await tool('get_course', { course: '6', year: 2026 });
    expect(early.text).toContain(
      'CRN 6 is MA 1021 section AL01 of 2027-28, not 2026-27.',
    );
  });

  it('forecasts only next year', async () => {
    for (const args of [
      { course: 'CS 2102', year: 2100 },
      { course: '1', year: 2030 },
    ]) {
      const far = await tool('get_course', args);
      expect(far.isError).toBe(true);
      expect(far.text).toContain(
        'Only next year (2027, 2027-28) can be forecast',
      );
    }
    const next = await tool('get_course', { course: 'CS 2102', year: 2027 });
    expect(next.isError).toBe(false);
  });

  it('says a year with no data is not in the catalog, rather than not offered', async () => {
    const code = await tool('get_course', { course: 'CS 2102', year: 2025 });
    expect(code.text).toBe(
      '2025-26 is not in this catalog (it covers 2026-27 and early 2027-28 entries), so nothing can be said about it here.',
    );
    const id = await tool('get_course', { course: 'CS-2102-1999' });
    expect(id.text).toContain('1999-00 is not in this catalog');
    // A year the catalog has, without the course: the usual answer.
    const missing = await tool('get_course', { course: 'CS-9999-2026' });
    expect(missing.text).toContain('No course CS 9999 in 2026-27.');
  });

  it('reads a CRN with leading zeros as the CRN', async () => {
    const { text } = await tool('get_course', { course: 'CRN0000001' });
    expect(text).toContain('CRN 1 is CS 2102 section AL01');
  });
});

describe('schema messages', () => {
  it('refuses a minimum above its maximum', async () => {
    for (const [min, max] of [
      ['minRating', 'maxRating'],
      ['minDifficulty', 'maxDifficulty'],
      ['minWouldTakeAgain', 'maxWouldTakeAgain'],
    ]) {
      const result = await tool('search_courses', {
        filters: { rmpRating: { [min]: 4, [max]: 2 } },
      });
      expect(result.isError).toBe(true);
      expect(result.text).toContain(`${max} must be at least ${min}`);
    }
  });

  it('explains a latestEnd that leaves no time, and takes 24:00 as an end', async () => {
    const early = await tool('search_courses', {
      filters: { times: { latestEnd: '00:00' } },
    });
    expect(early.isError).toBe(true);
    expect(early.text).toContain('latestEnd "00:00" leaves no time in the day');
    const late = await tool('search_courses', {
      filters: { times: { earliestStart: '17:00', latestEnd: '24:00' } },
    });
    expect(late.isError).toBe(false);
    expect(late.text).toContain(
      'Times read as: only within every day 17:00-24:00.',
    );
    const busy = await tool('check_conflicts', {
      crns: [40],
      busy: [{ days: ['M'], start: '18:00', end: '24:00' }],
    });
    expect(busy.isError).toBe(false);
    expect(busy.text).toContain('BUSY PSY 1400 B01');
  });

  it('takes "ALL" for every year, and names what a year or category must be', async () => {
    const all = await tool('search_courses', {
      filters: { academicYear: { year: 'ALL' } },
    });
    expect(all.isError).toBe(false);
    expect(all.data.year).toBe('all');
    const bad = await tool('search_courses', {
      filters: { academicYear: { year: 'next' } },
    });
    expect(bad.text).toContain(
      'year is a fall year as a number (2026 for 2026-27) or "all"',
    );
    const category = await tool('search_courses', {
      filters: { offeringPattern: { categories: [4] } },
    });
    expect(category.text).toContain(
      'offering categories are 1 (every year), 2 (every other year) or 3 (occasionally)',
    );
  });
});

describe('search words', () => {
  it('suggests an accented instructor for a name typed without accents', async () => {
    const { mcp } = await customEndpoints([
      {
        abbreviation: 'PH',
        name: 'Physics',
        courses: [
          course('PH-2201-2026', 'Optics', [
            section(110, 'B01', 'B', [
              period(['M'], '09:00', '09:50', ['EJ Néel']),
            ]),
          ]),
        ],
      },
    ]);
    const { text } = await toolOn(mcp, 'search_courses', {
      filters: { searchText: { query: 'Neeel', professorOnly: true } },
    });
    expect(text).toContain('did you mean EJ Néel?');
  });

  it('says which words past the cap were ignored', async () => {
    const words = Array.from({ length: 14 }, (_, i) => `topic${i}`);
    const { text } = await tool('search_courses', {
      filters: { searchText: { query: words.join(' ') } },
    });
    expect(text).toContain(
      'Searched by the first 12 distinct words; ignored: topic12 topic13.',
    );
  });
});

describe('internal errors', () => {
  it('logs the real error and tells the model only that one happened', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = () =>
      Promise.reject(new TypeError('word.toLowerCase is not a function'));
    const mcp = createMcpEndpoint(broken);
    for (const name of ['search_courses', 'get_catalog_info']) {
      const args = name === 'search_courses' ? { filters: {} } : {};
      const result = await toolOn(mcp, name, args);
      expect(result.isError).toBe(true);
      expect(result.text).toBe(
        `Internal error while running ${name}; try a simpler query, or try again later.`,
      );
    }
    const api = createApiHandler({ basePath: BASE, getCatalog: broken });
    const http = await callOn(api, '/meta');
    expect(http).toEqual({
      status: 500,
      body: { error: 'Internal server error' },
    });
    expect(String(quiet.mock.calls[0][1])).toContain('word.toLowerCase');
    quiet.mockRestore();
  });

  it('does not advertise tool list changes it can never send', async () => {
    const init = await rpcOn(endpoints(BEFORE_A).mcp, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(init.capabilities.tools.listChanged).toBe(false);
  });
});

describe('tool schemas', () => {
  it('still lists the terms and modes a caller may give, in any case', async () => {
    const { tools } = await rpcOn(endpoints(BEFORE_A).mcp, 'tools/list', {});
    const search = tools.find(
      (t: { name: string }) => t.name === 'search_courses',
    );
    const filters = search.inputSchema.properties.filters.properties;
    expect(filters.term.properties.terms.items.enum).toEqual([
      'A',
      'B',
      'C',
      'D',
      'F',
      'S',
    ]);
    expect(filters.deliveryMode.properties.modes.items.enum).toEqual([
      'In-Person',
      'Online',
      'Hybrid',
    ]);
    const lower = await tool('get_course', { course: 'PH 1110', terms: ['b'] });
    expect(lower.isError).toBe(false);
  });
});
