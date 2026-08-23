<script lang="ts">
  import { getInlineSVG } from '../utils/iconPaths';
  import type { CourseSelectionService } from '../services/selection/CourseSelectionService';
  import { logger } from '../utils/logger';
  import { showConfirm } from './modals/modalState.svelte';
  import { showAppError } from '../services/ui/uiState.svelte';
  import { sectionsOf } from '../utils/courseUtils';

  let {
    courseSelectionService,
  }: { courseSelectionService: CourseSelectionService } = $props();

  // Replaces ScheduleController.setupClearAllSectionsButton + handleClearAllSections.
  // The reactive sidebar/grid re-render off appState.selectedCourses on their own.
  function handleClick(): void {
    const selectedCourses = courseSelectionService.getSelectedCourses();

    if (selectedCourses.length === 0) {
      showAppError('No courses selected.');
      return;
    }

    const hasAnySections = selectedCourses.some(
      sc => sectionsOf(sc.selected).length > 0,
    );

    if (!hasAnySections) {
      showAppError('No sections selected to clear.');
      return;
    }

    showConfirm({
      title: 'Clear all sections',
      message: 'Clear all selected sections for all courses?',
      confirmLabel: 'Clear sections',
      variant: 'danger',
      onConfirm: () => {
        void (async () => {
          try {
            await courseSelectionService.clearAllComponents();
          } catch (error) {
            logger.error('Failed to clear all components:', error);
            showAppError('Failed to clear sections. Please try again.');
          }
        })();
      },
    });
  }
</script>

<button
  id="clear-all-sections-btn"
  class="btn btn-secondary clear-all-sections-btn"
  title="Clear all selected sections"
  aria-label="Clear all sections"
  onclick={handleClick}
>
  {@html getInlineSVG('ERASER', 'clear-all-eraser-icon')}
</button>
