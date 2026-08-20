<script lang="ts">
  import { getInlineSVG } from '../utils/iconPaths';
  import type { CourseSelectionService } from '../services/selection/CourseSelectionService';
  import { logger } from '../utils/logger';

  let { courseSelectionService }: { courseSelectionService: CourseSelectionService } = $props();

  // Replaces ScheduleController.setupClearAllSectionsButton + handleClearAllSections.
  // Behavior is identical: empty/no-sections paths alert and bail; otherwise
  // confirm, then clear all components via the service (the reactive sidebar/grid
  // re-render off appState.selectedCourses on their own).
  async function handleClick(): Promise<void> {
    const selectedCourses = courseSelectionService.getSelectedCourses();

    if (selectedCourses.length === 0) {
      alert('No courses selected.');
      return;
    }

    const hasAnySections = selectedCourses.some(sc =>
      sc.selectedLecture || sc.selectedDiscussion || sc.selectedLab
    );

    if (!hasAnySections) {
      alert('No sections selected to clear.');
      return;
    }

    if (confirm('Clear all selected sections for all courses?')) {
      try {
        await courseSelectionService.clearAllComponents();
      } catch (error) {
        logger.error('Failed to clear all components:', error);
        alert('Failed to clear sections. Please try again.');
      }
    }
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
