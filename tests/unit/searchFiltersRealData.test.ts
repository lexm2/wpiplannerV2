/**
 * The shared search, times and rating filters on the real catalog in
 * public/: the cases students and testers hit, as invariants of WPI's
 * catalog and ratings rather than of one refresh.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CatalogSource, type Catalog } from '../../src/api/catalog';
import { CourseQuerySchema, runCourseQuery } from '../../src/api/query';
import { RMPRatingFilter } from '../../src/core/filtering/filters/RMPRatingFilter';
import type { RMPRatingFilterCriteria } from '../../src/types/filters';
import type { FilterableSection } from '../../src/types/filterableUnit';
import { SectionType } from '../../src/types/types';
import type { Professor } from '../../src/types/rateMyProfessor';
import { getAllSections } from '../../src/utils/courseUtils';
import { foldText } from '../../src/utils/searchUtils';

const publicDir = join(import.meta.dirname, '../../public');
const source = new CatalogSource({ publicDir });
let catalog: Catalog;

beforeAll(async () => {
  catalog = await source.get();
});

const run = (filters: object, limit = 25) =>
  runCourseQuery(
    catalog,
    CourseQuerySchema.parse({ filters, includeEndedTerms: true, limit }),
  );
const search = (query: string, limit = 25) =>
  run({ searchText: { query } }, limit);
const top = (query: string, n = 3) => search(query, n).courses.map(c => c.code);

describe('search on the real catalog', () => {
  it('takes words that name object members as words', () => {
    for (const q of ['constructor', 'toString', 'hasOwnProperty']) {
      expect(() => search(q)).not.toThrow();
    }
  });

  it('finds accented instructors typed without accents', () => {
    const professorOnly = (query: string) =>
      run({ searchText: { query, professorOnly: true } }).total;
    const accented = new Set(
      catalog.courses.flatMap(c =>
        getAllSections(c).flatMap(sec =>
          sec.periods.flatMap(p => p.professor.split(/\s*;\s*/)),
        ),
      ),
    );
    for (const name of [...accented].filter(n => /[^\p{ASCII}]/u.test(n))) {
      const plain = foldText(name);
      expect(professorOnly(plain), name).toBe(professorOnly(name));
      expect(professorOnly(plain), name).toBeGreaterThan(0);
    }
  });

  it('answers a query of thousands of words quickly', () => {
    const words = Array.from({ length: 3000 }, (_, i) => `word${i}`);
    for (const query of [
      words.join(' '),
      Array(3000).fill('design').join(' '),
    ]) {
      const start = performance.now();
      search(query);
      expect(performance.now() - start).toBeLessThan(1000);
    }
  });

  it('lists a department by number', () => {
    for (const q of ['CS', 'computer science']) {
      const codes = search(q, 6).courses.map(c => Number(c.code.split(' ')[1]));
      expect(codes.every(n => String(n).length === 4)).toBe(true);
      expect(codes).toEqual([...codes].sort((a, b) => a - b));
    }
  });

  it('reads a department and one digit as a code prefix', () => {
    for (const q of ['CS2', 'CS 2']) {
      const rows = search(q, 50);
      expect(rows.total).toBeGreaterThan(5);
      expect(rows.courses.every(c => /^CS 2\d{3}/.test(c.code))).toBe(true);
    }
  });

  it('reads field acronyms as the subjects they name', () => {
    expect(top('OS', 2)).toEqual(expect.arrayContaining(['CS 3013']));
    expect(top('NLP', 2)).toContain('CS 4344');
    expect(top('AI', 6)).toContain('DS 1010');
    // A department code still lists its department.
    expect(top('MA', 3).every(c => c.startsWith('MA '))).toBe(true);
    expect(top('ML', 3).every(c => c.startsWith('ML '))).toBe(true);
    // PE is no field name here: no Project Evaluation or Power Electronics.
    const pe = search('PE', 50).courses.map(c => c.name);
    expect(pe.some(n => /project evaluation|power electronics/i.test(n))).toBe(
      false,
    );
  });

  it('puts statistics first for "stats", and no statics', () => {
    const rows = search('stats', 10).courses;
    expect(rows[0].name).toMatch(/statistic/i);
    expect(rows.some(r => /static|statement/i.test(r.name))).toBe(false);
  });

  it('ranks names that spell the query loosely', () => {
    expect(top('intro to programming', 3)).toContain('CS 1101');
    expect(top('machine lerning', 1)).toEqual(['CS 4342']);
    expect(top('acounting', 1)).toEqual(['ACC 2060']);
  });

  it('takes no common word from a room name', () => {
    // "lab" from a section's type is fine; from a building's name it is not.
    const rows = search('physics with lab', 100).courses;
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.slice(0, 5).every(r => r.code.startsWith('PH '))).toBe(true);
  });
});

