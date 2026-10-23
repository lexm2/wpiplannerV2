<script lang="ts" module>
  import type { TimeGridMode } from '../../types/filters';

  // An empty grid stores no filter, and so no mode or async choice; these keep
  // the last ones picked so reopening on nothing painted does not reset them.
  let lastMode: TimeGridMode = 'only';
  let lastIncludeAsync = false;
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import TimeGridPicker from '../filters/TimeGridPicker.svelte';
  import FilterToggle from '../filters/FilterToggle.svelte';
  import { appState } from '../../core/state/appState.svelte';
  import { gridRangeOf } from '../../utils/gridRange';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { TimesFilterCriteria, TimeWindow } from '../../types/filters';

  let {
    filterService,
    onRequestClose,
  }: {
    filterService: FilterService;
    onRequestClose: () => void;
  } = $props();

  // Seed only; the picker owns the selection while it is open.
  const seed = untrack(() =>
    filterService.getCriteria<TimesFilterCriteria>('times'),
  );
  const initialWindows: TimeWindow[] = seed?.windows ?? [];
  const initialMode: TimeGridMode = seed?.mode ?? lastMode;
  // The catalog's hours, widened for any stored window outside them so
  // reopening never trims a selection.
  const range = untrack(() =>
    gridRangeOf(initialWindows, appState.catalogRange),
  );

  let mode = $state(initialMode);
  let windows = initialWindows;
  let includeAsync = $state(seed?.includeAsync ?? lastIncludeAsync);

  function save(): void {
    lastMode = mode;
    lastIncludeAsync = includeAsync;
    // An empty grid drops the filter so it stops counting toward the badge.
    if (windows.length === 0) filterService.removeFilter('times');
    // Avoid mode keeps sections with no set times anyway.
    else if (includeAsync && mode === 'only')
      filterService.addFilter('times', { mode, windows, includeAsync });
    else filterService.addFilter('times', { mode, windows });
  }

  function onchange(nextMode: TimeGridMode, nextWindows: TimeWindow[]): void {
    mode = nextMode;
    windows = nextWindows;
    save();
  }

  function onAsyncChange(checked: boolean): void {
    includeAsync = checked;
    save();
  }
</script>

<Modal
  typeId="time-grid"
  title="Times"
  showHeader
  extraClass="time-grid-modal"
  {onRequestClose}
>
  {#snippet children(close)}
    <div class="modal-body">
      <TimeGridPicker
        windows={initialWindows}
        {range}
        mode={initialMode}
        {onchange}
      />
    </div>
    <div class="modal-footer">
      {#if mode === 'only'}
        <FilterToggle
          id="include-async-filter"
          label="Include async classes"
          checked={includeAsync}
          onchange={onAsyncChange}
        />
      {/if}
      <button class="modal-btn btn-primary" onclick={close}>Done</button>
    </div>
  {/snippet}
</Modal>
