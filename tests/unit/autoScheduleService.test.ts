/**
 * What autoScheduleService tells the user when generation doesn't produce a
 * schedule.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { autoScheduleService } from '../../src/services/scheduling/autoScheduleService';
import { uiState } from '../../src/services/ui/uiState.svelte';
import { appState } from '../../src/core/state/appState.svelte';
import type { AutoScheduleOrchestrator } from '../../src/services/scheduling/AutoScheduleOrchestrator';
import type { CourseSelectionService } from '../../src/services/selection/CourseSelectionService';
import type { FilterService } from '../../src/services/filtering/FilterService';
import type { CourseColorService } from '../../src/services/scheduling/CourseColorService';
import type { SelectedCourse } from '../../src/types/schedule';

function setup(generateSchedules: () => Promise<unknown>): void {
  const selection = [{ course: { id: 'CS2102' } }] as SelectedCourse[];
  autoScheduleService.init(
    {
      getSelectedCourses: () => selection,
    } as unknown as CourseSelectionService,
    {} as FilterService,
    {} as CourseColorService,
    { generateSchedules } as unknown as AutoScheduleOrchestrator,
  );
}

async function run(): Promise<string> {
  uiState.appError = null;
  autoScheduleService.runAutoSchedule();
  await vi.waitFor(() => expect(appState.scheduleGenerating).toBe(false));
  // Re-read through a cast: TS narrowed appError to null on assignment above.
  const error = uiState.appError as { message: string } | null;
  return error?.message ?? '';
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('autoScheduleService error reporting', () => {
  it('names the failure in the console and the banner', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    setup(() =>
      Promise.reject(
        new Error('Schedule generation timed out after 60 seconds'),
      ),
    );

    const message = await run();

    expect(message).toContain('timed out after 60 seconds');
    const logged = consoleError.mock.calls.map(args =>
      args.filter(a => typeof a === 'string').join(' '),
    );
    expect(logged.some(l => l.includes('timed out after 60 seconds'))).toBe(
      true,
    );
  });

  it('names the courses that have no usable section', async () => {
    setup(() =>
      Promise.resolve({
        status: 'no-candidates',
        courses: [
          { departmentAbbr: 'CS', number: '2102' },
          { departmentAbbr: 'MA', number: '1022' },
        ],
      }),
    );

    const message = await run();

    expect(message).toMatch(/CS2102 and MA1022/);
    expect(message).not.toContain('Could not generate a valid schedule.\n');
  });

  it('says so when every course was left locked', async () => {
    setup(() => Promise.resolve({ status: 'nothing-to-schedule' }));

    expect(await run()).toMatch(/No courses are included/);
  });
});
