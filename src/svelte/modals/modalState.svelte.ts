import type { SectionData } from '../../types/modal';

export interface DeleteLocalEventPayload {
    title: string;
    onConfirm: () => void;
}

class ModalState {
    sectionInfo = $state.raw<SectionData | null>(null);
    deleteLocalEvent = $state.raw<DeleteLocalEventPayload | null>(null);
}

export const modalState = new ModalState();
