// =============================================================================
// Base Sidebar Panel - Abstract base class for sidebar overlay panels
// =============================================================================

import type { SidebarPanel, SidebarPanelOptions, PanelAnimationType } from './types';

const DEFAULT_OPTIONS: Required<SidebarPanelOptions> = {
    containerId: 'schedule-selected-courses',
    animationDuration: 250,
    escapeToClose: true,
    animationType: 'fade',
};

/**
 * Abstract base class for sidebar overlay panels.
 * Provides common functionality for panel lifecycle, animations, and event handling.
 *
 * Subclasses must implement:
 * - panelId: Unique identifier for the panel
 * - panelClass: CSS class added to container when panel is open
 * - renderContent(): Returns the panel's HTML content
 * - attachEventListeners(): Attaches panel-specific event listeners
 */
export abstract class BaseSidebarPanel implements SidebarPanel {
    /** Unique identifier for this panel type */
    abstract readonly panelId: string;

    /** CSS class added to container when panel is open */
    abstract readonly panelClass: string;

    /** Reference to the sidebar container element */
    protected container: HTMLElement | null = null;

    /** Reference to the panel DOM element */
    protected panel: HTMLElement | null = null;

    /** Merged options with defaults */
    protected options: Required<SidebarPanelOptions>;

    /** Bound escape key handler for cleanup */
    private boundEscapeHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(options?: SidebarPanelOptions) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    // =========================================================================
    // Abstract Methods - Must be implemented by subclasses
    // =========================================================================

    /**
     * Render the panel content as HTML string.
     * Called when the panel opens.
     */
    protected abstract renderContent(): string;

    /**
     * Attach event listeners to the panel.
     * Called after the panel is added to the DOM.
     */
    protected abstract attachEventListeners(): void;

    // =========================================================================
    // Optional Hooks - Can be overridden by subclasses
    // =========================================================================

    /** Called after the panel opens and animation completes */
    protected onOpen?(): void;

    /** Called before the panel closes */
    protected onClose?(): void;

    // =========================================================================
    // Public Methods - SidebarPanel interface implementation
    // =========================================================================

    /**
     * Open the panel with animation.
     */
    open(): void {
        const container = document.getElementById(this.options.containerId);
        if (!container) {
            console.error(`[${this.panelId}] Container not found: ${this.options.containerId}`);
            return;
        }

        this.container = container;

        // Scroll container to top
        container.scrollTop = 0;

        // Add state class to prevent background scrolling
        container.classList.add(this.panelClass);

        // Create and configure panel element
        this.panel = document.createElement('div');
        this.panel.className = `sidebar-panel sidebar-panel--${this.panelId}`;
        this.panel.innerHTML = this.renderContent();

        // Add to container
        container.appendChild(this.panel);

        // Trigger animation based on type
        const animClass = this.getOpenAnimationClass();
        requestAnimationFrame(() => {
            if (this.panel) {
                this.panel.classList.add('active');
                if (animClass) {
                    this.panel.classList.add(animClass);
                }
            }
        });

        // Attach event listeners
        this.attachEventListeners();

        // Set up escape key handler
        if (this.options.escapeToClose) {
            this.boundEscapeHandler = this.handleEscapeKey.bind(this);
            document.addEventListener('keydown', this.boundEscapeHandler);
        }

        // Call optional hook
        this.onOpen?.();
    }

    /**
     * Close the panel with animation.
     */
    close(): void {
        if (!this.panel) return;

        // Call optional hook
        this.onClose?.();

        // Apply exit animation based on type
        const exitClass = this.getCloseAnimationClass();
        this.panel.classList.remove('active');
        if (exitClass) {
            this.panel.classList.add(exitClass);
        }

        // Wait for animation, then remove from DOM
        setTimeout(() => {
            if (this.panel && this.container && this.container.contains(this.panel)) {
                this.container.removeChild(this.panel);
                this.container.classList.remove(this.panelClass);
                this.panel = null;
                this.container = null;
            }
        }, this.options.animationDuration);

        // Clean up escape key handler
        this.cleanupEscapeHandler();
    }

    /**
     * Check if the panel is currently open.
     */
    isOpen(): boolean {
        return this.panel !== null;
    }

    /**
     * Clean up all resources.
     * Call this when the panel is no longer needed.
     */
    destroy(): void {
        // Close panel if open
        if (this.isOpen()) {
            // Immediate removal without animation
            if (this.panel && this.container && this.container.contains(this.panel)) {
                this.container.removeChild(this.panel);
                this.container.classList.remove(this.panelClass);
            }
            this.panel = null;
            this.container = null;
        }

        // Clean up event handlers
        this.cleanupEscapeHandler();
    }

    // =========================================================================
    // Protected Helper Methods - Available to subclasses
    // =========================================================================

    /**
     * Re-render the panel content without closing it.
     * Useful for updating content after state changes.
     */
    protected rerender(): void {
        if (!this.panel) return;

        this.panel.innerHTML = this.renderContent();
        this.attachEventListeners();
    }

    /**
     * Get a DOM element within the panel by selector.
     */
    protected querySelector<T extends Element>(selector: string): T | null {
        return this.panel?.querySelector<T>(selector) ?? null;
    }

    /**
     * Get all DOM elements within the panel matching a selector.
     */
    protected querySelectorAll<T extends Element>(selector: string): NodeListOf<T> {
        return this.panel?.querySelectorAll<T>(selector) ?? document.querySelectorAll<T>('__none__');
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    /**
     * Handle escape key press to close the panel.
     */
    private handleEscapeKey(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
        }
    }

    /**
     * Clean up the escape key event handler.
     */
    private cleanupEscapeHandler(): void {
        if (this.boundEscapeHandler) {
            document.removeEventListener('keydown', this.boundEscapeHandler);
            this.boundEscapeHandler = null;
        }
    }

    /**
     * Get the CSS class for the open animation based on animation type.
     */
    private getOpenAnimationClass(): string {
        switch (this.options.animationType) {
            case 'slide-right': return 'slide-in-right';
            case 'slide-left': return 'slide-in-left';
            default: return '';
        }
    }

    /**
     * Get the CSS class for the close animation based on animation type.
     */
    private getCloseAnimationClass(): string {
        switch (this.options.animationType) {
            case 'slide-right': return 'slide-out-left';
            case 'slide-left': return 'slide-out-right';
            default: return '';
        }
    }
}
