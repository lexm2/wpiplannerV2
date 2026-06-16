<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import { modalState } from './modalState.svelte';
  import { FilterModalController } from '../../ui/controllers/FilterModalController';
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

  let controller: FilterModalController | null = null;

  // Build + wire the (imperative) filter panel into the Svelte-provided host.
  // The panel reads modalState.filter (set before modalOpened) for mode +
  // auto-schedule continuation. `close` is the Modal's animated close.
  function mountPanel(node: HTMLElement, close: () => void) {
    const payload = modalState.filter ?? { mode: 'filter' as const };
    const c = new FilterModalController();
    c.setFilterService(filterService);
    c.setCourseSelectionService(courseSelectionService);
    c.setAutoScheduleOrchestrator(autoScheduleOrchestrator);
    c.setProfileStateManager(profileStateManager);
    c.setCourseData(getDepartments());
    c.setMode(payload.mode);
    if (payload.coursesToSchedule) c.setCoursesToSchedule(payload.coursesToSchedule);
    if (payload.onGenerate) c.setOnGenerate(payload.onGenerate);
    c.renderInto(node, close);
    controller = c;
    return {
      destroy() {
        c.destroy();
        if (controller === c) controller = null;
      },
    };
  }

  // Tutorial back-navigation re-applies filters to the service, then bumps this
  // tick so the open modal re-syncs its checkboxes (replaces refreshFilterUI).
  $effect(() => {
    modalState.filterRefreshTick;
    if (controller) untrack(() => controller!.refreshFilterUI());
  });
</script>

<Modal {typeId} extraClass="filter-modal" dialogClass="filter-modal-dialog" {onRequestClose}>
  {#snippet children(close)}
    <div style="display: contents" use:mountPanel={close}></div>
  {/snippet}
</Modal>