describe('times on the real catalog', () => {
  it('keeps every course when avoiding times nothing meets in', () => {
    const all = run({}).total;
    expect(run({ times: { mode: 'avoid', days: ['U'] } }).total).toBe(all);
    expect(
      run({
        times: { mode: 'avoid', earliestStart: '03:00', latestEnd: '04:00' },
      }).total,
    ).toBe(all);
  });
});

describe('ratings on the real catalog', () => {
  it('rates a professor listed twice by the profile with most ratings', () => {
    const { professors } = JSON.parse(
      readFileSync(join(publicDir, 'rateMyProfessor.json'), 'utf8'),
    ) as { professors: Professor[] };
    const byName = new Map<string, Professor[]>();
    for (const p of professors) {
      const name = foldText(`${p.firstName} ${p.lastName}`).replace(
        /\s+/g,
        ' ',
      );
      byName.set(name, [...(byName.get(name) ?? []), p]);
    }
    const twice = [...byName].filter(([, ps]) => ps.length > 1);
    for (const [name, ps] of twice) {
      const most = Math.max(...ps.map(p => p.numRatings));
      expect(catalog.rmp.getRatings(name)?.numRatings ?? 0, name).toBe(most);
    }
  });

  it('reads an unknown would-take-again share as no data', () => {
    const lookups = catalog.courses.flatMap(c =>
      (c.lectures ?? []).flatMap(l =>
        l.section.periods.flatMap(p => p.professor.split(/\s*;\s*/)),
      ),
    );
    for (const name of new Set(lookups)) {
      const wta = catalog.rmp.getRatings(name)?.wouldTakeAgain;
      if (wta !== undefined && wta !== null)
        expect(wta).toBeGreaterThanOrEqual(0);
    }
  });

  /** Lectures with two instructors or more, as the filter sees them. */
  function coTaught(): FilterableSection[] {
    return [...catalog.sectionsByCrn.values()]
      .map(e => e.filterable)
      .filter(
        fs =>
          fs.sectionType === SectionType.LECTURE &&
          fs.section.periods.some(p => p.professor.includes(';')),
      );
  }

  it('passes a co-taught lecture when any instructor passes', () => {
    const lectures = coTaught();
    expect(lectures.length).toBeGreaterThan(10);
    const filter = new RMPRatingFilter(catalog.rmp);
    const cases: [RMPRatingFilterCriteria, (r: Ratings) => boolean][] = [
      [{ minRating: 4, includeWithoutData: false }, r => r.rating >= 4],
      [
        { minNumRatings: 10, includeWithoutData: false },
        r => r.numRatings >= 10,
      ],
      [{ includeWithoutData: false }, () => true],
    ];
    for (const [criteria, passes] of cases) {
      for (const fs of lectures) {
        const names = fs.section.periods.flatMap(p =>
          p.professor.split(/\s*;\s*/),
        );
        const want = names.some(name => {
          const r = catalog.rmp.getRatings(name);
          return r !== null && passes(r);
        });
        const kept = filter.apply([fs], criteria).length === 1;
        expect(kept, `${fs.section.crn} ${names.join('; ')}`).toBe(want);
      }
    }
  });
});

type Ratings = NonNullable<ReturnType<Catalog['rmp']['getRatings']>>;
