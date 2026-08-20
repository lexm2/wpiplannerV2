import { ProfileStateManager } from '../core/state/ProfileStateManager'
import { CourseDataService } from '../services/data/courseDataService'
import { CourseSelectionService } from '../services/selection/CourseSelectionService'
import { BitMaskEngine } from '../core/scheduling/BitMaskEngine'
import { FilterService } from '../services/filtering/FilterService'
import { ScheduleManagementService } from '../services/selection/ScheduleManagementService'
import { ThemeManager } from '../themes/ThemeManager'
import { OperationManager } from '../utils/RequestCancellation'
import { CourseColorService } from '../services/scheduling/CourseColorService'
import { AutoScheduleOrchestrator } from '../services/scheduling/AutoScheduleOrchestrator'
import { DegreeImportService } from '../services/degree/degreeImportService'
import type { TutorialSetup } from '../services/tutorial/setupTutorial'

export interface ServiceContainer {
    tutorial?: TutorialSetup;
    profileStateManager: ProfileStateManager;
    courseDataService: CourseDataService;
    courseSelectionService: CourseSelectionService;
    conflictDetector: BitMaskEngine;
    filterService: FilterService;
    scheduleManagementService: ScheduleManagementService;
    themeManager: ThemeManager;
    operationManager: OperationManager;
    colorService: CourseColorService;
    autoScheduleOrchestrator: AutoScheduleOrchestrator;
    degreeImportService: DegreeImportService;
}
