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
       bucket list scrolls. The rail leads in the DOM because it leads visually;
       keeping the two orders together is what makes tab order match the page. -->
  <div class="degree-shell">
    <aside class="degree-pane degree-rail" aria-label="Unassigned courses">
      <UnassignedRail />
    </aside>
    <div class="degree-pane degree-main">
      <div class="degree-content">
        <DegreeSummary {record} {degreeImportService} />
        <RequirementList />
      </div>
    </div>
  </div>
{:else}
  <div class="degree-pane degree-main">
    <!-- The import state is a reading column, not a dashboard: it keeps the
         narrow width the bucket grid gave up. -->
    <div class="degree-content degree-content-narrow">
      <DegreeImport {degreeImportService} />
    </div>
  </div>
{/if}
