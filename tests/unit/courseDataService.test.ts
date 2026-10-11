/**
 * CourseDataService's prefetch/apply split: startup begins the catalog fetch
 * early, but nothing is published until loadCourseData() runs.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CourseDataService } from '../../src/services/data/courseDataService';
import { appState } from '../../src/core/state/appState.svelte';

const CATALOG = {
  generated: '2026-01-01T00:00:00Z',
  departments: [
    {
      abbreviation: 'CS',
      name: 'Computer Science',
      courses: [{ id: 'CS-1101', number: '1101', name: 'Intro' }],
    },
  ],
};

function mockFetch(ok = true) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      statusText: ok ? 'OK' : 'Server Error',
      json: () => Promise.resolve(CATALOG),
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  appState.loadedDepartments = [];
});

describe('CourseDataService prefetch', () => {
  it('fetches once and publishes only on loadCourseData', async () => {
    const fetchMock = mockFetch();
    const service = new CourseDataService();

    service.prefetchCourseData();
    service.prefetchCourseData();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(appState.loadedDepartments).toEqual([]);

    const db = await service.loadCourseData();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.departments[0].courses[0].id).toBe('CS-1101');
    expect(appState.loadedDepartments).toBe(db.departments);
  });

  it('surfaces a failed prefetch from loadCourseData', async () => {
    mockFetch(false);
    const service = new CourseDataService();

    service.prefetchCourseData();
    await new Promise(resolve => setTimeout(resolve, 0));

    await expect(service.loadCourseData()).rejects.toThrow(
      'No course data available',
    );
    expect(appState.loadedDepartments).toEqual([]);
  });

  it('fetches fresh when nothing was prefetched', async () => {
    const fetchMock = mockFetch();
    const service = new CourseDataService();

    await service.loadCourseData();
    await service.loadCourseData();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
