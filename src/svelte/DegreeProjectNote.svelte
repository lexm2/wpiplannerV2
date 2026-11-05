<script lang="ts">
  import styles from '../styles/components/course-list.module.css';
  import { appState } from '../core/state/appState.svelte';
  import { degreeProjectNotes } from '../utils/degreeProjects';
  import { getInlineSVG } from '../utils/iconPaths';
  import { slideFade } from './transitions';
  import type { FilterService } from '../services/filtering/FilterService';
  import type {
    AcademicYearFilterCriteria,
    SearchTextFilterCriteria,
  } from '../types/filters';

  let { filterService }: { filterService: FilterService } = $props();

  const notes = $derived.by(() => {
    const search =
      filterService.getCriteria<SearchTextFilterCriteria>('searchText');
    // An instructor-only search is about people, not topics.
    if (!search || search.professorOnly) return [];
    const year =
      filterService.getCriteria<AcademicYearFilterCriteria>(
        'academicYear',
      )?.year;
    return degreeProjectNotes(
      search.query,
      appState.loadedDepartments
        .flatMap(d => d.courses)
        .filter(
          c => year === undefined || year === 'all' || c.academicYear === year,
        ),
    );
  });
</script>

<!-- Mounted while empty, so a screen reader hears the note when it arrives. -->
<div role="status" aria-live="polite" data-degree-project-note>
  {#each notes as note (note)}
    <p
      class={styles['degree-project-note']}
      transition:slideFade={{ duration: 220 }}
    >
      {@html getInlineSVG('SCHOOL', styles['degree-project-note-icon'])}
      <span>{note}</span>
    </p>
  {/each}
</div>
