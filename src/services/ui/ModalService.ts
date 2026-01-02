/**
 * Centralized modal lifecycle management with z-index coordination, animation sequencing, and event handling
 */
export class ModalService {
    private modals: Map<string, HTMLElement> = new Map();
    private currentZIndex: number = 1000;

    showModal(id: string, modalElement: HTMLElement): void {
        // Remove existing modal with same ID if it exists
        this.hideModal(id);

        // Set z-index
        modalElement.style.zIndex = this.currentZIndex.toString();
        this.currentZIndex += 10;

        // Store modal reference
        this.modals.set(id, modalElement);

        // Inject into DOM
        document.body.appendChild(modalElement);

        // Trigger show animation - double rAF ensures browser paints initial state first
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                modalElement.classList.add('show');
                // Also apply show class to dialog for animation (CSS Modules compatibility)
                const dialog = modalElement.querySelector('.modal-dialog');
                if (dialog) {
                    dialog.classList.add('show');
                }
            });
        });
    }

    hideModal(id: string): void {
        const modalElement = this.modals.get(id);
        if (modalElement) {
            modalElement.classList.add('hide');
            // Also apply hide class to dialog for animation (CSS Modules compatibility)
            const dialog = modalElement.querySelector('.modal-dialog');
            if (dialog) {
                dialog.classList.add('hide');
            }

            setTimeout(() => {
                if (modalElement.parentNode) {
                    modalElement.parentNode.removeChild(modalElement);
                }
                this.modals.delete(id);
            }, 200);
        }
    }

    hideAllModals(): void {
        const modalIds = Array.from(this.modals.keys());
        modalIds.forEach(id => this.hideModal(id));
    }

    isModalOpen(id: string): boolean {
        return this.modals.has(id);
    }

    getOpenModals(): string[] {
        return Array.from(this.modals.keys());
    }

    generateId(): string {
        return `modal-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    // Utility method for backdrop and escape key handling
    setupModalBehavior(modalElement: HTMLElement, id: string, options: {
        closeOnBackdrop?: boolean;
        closeOnEscape?: boolean;
    } = {}): void {
        const { closeOnBackdrop = true, closeOnEscape = true } = options;

        // Backdrop click handling
        if (closeOnBackdrop) {
            modalElement.addEventListener('click', (event) => {
                if (event.target === modalElement) {
                    this.hideModal(id);
                }
            });
        }

        // Escape key handling
        if (closeOnEscape) {
            const escapeHandler = (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    this.hideModal(id);
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);
        }
    }
}