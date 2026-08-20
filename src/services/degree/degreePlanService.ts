import { appState } from '../../core/state/appState.svelte';
import { setPage, showAppError } from '../ui/uiState.svelte';
import type { ScheduleManagementService } from '../selection/ScheduleManagementService';
import type { ProfileStateManager } from '../../core/state/ProfileStateManager';
import type { FilterService } from '../filtering/FilterService';
import type { Requirement, StudentRecord } from '../../types/degree';
import { matchPlannedCourses, type PlanMatchResult } from './planMatcher';
import { inferRequirementDepartments, matchScheduleToRequirements } from './requirementMatching';
import { getDegreeBucketCriteria } from './degreeBucketRules';
import { findCatalogCourse } from './catalogLookup';
import { degreeState } from '../../svelte/degree/degreeState.svelte';
import { courseListState } from '../../svelte/courseListState.svelte';

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
    private filterService: FilterService | null = null;

    init(
        scheduleManagementService: ScheduleManagementService,
        profileStateManager: ProfileStateManager,
        filterService: FilterService,
    ): void {
        this.scheduleManagementService = scheduleManagementService;
        this.profileStateManager = profileStateManager;
        this.filterService = filterService;
    }

    /**
     * Match the record's planned courses against the catalog, create a new
     * "Enrolled" schedule containing them, activate it, and switch to the
     * schedule page. Returns match stats for the UI to surface.
     */
    async buildFromPlan(record: StudentRecord): Promise<PlanMatchResult['stats']> {
        if (!this.scheduleManagementService || !this.profileStateManager) {
            throw new Error('DegreePlanService not initialized');
        }

        const { selections, year, stats } = matchPlannedCourses(record, appState.loadedDepartments);

        const created = await this.scheduleManagementService.createNewSchedule('Enrolled', {
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
        setPage('schedule');

        return stats;
    }

    /**
     * Toggle the non-destructive "what does my current schedule fill?" preview.
     * Computes which requirements the active schedule's courses match and stores
     * the result on degreeState (overlay tiles read it); a second call clears it.
     */
    checkActiveSchedule(): void {
        if (degreeState.scheduleMatch) {
            degreeState.clearOverlay();
            return;
        }
        const record = degreeState.record;
        if (!record) return;
        degreeState.scheduleMatch = matchScheduleToRequirements(
            record,
            appState.selectedCourses,
            appState.loadedDepartments,
        );
    }

    /**
     * From an empty requirement slot: filter the courses page to the departments
     * that give credit for the requirement (+ the active academic year) and
     * navigate there so the user can pick a course.
     */
    browseForRequirement(req: Requirement): void {
        if (!this.filterService) return;

        // Prefer authoritative tracking-sheet rules (valid departments + excluded
        // course codes) via the backend-only degreeBucket filter; fall back to the
        // applied-course heuristic when the sheets carry no rule for this bucket.
        const record = degreeState.record;
        const classYear = record?.startYear != null ? record.startYear + 4 : null;
        const bucketCriteria = record
            ? getDegreeBucketCriteria(record.major, classYear, req.category, req.name)
            : null;

        if (bucketCriteria) {
            this.filterService.addFilter('degreeBucket', bucketCriteria);
            this.filterService.removeFilter('department');
        } else {
            this.filterService.removeFilter('degreeBucket');
            const depts = inferRequirementDepartments(req, appState.loadedDepartments);
            if (depts.length) {
                this.filterService.addFilter('department', { departments: depts });
            } else {
                this.filterService.removeFilter('department');
            }
        }

        const year = appState.activeSchedule?.year ?? this.profileStateManager?.getDefaultAcademicYear();
        if (year !== undefined) {
            this.filterService.addFilter('academicYear', { year });
        }

        setPage('planner');
    }

    /**
     * Open a degree course's catalog entry on the classes (planner) page: resolve
     * the linked Course, surface it (search + year filter), select it so the
     * detail panel shows it, and scroll its list entry into view. If the catalog
     * has no such course, alert and do nothing else.
     */
    openCourse(code: string, year: number | null): void {
        const preferredYear =
            year ?? appState.activeSchedule?.year ?? this.profileStateManager?.getDefaultAcademicYear() ?? null;
        const course = findCatalogCourse(code, preferredYear, appState.loadedDepartments);

        if (!course) {
            if (typeof alert === 'function') showAppError(`${code} could not be found in the course catalog.`);
            return;
        }

        if (this.filterService) {
            this.filterService.addFilter('searchText', { query: `${course.departmentAbbr}${course.number}` });
            if (course.academicYear !== undefined) {
                this.filterService.addFilter('academicYear', { year: course.academicYear });
            }
        }

        courseListState.selectedCourse = course;
        setPage('planner');
        scrollCourseIntoView(course.id);
    }
}

/** Best-effort scroll of a course's list entry into view once the planner renders it. */
function scrollCourseIntoView(courseId: string): void {
    if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
    const selector = `#course-container [data-course-id="${typeof CSS !== 'undefined' ? CSS.escape(courseId) : courseId}"]`;
    let tries = 0;
    const tick = () => {
        const el = document.querySelector(selector);
        if (el) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            return;
        }
        if (tries++ < 12) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

export const degreePlanService = new DegreePlanService();
