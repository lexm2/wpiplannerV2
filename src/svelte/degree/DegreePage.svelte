<script lang="ts">
  import type { DegreeImportService } from '../../services/degree/degreeImportService';
  import { degreeState } from './degreeState.svelte';
  import DegreeImport from './DegreeImport.svelte';
  import DegreeSummary from './DegreeSummary.svelte';
  import RequirementList from './RequirementList.svelte';
  import UnassignedRail from './UnassignedRail.svelte';
  import SidePanel from '../SidePanel.svelte';
  import { PANEL_WIDTHS } from '../panelWidths';

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
    <!-- .degree-rail stays on the panel, not the scroller: courseDrag resolves
         the unassign target with closest('.degree-rail'), so a drop on the
         resize seam still counts as a drop on the rail. .degree-pane goes on
         the scroller inside, which is what dragAutoScroll edge-scrolls. -->
    <SidePanel
      class="degree-rail"
      label="Unassigned courses"
      config={PANEL_WIDTHS.degreeRail}
      edge="right"
      resizeLabel="Resize the unassigned rail"
    >
      <div class="degree-pane degree-side-scroll">
        <UnassignedRail />
      </div>
    </SidePanel>
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
