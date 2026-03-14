// =============================================================================
// Base Sidebar Panel - Abstract base class for sidebar overlay panels
// =============================================================================

import type {
    SidebarPanel,
    SidebarPanelOptions,
    SidebarListItem,
    SidebarListGroup,
    AnimatedListOptions,
} from './types';

const DEFAULT_OPTIONS: Required<Omit<SidebarPanelOptions, 'animatedList'>> = {
    containerId: 'schedule-sidebar-content',
    animationDuration: 250,
    escapeToClose: true,
    animationType: 'fade',
};

const DEFAULT_LIST_OPTIONS: Required<AnimatedListOptions> = {
    staggerDelay: 40,
    itemClass: 'sidebar-list-item',
    listClass: 'sidebar-list',
    groupClass: 'sidebar-list-group',
    groupHeaderClass: 'sidebar-list-group-header',
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
    protected options: Required<Omit<SidebarPanelOptions, 'animatedList'>>;

    /** Animated list configuration (if enabled) */
    protected listOptions: Required<AnimatedListOptions> | null = null;

    /** Bound escape key handler for cleanup */
    private boundEscapeHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(options?: SidebarPanelOptions) {
        const { animatedList, ...panelOptions } = options || {};
        this.options = { ...DEFAULT_OPTIONS, ...panelOptions };

        // Initialize list options if animated list is enabled
        if (animatedList) {
            this.listOptions = { ...DEFAULT_LIST_OPTIONS, ...animatedList };
        }
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
    // Optional Methods for Animated Lists - Can be overridden by subclasses
    // =========================================================================

    /**
     * Get the items to render in the animated list.
     * Only called if animatedList options are provided.
     * Default returns empty array.
     */
    protected getListItems(): SidebarListItem[] {
        return [];
    }

    /**
     * Get grouped items for the animated list.
     * If groups are returned, items are rendered with group headers.
     * Default returns null (no grouping).
     */
    protected getListGroups(): SidebarListGroup[] | null {
        return null;
    }

    /**
     * Attach event listeners to a specific list item.
     * Called for each item after rendering.
     * Default does nothing.
     */
    protected attachItemListeners(_itemElement: HTMLElement, _item: SidebarListItem): void {
        // Override in subclass to attach item-specific listeners
    }

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

        // Attach item listeners if animated list is enabled
        if (this.listOptions) {
            this.attachAllItemListeners();
        }

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

        // Re-attach item listeners if animated list is enabled
        if (this.listOptions) {
            this.attachAllItemListeners();
        }
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
    // Protected Methods for Animated Lists
    // =========================================================================

    /**
     * Render the animated list content.
     * Should be called from renderContent() where the list should appear.
     * Automatically uses groups if getListGroups() returns non-null.
     */
    protected renderAnimatedList(): string {
        if (!this.listOptions) return '';

        const groups = this.getListGroups();
        if (groups) {
            return this.renderGroupedList(groups);
        }

        const items = this.getListItems();
        return this.renderItemList(items);
    }

    /**
     * Render a flat list of items with stagger animation.
     * @param items - List items to render
     * @param startIndex - Starting index for stagger delay calculation
     */
    protected renderItemList(items: SidebarListItem[], startIndex = 0): string {
        if (!this.listOptions) return '';

        return `
            <div class="${this.listOptions.listClass}">
                ${items.map((item, index) =>
                    this.renderListItem(item, startIndex + index)
                ).join('')}
            </div>
        `;
    }

    /**
     * Render grouped items with headers and stagger animation.
     * @param groups - List groups to render
     */
    protected renderGroupedList(groups: SidebarListGroup[]): string {
        if (!this.listOptions) return '';

        let cardIndex = 0;
        let html = '';

        for (const group of groups) {
            if (group.items.length === 0) continue;

            const headerHtml = group.headerHtml || (group.label
                ? `<div class="${this.listOptions.groupHeaderClass}">${group.label}</div>`
                : '');

            html += `
                <div class="${this.listOptions.groupClass}" data-group-id="${group.id}">
                    ${headerHtml}
                    <div class="${this.listOptions.listClass}">
                        ${group.items.map(item =>
                            this.renderListItem(item, cardIndex++)
                        ).join('')}
                    </div>
                </div>
            `;
        }

        return html;
    }

    /**
     * Render a single list item with stagger index.
     * @param item - The item to render
     * @param index - Index for stagger animation delay
     */
    protected renderListItem(item: SidebarListItem, index: number): string {
        if (!this.listOptions) return '';

        const className = [this.listOptions.itemClass, item.className]
            .filter(Boolean).join(' ');

        const dataAttrs = Object.entries(item.dataAttributes || {})
            .map(([key, value]) => `data-${key}="${value}"`)
            .join(' ');

        return `
            <div class="${className}"
                 data-item-id="${item.id}"
                 style="--card-index: ${index}"
                 ${dataAttrs}>
                ${item.render()}
            </div>
        `;
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    /**
     * Attach event listeners to all list items.
     */
    private attachAllItemListeners(): void {
        if (!this.listOptions || !this.panel) return;

        const groups = this.getListGroups();
        const items = groups
            ? groups.flatMap(g => g.items)
            : this.getListItems();

        for (const item of items) {
            const element = this.panel.querySelector<HTMLElement>(
                `[data-item-id="${item.id}"]`
            );
            if (element) {
                this.attachItemListeners(element, item);
            }
        }
    }

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
