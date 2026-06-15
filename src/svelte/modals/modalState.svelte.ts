import type { SectionData } from '../../types/modal';
import type { LocalCalendarEvent } from '../../types/schedule';

export interface DeleteLocalEventPayload {
    title: string;
    onConfirm: () => void;
}

export interface LocalEventPayload {
    /** Callback when the event is saved */
    onSave: (event: Omit<LocalCalendarEvent, 'id' | 'createdAt' | 'updatedAt'>) => void;
    /** Optional: existing event to edit (if not provided, creates new) */
    existingEvent?: LocalCalendarEvent;
}

class ModalState {
    sectionInfo = $state.raw<SectionData | null>(null);
    deleteLocalEvent = $state.raw<DeleteLocalEventPayload | null>(null);
    localEvent = $state.raw<LocalEventPayload | null>(null);
}

export const modalState = new ModalState();
