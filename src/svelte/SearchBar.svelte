<script lang="ts">
  import { slideFade } from './transitions';
  import { untrack } from 'svelte';
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import { getAvailableProfessors } from '../utils/searchUtils';
  import type { FilterService } from '../services/filtering/FilterService';
  import type { DebouncedOperation } from '../utils/RequestCancellation';
  import type { SearchTextFilterCriteria } from '../types/filters';
  import { logger } from '../utils/logger';

  let { filterService, debouncedSearch }: {
    filterService: FilterService;
    debouncedSearch: DebouncedOperation;
  } = $props();

  // `query` is the LOCAL display value, updated on every keystroke via bind:value.
  // The `searchText` FILTER only changes on the DEBOUNCED write (or an external
  // write from the FilterModal / a page-switch reset) — never per keystroke. So
  // the $effect below can safely adopt the filter's query into `query` without
  // clobbering mid-typing.
  let query = $state('');
  let professorMode = $state(false);
  let dropdownOpen = $state(false);

  // EXTERNAL sync (replaces MainController.syncSearchInputFromFilters): when the
  // shared `searchText` filter changes from outside this component — the
  // page-switch reset (removeFilter) or the still-vanilla FilterModal editing
  // the same filter — adopt its query. Reading getActiveFilters() (a SvelteMap)
  // makes this reactive. The guard avoids no-op churn and, crucially, this only
  // fires on debounced/external filter writes, so it never overwrites a
  // keystroke that hasn't been committed to the filter yet.
  $effect(() => {
    // Track ONLY the filter (the SvelteMap). The compare/assign to `query` must
    // be untracked — otherwise reading `query` here makes it a dependency, and
    // every keystroke would re-run this effect and reset `query` back to the
    // (not-yet-debounced) filter value, clobbering what the user typed.
    const f = filterService.getActiveFilters().find(x => x.id === 'searchText');
    const filterQuery = (f?.criteria as SearchTextFilterCriteria | undefined)?.query ?? '';
    untrack(() => {
      if (filterQuery !== query) {
        query = filterQuery;
        // If the filter was cleared externally (e.g. page-switch reset), drop the
        // professor mode + dropdown too, mirroring the old reset behavior.
        if (filterQuery === '') {
          professorMode = false;
          dropdownOpen = false;
        }
      }
    });
  });

  // Professor autocomplete (only in professor mode with a non-empty query).
  // Mirrors the old #search-input input handler: case-insensitive `includes`,
  // capped at 10. `appState.loadedDepartments` is a rune, so this recomputes
  // when the catalog loads.
  const professorMatches = $derived.by(() => {
    if (!professorMode || query.length === 0) return [];
    const courses = appState.loadedDepartments.flatMap(d => d.courses);
    return getAvailableProfessors(courses)
      .filter(p => p.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10);
  });

  // Commit the current query to the shared `searchText` filter. Same semantics as
  // the old debounced operation body: addFilter when the trimmed query is
  // non-empty, removeFilter otherwise; pass the ORIGINAL query (with spaces) and
  // the current professorMode as professorOnly. The filter modal reads the same
  // filter reactively, so no manual modal sync is needed.
  function applySearch(): void {
    if (query.trim().length > 0) {
      filterService.addFilter('searchText', { query, professorOnly: professorMode });
    } else {
      filterService.removeFilter('searchText');
    }
  }

  function onInput(): void {
    // bind:value already updated `query`; the dropdown reacts via the $derived.
    if (professorMode) dropdownOpen = professorMatches.length > 0;
    // Debounced write to the filter — keep the existing DebouncedOperation
    // timing/cancellation (300ms) rather than a naive setTimeout.
    debouncedSearch.execute(async (cancellationToken) => {
      cancellationToken.throwIfCancelled();
      applySearch();
      return Promise.resolve();
    }).catch(error => {
      if (error?.name !== 'CancellationError') {
        logger.error('Search error:', error);
      }
    });
  }

  // Hide the dropdown shortly after blur so a click on an option still registers
  // (matches the old 150ms blur timeout).
  function onBlur(): void {
    setTimeout(() => { dropdownOpen = false; }, 150);
  }

  // Toggle course <-> professor mode: clear the query + filter, swap the
  // placeholder/icon (reactive via `professorMode`), hide the dropdown.
  function toggleMode(): void {
    professorMode = !professorMode;
    query = '';
    dropdownOpen = false;
    filterService.removeFilter('searchText');
  }

  // Clear button: empty the query + filter, reset professor mode, hide dropdown.
  function clear(): void {
    query = '';
    professorMode = false;
    dropdownOpen = false;
    filterService.removeFilter('searchText');
  }

  // Selecting a professor fills the input and searches immediately (no debounce),
  // mirroring the old behavior of dispatching an input event after setting value.
  function selectProfessor(professor: string): void {
    query = professor;
    dropdownOpen = false;
    applySearch();
  }
</script>

<input
  type="text"
  id="search-input"
  class="search-input"
  bind:value={query}
  oninput={onInput}
  onblur={onBlur}
  placeholder={professorMode ? 'Search professors...' : 'Search courses...'}
  aria-label="Search courses"
/>
{#if dropdownOpen && professorMatches.length > 0}
  <div
    id="search-professor-dropdown"
    class="professor-dropdown"
    transition:slideFade={{ duration: 150 }}
  >
    {#each professorMatches as professor (professor)}
      <button
        type="button"
        class="professor-option"
        data-professor={professor}
        onclick={() => selectProfessor(professor)}
      >{professor}</button>
    {/each}
  </div>
{/if}
<button
  id="search-mode-btn"
  class="search-mode-btn"
  class:active={professorMode}
  title="Search professors"
  aria-label="Toggle professor search"
  onclick={toggleMode}
>{@html professorMode
  ? getInlineSVG('SCHOOL_FULL', 'school-full-icon')
  : getInlineSVG('SCHOOL', 'school-icon')}</button>
<button
  id="search-clear-btn"
  class="search-clear-btn"
  title="Clear search"
  aria-label="Clear search"
  hidden={query === ''}
  onclick={clear}
>{@html getInlineSVG('X', 'x-icon')}</button>
