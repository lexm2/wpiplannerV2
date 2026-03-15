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

export abstract class BaseSidebarPanel implements SidebarPanel {
    abstract readonly panelId: string;
    abstract readonly panelClass: string;

    protected container: HTMLElement | null = null;
    protected panel: HTMLElement | null = null;
    protected options: Required<Omit<SidebarPanelOptions, 'animatedList'>>;
    protected listOptions: Required<AnimatedListOptions> | null = null;
    private boundEscapeHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(options?: SidebarPanelOptions) {
        const { animatedList, ...panelOptions } = options || {};
        this.options = { ...DEFAULT_OPTIONS, ...panelOptions };

        if (animatedList) {
            this.listOptions = { ...DEFAULT_LIST_OPTIONS, ...animatedList };
        }
    }

    protected abstract renderContent(): string;
    protected abstract attachEventListeners(): void;

    protected onOpen?(): void;
    protected onClose?(): void;

    protected getListItems(): SidebarListItem[] {
        return [];
    }

    protected getListGroups(): SidebarListGroup[] | null {
        return null;
    }

    protected attachItemListeners(_itemElement: HTMLElement, _item: SidebarListItem): void {}

    open(): void {
        const container = document.getElementById(this.options.containerId);
        if (!container) {
            console.error(`[${this.panelId}] Container not found: ${this.options.containerId}`);
            return;
        }

        this.container = container;
        container.scrollTop = 0;
        container.classList.add(this.panelClass);

        this.panel = document.createElement('div');
        this.panel.className = `sidebar-panel sidebar-panel--${this.panelId}`;
        this.panel.innerHTML = this.renderContent();
        container.appendChild(this.panel);

        const animClass = this.getOpenAnimationClass();
        requestAnimationFrame(() => {
            if (this.panel) {
                this.panel.classList.add('active');
                if (animClass) {
                    this.panel.classList.add(animClass);
                }
            }
        });

        this.attachEventListeners();

        if (this.listOptions) {
            this.attachAllItemListeners();
        }

        if (this.options.escapeToClose) {
            this.boundEscapeHandler = this.handleEscapeKey.bind(this);
            document.addEventListener('keydown', this.boundEscapeHandler);
        }

        this.onOpen?.();
    }

    close(): void {
        if (!this.panel) return;

        this.onClose?.();

        const exitClass = this.getCloseAnimationClass();
        this.panel.classList.remove('active');
        if (exitClass) {
            this.panel.classList.add(exitClass);
        }

        setTimeout(() => {
            if (this.panel && this.container && this.container.contains(this.panel)) {
                this.container.removeChild(this.panel);
                this.container.classList.remove(this.panelClass);
                this.panel = null;
                this.container = null;
            }
        }, this.options.animationDuration);

        this.cleanupEscapeHandler();
    }

    isOpen(): boolean {
        return this.panel !== null;
    }

    destroy(): void {
        if (this.isOpen()) {
            if (this.panel && this.container && this.container.contains(this.panel)) {
                this.container.removeChild(this.panel);
                this.container.classList.remove(this.panelClass);
            }
            this.panel = null;
            this.container = null;
        }

        this.cleanupEscapeHandler();
    }

    protected rerender(): void {
        if (!this.panel) return;

        this.panel.innerHTML = this.renderContent();
        this.attachEventListeners();

        if (this.listOptions) {
            this.attachAllItemListeners();
        }
    }

    protected querySelector<T extends Element>(selector: string): T | null {
        return this.panel?.querySelector<T>(selector) ?? null;
    }

    protected querySelectorAll<T extends Element>(selector: string): NodeListOf<T> {
        return this.panel?.querySelectorAll<T>(selector) ?? document.querySelectorAll<T>('__none__');
    }

    protected renderAnimatedList(): string {
        if (!this.listOptions) return '';

        const groups = this.getListGroups();
        if (groups) {
            return this.renderGroupedList(groups);
        }

        const items = this.getListItems();
        return this.renderItemList(items);
    }

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

    private handleEscapeKey(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
        }
    }

    private cleanupEscapeHandler(): void {
        if (this.boundEscapeHandler) {
            document.removeEventListener('keydown', this.boundEscapeHandler);
            this.boundEscapeHandler = null;
        }
    }

    private getOpenAnimationClass(): string {
        switch (this.options.animationType) {
            case 'slide-right': return 'slide-in-right';
            case 'slide-left': return 'slide-in-left';
            default: return '';
        }
    }

    private getCloseAnimationClass(): string {
        switch (this.options.animationType) {
            case 'slide-right': return 'slide-out-left';
            case 'slide-left': return 'slide-out-right';
            default: return '';
        }
    }
}
