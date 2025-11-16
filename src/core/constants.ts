import { SimpleTime } from '../types/types'

export enum ValidationErrorCode {
    INVALID_TYPE = 'INVALID_TYPE',
    INVALID_ARRAY = 'INVALID_ARRAY',
    MISSING_REQUIRED = 'MISSING_REQUIRED',
    INVALID_CREDITS = 'INVALID_CREDITS',
    MISSING_DEPARTMENT = 'MISSING_DEPARTMENT',
    MISSING_TIME_RANGE = 'MISSING_TIME_RANGE',
    INVALID_TIME_FORMAT = 'INVALID_TIME_FORMAT',
    INVALID_TIME_ORDER = 'INVALID_TIME_ORDER',
    INVALID_SET = 'INVALID_SET',
    DUPLICATE_IDS = 'DUPLICATE_IDS',
    DANGLING_REFERENCE = 'DANGLING_REFERENCE'
}

export enum ValidationSeverity {
    ERROR = 'error',
    CRITICAL = 'critical'
}

export enum StateChangeEventType {
    SCHEDULE_CHANGED = 'schedule_changed',
    COURSES_CHANGED = 'courses_changed',
    PREFERENCES_CHANGED = 'preferences_changed',
    ACTIVE_SCHEDULE_CHANGED = 'active_schedule_changed',
    SAVE_STATE_CHANGED = 'save_state_changed'
}

export enum FilterEventType {
    ADD = 'add',
    REMOVE = 'remove',
    CLEAR = 'clear',
    UPDATE = 'update'
}

export enum StorageKey {
    USER_STATE = 'wpi-planner-user-state',
    PREFERENCES = 'wpi-planner-preferences',
    SCHEDULES = 'wpi-planner-schedules',
    THEME = 'wpi-planner-theme',
    ACTIVE_SCHEDULE_ID = 'wpi-planner-active-schedule-id',
    TRANSACTION_LOG = 'wpi-planner-transaction-log'
}

export const VALID_DAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
