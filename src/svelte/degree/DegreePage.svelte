<script lang="ts">
  import type { DegreeImportService } from '../../services/degree/degreeImportService';
  import { degreeState } from './degreeState.svelte';
  import DegreeImport from './DegreeImport.svelte';
  import DegreeSummary from './DegreeSummary.svelte';
  import RequirementList from './RequirementList.svelte';
  import UnassignedRail from './UnassignedRail.svelte';

  let { degreeImportService }: { degreeImportService: DegreeImportService } =
    $props();

  const record = $derived(degreeState.record);
  const ready = $derived(degreeState.status === 'ready' && record !== null);
</script>

{#if ready && record}
  <!-- Two independently-scrolling panes so the rail stays reachable while the
       bucket list scrolls. -->
  <div class="degree-shell">
    <div class="degree-pane degree-main">
      <header class="content-header degree-page-header">
        <h1 class="degree-page-title">Degree</h1>
      </header>
      <div class="degree-content">
        <DegreeSummary {record} {degreeImportService} />
        <RequirementList />
      </div>
    </div>
    <aside class="degree-pane degree-rail" aria-label="Unassigned courses">
      <UnassignedRail />
    </aside>
  </div>
{:else}
  <div class="degree-pane degree-main">
    <header class="content-header degree-page-header">
      <h1 class="degree-page-title">Degree</h1>
    </header>
    <div class="degree-content">
      <DegreeImport {degreeImportService} />
    </div>
  </div>
{/if}
