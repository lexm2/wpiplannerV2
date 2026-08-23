<script lang="ts">
  // Mount point for the component-selection wizard. Mounted once (into
  // #schedule-sidebar-content, a sibling of the ScheduleSidebar courses wrapper) and
  // mounts/destroys a fresh ComponentSelectionWizard per open. Driven entirely by the
  // wizardState store - ScheduleController calls wizardState.open()/close().
  import { wizardState } from './wizardState.svelte';
  import ComponentSelectionWizard from './ComponentSelectionWizard.svelte';
</script>

{#if wizardState.isOpen}
  <!-- Key on the course so reopening for a DIFFERENT course remounts a fresh
       wizard (ComponentSelectionWizard snapshots its config at mount). Without
       this, a rapid close→open - which Svelte batches so the {#if} never cycles
       to false - would leave the previous course's wizard on screen. -->
  {#key wizardState.config?.course.id}
    <ComponentSelectionWizard />
  {/key}
{/if}
