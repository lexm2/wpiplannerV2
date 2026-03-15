export type PanelAnimationType = 'fade' | 'slide-right' | 'slide-left';

export interface SidebarListItem {
    readonly id: string;
    render(): string;
    className?: string;
    dataAttributes?: Record<string, string>;
}

export interface SidebarListGroup<T extends SidebarListItem = SidebarListItem> {
    readonly id: string;
    readonly items: T[];
    label?: string;
    headerHtml?: string;
}

export interface AnimatedListOptions {
    staggerDelay?: number;
    itemClass?: string;
    listClass?: string;
    groupClass?: string;
    groupHeaderClass?: string;
}

export interface SidebarPanel {
    readonly panelId: string;
    readonly panelClass: string;
    open(): void;
    close(): void;
    isOpen(): boolean;
    destroy?(): void;
}

export interface SidebarEntry {
    readonly entryId: string;
    readonly entryType: string;
    render(): string;
    attachListeners(container: HTMLElement): void;
    getData(): unknown;
}

export interface SidebarPanelOptions {
    containerId?: string;
    animationDuration?: number;
    escapeToClose?: boolean;
    animationType?: PanelAnimationType;
    animatedList?: AnimatedListOptions;
}

export interface CourseEntryOptions {
    onClearSections?: () => void;
    onRemove?: () => void;
    onClick?: () => void;
    isExpanded?: boolean;
}

export interface CalendarButtonEntryOptions {
    calendarName: string;
    totalEvents: number;
    visibleEvents: number;
    onClick?: () => void;
}
