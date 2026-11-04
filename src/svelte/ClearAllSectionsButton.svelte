<script lang="ts">
  import type { CourseSelectionService } from '../services/selection/CourseSelectionService';
  import { logger } from '../utils/logger';
  import { showConfirm } from './modals/modalState.svelte';
  import { showAppError } from '../services/ui/uiState.svelte';

  let {
    courseSelectionService,
  }: { courseSelectionService: CourseSelectionService } = $props();

  // The reactive sidebar/grid re-render off appState.selectedCourses on their own.
  function handleClick(): void {
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
  type="button"
  class="clear-all-sections-btn"
  onclick={handleClick}>Clear all sections</button
>
