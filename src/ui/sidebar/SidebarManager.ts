// =============================================================================
// Sidebar Manager - Orchestrates sidebar entries and panels
// =============================================================================

import type { SidebarEntry, SidebarPanel } from './types';

/**
 * Manages sidebar content including entries (list items) and panels (overlays).
 *
 * Responsibilities:
 * - Maintains ordered list of entries
 * - Renders entries to the sidebar container
 * - Tracks currently active panel
 * - Preserves active panel when re-rendering entries
 */
export class SidebarManager {
    /** Ordered list of sidebar entries */
    private entries: SidebarEntry[] = [];

    /** Currently active overlay panel (if any) */
    private activePanel: SidebarPanel | null = null;

    /** DOM ID of the sidebar container */
    private containerId: string;

    /** Cached reference to container element */
    private container: HTMLElement | null = null;

    constructor(containerId: string) {
        this.containerId = containerId;
    }

    // =========================================================================
    // Entry Management
    // =========================================================================

    /**
     * Add an entry to the sidebar.
     * Entries are rendered in the order they are added.
     */
    addEntry(entry: SidebarEntry): void {
        this.entries.push(entry);
    }

    /**
     * Add an entry at a specific index.
     */
    addEntryAt(entry: SidebarEntry, index: number): void {
        this.entries.splice(index, 0, entry);
    }

    /**
     * Remove an entry by its ID.
     * Returns true if an entry was removed.
     */
    removeEntry(entryId: string): boolean {
        const index = this.entries.findIndex(e => e.entryId === entryId);
        if (index !== -1) {
            this.entries.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get an entry by its ID.
     */
    getEntry(entryId: string): SidebarEntry | undefined {
        return this.entries.find(e => e.entryId === entryId);
    }

    /**
     * Get all entries of a specific type.
     */
    getEntriesByType(entryType: string): SidebarEntry[] {
        return this.entries.filter(e => e.entryType === entryType);
    }

    /**
     * Get all entries.
     */
    getEntries(): readonly SidebarEntry[] {
        return this.entries;
    }

    /**
     * Clear all entries from the sidebar.
     * Does not affect the active panel.
     */
    clearEntries(): void {
        this.entries = [];
    }

    /**
     * Get the number of entries.
     */
    get entryCount(): number {
        return this.entries.length;
    }

    // =========================================================================
    // Rendering
    // =========================================================================

    /**
     * Render all entries to the sidebar container.
     * Preserves any active panel overlay.
     */
    render(): void {
        const container = this.getContainer();
        if (!container) {
            console.error(`[SidebarManager] Container not found: ${this.containerId}`);
            return;
        }

        // Save reference to panel element if one exists
        const panelElement = container.querySelector('.sidebar-panel');

        // Clear container content (except panel)
        if (panelElement) {
            // Temporarily remove panel, clear, then re-add
            panelElement.remove();
        }
        container.innerHTML = '';

        // Render all entries
        if (this.entries.length === 0) {
            container.innerHTML = this.renderEmptyState();
        } else {
            for (const entry of this.entries) {
                const entryHtml = entry.render();
                container.insertAdjacentHTML('beforeend', entryHtml);
            }

            // Attach event listeners for all entries
            for (const entry of this.entries) {
                entry.attachListeners(container);
            }
        }

        // Re-add panel if it existed
        if (panelElement) {
            container.appendChild(panelElement);
        }
    }

    /**
     * Render empty state when no entries exist.
     * Can be overridden for custom empty state.
     */
    protected renderEmptyState(): string {
        return `
            <div class="sidebar-empty-state">
                <p>No items to display</p>
            </div>
        `;
    }

    // =========================================================================
    // Panel Management
    // =========================================================================

    /**
     * Open a panel overlay.
     * Closes any currently active panel first.
     */
    openPanel(panel: SidebarPanel): void {
        // Close existing panel if different
        if (this.activePanel && this.activePanel !== panel) {
            this.activePanel.close();
        }

        this.activePanel = panel;
        panel.open();
    }

    /**
     * Close the currently active panel.
     */
    closePanel(): void {
        if (this.activePanel) {
            this.activePanel.close();
            this.activePanel = null;
        }
    }

    /**
     * Get the currently active panel (if any).
     */
    getActivePanel(): SidebarPanel | null {
        return this.activePanel;
    }

    /**
     * Check if a specific panel is currently active.
     */
    isPanelActive(panelId: string): boolean {
        return this.activePanel?.panelId === panelId;
    }

    /**
     * Check if any panel is currently open.
     */
    hasActivePanel(): boolean {
        return this.activePanel !== null && this.activePanel.isOpen();
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    /**
     * Clean up all resources.
     * Call this when the sidebar is no longer needed.
     */
    destroy(): void {
        // Close and destroy active panel
        if (this.activePanel) {
            this.activePanel.destroy?.();
            this.activePanel = null;
        }

        // Clear entries
        this.entries = [];

        // Clear container reference
        this.container = null;
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    /**
     * Get the container element, caching the reference.
     */
    private getContainer(): HTMLElement | null {
        if (!this.container) {
            this.container = document.getElementById(this.containerId);
        }
        return this.container;
    }
}
