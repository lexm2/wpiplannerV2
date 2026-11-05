import { expect, appModuleUrl, type Page } from './fixtures';
import {
  DEFAULT_RANKING_PREFERENCES,
  type RankingPreferences,
} from '../../src/services/scheduling/rankingPreferences';

/**
 * The app against what the running tutorial step says it must be. Both come
 * from the page: `getRequiredState()` is the tutorial's own claim (its start
 * plus every earlier step's effect), the rest is read from the real services
 * and DOM. Used after every advance, so a step can never sit on a wrong app.
 */

interface Picks {
  lecture?: string;
  discussion?: string;
  lab?: string;
}

interface RequiredState {
  page: string;
  wizard: { courseId: string; step: string } | null;
  modal: string | null;
  courses: Record<string, Picks>;
  filters: Record<string, unknown>;
  ranking: Record<string, string>;
  viewing: string | null;
  generated: boolean;
}

interface Actual {
  page: string;
  courses: Record<string, Picks>;
  filters: Array<{ id: string; criteria: unknown }>;
  modals: string[];
  wizard: { open: boolean; step: string | null };
  ranking: RankingPreferences;
  viewing: string | null;
  generated: boolean;
}

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );

/** Everything that differs, in words; empty when the app is as required. */
async function appMismatches(page: Page): Promise<string[]> {
  const stateUrl = await appModuleUrl(
    page,
    '/src/core/state/appState.svelte.ts',
  );
  const listUrl = await appModuleUrl(
    page,
    '/src/svelte/courseListState.svelte.ts',
  );
  const read = await page.evaluate(
    async ([appStateUrl, courseListUrl]) => {
      const { appState } = await import(appStateUrl);
      const { courseListState } = await import(courseListUrl);
      const services = (window as any).services;
      const required: RequiredState | null =
        services.tutorial.service.getRequiredState();
      if (!required) return null;

      const courses: Record<string, Picks> = {};
      for (const sc of services.courseSelectionService.getSelectedCourses()) {
        courses[sc.course.id] = {
          lecture: sc.selected.lecture?.number,
          discussion: sc.selected.discussion?.number,
          lab: sc.selected.lab?.number,
        };
      }
      const wizardStep = [...document.querySelectorAll('[data-step]')].find(
        el => el.tagName !== 'BUTTON',
      );
      const status = document.querySelector('.schedule-result-status');
      const actual: Actual = {
        page: document.querySelector('#schedule-tab.active')
          ? 'schedule'
          : document.querySelector('#planner-tab.active')
            ? 'planner'
            : 'other',
        courses,
        filters: services.filterService.getActiveFilters().map((f: any) => ({
          id: f.id,
          criteria: JSON.parse(JSON.stringify(f.criteria)),
        })),
        modals: [...document.querySelectorAll('[data-modal-type]')]
          .map(el => el.getAttribute('data-modal-type') ?? '')
          .filter(type => !type.startsWith('drawer-')),
        wizard: {
          open: !!wizardStep,
          step: wizardStep?.getAttribute('data-step') ?? null,
        },
        ranking: JSON.parse(JSON.stringify(appState.rankingPreferences)),
        viewing: courseListState.selectedCourseId,
        generated: !!status && !(status as HTMLElement).hidden,
      };
      return { required, actual };
    },
    [stateUrl, listUrl],
  );
  if (!read) return [];
  const { required, actual } = read;
  const out: string[] = [];

  if (actual.page !== required.page) {
    out.push(`page is ${actual.page}, required ${required.page}`);
  }

  const wantedIds = Object.keys(required.courses).sort();
  const haveIds = Object.keys(actual.courses).sort();
  if (canonical(wantedIds) !== canonical(haveIds)) {
    out.push(
      `selected courses ${haveIds.join(',')}, required ${wantedIds.join(',')}`,
    );
  } else if (!required.generated) {
    // A generated schedule's sections are the generator's, so only
    // membership is the state then.
    for (const id of wantedIds) {
      const want = required.courses[id];
      const have = actual.courses[id];
      for (const kind of ['lecture', 'discussion', 'lab'] as const) {
        if (want[kind] !== have[kind]) {
          out.push(`${id} ${kind} is ${have[kind]}, required ${want[kind]}`);
        }
      }
    }
  }

  // The schedule owns its year; the app itself drops department on the
  // schedule page; periodConflict also holds the sections it blocks against.
  const wantedFilters = new Map(Object.entries(required.filters));
  if (required.page === 'planner') {
    wantedFilters.set('department', { departments: ['TUT'] });
  }
  const haveFilters = new Map(
    actual.filters
      .filter(f => f.id !== 'academicYear')
      .filter(f => required.page === 'planner' || f.id !== 'department')
      .map(f => {
        const { selectedCourses: _held, ...rest } = f.criteria as Record<
          string,
          unknown
        >;
        return [f.id, f.id === 'periodConflict' ? rest : f.criteria] as const;
      }),
  );
  if (required.page !== 'planner') wantedFilters.delete('department');
  for (const id of new Set([...wantedFilters.keys(), ...haveFilters.keys()])) {
    const want = wantedFilters.get(id);
    const have = haveFilters.get(id);
    if (canonical(want) !== canonical(have)) {
      out.push(
        `filter ${id} is ${canonical(have)}, required ${canonical(want)}`,
      );
    }
  }

  const open = actual.modals;
  const modalOk =
    required.modal === null
      ? open.length === 0
      : open.length === 1 && open[0] === required.modal;
  if (!modalOk) {
    out.push(`modals open [${open.join(',')}], required ${required.modal}`);
  }

  if (required.wizard) {
    if (!actual.wizard.open || actual.wizard.step !== required.wizard.step) {
      out.push(
        `wizard is ${actual.wizard.open ? actual.wizard.step : 'closed'}, required ${required.wizard.step}`,
      );
    }
  } else if (actual.wizard.open) {
    out.push(`wizard is open on ${actual.wizard.step}, required closed`);
  }

  for (const key of Object.keys(DEFAULT_RANKING_PREFERENCES) as Array<
    keyof RankingPreferences
  >) {
    const want =
      required.ranking[key] ?? DEFAULT_RANKING_PREFERENCES[key].importance;
    if (actual.ranking[key].importance !== want) {
      out.push(
        `ranking ${key} is ${actual.ranking[key].importance}, required ${want}`,
      );
    }
  }

  if (actual.viewing !== required.viewing) {
    out.push(`viewing ${actual.viewing}, required ${required.viewing}`);
  }

  if (actual.generated !== required.generated) {
    out.push(
      `generated schedule showing is ${actual.generated}, required ${required.generated}`,
    );
  }
  return out;
}

/**
 * Polls until the app matches the required state; returns what still differs
 * when time runs out (empty when it matched).
 */
export async function waitForTutorialState(
  page: Page,
  timeout = 10_000,
): Promise<string[]> {
  const deadline = Date.now() + timeout;
  let mismatches = await appMismatches(page);
  while (mismatches.length > 0 && Date.now() < deadline) {
    await page.waitForTimeout(150);
    mismatches = await appMismatches(page);
  }
  return mismatches;
}

/** Waits for the app to settle into the required state, or fails with why not. */
export async function expectAppMatchesTutorial(
  page: Page,
  timeout = 10_000,
): Promise<void> {
  expect(
    await waitForTutorialState(page, timeout),
    'the app should be in the state the tutorial step requires',
  ).toEqual([]);
}
