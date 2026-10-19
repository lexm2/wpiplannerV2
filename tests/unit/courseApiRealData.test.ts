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

const source = new CatalogSource({
  publicDir: join(import.meta.dirname, '../../public'),
});
const mcp = createMcpEndpoint(() => source.get());
let catalog: Catalog;

beforeAll(async () => {
  catalog = await source.get();
});

async function toolText(name: string, args: unknown): Promise<string> {
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
  return JSON.parse(data ? data.slice(6) : body).result.content[0].text;
}

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

  const search = (query: string, limit = 25) =>
    runCourseQuery(
      catalog,
      CourseQuerySchema.parse({
        filters: { searchText: { query } },
        includeEndedTerms: true,
        limit,
      }),
    );

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
