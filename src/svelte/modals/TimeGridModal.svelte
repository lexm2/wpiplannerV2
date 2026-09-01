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

  // Seed only; the picker owns the selection while it is open.
  const seed = untrack(() =>
    filterService.getCriteria<TimesFilterCriteria>('times'),
  );
  const initialWindows: TimeWindow[] = seed?.windows ?? [];
  const initialMode: TimeGridMode = seed?.mode ?? 'only';

  const includeAsync = $derived(
    filterService.getCriteria<AsyncFilterCriteria>('async')?.include !== false,
  );

  function onchange(mode: TimeGridMode, windows: TimeWindow[]): void {
    // An empty grid drops the filter so it stops counting toward the badge.
    if (windows.length > 0) filterService.addFilter('times', { mode, windows });
    else filterService.removeFilter('times');
  }

  function onAsyncChange(checked: boolean): void {
    // Including async is the default state, stored as no filter at all.
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
