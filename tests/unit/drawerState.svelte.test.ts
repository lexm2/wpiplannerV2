import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

/**
 * Drawers live in the modal stack, and only open where their panel is hidden.
 * jsdom has no matchMedia, so the stub below answers `(max-width: Npx)` from a
 * settable width - stubbed before the module is imported, since its
 * MediaQuery objects are built at import time.
 */
let width = 1440;

beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity);
    return {
      get matches() {
        return width <= max;
      },
      media: query,
      addEventListener() {},
      removeEventListener() {},
    };
  });
});

const load = async () => ({
  ...(await import('../../src/svelte/drawerState.svelte')),
  ...(await import('../../src/services/ui/uiState.svelte')),
});

describe('drawerState', () => {
  beforeEach(async () => {
    (await load()).closeAllModals();
  });

  it('does not open a drawer while its panel is on screen', async () => {
    const { openDrawer, isDrawerOpen, uiState } = await load();
    width = 1440;
    expect(openDrawer('departments')).toBe(false);
    expect(isDrawerOpen('departments')).toBe(false);
    expect(uiState.openModals).toEqual([]);

    // The schedule sidebar is hidden only from 1024px down.
    width = 1100;
    expect(openDrawer('schedule')).toBe(false);
    expect(openDrawer('details')).toBe(true);
  });

  it('opens as an entry in the modal stack, one drawer at a time', async () => {
    const { openDrawer, openDrawerId, uiState, openModal } = await load();
    width = 1000;
    openDrawer('departments');
    expect(openDrawerId()).toBe('departments');

    openDrawer('details');
    expect(openDrawerId()).toBe('details');
    expect(uiState.openModals).toEqual(['drawer-details']);

    // A modal opened from the drawer stacks on top of it.
    openModal('filter-modal');
    expect(uiState.openModals.at(-1)).toBe('filter-modal');
    expect(openDrawerId()).toBe('details');
  });

  it('closes the open drawer and leaves other modals alone', async () => {
    const { openDrawer, closeDrawer, openDrawerId, uiState, openModal } =
      await load();
    width = 1000;
    openDrawer('schedule');
    openModal('section-info');
    closeDrawer();
    expect(openDrawerId()).toBe(null);
    expect(uiState.openModals).toEqual(['section-info']);
    // Closing again is a no-op.
    closeDrawer();
    expect(uiState.openModals).toEqual(['section-info']);
  });
});
