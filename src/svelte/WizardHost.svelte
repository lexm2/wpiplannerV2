<script lang="ts">
  // Mount point for the component-selection wizard: mounts/destroys a fresh
  // ComponentSelectionWizard per open, driven entirely by the wizardState store.
  import { wizardState } from './wizardState.svelte';
  import ComponentSelectionWizard from './ComponentSelectionWizard.svelte';
</script>

{#if wizardState.isOpen}
  <!-- Key on the course so reopening for a DIFFERENT course remounts a fresh
       wizard (ComponentSelectionWizard snapshots its config at mount). Without
       this, a rapid close->open - which Svelte batches so the {#if} never
       cycles to false - would leave the previous course's wizard on screen. -->
  {#key wizardState.config?.course.id}
    <ComponentSelectionWizard />
  {/key}
{/if}
