/**
 * Guards the one thing about `wizardState.selections` that neither tsc nor
 * svelte-check can see: it has to survive `postMessage`.
 *
 * The wizard hands this object to the state layer verbatim on complete, and it
 * ends up inside a persisted Schedule - which crosses a structured-clone
 * boundary into the storage worker. A deep `$state` object is a Proxy, and a
 * Proxy is NOT structured-cloneable, so declaring it as anything but
 * `$state.raw` makes every save of that schedule throw DataCloneError. The
 * throw was swallowed, so the symptom was a selection that showed on the
 * calendar and vanished on reload.
 */
import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import { wizardState } from '../../src/svelte/wizardState.svelte';
import { AcademicTerm } from '../../src/types/schedule';
import type { Section } from '../../src/types/types';

function section(number: string, crn: number): Section {
  return {
    crn,
    number,
    seats: 30,
    seatsAvailable: 10,
    actualWaitlist: 0,
    maxWaitlist: 0,
    computedTerm: AcademicTerm.A,
    periods: [],
  };
}

const LEC = section('AL01', 348532);
const DIS = section('AD01', 348534);

describe('wizardState.selections', () => {
  it('is structured-cloneable, the way the storage worker needs it', () => {
    const cleanup = $effect.root(() => {
      wizardState.selections = { lecture: LEC };
      wizardState.selections = { ...wizardState.selections, discussion: DIS };
      flushSync();

      // Exactly what Worker.postMessage does to a Schedule holding this object.
      expect(() =>
        structuredClone({ data: { selected: wizardState.selections } }),
      ).not.toThrow();
    });
    cleanup();
  });

  it('keeps the catalog section objects identical, not copies', () => {
    const cleanup = $effect.root(() => {
      wizardState.selections = { lecture: LEC, discussion: DIS };
      flushSync();

      // A deep-state proxy would hand back a wrapper here, which breaks the
      // identity `appState` documents it relies on for catalog objects.
      expect(wizardState.selections.lecture).toBe(LEC);
      expect(wizardState.selections.discussion).toBe(DIS);
    });
    cleanup();
  });
});
