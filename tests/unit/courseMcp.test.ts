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
    expect(result.text).toContain('Seats as of 2026-09-02');
    expect(result.text).toContain('1. PH 1110 General Physics | 3 cr | B');
    expect(result.text).toContain(
      'BL01 CRN 20 B | MTRF 09:00-09:50 | Ada Lovelace RMP 4.5 (12) | 10/30 open',
    );
    // Without section-level filters, rows stay one line.
    const plain = await tool('search_courses', { filters: {} });
    expect(plain.text).not.toContain('CRN');
  });

  it('splits seats by term, totals every page, and warns of low counts', async () => {
    const { text } = await tool('search_courses', {
      filters: { department: { departments: ['MA', 'DS'] } },
    });
    expect(text).toContain(
      '2. MA 1021 Calculus I | 3 cr | A,C | A FULL 30/30 · C 10/30 open',
    );
    expect(text).toContain(
      'All 2 matching courses, every page: 20 open seats in 3 sections (cross-listed sections counted once).',
    );
    expect(text).not.toContain('low counts');
    const low = await tool('search_courses', {
      filters: { department: { departments: ['RBE'] } },
    });
    expect(low.text).toContain(
      'Seat counts are from 2026-09-02; low counts (3 or fewer) may already be gone.',
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

  it('names the right place for a key given in the wrong one', async () => {
    const { text, isError } = await tool('search_courses', {
      filters: { earliestStart: '17:00' },
    });
    expect(isError).toBe(true);
    expect(text).toContain('it goes in filters.times.earliestStart');
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
    expect(text.length).toBeLessThan(1500);
    expect(data.sections).toHaveLength(4);
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
    const crn = await tool('check_conflicts', { crns: [1, 42] });
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
      'could be MA (Mathematical Sciences), CS (Computer Science), DS (Data Science)',
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
    expect(one.text).toContain('nothing to compare');
  });

  it('explains an empty or early year of departments', async () => {
    const none = await tool('list_departments', { year: 2030 });
    expect(none.isError).toBe(true);
    expect(none.text).toContain('not published yet');
    const early = await tool('list_departments', { year: 2027 });
    expect(early.text).toContain('only early entries (1 course)');
  });
});
