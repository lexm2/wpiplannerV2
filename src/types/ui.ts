import { DayOfWeek, SimpleTime, TimeSlot } from './types';

export interface SearchFilter {
    departments: string[];
    timeSlots: TimeSlot[];
    professors: string[];
    availabilityOnly: boolean;
    creditRange: { min: number; max: number };
}

export interface CourseDisplayProps {
    showDescription: boolean;
    showSections: boolean;
    showEnrollment: boolean;
    highlightConflicts: boolean;
}

export interface GridTimeSlot {
    hour: number;
    minute: number;
    displayTime: string;
}

export interface ScheduleGridCell {
    timeSlot: GridTimeSlot;
    day: string;
    course?: {
        id: string;
        name: string;
        section: string;
        color: string;
    };
    isConflict: boolean;
}

export interface DragDropState<T = unknown> {
    isDragging: boolean;
    draggedItem: T | null;
    dropZone: string | null;
}

export enum ViewType {
    SEARCH = 'search',
    SCHEDULE = 'schedule',
    PLANNER = 'planner'
}

export interface ViewState {
    currentView: ViewType;
    selectedSemester: string;
    selectedYear: number;
    isLoading: boolean;
    error: string | null;
}

export enum ModalType {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CONFIRM = 'confirm',
    CUSTOM = 'custom'
}

export enum ButtonStyle {
    PRIMARY = 'primary',
    SECONDARY = 'secondary',
    DANGER = 'danger'
}

export interface ModalButton {
    text: string;
    style: ButtonStyle;
    callback?: () => void;
}

export interface Modal<TData = unknown> {
    id: string;
    title: string;
    content: string;
    type: ModalType;
    buttons?: ModalButton[];
    closable?: boolean;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    templatePath?: string;
    customCSS?: string;
    data?: TData;
}

export interface TemplateModal<TData = unknown> {
    id: string;
    title: string;
    template: string;
    data: TData;
    closable?: boolean;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
}