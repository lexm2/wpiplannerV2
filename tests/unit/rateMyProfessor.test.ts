/**
 * RateMyProfessorService name matching and RMPRatingFilter's handling of
 * sections with no listed instructor.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RateMyProfessorService } from '../../src/services/external/RateMyProfessorService';
import { RMPRatingFilter } from '../../src/core/filtering/filters/RMPRatingFilter';
import type { Professor } from '../../src/types/rateMyProfessor';
import type { FilterableSection } from '../../src/types/filterableUnit';

let nextId = 1;
function prof(firstName: string, lastName: string, avgRating = 4): Professor {
  const id = nextId++;
  return {
    id: String(id),
    legacyId: id,
    firstName,
    lastName,
    department: 'CS',
    avgRating,
    avgDifficulty: 3,
    numRatings: 10,
    wouldTakeAgainPercent: null,
    profileUrl: `https://example.test/${id}`,
  };
}

function mockFetch(professors: Professor[]) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          lastUpdated: '2026-01-01',
          school: { id: 'wpi', name: 'WPI' },
          professors,
          totalProfessors: professors.length,
        }),
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function serviceWith(professors: Professor[]) {
  mockFetch(professors);
  const service = new RateMyProfessorService();
  await service.loadData();
  return service;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RateMyProfessorService.findProfessor', () => {
  it('matches an exact full name', async () => {
    const curran = prof('Amy', 'Curran');
    const service = await serviceWith([curran]);
    expect(service.findProfessor('Amy Curran')?.id).toBe(curran.id);
  });

  it('looks up each instructor of a co-taught section', async () => {
    const susanin = prof('Laura', 'Susanin');
    const service = await serviceWith([susanin]);
    expect(service.findProfessor('Amy Curran; Laura Susanin')?.id).toBe(
      susanin.id,
    );
  });

  it('uses the first co-instructor that matches', async () => {
    const curran = prof('Amy', 'Curran');
    const service = await serviceWith([curran, prof('Laura', 'Susanin')]);
    expect(service.findProfessor('Amy Curran; Laura Susanin')?.id).toBe(
      curran.id,
    );
  });

  it('prefers the co-instructor with the most ratings', async () => {
    const farzin = { ...prof('Shahin', 'Farzin', 0), numRatings: 0 };
    const elKorchi = { ...prof('Tahar', 'El-Korchi', 3.1), numRatings: 21 };
    const service = await serviceWith([farzin, elKorchi]);
    expect(service.findProfessor('Shahin Farzin; Tahar El-Korchi')?.id).toBe(
      elKorchi.id,
    );
    expect(
      service.getRatingDisplay('Shahin Farzin; Tahar El-Korchi')?.rating,
    ).toBe('3.1');
  });

  it('rejects a lone last-name match with a different first name', async () => {
    const service = await serviceWith([prof('Alice', 'Smith')]);
    expect(service.findProfessor('John Smith')).toBeNull();
  });

  it('rejects every candidate when none has a compatible first name', async () => {
    const service = await serviceWith([
      prof('Alice', 'Smith'),
      prof('Mary', 'Smith'),
    ]);
    expect(service.findProfessor('John Smith')).toBeNull();
  });

  it('accepts initials, short forms, and near spellings', async () => {
    const john = prof('John', 'Smith');
    const service = await serviceWith([prof('Alice', 'Smith'), john]);
    expect(service.findProfessor('J. Smith')?.id).toBe(john.id);
    expect(service.findProfessor('Jon Smith')?.id).toBe(john.id);
    expect(service.findProfessor('Smith, Johnathan')?.id).toBe(john.id);
  });

  it('accepts a last name alone', async () => {
    const curran = prof('Amy', 'Curran');
    const service = await serviceWith([curran]);
    expect(service.findProfessor('Curran')?.id).toBe(curran.id);
  });

  it('shares one fetch between concurrent loads', async () => {
    const fetchMock = mockFetch([prof('Amy', 'Curran')]);
    const service = new RateMyProfessorService();
    await Promise.all([service.loadData(), service.loadData()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(service.isLoaded()).toBe(true);
  });

  it('forgets the old professors when loadFromData replaces the data', () => {
    const service = new RateMyProfessorService();
    const data = (professors: Professor[]) => ({
      lastUpdated: '2026-01-01',
      school: { id: 'wpi', name: 'WPI' },
      professors,
      totalProfessors: professors.length,
    });
    service.loadFromData(data([prof('Amy', 'Curran')]));
    expect(service.findProfessor('Amy Curran')).not.toBeNull();

    const susanin = prof('Laura', 'Susanin');
    service.loadFromData(data([susanin]));
    expect(service.findProfessor('Amy Curran')).toBeNull();
    expect(service.findProfessor('Laura Susanin')?.id).toBe(susanin.id);
  });

  it('matches names whatever their accents', async () => {
    const munoz = prof('Lina', 'Muñoz-Márquez');
    const vieux = prof('Karl-Frederic', 'Vieux');
    const service = await serviceWith([munoz, vieux]);
    expect(service.findProfessor('Lina Munoz-Marquez')?.id).toBe(munoz.id);
    expect(service.findProfessor('L. Munoz-Marquez')?.id).toBe(munoz.id);
    expect(service.findProfessor('Karl-Frédéric Vieux')?.id).toBe(vieux.id);
  });

  it('keeps the duplicate profile with the most ratings, whatever the order', async () => {
    const real = { ...prof('Richard', 'Quimby', 2.2), numRatings: 52 };
    const empty = { ...prof('Richard', 'Quimby', 0), numRatings: 0 };
    for (const order of [
      [real, empty],
      [empty, real],
    ]) {
      const service = await serviceWith(order);
      expect(service.findProfessor('Richard Quimby')?.id).toBe(real.id);
      // The last-name index holds the same profile.
      expect(service.findProfessor('R. Quimby')?.id).toBe(real.id);
      expect(service.findProfessor('Quimby')?.id).toBe(real.id);
      expect(service.getRatings('Richard Quimby')?.numRatings).toBe(52);
    }
  });

  it('keeps the first of two duplicates with as many ratings', async () => {
    const first = prof('Taimoor', 'Afzal');
    const second = prof('Taimoor', 'Afzal');
    const service = await serviceWith([first, second]);
    expect(service.findProfessor('Taimoor Afzal')?.id).toBe(first.id);
  });

  it('breaks a first-name tie by the number of ratings', async () => {
    const few = { ...prof('Jane', 'Doe'), numRatings: 2 };
    const many = { ...prof('John', 'Doe'), numRatings: 30 };
    const service = await serviceWith([few, many]);
    // "J." fits both equally; the better-documented profile wins.
    expect(service.findProfessor('J. Doe')?.id).toBe(many.id);
  });

  it('rejects data that does not match the schema', () => {
    const service = new RateMyProfessorService();
    expect(() => service.loadFromData({ professors: 'no' })).toThrow();
    expect(service.isLoaded()).toBe(false);
  });
});

describe('RateMyProfessorService.getRatings', () => {
  it('rounds to the precision getRatingDisplay shows', async () => {
    const service = await serviceWith([
      { ...prof('Amy', 'Curran', 3.96), wouldTakeAgainPercent: 88.8889 },
    ]);
    expect(service.getRatings('Amy Curran')).toEqual({
      rating: 4,
      difficulty: 3,
      numRatings: 10,
      wouldTakeAgain: 89,
    });
    expect(service.getRatingDisplay('Amy Curran')).toEqual({
      rating: '4.0',
      difficulty: '3.0',
      numRatings: 10,
      wouldTakeAgain: '89%',
      hasData: true,
    });
  });

  it('returns null for an unmatched or unrated professor', async () => {
    const service = await serviceWith([
      { ...prof('Amy', 'Curran'), numRatings: 0 },
    ]);
    expect(service.getRatings('Amy Curran')).toBeNull();
    expect(service.getRatings('Laura Susanin')).toBeNull();
  });

  it("reads RMP's -1 retake share, like a missing one, as no data", async () => {
    const service = await serviceWith([
      { ...prof('Amy', 'Curran'), wouldTakeAgainPercent: -1 },
      prof('Laura', 'Susanin'),
      { ...prof('Ada', 'Lovelace'), wouldTakeAgainPercent: 0 },
    ]);
    expect(service.getRatings('Amy Curran')?.wouldTakeAgain).toBeNull();
    expect(service.getRatingDisplay('Amy Curran')?.wouldTakeAgain).toBeNull();
    expect(service.getRatings('Laura Susanin')?.wouldTakeAgain).toBeNull();
    // Nobody would take again is data.
    expect(service.getRatings('Ada Lovelace')?.wouldTakeAgain).toBe(0);
  });
});

describe('RMPRatingFilter', () => {
  function sectionTaughtBy(...professors: string[]): FilterableSection {
    return {
      section: { periods: professors.map(professor => ({ professor })) },
    } as unknown as FilterableSection;
  }

  it('keeps sections with no listed instructor when including those without data', async () => {
    const service = await serviceWith([prof('Amy', 'Curran', 4.5)]);
    const filter = new RMPRatingFilter(service);
    const unassigned = sectionTaughtBy('Not Assigned', '');
    const rated = sectionTaughtBy('Amy Curran');

    expect(
      filter.apply([unassigned, rated], {
        minRating: 4,
        includeWithoutData: true,
      }),
    ).toEqual([unassigned, rated]);
    expect(
      filter.apply([unassigned, rated], {
        minRating: 4,
        includeWithoutData: false,
      }),
    ).toEqual([rated]);
  });

  it("judges by the listed instructor, not an unassigned period's lack of data", async () => {
    const service = await serviceWith([prof('Amy', 'Curran', 2)]);
    const filter = new RMPRatingFilter(service);
    const section = sectionTaughtBy('Amy Curran', 'Not Assigned');

    expect(
      filter.apply([section], { minRating: 4, includeWithoutData: true }),
    ).toEqual([]);
  });

  it('compares the rounded rating, as displayed', async () => {
    // 3.96 shows as 4.0, so it passes a 4.0 minimum
    const service = await serviceWith([prof('Amy', 'Curran', 3.96)]);
    const filter = new RMPRatingFilter(service);
    const section = sectionTaughtBy('Amy Curran');

    expect(filter.apply([section], { minRating: 4 })).toEqual([section]);
  });

  it('skips a retake bound for a missing or -1 share, min and max alike', async () => {
    const service = await serviceWith([
      prof('Laura', 'Susanin'),
      { ...prof('Amy', 'Curran'), wouldTakeAgainPercent: -1 },
      { ...prof('Ada', 'Lovelace'), wouldTakeAgainPercent: 20 },
    ]);
    const filter = new RMPRatingFilter(service);
    const missing = sectionTaughtBy('Laura Susanin');
    const negative = sectionTaughtBy('Amy Curran');
    const low = sectionTaughtBy('Ada Lovelace');
    const all = [missing, negative, low];

    expect(filter.apply(all, { minWouldTakeAgain: 50 })).toEqual([
      missing,
      negative,
    ]);
    expect(filter.apply(all, { minWouldTakeAgain: 10 })).toEqual(all);
    expect(filter.apply(all, { maxWouldTakeAgain: 10 })).toEqual([
      missing,
      negative,
    ]);
    // The other bounds still apply to them.
    expect(
      filter.apply(all, { minWouldTakeAgain: 10, minRating: 4.5 }),
    ).toEqual([]);
  });

  it('treats a professor with no ratings as having no data', async () => {
    const service = await serviceWith([
      { ...prof('Amy', 'Curran', 1), numRatings: 0 },
    ]);
    const filter = new RMPRatingFilter(service);
    const section = sectionTaughtBy('Amy Curran');

    expect(
      filter.apply([section], { minRating: 4, includeWithoutData: true }),
    ).toEqual([section]);
    expect(
      filter.apply([section], { minRating: 4, includeWithoutData: false }),
    ).toEqual([]);
  });

  describe('co-taught lectures', () => {
    const rated = (first: string, last: string, rating: number, n: number) => ({
      ...prof(first, last, rating),
      numRatings: n,
    });

    it('passes a lecture when any co-instructor passes', async () => {
      const service = await serviceWith([
        rated('Amity', 'Manning', 2, 6),
        rated('Scarlet', 'Shell', 4.1, 15),
      ]);
      const filter = new RMPRatingFilter(service);
      const bb552 = sectionTaughtBy('Amity Manning; Scarlet Shell');
      expect(filter.apply([bb552], { minRating: 4 })).toEqual([bb552]);
      expect(filter.apply([bb552], { maxRating: 2.5 })).toEqual([bb552]);
      expect(filter.apply([bb552], { minRating: 4.5 })).toEqual([]);
    });

    it('counts the co-instructor who has enough ratings', async () => {
      const service = await serviceWith([
        rated('Marja', 'Bakermans', 4.8, 5),
        rated('Kristin', 'Pfeifer', 4.5, 13),
      ]);
      const filter = new RMPRatingFilter(service);
      const fy1101 = sectionTaughtBy('Marja Bakermans; Kristin Pfeifer');
      expect(
        filter.apply([fy1101], {
          minNumRatings: 10,
          includeWithoutData: false,
        }),
      ).toEqual([fy1101]);
      expect(
        filter.apply([fy1101], {
          minNumRatings: 20,
          includeWithoutData: false,
        }),
      ).toEqual([]);
    });

    it('is without data only when no co-instructor has ratings', async () => {
      const service = await serviceWith([
        rated('Shahin', 'Farzin', 0, 0),
        rated('Tahar', 'El-Korchi', 3.1, 21),
      ]);
      const filter = new RMPRatingFilter(service);
      const aren = sectionTaughtBy('Shahin Farzin; Tahar El-Korchi');
      const unrated = sectionTaughtBy('Shahin Farzin; Nobody Known');
      expect(
        filter.apply([aren, unrated], { includeWithoutData: false }),
      ).toEqual([aren]);
      expect(
        filter.apply([aren, unrated], {
          minRating: 3,
          includeWithoutData: true,
        }),
      ).toEqual([aren, unrated]);
    });

    it('does not let an unrated co-instructor rescue a failing one', async () => {
      const service = await serviceWith([rated('Amy', 'Curran', 2, 10)]);
      const filter = new RMPRatingFilter(service);
      const section = sectionTaughtBy('Amy Curran; Nobody Known');
      expect(
        filter.apply([section], { minRating: 4, includeWithoutData: true }),
      ).toEqual([]);
    });

    it('judges instructors listed on separate periods the same way', async () => {
      const service = await serviceWith([
        rated('Amy', 'Curran', 2, 10),
        rated('Laura', 'Susanin', 4.5, 10),
      ]);
      const filter = new RMPRatingFilter(service);
      const section = sectionTaughtBy('Amy Curran', 'Laura Susanin');
      expect(filter.apply([section], { minRating: 4 })).toEqual([section]);
    });
  });
});
