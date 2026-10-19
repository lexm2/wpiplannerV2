/**
 * The course MCP server: its tools, and the compact text each returns for a
 * model to read (src/mcp/render.ts), over the same fixture as the HTTP
 * tests.
 */
import { describe, expect, it } from 'vitest';
import { AFTER_A, BEFORE_A, endpoints, rpcOn, tool } from './courseApiFixture';

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
    expect(text).toContain('Degree attributes: none | Cross-listed: none');
    expect(text).toContain(
      'Prerequisites: none stated in the catalog description.',
    );
    expect(text).toContain('Recommended background: none stated.');
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
      'One section, so no times to compare. They make a valid set to register in Workday.',
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
    expect(early.text).toContain('only early entries (1 course)');
  });
});
