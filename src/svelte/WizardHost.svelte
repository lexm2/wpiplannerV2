<script lang="ts">
  // Mount point for the component-selection wizard. Mounted once (into
  // #schedule-sidebar-content, a sibling of the ScheduleSidebar courses wrapper) and
  // mounts/destroys a fresh ComponentSelectionWizard per open. Driven entirely by the
  // wizardState store — ScheduleController calls wizardState.open()/close().
  import { wizardState } from './wizardState.svelte';
  import ComponentSelectionWizard from './ComponentSelectionWizard.svelte';
</script>

{#if wizardState.isOpen}
  <ComponentSelectionWizard />
{/if}
