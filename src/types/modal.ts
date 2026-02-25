/**
 * Core modal interface that all modals must implement
 */
export interface IModal {
    show(...args: any[]): void | Promise<void> | string;
    hide(): void;
    isOpen(): boolean;

    // Optional lifecycle methods
    destroy?(): void;
    onClose?(callback: () => void): void;
}

/**
 * Options for modal behavior and configuration
 */
export interface ModalOptions {
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    animated?: boolean;
    onClose?: () => void;
    onShow?: () => void;
}

/**
 * Modal type variants for info/alert modals
 */
export type ModalType = 'info' | 'warning' | 'error' | 'success';

/**
 * Modal event types for event-driven patterns
 */
export type ModalEventType = 'show' | 'hide' | 'destroy';

/**
 * Modal event data
 */
export interface ModalEvent {
    type: ModalEventType;
    modalId: string;
    timestamp: number;
}
