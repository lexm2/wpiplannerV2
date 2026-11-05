<script lang="ts">
  import { slideFade } from './transitions';
  import TextField from './ui/TextField.svelte';
  import { untrack } from 'svelte';
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import {
    foldText,
    getAvailableProfessors,
    hasSearchableText,
  } from '../utils/searchUtils';
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

  // The shared `searchText` filter's query. Reading getActiveFilters() (a
  // SvelteMap) makes this reactive; as a $derived string it only propagates
  // when the query itself changes, not on writes to unrelated filters.
  const filterQuery = $derived(
    (
      filterService.getActiveFilters().find(x => x.id === 'searchText')
        ?.criteria as SearchTextFilterCriteria | undefined
    )?.query ?? '',
  );

  // EXTERNAL sync: when the shared `searchText` filter changes from outside this
  // component - the page-switch reset (removeFilter) or the FilterModal editing
  // the same filter - adopt its query. The guard avoids no-op churn and,
  // crucially, this only fires on debounced/external filter writes, so it never
  // overwrites a keystroke that hasn't been committed to the filter yet.
  $effect(() => {
    // Track ONLY filterQuery. The compare/assign to `query` must be untracked -
    // otherwise reading `query` here makes it a dependency, and every keystroke
    // would re-run this effect and reset `query` back to the (not-yet-debounced)
    // filter value, clobbering what the user typed.
    const committed = filterQuery;
    untrack(() => {
      if (committed.trim() !== committedQuery(query)) {
        query = committed;
        // If the filter was cleared externally (e.g. page-switch reset), drop the
        // professor mode + dropdown too.
        if (committed === '') {
          professorMode = false;
          dropdownOpen = false;
        }
      }
    });
  });

  // What a typed query commits as: whitespace-only text and text with nothing
  // to search for (punctuation, emoji) commit as "no filter", so they must not
  // read as a change against the cleared filter either.
  function committedQuery(text: string): string {
    return hasSearchableText(text) ? text.trim() : '';
  }

  // The field is non-empty yet searches nothing; said so rather than left to
  // look like a search that matched everything.
  const nothingSearchable = $derived(
    query.trim().length > 0 && !hasSearchableText(query),
  );

  // Every professor in the catalog, gathered once per catalog load rather than
  // per keystroke. `appState.loadedDepartments` is a rune, so this recomputes
  // when the catalog loads.
  const allProfessors = $derived(
    getAvailableProfessors(appState.loadedDepartments.flatMap(d => d.courses)),
  );

  // Professor autocomplete (only in professor mode with a non-empty query).
  const professorMatches = $derived.by(() => {
    if (!professorMode || query.length === 0) return [];
    const needle = foldText(query);
    return allProfessors.filter(p => foldText(p).includes(needle)).slice(0, 10);
  });

  // Commit the current query to the shared `searchText` filter, passing the
  // ORIGINAL query (with spaces). The filter modal reads the same filter
  // reactively, so no manual modal sync is needed.
  function applySearch(): void {
    if (committedQuery(query)) {
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

  let dropdownEl = $state<HTMLElement | null>(null);

  // Close once focus leaves both the field and the dropdown, so a keyboard user
  // can Tab/ArrowDown from the field into the options. Options swallow
  // mousedown, so a click on one never blurs the field in the first place.
  function onFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget as Node | null;
    if (next && (dropdownEl?.contains(next) || next === searchInput())) return;
    dropdownOpen = false;
  }

  function searchInput(): HTMLElement | null {
    return document.getElementById('search-input');
  }

  function options(): HTMLElement[] {
    return Array.from(
      dropdownEl?.querySelectorAll<HTMLElement>('.professor-option') ?? [],
    );
  }

  function onInputKeydown(e: KeyboardEvent): void {
    if (!dropdownOpen || professorMatches.length === 0) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      dropdownOpen = false;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      options()[0]?.focus();
    }
  }

  function onDropdownKeydown(e: KeyboardEvent): void {
    const opts = options();
    const i = opts.indexOf(e.target as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      dropdownOpen = false;
      searchInput()?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      opts[Math.min(i + 1, opts.length - 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (i <= 0) searchInput()?.focus();
      else opts[i - 1]?.focus();
    }
  }

  // The typed text carries over: it is searched as a professor (or as a course
  // again), not thrown away.
  function toggleMode(): void {
    professorMode = !professorMode;
    dropdownOpen = professorMode && professorMatches.length > 0;
    applySearch();
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
    // Picked from the keyboard, focus was on the option that just unmounted.
    searchInput()?.focus();
  }
</script>

<TextField
  id="search-input"
  panel
  fieldClass="search-field"
  ariaLabel="Search courses"
  placeholder={professorMode ? 'Search professors...' : 'Search courses...'}
  hint={nothingSearchable ? 'Type a letter or number to search' : undefined}
  bind:value={query}
  oninput={onInput}
  onkeydown={onInputKeydown}
  onblur={onFocusOut}
  {trailing}
/>
{#if dropdownOpen && professorMatches.length > 0}
  <!-- svelte-ignore a11y_no_static_element_interactions (arrow keys between the option buttons) -->
  <div
    id="search-professor-dropdown"
    class="professor-dropdown"
    bind:this={dropdownEl}
    transition:slideFade={{ duration: 150 }}
    onfocusout={onFocusOut}
    onkeydown={onDropdownKeydown}
  >
    {#each professorMatches as professor (professor)}
      <button
        type="button"
        class="professor-option"
        data-professor={professor}
        onmousedown={e => e.preventDefault()}
        onclick={() => selectProfessor(professor)}>{professor}</button
      >
    {/each}
  </div>
{/if}
{#snippet trailing()}
  <button
    id="search-mode-btn"
    class:active={professorMode}
    title={professorMode ? 'Search courses instead' : 'Search professors'}
    aria-label="Search by professor"
    aria-pressed={professorMode}
    onclick={toggleMode}
    >{@html professorMode
      ? getInlineSVG('SCHOOL_FULL', 'school-full-icon')
      : getInlineSVG('SCHOOL', 'school-icon')}</button
  >
  <!-- No `hidden={query === ''}` here: the old attribute never took effect
       (.search-clear-btn set `display: flex`, which outranks the UA's [hidden]
       rule), so the button has always been permanently visible. Kept as-is
       rather than silently changing behaviour. Phone widths do hide it while
       empty (main-content.css), where the field has no room to spare. -->
  <button
    id="search-clear-btn"
    class:search-clear-empty={query === ''}
    title="Clear search"
    aria-label="Clear search"
    onclick={clear}>{@html getInlineSVG('X', 'x-icon')}</button
  >
{/snippet}
