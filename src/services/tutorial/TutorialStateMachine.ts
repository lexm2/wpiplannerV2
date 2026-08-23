import type { TutorialSnapshot } from '../../types/tutorial';
import type { ServiceContainer } from '../../bootstrap/ServiceContainer';
import { componentWizardService } from '../../services/scheduling/componentWizardService';
import { autoScheduleService } from '../../services/scheduling/autoScheduleService';
import { modalState } from '../../svelte/modals/modalState.svelte';
import {
  getUiSnapshot,
  restoreUiSnapshot,
  closeAllModals,
  openModal,
} from '../ui/uiState.svelte';
import { deepClone } from '../../utils/jsonSerializer';

export class TutorialStateMachine {
  private snapshots: Map<number, TutorialSnapshot> = new Map();

  constructor(private services: ServiceContainer) {}

  captureSnapshot(stepIndex: number): void {
    const state = this.services.profileStateManager.getState();
    const snapshot: TutorialSnapshot = {
      stepIndex,
      activeScheduleId: state.activeScheduleId,
      schedules: deepClone(state.schedules),
      preferences: deepClone(state.preferences),
      uiState: getUiSnapshot(),
      activeFilters: deepClone(this.services.filterService.getActiveFilters()),
    };
    this.snapshots.set(stepIndex, snapshot);
  }

  async restoreSnapshot(stepIndex: number): Promise<void> {
    const snapshot = this.snapshots.get(stepIndex);
    if (!snapshot) return;

    closeAllModals();
    componentWizardService.closeComponentWizard();

    this.services.profileStateManager.restoreTutorialState({
      activeScheduleId: snapshot.activeScheduleId,
      schedules: deepClone(snapshot.schedules),
      preferences: deepClone(snapshot.preferences),
    });

    this.services.filterService.clearFilters();
    for (const filter of snapshot.activeFilters) {
      this.services.filterService.addFilter(filter.id, filter.criteria);
    }

    restoreUiSnapshot(snapshot.uiState);

    if (snapshot.uiState.wizard.isOpen && snapshot.uiState.wizard.courseId) {
      const { courseId, step } = snapshot.uiState.wizard;
      const selected = this.services.courseSelectionService
        .getSelectedCourses()
        .find(sc => sc.course.id === courseId);
      if (selected) {
        componentWizardService.openComponentWizard(
          selected.course,
          selected,
          step ?? undefined,
        );
      }
    }

    for (const typeId of snapshot.uiState.openModals) {
      this.reopenModal(typeId);
    }
  }

  hasSnapshot(stepIndex: number): boolean {
    return this.snapshots.has(stepIndex);
  }

  clear(): void {
    this.snapshots.clear();
  }

  private reopenModal(typeId: string): void {
    switch (typeId) {
      case 'filter-modal':
        modalState.filter = { mode: 'filter' };
        openModal('filter-modal');
        break;
      case 'schedule-picker':
        openModal('schedule-picker');
        break;
      case 'auto-schedule':
        autoScheduleService.openAutoSchedule();
        break;
      case 'auto-schedule-intro':
        autoScheduleService.openAutoScheduleIntro();
        break;
      case 'auto-schedule-filter':
        autoScheduleService.openAutoScheduleFilter();
        break;
    }
  }
}
