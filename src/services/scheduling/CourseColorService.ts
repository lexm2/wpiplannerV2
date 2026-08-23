import { SelectedCourse } from '../../types/schedule';
import { CourseSelectionService } from '../selection/CourseSelectionService';
import { appState } from '../../core/state/appState.svelte';

const DEFAULT_COLORS = [
  '#4CAF50',
  '#2196F3',
  '#FF9800',
  '#9C27B0',
  '#F44336',
  '#00BCD4',
  '#795548',
  '#607D8B',
  '#3F51B5',
  '#E91E63',
];

export class CourseColorService {
  private courseColorMap: Map<string, string> = new Map();
  private usedColors: Set<string> = new Set();
  private courseSelectionService: CourseSelectionService;

  constructor(courseSelectionService: CourseSelectionService) {
    this.courseSelectionService = courseSelectionService;
  }

  // Release colors for courses that are no longer selected. Driven by an
  // App.svelte $effect keyed on appState.selectedById.
  releaseUnselectedColors(): void {
    const selectedIds = new Set(
      appState.selectedCourses.map(sc => sc.course.id),
    );
    for (const courseId of [...this.courseColorMap.keys()]) {
      if (!selectedIds.has(courseId)) {
        this.releaseCourseColor(courseId);
      }
    }
  }

  precomputeCourseColors(selectedCourses: SelectedCourse[]): void {
    for (const sc of selectedCourses) {
      const courseId = sc.course.id;

      if (sc.customColor) {
        this.courseColorMap.set(courseId, sc.customColor);
        this.usedColors.add(sc.customColor);
      } else if (!this.courseColorMap.has(courseId)) {
        let assignedColor = DEFAULT_COLORS.find(c => !this.usedColors.has(c));
        if (!assignedColor) {
          let hash = 0;
          for (let i = 0; i < courseId.length; i++) {
            hash = courseId.charCodeAt(i) + ((hash << 5) - hash);
          }
          assignedColor =
            DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length];
        }

        this.courseColorMap.set(courseId, assignedColor);
        this.usedColors.add(assignedColor);
      }
    }
  }

  getCourseColor(courseId: string): string {
    return this.courseColorMap.get(courseId) || '#6B7280';
  }

  releaseCourseColor(courseId: string): void {
    const color = this.courseColorMap.get(courseId);
    if (color) {
      this.usedColors.delete(color);
      this.courseColorMap.delete(courseId);
    }
  }

  setCourseColor(courseId: string, color: string): void {
    this.courseColorMap.set(courseId, color);
    this.usedColors.add(color);
    // Persists customColor onto the SelectedCourse, which reassigns
    // appState.selectedCourses - the declarative grid derives off that and
    // re-colors on its own (no separate signal needed).
    this.courseSelectionService.setCourseColor(courseId, color);
  }
}
