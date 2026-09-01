<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import TimeGridPicker from '../filters/TimeGridPicker.svelte';
  import FilterToggle from '../filters/FilterToggle.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type {
    AsyncFilterCriteria,
    TimeGridMode,
    TimesFilterCriteria,
    TimeWindow,
  } from '../../types/filters';

  let {
    filterService,
    onRequestClose,
  }: {
    filterService: FilterService;
    onRequestClose: () => void;
  } = $props();

  // Snapshot for seeding only - the picker owns the cell set while open, and
  // nothing behind this modal can edit the criteria in the meantime.
  const seed = untrack(() =>
    filterService.getCriteria<TimesFilterCriteria>('times'),
  );
  const initialWindows: TimeWindow[] = seed?.windows ?? [];
  const initialMode: TimeGridMode = seed?.mode ?? 'only';

  // The async toggle reads live rather than being seeded: it is a plain
  // boolean with no drag state to protect.
  const includeAsync = $derived(
    filterService.getCriteria<AsyncFilterCriteria>('async')?.include !== false,
  );

  function onchange(mode: TimeGridMode, windows: TimeWindow[]): void {
    // Clearing the grid removes the filter outright, so the panel's
    // filter-count badge doesn't keep counting an empty selection.
    if (windows.length > 0) filterService.addFilter('times', { mode, windows });
    else filterService.removeFilter('times');
  }

  function onAsyncChange(checked: boolean): void {
    // Including async sections is the default, so it is stored as no filter at
    // all rather than as a no-op criteria that would count toward the badge.
    if (checked) filterService.removeFilter('async');
    else filterService.addFilter('async', { include: false });
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
      <TimeGridPicker windows={initialWindows} mode={initialMode} {onchange}>
        {#snippet toolbarExtra()}
          <FilterToggle
            id="include-async-filter"
            label="Include async classes"
            checked={includeAsync}
            onchange={onAsyncChange}
          />
        {/snippet}
      </TimeGridPicker>
    </div>
    <div class="modal-footer">
      <button class="modal-btn btn-primary" onclick={close}>Done</button>
    </div>
  {/snippet}
</Modal>
