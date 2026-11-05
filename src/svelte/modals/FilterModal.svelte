<script lang="ts">
  import Modal from './Modal.svelte';
  import { FILTER_WINDOW_TITLES, modalState } from './modalState.svelte';
  import FilterPanel from '../filters/FilterPanel.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { CourseSelectionService } from '../../services/selection/CourseSelectionService';
  import type { AutoScheduleOrchestrator } from '../../services/scheduling/AutoScheduleOrchestrator';
  import type { Department } from '../../types/types';

  let {
    typeId,
    filterService,
    courseSelectionService,
    autoScheduleOrchestrator,
    getDepartments,
    onRequestClose,
  }: {
    // 'filter-modal' (course list, section picker) or 'auto-schedule-filter'.
    typeId: string;
    filterService: FilterService;
    courseSelectionService: CourseSelectionService;
    autoScheduleOrchestrator: AutoScheduleOrchestrator;
    getDepartments: () => Department[];
    onRequestClose: () => void;
  } = $props();

  // Payload (mode + auto-schedule continuation) is set on modalState.filter
  // before the modal opens; it does not change while open.
  const payload = modalState.filter ?? { mode: 'filter' as const };
</script>

<Modal
  {typeId}
  title={FILTER_WINDOW_TITLES[payload.mode]}
  extraClass="filter-modal"
  dialogClass="filter-modal-dialog"
  {onRequestClose}
>
  {#snippet children(close)}
    <FilterPanel
      mode={payload.mode}
      onGenerate={payload.onGenerate}
      coursesToSchedule={payload.coursesToSchedule}
      sectionsShown={payload.sectionsShown}
      {filterService}
      {courseSelectionService}
      {autoScheduleOrchestrator}
      {getDepartments}
      requestClose={close}
    />
  {/snippet}
</Modal>
