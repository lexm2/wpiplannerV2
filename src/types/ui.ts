export interface SearchFilter {
    departments: string[];
    timeSlots: TimeSlot[];
    professors: string[];
    availabilityOnly: boolean;
    creditRange: { min: number; max: number };
}

export interface TimeSlot {
    startTime: { hours: number; minutes: number };
    endTime: { hours: number; minutes: number };
    days: string[];
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

export interface DragDropState {
    isDragging: boolean;
    draggedItem: any;
    dropZone: string | null;
}

export interface ViewState {
    currentView: 'search' | 'schedule' | 'planner';
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

export interface ModalButton {
    text: string;
    style: 'primary' | 'secondary' | 'danger';
    callback?: () => void;
}

export interface Modal {
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
    data?: any;
}

export interface TemplateModal {
    id: string;
    title: string;
    template: string;
    data: any;
    closable?: boolean;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
}