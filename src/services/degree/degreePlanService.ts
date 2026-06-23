import { appState } from '../../core/state/appState.svelte';
import type { ScheduleManagementService } from '../selection/ScheduleManagementService';
import type { ProfileStateManager } from '../../core/state/ProfileStateManager';
import type { UIStateManager } from '../ui/UIStateManager';
import type { StudentRecord } from '../../types/degree';
import { matchPlannedCourses, type PlanMatchResult } from './planMatcher';

/**
 * Builds a planner schedule from the planned (in-progress) courses of an
 * imported academic-progress record, then swaps to it.
 *
 * Matching is delegated to the pure matchPlannedCourses(); this service handles
 * the schedule lifecycle (create → populate → activate) via the existing
 * ScheduleManagementService. Dependencies are injected once via init(), matching
 * the other standalone scheduling services.
 */
class DegreePlanService {
    private scheduleManagementService: ScheduleManagementService | null = null;
    private profileStateManager: ProfileStateManager | null = null;
    private uiStateManager: UIStateManager | null = null;

    init(
        scheduleManagementService: ScheduleManagementService,
        profileStateManager: ProfileStateManager,
        uiStateManager: UIStateManager,
    ): void {
        this.scheduleManagementService = scheduleManagementService;
        this.profileStateManager = profileStateManager;
        this.uiStateManager = uiStateManager;
    }

    /**
     * Match the record's planned courses against the catalog, create a new
     * "Planned Courses" schedule containing them, activate it, and switch to the
     * schedule page. Returns match stats for the UI to surface.
     */
    async buildFromPlan(record: StudentRecord): Promise<PlanMatchResult['stats']> {
        if (!this.scheduleManagementService || !this.profileStateManager) {
            throw new Error('DegreePlanService not initialized');
        }

        const { selections, year, stats } = matchPlannedCourses(record, appState.loadedDepartments);

        const created = await this.scheduleManagementService.createNewSchedule('Planned Courses', {
            autoActivate: false,
            autoSave: false,
        });
        if (!created.success || !created.schedule) {
            throw new Error(created.error ?? 'Failed to create schedule');
        }
        const scheduleId = created.schedule.id;

        if (selections.length > 0) {
            const update = await this.scheduleManagementService.updateSchedule(
                scheduleId,
                { selectedCourses: selections, year },
                { autoSave: false },
            );
            if (!update.success) {
                throw new Error(update.error ?? 'Failed to add courses to schedule');
            }
        }

        await this.scheduleManagementService.setActiveSchedule(scheduleId);
        this.profileStateManager.save();
        this.uiStateManager?.setPage('schedule');

        return stats;
    }
}

export const degreePlanService = new DegreePlanService();
