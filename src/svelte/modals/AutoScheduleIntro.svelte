<script lang="ts">
  import listStyles from '../../styles/components/course-list.module.css';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import Modal from './Modal.svelte';
  import { modalState } from './modalState.svelte';
  import type { SelectedCourse } from '../../types/schedule';
  import { sectionsOf } from '../../utils/courseUtils';
  import { QUARTER_TERMS, SEMESTER_TERMS } from '../../utils/typeGuards';

  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const payload = $derived(modalState.autoScheduleIntro);

  function hasPickedSections(sc: SelectedCourse): boolean {
    return sectionsOf(sc.selected).length > 0;
  }

  function computeAvailableTerms(sc: SelectedCourse): Set<string> {
    const terms = new Set<string>();
    sc.course.lectures?.forEach(lg => terms.add(lg.section.computedTerm));
    sc.course.standaloneLabs?.forEach(s => terms.add(s.computedTerm));
    return terms;
  }

  // Computed once per payload rather than on every badge read. Read-only:
  // callers copy before mutating.
  const availableByCourse = $derived(
    new Map(
      (payload?.selectedCourses ?? []).map(sc => [
        sc.course.id,
        computeAvailableTerms(sc),
      ]),
    ),
  );

  function availableTerms(sc: SelectedCourse): ReadonlySet<string> {
    return availableByCourse.get(sc.course.id) ?? computeAvailableTerms(sc);
  }

  // Semester terms (F spans A+B, S spans C+D) get a badge only when the
  // course offers them, so quarter-only cards keep their four badges.
  function badgeTerms(available: ReadonlySet<string>): string[] {
    return [...QUARTER_TERMS, ...SEMESTER_TERMS.filter(t => available.has(t))];
  }

  // After a generation every course has sections; locking them all by default
  // would leave nothing to schedule, so then every course starts included.
  const allPicked = $derived(
    !!payload?.selectedCourses.every(sc => hasPickedSections(sc)),
  );

  // Per-course selected terms. Sections-already-picked courses start empty
  // (excluded from auto-scheduling) unless all of them are; others default to
  // all available terms.
  // SvelteMap/SvelteSet so .size/.has reads in the template stay reactive.
  let termsByCourse = $state(new SvelteMap<string, SvelteSet<string>>());

  // Re-seed whenever a new payload arrives (keyed on payload identity).
  let seededFor: object | null = null;
  $effect(() => {
    const p = payload;
    if (!p || p === seededFor) return;
    seededFor = p;
    const lockPicked = !allPicked;
    const next = new SvelteMap<string, SvelteSet<string>>();
    for (const sc of p.selectedCourses) {
      next.set(
        sc.course.id,
        new SvelteSet(
          lockPicked && hasPickedSections(sc) ? [] : availableTerms(sc),
        ),
      );
    }
    termsByCourse = next;
  });

  // Tutorial-driven term-preference overrides. Merge whenever the override
  // channel changes, then clear it so the same prefs can be pushed again on a
  // later tutorial run.
  $effect(() => {
    const prefs = modalState.autoScheduleIntroTermPrefs;
    if (!prefs) return;
    for (const [courseId, terms] of Object.entries(prefs)) {
      termsByCourse.set(courseId, new SvelteSet(terms));
    }
    modalState.autoScheduleIntroTermPrefs = null;
  });

  function isSelected(sc: SelectedCourse, term: string): boolean {
    return !!termsByCourse.get(sc.course.id)?.has(term);
  }
  function cardSelected(sc: SelectedCourse): boolean {
    return (termsByCourse.get(sc.course.id)?.size ?? 0) > 0;
  }

  function toggleCard(sc: SelectedCourse): void {
    const set = termsByCourse.get(sc.course.id);
    if (!set) return;
    if (set.size > 0) {
      set.clear();
    } else {
      availableTerms(sc).forEach(t => set.add(t));
    }
  }

  // The card is itself a checkbox for keyboard users. The target guard keeps
  // Enter/Space on the nested term buttons toggling just that term.
  function onCardKeydown(e: KeyboardEvent, sc: SelectedCourse): void {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleCard(sc);
    }
  }

  function toggleTerm(sc: SelectedCourse, term: string): void {
    const set = termsByCourse.get(sc.course.id);
    if (!set) return;
    if (set.has(term)) set.delete(term);
    else set.add(term);
  }

  function next(close: () => void): void {
    if (!payload) return;
    const filtered = payload.selectedCourses.map(sc => {
      const available = availableTerms(sc);
      const selected = termsByCourse.get(sc.course.id) ?? available;
      // No narrowing if every available term is still selected.
      if ([...available].every(t => selected.has(t))) return sc;
      return { ...sc, allowedTerms: [...selected] };
    });
    payload.onNext(filtered);
    close();
  }

  function courseCode(sc: SelectedCourse): string {
    return `${sc.course.departmentAbbr}${sc.course.number}`;
  }
</script>

{#if payload}
  <Modal
    typeId="auto-schedule-intro"
    title="Auto-Schedule"
    showHeader
    extraClass="filter-modal"
    {onRequestClose}
  >
    {#snippet children(close)}
      <div class="modal-body as-course-picker-body">
        <p class="as-picker-hint">
          {#if allPicked}
            All courses are included. Click a course to lock it to its current
            sections.
          {:else}
            Courses with selected sections are locked by default. Click a course
            to include it in auto-scheduling.
          {/if}
        </p>
        <div class="as-course-grid">
          {#each payload.selectedCourses as sc (sc.course.id)}
            {@const available = availableTerms(sc)}
            <div
              class="as-course-card"
              class:selected={cardSelected(sc)}
              data-course-id={sc.course.id}
              role="checkbox"
              tabindex="0"
              aria-checked={cardSelected(sc)}
              aria-label="{courseCode(sc)} {sc.course.name}"
              onclick={() => toggleCard(sc)}
              onkeydown={e => onCardKeydown(e, sc)}
            >
              <div
                class="as-course-card-accent"
                style="background:{payload.getColor(sc.course.id)}"
              ></div>
              <div class="as-course-card-content">
                <div class="as-course-code">{courseCode(sc)}</div>
                <div class="as-course-name">{sc.course.name}</div>
                <div class="as-course-year">
                  {sc.course.academicYear ?? '-'}
                </div>
              </div>
              <div
                class={['as-card-terms', listStyles['term-badges-container']]}
              >
                {#each badgeTerms(available) as term (term)}
                  {#if available.has(term)}
                    <button
                      type="button"
                      class={[
                        listStyles['term-badge'],
                        { [listStyles['selected']]: isSelected(sc, term) },
                      ]}
                      aria-pressed={isSelected(sc, term)}
                      data-term={term}
                      data-term-badge
                      data-course-id={sc.course.id}
                      onclick={e => {
                        e.stopPropagation();
                        toggleTerm(sc, term);
                      }}
                    >
                      <span class={listStyles['term-letter']}>{term}</span>
                    </button>
                  {:else}
                    <span
                      class={[
                        listStyles['term-badge'],
                        listStyles['unavailable'],
                      ]}
                      data-term={term}
                      data-term-badge
                      data-course-id={sc.course.id}
                    >
                      <span class={listStyles['term-letter']}>{term}</span>
                    </span>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
      <div class="modal-footer">
        <button
          class="modal-btn btn-primary"
          data-action="next"
          onclick={() => next(close)}>Next</button
        >
      </div>
    {/snippet}
  </Modal>
{/if}
