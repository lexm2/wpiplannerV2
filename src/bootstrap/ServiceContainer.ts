import { ProfileStateManager } from '../core/state/ProfileStateManager'
import { StorageService } from '../services/selection/StorageService'
import { CourseDataService } from '../services/data/courseDataService'
import { CourseSelectionService } from '../services/selection/CourseSelectionService'
import { BitMaskEngine } from '../core/scheduling/BitMaskEngine'
import { ModalService } from '../services/ui/ModalService'
import { CourseFilterService } from '../services/filtering/CourseFilterService'
import { ScheduleFilterService } from '../services/filtering/ScheduleFilterService'
import { ScheduleManagementService } from '../services/selection/ScheduleManagementService'
import { ThemeManager } from '../themes/ThemeManager'
import { OperationManager } from '../utils/RequestCancellation'
import { UIStateManager } from '../services/ui/UIStateManager'
import { TimestampManager } from '../ui/controllers/TimestampManager'

export interface ServiceContainer {
    profileStateManager: ProfileStateManager;
    storageService: StorageService;
    courseDataService: CourseDataService;
    courseSelectionService: CourseSelectionService;
    conflictDetector: BitMaskEngine;
    modalService: ModalService;
    filterService: CourseFilterService;
    scheduleFilterService: ScheduleFilterService;
    scheduleManagementService: ScheduleManagementService;
    themeManager: ThemeManager;
    operationManager: OperationManager;
    uiStateManager: UIStateManager;
    timestampManager: TimestampManager;
}
