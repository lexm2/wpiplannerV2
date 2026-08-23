<script lang="ts">
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import Modal from './Modal.svelte';
  import { modalState } from './modalState.svelte';
  import type { SelectedCourse } from '../../types/schedule';
  import { sectionsOf } from '../../utils/courseUtils';

  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const payload = $derived(modalState.autoScheduleIntro);

  const TERMS = ['A', 'B', 'C', 'D'];

  function hasPickedSections(sc: SelectedCourse): boolean {
    return sectionsOf(sc.selected).length > 0;
  }

  function availableTerms(sc: SelectedCourse): Set<string> {
    const terms = new Set<string>();
    sc.course.lectures?.forEach(lg => terms.add(lg.section.computedTerm));
    sc.course.standaloneLabs?.forEach(s => terms.add(s.computedTerm));
    return terms;
  }

  // Per-course selected terms. Sections-already-picked courses start empty
  // (excluded from auto-scheduling); others default to all available terms.
  // SvelteMap/SvelteSet so .size/.has reads in the template stay reactive.
  let termsByCourse = $state(new SvelteMap<string, SvelteSet<string>>());

  // Re-seed whenever a new payload arrives (keyed on payload identity).
  let seededFor: object | null = null;
  $effect(() => {
    const p = payload;
    if (!p || p === seededFor) return;
    seededFor = p;
    const next = new SvelteMap<string, SvelteSet<string>>();
    for (const sc of p.selectedCourses) {
      next.set(
        sc.course.id,
        new SvelteSet(hasPickedSections(sc) ? [] : availableTerms(sc)),
      );
    }
    termsByCourse = next;
  });

  // Tutorial-driven term-preference overrides (replaces setTermPreferences).
  // Merge whenever the override channel changes, then clear it so the same
  // prefs can be pushed again on a later tutorial run.
  $effect(() => {
    const prefs = modalState.autoScheduleIntroTermPrefs;
    if (!prefs) return;
    for (const [courseId, terms] of Object.entries(prefs)) {
      termsByCourse.set(courseId, new SvelteSet(terms));
    }
    modalState.autoScheduleIntroTermPrefs = null;
  });

  function isAvailable(sc: SelectedCourse, term: string): boolean {
    return availableTerms(sc).has(term);
  }
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
          Courses with selected sections are locked by default. Click a course
          to include it in auto-scheduling.
        </p>
        <div class="as-course-grid">
          {#each payload.selectedCourses as sc (sc.course.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (card is a click-to-toggle surface; term badges below are the granular controls) -->
            <div
              class="as-course-card"
              class:selected={cardSelected(sc)}
              data-course-id={sc.course.id}
              onclick={() => toggleCard(sc)}
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
              <div class="as-card-terms term-badges-container">
                {#each TERMS as term (term)}
                  {#if isAvailable(sc, term)}
                    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (term badge toggles one term; stops card toggle) -->
                    <span
                      class="term-badge"
                      class:selected={isSelected(sc, term)}
                      data-term={term}
                      data-course-id={sc.course.id}
                      onclick={e => {
                        e.stopPropagation();
                        toggleTerm(sc, term);
                      }}
                    >
                      <span class="term-letter">{term}</span>
                    </span>
                  {:else}
                    <span
                      class="term-badge unavailable"
                      data-term={term}
                      data-course-id={sc.course.id}
                    >
                      <span class="term-letter">{term}</span>
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
