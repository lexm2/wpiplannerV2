<script lang="ts">
  import Modal from './Modal.svelte';
  import { modalState } from './modalState.svelte';
  import FilterPanel from '../filters/FilterPanel.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { CourseSelectionService } from '../../services/selection/CourseSelectionService';
  import type { AutoScheduleOrchestrator } from '../../services/scheduling/AutoScheduleOrchestrator';
  import type { ProfileStateManager } from '../../core/state/ProfileStateManager';
  import type { Department } from '../../types/types';

  let {
    typeId,
    filterService,
    courseSelectionService,
    autoScheduleOrchestrator,
    profileStateManager,
    getDepartments,
    onRequestClose,
  }: {
    // 'filter-modal' (planner/schedule) or 'auto-schedule-filter'.
    typeId: string;
    filterService: FilterService;
    courseSelectionService: CourseSelectionService;
    autoScheduleOrchestrator: AutoScheduleOrchestrator;
    profileStateManager: ProfileStateManager;
    getDepartments: () => Department[];
    onRequestClose: () => void;
  } = $props();

  // Payload (mode + auto-schedule continuation) is set on modalState.filter
  // before the modal opens; it does not change while open.
  const payload = modalState.filter ?? { mode: 'filter' as const };
</script>

<Modal
  {typeId}
  extraClass="filter-modal"
  dialogClass="filter-modal-dialog"
  {onRequestClose}
>
  {#snippet children(close)}
    <FilterPanel
      mode={payload.mode}
      onGenerate={payload.onGenerate}
      coursesToSchedule={payload.coursesToSchedule}
      {filterService}
      {courseSelectionService}
      {autoScheduleOrchestrator}
      {profileStateManager}
      {getDepartments}
      requestClose={close}
    />
  {/snippet}
</Modal>
