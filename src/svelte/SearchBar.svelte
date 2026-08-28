<script lang="ts">
  import { slideFade } from './transitions';
  import TextField from './ui/TextField.svelte';
  import { untrack } from 'svelte';
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import { getAvailableProfessors } from '../utils/searchUtils';
  import type { FilterService } from '../services/filtering/FilterService';
  import type { DebouncedOperation } from '../utils/RequestCancellation';
  import type { SearchTextFilterCriteria } from '../types/filters';
  import { logger } from '../utils/logger';

  let {
    filterService,
    debouncedSearch,
  }: {
    filterService: FilterService;
    debouncedSearch: DebouncedOperation;
  } = $props();

  // `query` is the LOCAL display value, updated on every keystroke via bind:value.
  // The `searchText` FILTER only changes on the DEBOUNCED write (or an external
  // write from the FilterModal / a page-switch reset) - never per keystroke. So
  // the $effect below can safely adopt the filter's query into `query` without
  // clobbering mid-typing.
  let query = $state('');
  let professorMode = $state(false);
  let dropdownOpen = $state(false);

  // EXTERNAL sync: when the shared `searchText` filter changes from outside this
  // component - the page-switch reset (removeFilter) or the FilterModal editing
  // the same filter - adopt its query. Reading getActiveFilters() (a SvelteMap)
  // makes this reactive. The guard avoids no-op churn and, crucially, this only
  // fires on debounced/external filter writes, so it never overwrites a
  // keystroke that hasn't been committed to the filter yet.
  $effect(() => {
    // Track ONLY the filter (the SvelteMap). The compare/assign to `query` must
    // be untracked - otherwise reading `query` here makes it a dependency, and
    // every keystroke would re-run this effect and reset `query` back to the
    // (not-yet-debounced) filter value, clobbering what the user typed.
    const f = filterService.getActiveFilters().find(x => x.id === 'searchText');
    const filterQuery =
      (f?.criteria as SearchTextFilterCriteria | undefined)?.query ?? '';
    untrack(() => {
      if (filterQuery !== query) {
        query = filterQuery;
        // If the filter was cleared externally (e.g. page-switch reset), drop the
        // professor mode + dropdown too.
        if (filterQuery === '') {
          professorMode = false;
          dropdownOpen = false;
        }
      }
    });
  });

  // Professor autocomplete (only in professor mode with a non-empty query).
  // `appState.loadedDepartments` is a rune, so this recomputes when the
  // catalog loads.
  const professorMatches = $derived.by(() => {
    if (!professorMode || query.length === 0) return [];
    const courses = appState.loadedDepartments.flatMap(d => d.courses);
    return getAvailableProfessors(courses)
      .filter(p => p.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10);
  });

  // Commit the current query to the shared `searchText` filter, passing the
  // ORIGINAL query (with spaces). The filter modal reads the same filter
  // reactively, so no manual modal sync is needed.
  function applySearch(): void {
    if (query.trim().length > 0) {
      filterService.addFilter('searchText', {
        query,
        professorOnly: professorMode,
      });
    } else {
      filterService.removeFilter('searchText');
    }
  }

  function onInput(): void {
    // bind:value already updated `query`; the dropdown reacts via the $derived.
    if (professorMode) dropdownOpen = professorMatches.length > 0;
    // Debounced write to the filter - keep the existing DebouncedOperation
    // timing/cancellation (300ms) rather than a naive setTimeout.
    debouncedSearch
      .execute(async cancellationToken => {
        cancellationToken.throwIfCancelled();
        applySearch();
        return Promise.resolve();
      })
      .catch(error => {
        if (error?.name !== 'CancellationError') {
          logger.error('Search error:', error);
        }
      });
  }

  // Hide the dropdown shortly after blur so a click on an option still registers.
  function onBlur(): void {
    setTimeout(() => {
      dropdownOpen = false;
    }, 150);
  }

  function toggleMode(): void {
    professorMode = !professorMode;
    query = '';
    dropdownOpen = false;
    filterService.removeFilter('searchText');
  }

  function clear(): void {
    query = '';
    professorMode = false;
    dropdownOpen = false;
    filterService.removeFilter('searchText');
  }

  // Selecting a professor searches immediately - no debounce.
  function selectProfessor(professor: string): void {
    query = professor;
    dropdownOpen = false;
    applySearch();
  }
</script>

<TextField
  id="search-input"
  panel
  fieldClass="search-field"
  ariaLabel="Search courses"
  placeholder={professorMode ? 'Search professors...' : 'Search courses...'}
  bind:value={query}
  oninput={onInput}
  onblur={onBlur}
  {trailing}
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
        onclick={() => selectProfessor(professor)}>{professor}</button
      >
    {/each}
  </div>
{/if}
{#snippet trailing()}
  <button
    id="search-mode-btn"
    class:active={professorMode}
    title="Search professors"
    aria-label="Toggle professor search"
    onclick={toggleMode}
    >{@html professorMode
      ? getInlineSVG('SCHOOL_FULL', 'school-full-icon')
      : getInlineSVG('SCHOOL', 'school-icon')}</button
  >
  <!-- No `hidden={query === ''}` here: the old attribute never took effect
       (.search-clear-btn set `display: flex`, which outranks the UA's [hidden]
       rule), so the button has always been permanently visible. Kept as-is
       rather than silently changing behaviour. -->
  <button
    id="search-clear-btn"
    title="Clear search"
    aria-label="Clear search"
    onclick={clear}>{@html getInlineSVG('X', 'x-icon')}</button
  >
{/snippet}
