<script lang="ts">
  import { uiState, closeModal } from '../../services/ui/uiState.svelte';
  import MobileNotice from './MobileNotice.svelte';
  import Changelog from './Changelog.svelte';
  import Tutorials from './Tutorials.svelte';
  import SectionInfo from './SectionInfo.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import DeleteLocalEvent from './DeleteLocalEvent.svelte';
  import LocalEvent from './LocalEvent.svelte';
  import AutoScheduleIntro from './AutoScheduleIntro.svelte';
  import SchedulePicker from './SchedulePicker.svelte';
  import FilterModal from './FilterModal.svelte';
  import BucketConfig from './BucketConfig.svelte';
  import CourseFinderModal from './CourseFinderModal.svelte';
  import DegreeImportWarning from './DegreeImportWarning.svelte';
  import TimeGridModal from './TimeGridModal.svelte';
  import type { TutorialSetup } from '../../services/tutorial/setupTutorial';
  import type { ScheduleManagementService } from '../../services/selection/ScheduleManagementService';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { CourseSelectionService } from '../../services/selection/CourseSelectionService';
  import type { AutoScheduleOrchestrator } from '../../services/scheduling/AutoScheduleOrchestrator';
  import type { ProfileStateManager } from '../../core/state/ProfileStateManager';
  import type { Department } from '../../types/types';

  let {
    getTutorial,
    scheduleManagementService,
    filterService,
    courseSelectionService,
    autoScheduleOrchestrator,
    profileStateManager,
    getDepartments,
  }: {
    // Thunk, not a value: services.tutorial is assigned after this layer
    // mounts, so it must be read lazily at render time. The {#each} re-runs on
    // every uiState.openModals change, so reading it when 'tutorials' opens
    // returns the (by-then-set) instance.
    getTutorial: () => TutorialSetup | undefined;
    scheduleManagementService: ScheduleManagementService;
    filterService: FilterService;
    courseSelectionService: CourseSelectionService;
    autoScheduleOrchestrator: AutoScheduleOrchestrator;
    profileStateManager: ProfileStateManager;
    getDepartments: () => Department[];
  } = $props();

  // Single declarative modal layer - the only modal renderer in the app.
  // Renders a Svelte component for each open modal type-id in the registry
  // below; uiState.openModals is the sole modal source of truth.
  //
  // Closing goes through closeModal(id) so uiState.openModals
  // stays the single source of truth (keeping tutorial snapshots correct);
  // that removal unmounts the component, after its ~225ms hide animation has
  // already played. Payload modals (section-info, delete-local-event) read
  // their data from modalState (set by the trigger sites before modalOpened).
</script>

{#each uiState.openModals as id (id)}
  {#if id === 'mobile-notice'}
    <MobileNotice onRequestClose={() => closeModal('mobile-notice')} />
  {:else if id === 'changelog'}
    <Changelog onRequestClose={() => closeModal('changelog')} />
  {:else if id === 'tutorials'}
    {@const tutorial = getTutorial()}
    {#if tutorial}
      <Tutorials {tutorial} onRequestClose={() => closeModal('tutorials')} />
    {/if}
  {:else if id === 'section-info'}
    <SectionInfo onRequestClose={() => closeModal('section-info')} />
  {:else if id === 'confirm'}
    <ConfirmDialog onRequestClose={() => closeModal('confirm')} />
  {:else if id === 'delete-local-event'}
    <DeleteLocalEvent onRequestClose={() => closeModal('delete-local-event')} />
  {:else if id === 'local-event'}
    <LocalEvent onRequestClose={() => closeModal('local-event')} />
  {:else if id === 'auto-schedule-intro'}
    <AutoScheduleIntro
      onRequestClose={() => closeModal('auto-schedule-intro')}
    />
  {:else if id === 'schedule-picker'}
    <SchedulePicker
      {scheduleManagementService}
      {profileStateManager}
      {getTutorial}
      onRequestClose={() => closeModal('schedule-picker')}
    />
  {:else if id === 'bucket-config'}
    <BucketConfig onRequestClose={() => closeModal('bucket-config')} />
  {:else if id === 'degree-import-warning'}
    <DegreeImportWarning
      onRequestClose={() => closeModal('degree-import-warning')}
    />
  {:else if id === 'course-finder'}
    <CourseFinderModal onRequestClose={() => closeModal('course-finder')} />
  {:else if id === 'filter-modal'}
    <FilterModal
      typeId="filter-modal"
      {filterService}
      {courseSelectionService}
      {autoScheduleOrchestrator}
      {profileStateManager}
      {getDepartments}
      onRequestClose={() => closeModal('filter-modal')}
    />
  {:else if id === 'time-grid'}
    <TimeGridModal
      {filterService}
      onRequestClose={() => closeModal('time-grid')}
    />
  {:else if id === 'auto-schedule-filter'}
    <FilterModal
      typeId="auto-schedule-filter"
      {filterService}
      {courseSelectionService}
      {autoScheduleOrchestrator}
      {profileStateManager}
      {getDepartments}
      onRequestClose={() => closeModal('auto-schedule-filter')}
    />
  {/if}
{/each}
