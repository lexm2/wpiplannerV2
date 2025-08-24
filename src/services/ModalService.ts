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

        // Trigger show animation
        requestAnimationFrame(() => {
            modalElement.classList.add('show');
        });
    }

    hideModal(id: string): void {
        const modalElement = this.modals.get(id);
        if (modalElement) {
            modalElement.classList.add('hide');
            
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
        return `modal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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