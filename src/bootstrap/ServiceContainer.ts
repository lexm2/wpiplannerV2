import { ProfileStateManager } from '../core/state/ProfileStateManager'
import { StorageService } from '../services/selection/StorageService'
import { CourseDataService } from '../services/data/courseDataService'
import { CourseSelectionService } from '../services/selection/CourseSelectionService'
import { BitMaskEngine } from '../core/scheduling/BitMaskEngine'
import { ModalService } from '../services/ui/ModalService'
import { FilterService } from '../services/filtering/FilterService'
import { ScheduleManagementService } from '../services/selection/ScheduleManagementService'
import { ThemeManager } from '../themes/ThemeManager'
import { OperationManager } from '../utils/RequestCancellation'
import { UIStateManager } from '../services/ui/UIStateManager'
import { TimestampManager } from '../ui/controllers/TimestampManager'
import type { TutorialSetup } from '../services/tutorial/setupTutorial'

export interface ServiceContainer {
    tutorial?: TutorialSetup;
    profileStateManager: ProfileStateManager;
    storageService: StorageService;
    courseDataService: CourseDataService;
    courseSelectionService: CourseSelectionService;
    conflictDetector: BitMaskEngine;
    modalService: ModalService;
    filterService: FilterService;
    scheduleManagementService: ScheduleManagementService;
    themeManager: ThemeManager;
    operationManager: OperationManager;
    uiStateManager: UIStateManager;
    timestampManager: TimestampManager;
}
