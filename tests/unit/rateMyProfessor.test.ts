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
});
