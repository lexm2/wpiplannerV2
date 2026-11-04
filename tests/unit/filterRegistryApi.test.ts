/**
 * The course API offers whatever the filter registry holds. Here the
 * registry gains a filter that src/api/filterInputs.ts has no entry for
 * (seatsLeft) and loses one it has (offeringPattern): the new one is
 * searchable as its own criteria, in the POST body, as GET JSON and in the
 * MCP tool's schema, with its own rules; the removed one is refused like
 * any unknown key.
 */
import { describe, expect, it, vi } from 'vitest';
import type * as Zod from 'zod';
import type * as Filters from '../../src/core/filtering/filters';

vi.mock('../../src/core/filtering/filters', async importOriginal => {
  const real = await importOriginal<typeof Filters>();
  const z = await import('zod');

  const criteria = z
    .object({
      min: z.number().int().min(0),
      max: z.number().int(),
    })
    .refine(c => c.max >= c.min, 'max must be at least min')
    .describe('Keep sections with between min and max open seats.');

  class SeatsLeftFilter {
    static readonly id = 'seatsLeft';
    static readonly criteria = criteria;
    readonly id = SeatsLeftFilter.id;
    readonly criteria = SeatsLeftFilter.criteria;
    readonly name = 'Seats left';
    readonly description = 'Sections by their open seats';
    readonly priority = 50;

    apply(
      sections: { section: { seatsAvailable: number } }[],
      c: Zod.output<typeof criteria>,
    ) {
      return sections.filter(
        fs =>
          fs.section.seatsAvailable >= c.min &&
          fs.section.seatsAvailable <= c.max,
      );
    }

    getDisplayValue(c: Zod.output<typeof criteria>) {
      return `${c.min}-${c.max} seats left`;
    }
  }

  const FILTERS = [
    ...real.FILTERS.filter(F => F.id !== 'offeringPattern'),
    SeatsLeftFilter,
  ] as unknown as typeof real.FILTERS;
  return {
    ...real,
    FILTERS,
    createFilters: (deps: Filters.FilterDeps) => FILTERS.map(F => new F(deps)),
  };
});

import { BEFORE_A, call, codes, endpoints, rpcOn } from './courseApiFixture';

const search = (filters: unknown) => call('/courses/search', { filters });

describe('a filter added to the registry', () => {
  it('is searchable as its own criteria and run by the filter', async () => {
    const added = await search({ seatsLeft: { min: 1, max: 1000 } });
    // The same sections as the availability filter's minimum.
    const known = await search({ availability: { minAvailable: 1 } });
    expect(added.status).toBe(200);
    expect(added.body).toEqual(known.body);
    expect(codes(added.body).length).toBeGreaterThan(0);

    const none = await search({ seatsLeft: { min: 999, max: 1000 } });
    expect(codes(none.body)).toEqual([]);
    expect(
      none.body.relaxations.map((r: { filter: string }) => r.filter),
    ).toEqual(['seatsLeft']);
  });

  it('is read from GET as JSON under its id', async () => {
    const json = encodeURIComponent(JSON.stringify({ min: 1, max: 1000 }));
    const get = await call(`/courses?seatsLeft=${json}`);
    const post = await search({ seatsLeft: { min: 1, max: 1000 } });
    expect(get.status).toBe(200);
    expect(get.body).toEqual(post.body);

    const notObject = await call('/courses?seatsLeft=5');
    expect(notObject.status).toBe(400);
    expect(notObject.body.error).toContain('seatsLeft must be a JSON object');
  });

  it("keeps the filter's own rules, and says which keys it takes", async () => {
    const backwards = await search({ seatsLeft: { min: 5, max: 1 } });
    expect(backwards.status).toBe(400);
    expect(JSON.stringify(backwards.body.details)).toContain(
      'max must be at least min',
    );

    const typo = await search({ seatsLeft: { min: 1, max: 5, maxx: 6 } });
    expect(typo.status).toBe(400);
    expect(typo.body.details[0].message).toContain(
      'Accepted in filters.seatsLeft: min, max.',
    );
  });

  it("is in the MCP search tool's schema, described", async () => {
    const { tools } = await rpcOn(endpoints(BEFORE_A).mcp, 'tools/list', {});
    const searchTool = tools.find(
      (t: { name: string }) => t.name === 'search_courses',
    );
    const filters = searchTool.inputSchema.properties.filters.properties;
    expect(filters.seatsLeft.description).toBe(
      'Keep sections with between min and max open seats.',
    );
    expect(Object.keys(filters.seatsLeft.properties)).toEqual(['min', 'max']);
    expect(filters.offeringPattern).toBeUndefined();
  });
});

describe('a filter removed from the registry', () => {
  it('is refused in the body and as a GET parameter', async () => {
    const body = await search({ offeringPattern: { categories: [1] } });
    expect(body.status).toBe(400);
    expect(body.body.details[0].message).toContain(
      'Unknown key "offeringPattern" in filters',
    );

    const get = await call('/courses?offeringPattern=1');
    expect(get.status).toBe(400);
    expect(get.body.error).toContain('Unknown parameter: offeringPattern');
  });
});
