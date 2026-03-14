import type { SidebarEntry, SidebarPanel } from './types';

export class SidebarManager {
    private entries: SidebarEntry[] = [];
    private activePanel: SidebarPanel | null = null;
    private containerId: string;
    private container: HTMLElement | null = null;

    constructor(containerId: string) {
        this.containerId = containerId;
    }

    addEntry(entry: SidebarEntry): void {
        this.entries.push(entry);
    }

    addEntryAt(entry: SidebarEntry, index: number): void {
        this.entries.splice(index, 0, entry);
    }

    removeEntry(entryId: string): boolean {
        const index = this.entries.findIndex(e => e.entryId === entryId);
        if (index !== -1) {
            this.entries.splice(index, 1);
            return true;
        }
        return false;
    }

    getEntry(entryId: string): SidebarEntry | undefined {
        return this.entries.find(e => e.entryId === entryId);
    }

    getEntriesByType(entryType: string): SidebarEntry[] {
        return this.entries.filter(e => e.entryType === entryType);
    }

    getEntries(): readonly SidebarEntry[] {
        return this.entries;
    }

    clearEntries(): void {
        this.entries = [];
    }

    get entryCount(): number {
        return this.entries.length;
    }

    render(): void {
        const container = this.getContainer();
        if (!container) {
            console.error(`[SidebarManager] Container not found: ${this.containerId}`);
            return;
        }

        const panelElement = container.querySelector('.sidebar-panel');

        if (panelElement) {
            panelElement.remove();
        }
        container.innerHTML = '';

        if (this.entries.length === 0) {
            container.innerHTML = this.renderEmptyState();
        } else {
            for (const entry of this.entries) {
                const entryHtml = entry.render();
                container.insertAdjacentHTML('beforeend', entryHtml);
            }

            for (const entry of this.entries) {
                entry.attachListeners(container);
            }
        }

        if (panelElement) {
            container.appendChild(panelElement);
        }
    }

    protected renderEmptyState(): string {
        return `
            <div class="sidebar-empty-state">
                <p>No items to display</p>
            </div>
        `;
    }

    openPanel(panel: SidebarPanel): void {
        if (this.activePanel && this.activePanel !== panel) {
            this.activePanel.close();
        }

        this.activePanel = panel;
        panel.open();
    }

    closePanel(): void {
        if (this.activePanel) {
            this.activePanel.close();
            this.activePanel = null;
        }
    }

    getActivePanel(): SidebarPanel | null {
        return this.activePanel;
    }

    isPanelActive(panelId: string): boolean {
        return this.activePanel?.panelId === panelId;
    }

    hasActivePanel(): boolean {
        return this.activePanel !== null && this.activePanel.isOpen();
    }

    destroy(): void {
        if (this.activePanel) {
            this.activePanel.destroy?.();
            this.activePanel = null;
        }

        this.entries = [];
        this.container = null;
    }

    private getContainer(): HTMLElement | null {
        if (!this.container) {
            this.container = document.getElementById(this.containerId);
        }
        return this.container;
    }
}
