<script lang="ts">
  import type { DegreeImportService } from '../../services/degree/degreeImportService';
  import { degreeState } from './degreeState.svelte';
  import DegreeImport from './DegreeImport.svelte';
  import DegreeSummary from './DegreeSummary.svelte';
  import RequirementList from './RequirementList.svelte';

  let { degreeImportService }: { degreeImportService: DegreeImportService } =
    $props();

  const record = $derived(degreeState.record);
  const ready = $derived(degreeState.status === 'ready' && record !== null);
</script>

<div class="degree-content">
  {#if ready && record}
    <DegreeSummary {record} {degreeImportService} />
    <RequirementList {record} />
  {:else}
    <DegreeImport {degreeImportService} />
  {/if}
</div>
