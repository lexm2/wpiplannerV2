import { SelectedCourse } from '../../types/schedule'
import type { AutoScheduleSettings, WeeklyTimeSlot } from '../../types/schedule'
import type { CourseComponentSelections } from '../../types/scheduling'
import { CourseSelectionService } from '../selection/CourseSelectionService'
import { FilterService } from '../filtering/FilterService'
import type { ScheduleResult } from './AutoScheduler'
import { SmartScheduler } from './SmartScheduler'
import { ScheduleWorkerManager } from '../../workers/ScheduleWorkerManager'

export interface CalendarEventProvider {
    getAllLocalEventBlockedTimes(): WeeklyTimeSlot[];
    getLocalEventCount(): number;
}

export class AutoScheduleOrchestrator {
    private generatedSchedules: ScheduleResult[][] = [];
    private currentScheduleIndex: number = 0;
    private isApplyingAutoSchedule: boolean = false;
    private courseSelectionService: CourseSelectionService;
    private filterService: FilterService;
    private calendarEventProvider: CalendarEventProvider | null = null;
    private onStateChangeCallback: (() => void) | null = null;

    constructor(
        courseSelectionService: CourseSelectionService,
        filterService: FilterService
    ) {
        this.courseSelectionService = courseSelectionService;
        this.filterService = filterService;
    }

    setCalendarEventProvider(provider: CalendarEventProvider): void {
        this.calendarEventProvider = provider;
    }

    onStateChange(callback: () => void): void {
        this.onStateChangeCallback = callback;
    }

    private notifyStateChange(): void {
        this.onStateChangeCallback?.();
    }

    setupCourseSelectionChangeListener(): void {
        this.courseSelectionService.onSelectionChange(() => {
            if (this.isApplyingAutoSchedule) return;
            this.generatedSchedules = [];
            this.currentScheduleIndex = 0;
            this.notifyStateChange();
        });
    }

    getGeneratedSchedules(): ScheduleResult[][] {
        return this.generatedSchedules;
    }

    getCurrentScheduleIndex(): number {
        return this.currentScheduleIndex;
    }

    getIsApplyingAutoSchedule(): boolean {
        return this.isApplyingAutoSchedule;
    }

    getAllCalendarBlockedTimes(): WeeklyTimeSlot[] {
        return this.calendarEventProvider?.getAllLocalEventBlockedTimes() ?? [];
    }

    getLocalEventCount(): number {
        return this.calendarEventProvider?.getLocalEventCount() ?? 0;
    }

    async navigateSchedule(direction: 1 | -1): Promise<void> {
        if (this.generatedSchedules.length === 0) return;

        this.currentScheduleIndex = (this.currentScheduleIndex + direction + this.generatedSchedules.length) % this.generatedSchedules.length;

        await this.applyScheduleAtIndex(this.currentScheduleIndex);
    }

    prepareLockedSections(selectedCourses: SelectedCourse[]): void {
        for (const selectedCourse of selectedCourses) {
            selectedCourse.lockedSections = new Set();

            if (selectedCourse.selectedLecture) {
                selectedCourse.lockedSections.add(String(selectedCourse.selectedLecture.crn));
            }
            if (selectedCourse.selectedDiscussion) {
                selectedCourse.lockedSections.add(String(selectedCourse.selectedDiscussion.crn));
            }
            if (selectedCourse.selectedLab) {
                selectedCourse.lockedSections.add(String(selectedCourse.selectedLab.crn));
            }
        }
    }

    async generateSchedules(selectedCourses: SelectedCourse[], settings?: AutoScheduleSettings): Promise<boolean> {
        try {
            if (settings) {
                let blockedTimes = [...settings.blockedTimes];
                if (settings.avoidCalendarEvents && this.calendarEventProvider) {
                    const calendarBlockedTimes = this.calendarEventProvider.getAllLocalEventBlockedTimes();
                    blockedTimes = [...blockedTimes, ...calendarBlockedTimes];
                }

                if (blockedTimes.length > 0) {
                    this.filterService.addFilter('blockedTimes', { blockedTimes });
                }

                if (settings.wakeUpTime) {
                    this.filterService.addFilter('wakeUpTime', { wakeUpTime: settings.wakeUpTime });
                }
            }

            const scheduler = new SmartScheduler(this.filterService);
            const input = scheduler.buildCandidateData(selectedCourses);

            if (settings) {
                this.filterService.removeFilter('blockedTimes');
                this.filterService.removeFilter('wakeUpTime');
            }

            if (!input) {
                this.generatedSchedules = [];
                this.currentScheduleIndex = 0;
                return false;
            }

            const effectiveSettings = settings ?? { blockedTimes: [] };
            const allSchedules = await ScheduleWorkerManager.getInstance().generate(input, effectiveSettings, 500);

            if (allSchedules.length === 0) {
                this.generatedSchedules = [];
                this.currentScheduleIndex = 0;
                return false;
            }

            this.generatedSchedules = allSchedules;
            this.currentScheduleIndex = 0;

            await this.applyScheduleAtIndex(0);
            return true;

        } catch (error) {
            console.error('[Auto-Schedule] Error generating schedules:', error);
            this.generatedSchedules = [];
            this.currentScheduleIndex = 0;
            throw error;
        }
    }

    private async applyScheduleAtIndex(index: number): Promise<void> {
        const schedule = this.generatedSchedules[index];
        if (!schedule) {
            console.warn(`[Auto-Schedule] No schedule found at index ${index}`);
            return;
        }

        this.isApplyingAutoSchedule = true;
        try {
            const selections: CourseComponentSelections[] = [];

            for (const result of schedule) {
                if (result.isLocked) {
                    continue;
                }

                selections.push({
                    course: result.course,
                    lecture: result.combination.lecture,
                    discussion: result.combination.discussion,
                    lab: result.combination.lab
                });
            }

            if (selections.length > 0) {
                await this.courseSelectionService.batchSetSelectedComponents(selections, true);
            }
        } finally {
            this.isApplyingAutoSchedule = false;
        }
    }

    resetSchedules(): void {
        this.generatedSchedules = [];
        this.currentScheduleIndex = 0;
    }
}
