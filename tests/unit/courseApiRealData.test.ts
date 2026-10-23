/**
 * Budgets and rankings on the real catalog in public/: the MCP text a model
 * reads must stay small, and the searches students actually typed must put
 * the right course on top. Invariants of WPI's catalog, not of one refresh.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { CatalogSource, type Catalog } from '../../src/api/catalog';
import { CourseQuerySchema, runCourseQuery } from '../../src/api/query';
import { createMcpEndpoint } from '../../src/mcp/server';
import { resolveDepartments } from '../../src/api/lookup';
import { findConflicts } from '../../src/api/conflicts';
import type { ApiError } from '../../src/api/errors';

const source = new CatalogSource({
  publicDir: join(import.meta.dirname, '../../public'),
});
const mcp = createMcpEndpoint(() => source.get());
let catalog: Catalog;

beforeAll(async () => {
  catalog = await source.get();
});

async function toolText(name: string, args: unknown): Promise<string> {
  return (await toolResult(name, args)).text;
}

async function toolResult(
  name: string,
  args: unknown,
): Promise<{ text: string; data: unknown }> {
  const response = await mcp.fetch(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    }),
  );
  const body = await response.text();
  const data = body.split('\n').find(line => line.startsWith('data: '));
  const result = JSON.parse(data ? data.slice(6) : body).result;
  return { text: result.content[0].text, data: result.structuredContent };
}

const search = (query: string, limit = 25) =>
  runCourseQuery(
    catalog,
    CourseQuerySchema.parse({
      filters: { searchText: { query } },
      includeEndedTerms: true,
      limit,
    }),
  );

const top = (query: string, n = 3) =>
  runCourseQuery(
    catalog,
    CourseQuerySchema.parse({
      filters: { searchText: { query } },
      includeEndedTerms: true,
      limit: n,
    }),
  ).courses.map(c => c.code);

describe('MCP output size', () => {
  it('keeps the busiest courses well under 10 KB of text', async () => {
    for (const course of ['MA 1021', 'MA 1022']) {
      const text = await toolText('get_course', { course });
      expect(text.startsWith('{')).toBe(false);
      expect(text.length).toBeLessThan(10_000);
    }
  });

  it('sends get_course data no bigger than the view the text shows', async () => {
    const { text, data } = await toolResult('get_course', {
      course: 'MA 1022',
    });
    const json = JSON.stringify(data);
    expect(json.length).toBeLessThan(Math.min(2.5 * text.length, 12_000));
    // The same sections as the text: no ended A term, no interest lists.
    const sections = (data as { sections: { crn: number; term: string }[] })
      .sections;
    expect(sections.some(s => s.term === 'A')).toBe(false);
    for (const s of sections) expect(text).toContain(`CRN ${s.crn}`);
  });

  it('keeps a page of 25 search rows compact', async () => {
    const text = await toolText('search_courses', {
      filters: { department: { departments: ['CS'] } },
    });
    expect(text.split('\n').length).toBeLessThan(35);
    expect(text.length).toBeLessThan(6_000);
  });
});

describe('ranking on the real catalog', () => {
  it('puts the course a code names first', () => {
    expect(top('MA 1022', 1)).toEqual(['MA 1022']);
    expect(top('ma1022', 1)).toEqual(['MA 1022']);
  });

  it('puts RBE 1001 at the top for robotics, typos included', () => {
    for (const q of ['robotics', 'robtics', 'robotcs']) {
      expect(top(q)).toContain('RBE 1001');
    }
  });

  it('puts game design courses above descriptions that mention it', () => {
    expect(top('game design', 1)[0]).toMatch(/^IMGD /);
  });

  it('reads AI as a word and as Artificial Intelligence, not inside words', () => {
    const ai = search('AI');
    const names = ai.courses.map(c => c.name);
    expect(ai.total).toBeLessThan(100);
    expect(ai.courses.map(c => c.code)).toContain('CS 4341');
    expect(names.some(n => /aircraft|air breathing|aided/i.test(n))).toBe(
      false,
    );
    expect(search('PE').total).toBeLessThan(50);
  });

  it('puts the undergraduate AI courses a first-year can take first', () => {
    const ai = search('AI', 12);
    const codes = ai.courses.map(c => c.code);
    // "Artificial Intelligence" spelled out ranks with "AI" itself.
    expect(codes.slice(0, 2)).toContain('DS 1010');
    expect(codes).toContain('CS 4341');
    const graduate = ai.courses.map(c => c.isGraduate);
    expect(graduate.indexOf(true)).toBeGreaterThan(graduate.lastIndexOf(false));
    expect(ai.notices).toContain('"AI" read as AI or artificial intelligence.');
  });

  it('ranks calculus by number and numeral, whatever the spelling', () => {
    for (const q of ['calculus', 'calc 1', 'calculus 1', 'calc I']) {
      expect(top(q, 1), q).toEqual(['MA 1021']);
    }
    for (const q of ['calc 2', 'calculus 2', 'MA 1022 calculus']) {
      expect(top(q, 1), q).toEqual(['MA 1022']);
    }
  });

  it('reads every spelling of a code alike, and labels mere mentions', () => {
    const totals = ['MA 1022', 'MA-1022', 'MA_1022', 'ma1o22'].map(
      q => search(q).total,
    );
    expect(new Set(totals).size).toBe(1);
    const rows = search('MA 1022').courses;
    expect(rows[0]).toMatchObject({ code: 'MA 1022', match: 'code' });
    expect(rows.slice(1).every(r => r.match === 'mentions')).toBe(true);
  });

  it('puts introductory courses first for a broad topic or a department', () => {
    expect(top('computer science', 5)).toContain('CS 1101');
    expect(top('statistics', 1)[0]).toMatch(/^MA [1-4]/);
  });

  it('says when no course is mainly about the words', () => {
    const weak = search('procedural generation');
    expect(weak.total).toBeGreaterThan(0);
    expect(weak.search?.onlyMentions).toBe(true);
    expect(search('machine learning').search?.onlyMentions).toBe(false);
  });
});

describe('loose searches on the real catalog', () => {
  it('lists only the closest few when several words match only descriptions', () => {
    const loose = runCourseQuery(
      catalog,
      CourseQuerySchema.parse({
        filters: { searchText: { query: 'alternate years' } },
      }),
    );
    expect(loose.total).toBeGreaterThan(20);
    expect(loose.courses).toHaveLength(5);
    expect(loose.search?.descriptionOnly).toBe(true);
    expect(loose.notices.join(' ')).toContain('listing the closest 5 of');
    // An explicit limit, and a search matching names, are not capped.
    const asked = runCourseQuery(
      catalog,
      CourseQuerySchema.parse({
        filters: { searchText: { query: 'alternate years' } },
        limit: 25,
      }),
    );
    expect(asked.courses).toHaveLength(25);
    expect(search('game design').courses.length).toBe(25);
  });
});

describe('known terms on the real catalog', () => {
  it('names the catalog courses an IQP or HUA search means', () => {
    const iqp = search('IQP', 5);
    expect(iqp.notices[0]).toContain('Catalog courses named for it: ID 2050');
    expect(iqp.courses[0].code).toBe('ID 2050');
    const hua = search('HUA', 5);
    expect(hua.notices[0]).toContain(
      'HU 3900 Inquiry Seminar In Humanities And Arts',
    );
    expect(hua.notices[0]).toContain(
      'HU 3910 Practicum In Humanities And Arts',
    );
  });
});

describe('department names on the real catalog', () => {
  it('reads "and" as the catalog\'s "&", in a filter and in a search', () => {
    expect(
      resolveDepartments(catalog, ['Interactive Media and Game Development'])
        .abbrs,
    ).toEqual(['IMGD']);
    const result = top('Interactive Media and Game Development', 5);
    expect(result.every(code => code.startsWith('IMGD '))).toBe(true);
  });

  it('suggests the department whose abbreviation or initials hold the letters first', () => {
    let error: unknown;
    try {
      resolveDepartments(catalog, ['PE']);
    } catch (e) {
      error = e;
    }
    const { candidates } = (error as ApiError).details as {
      candidates: string[];
    };
    // WPE is Wellness & Physical Education; edit-distance neighbours after.
    expect(candidates[0]).toBe('WPE');
    expect(candidates).not.toContain('OIE');
  });
});

describe('search results agree with themselves', () => {
  it('keeps no course on an interest list alone', () => {
    // WPI lists interest lists as Online, so these once matched placeholders.
    for (const filters of [
      { deliveryMode: { modes: ['Online'] }, term: { terms: ['C', 'D'] } },
      {
        deliveryMode: { modes: ['Online', 'Hybrid'] },
        courseLevel: { min: 2, max: 4 },
      },
    ]) {
      const result = runCourseQuery(
        catalog,
        CourseQuerySchema.parse({ filters, limit: 200 }),
      );
      expect(result.courses.length).toBe(result.total);
      for (const row of result.courses) {
        expect(row.sections?.length, row.code).toBeGreaterThan(0);
        expect(row.terms.length, row.code).toBeGreaterThan(0);
      }
    }
  });
});

describe('alternating years on the real catalog', () => {
  it('reads ME 3501 as off in 2027-28, citing its description', async () => {
    const text = await toolText('get_course', {
      course: 'ME 3501',
      year: 2027,
    });
    expect(text).toContain(
      'Alternating years; runs in 2026-27, so likely not offered in 2027-28 (the catalog description: "This course will be offered in 2020-21, and in alternating years thereafter.")',
    );
  });

  it('reads every alternating-years statement in the descriptions', () => {
    const mentions = catalog.courses.filter(c =>
      /offered in \d{4}.{0,30}alternat\w* years thereafter/i.test(
        c.description,
      ),
    );
    expect(mentions.length).toBeGreaterThan(50);
    for (const c of mentions) {
      expect(
        c.alternatingYears,
        `${c.departmentAbbr} ${c.number}`,
      ).toBeTruthy();
    }
  });
});

describe('section dates on the real catalog', () => {
  it('never calls sections whose dates do not meet a conflict', () => {
    // BB 3813's half-term labs: BX01 to Nov 12, BX02 from Nov 16, same
    // days and times.
    const pairs: [number, number][] = [];
    for (const course of catalog.courses) {
      const sections = (course.standaloneLabs ?? []).filter(s => s.startDate);
      for (const a of sections) {
        for (const b of sections) {
          if (a.crn < b.crn && a.computedTerm === b.computedTerm) {
            if (a.endDate < b.startDate || b.endDate < a.startDate) {
              pairs.push([a.crn, b.crn]);
            }
          }
        }
      }
    }
    expect(pairs.length).toBeGreaterThan(0);
    for (const crns of pairs) {
      expect(findConflicts(catalog, crns).conflicts, String(crns)).toEqual([]);
    }
  });

  it("prints a half-semester section's own dates", async () => {
    const section = [...catalog.sectionsByCrn.values()].find(
      e =>
        e.section.computedTerm === 'F' &&
        e.courses[0].academicYear === 2026 &&
        e.section.endDate &&
        e.section.endDate < '2026-12-01',
    );
    expect(section).toBeDefined();
    const course = section!.courses[0];
    const text = await toolText('get_course', {
      course: `${course.departmentAbbr} ${course.number}`,
    });
    expect(text).toContain(
      `CRN ${section!.section.crn} | runs ${section!.section.startDate} to ${section!.section.endDate}`,
    );
  });
});

describe('omitted full sections on the real catalog', () => {
  it('counts every full MA 1022 section of a term once, placeholders aside', async () => {
    const course = catalog.courses.find(
      c => c.id === `MA-1022-${catalog.years[0]}`,
    )!;
    const terms = [
      ...new Set(
        [...catalog.sectionsByCrn.values()]
          .filter(e => e.courses.includes(course))
          .map(e => e.section.computedTerm as string),
      ),
    ];
    for (const term of terms) {
      const full = new Set(
        [...catalog.sectionsByCrn.values()]
          .filter(
            e =>
              e.courses.includes(course) &&
              e.section.computedTerm === term &&
              !e.section.isInterestList &&
              e.section.seatsAvailable <= 0,
          )
          .map(e => e.section.crn),
      );
      const { data } = await toolResult('get_course', {
        course: 'MA 1022',
        includeFull: false,
        terms: [term],
      });
      expect(
        (data as { omitted: { fullSections: number } }).omitted.fullSections,
        term,
      ).toBe(full.size);
    }
  });
});
