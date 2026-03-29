import type { TutorialSnapshot } from '../../types/tutorial';
import type { ServiceContainer } from '../../bootstrap/ServiceContainer';
import type { MainController } from '../../ui/controllers/MainController';
import { setReplacer, setReviver } from '../../utils';

export class TutorialStateMachine {
    private snapshots: Map<number, TutorialSnapshot> = new Map();

    constructor(
        private services: ServiceContainer,
        private mainController: MainController,
    ) {}

    captureSnapshot(stepIndex: number): void {
        const state = this.services.profileStateManager.getState();
        const snapshot: TutorialSnapshot = {
            stepIndex,
            activeScheduleId: state.activeScheduleId,
            schedules: this.deepClone(state.schedules),
            preferences: this.deepClone(state.preferences),
            uiState: this.services.uiStateManager.getSnapshot(),
            activeFilters: this.deepClone(this.services.filterService.getActiveFilters()),
        };
        this.snapshots.set(stepIndex, snapshot);
    }

    async restoreSnapshot(stepIndex: number): Promise<void> {
        const snapshot = this.snapshots.get(stepIndex);
        if (!snapshot) return;

        // 1. Close everything
        this.services.modalService.hideAllModals();
        this.mainController.closeWizard();

        // 2. Restore profile state
        this.services.profileStateManager.restoreTutorialState({
            activeScheduleId: snapshot.activeScheduleId,
            schedules: this.deepClone(snapshot.schedules),
            preferences: this.deepClone(snapshot.preferences),
        });

        // 3. Restore filters
        this.services.filterService.clearFilters();
        for (const filter of snapshot.activeFilters) {
            this.services.filterService.addFilter(filter.id, filter.criteria);
        }

        // 4. Restore page/view (restoreState clears modal/wizard tracking internally)
        this.services.uiStateManager.restoreState(snapshot.uiState);

        // 5. Re-open wizard if it was open
        if (snapshot.uiState.wizard.isOpen && snapshot.uiState.wizard.courseId) {
            this.mainController.openWizardForCourse(snapshot.uiState.wizard.courseId);
        }

        // 6. Re-open modals that were open
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
                document.querySelector<HTMLElement>('#filter-btn')?.click();
                break;
            case 'schedule-picker':
                document.querySelector<HTMLElement>('#schedule-picker-btn')?.click();
                break;
        }
    }

    private deepClone<T>(obj: T): T {
        return JSON.parse(JSON.stringify(obj, setReplacer), setReviver);
    }
}
