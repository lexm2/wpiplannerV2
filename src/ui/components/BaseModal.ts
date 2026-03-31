import type { IModal, ModalOptions } from '../../types/modal';
import { ModalService } from '../../services/ui/ModalService';
import type { UIStateManager } from '../../services/ui/UIStateManager';

/**
 * Unified abstract base class for all modal implementations.
 * Provides common lifecycle management, event handling, and DOM utilities.
 * All modals should extend this class.
 */
export abstract class BaseModal implements IModal {
    protected modalService: ModalService;
    protected uiStateManager: UIStateManager | null;
    protected modalId: string | null = null;
    protected modalElement: HTMLElement | null = null;
    protected closeCallbacks: Array<() => void> = [];

    abstract get modalTypeId(): string;

    constructor(modalService: ModalService, uiStateManager?: UIStateManager) {
        this.modalService = modalService;
        this.uiStateManager = uiStateManager ?? null;
    }

    /**
     * Display the modal - must be implemented by subclasses
     */
    abstract show(...args: unknown[]): void | Promise<void> | string;

    /**
     * Hide the modal via ModalService
     */
    hide(): void {
        if (this.modalId) {
            this.uiStateManager?.modalClosed(this.modalTypeId);
            this.modalService.hideModal(this.modalId);
            this.triggerCloseCallbacks();
            this.modalId = null;
            this.modalElement = null;
        }
    }

    /**
     * Check if modal is currently open
     */
    isOpen(): boolean {
        return this.modalId !== null && this.modalService.isModalOpen(this.modalId);
    }

    /**
     * Register callback to fire on modal close
     */
    onClose(callback: () => void): void {
        this.closeCallbacks.push(callback);
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        if (this.isOpen()) {
            this.hide();
        }
        this.closeCallbacks = [];
    }

    /**
     * Show modal via ModalService with standard behavior.
     * Call this from subclass show() method.
     */
    protected showModal(element: HTMLElement, options: ModalOptions = {}): string {
        this.modalId = this.modalService.generateId();
        this.modalElement = element;
        this.modalService.showModal(this.modalId, element);
        this.modalService.setupModalBehavior(element, this.modalId, {
            closeOnBackdrop: options.closeOnBackdrop ?? true,
            closeOnEscape: options.closeOnEscape ?? true
        });
        this.uiStateManager?.modalOpened(this.modalTypeId);
        return this.modalId;
    }

    /**
     * Get the current modal ID
     */
    protected getModalId(): string | null {
        return this.modalId;
    }

    /**
     * Escape HTML to prevent XSS
     */
    protected escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Trigger all registered close callbacks
     */
    private triggerCloseCallbacks(): void {
        this.closeCallbacks.forEach(cb => cb());
    }
}
