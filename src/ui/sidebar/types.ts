// =============================================================================
// Sidebar Module Types - Interfaces for modular sidebar architecture
// =============================================================================

/**
 * Animation type for sidebar panels.
 * - 'fade': Simple opacity fade (default)
 * - 'slide-right': Slides in from the right, slides out to the left
 * - 'slide-left': Slides in from the left, slides out to the right
 */
export type PanelAnimationType = 'fade' | 'slide-right' | 'slide-left';

/**
 * Interface for sidebar overlay panels (wizard, calendar events, etc.)
 * Panels are full-screen overlays that appear on top of the sidebar content.
 */
export interface SidebarPanel {
    /** Unique identifier for this panel type */
    readonly panelId: string;

    /** CSS class added to container when panel is open (e.g., 'wizard-active') */
    readonly panelClass: string;

    /** Open the panel with animation */
    open(): void;

    /** Close the panel with animation */
    close(): void;

    /** Check if the panel is currently open */
    isOpen(): boolean;

    /** Clean up resources (optional) */
    destroy?(): void;
}

/**
 * Interface for sidebar list entries (courses, calendar button, etc.)
 * Entries are individual items rendered in the sidebar list.
 */
export interface SidebarEntry {
    /** Unique identifier for this entry instance */
    readonly entryId: string;

    /** Type of entry for categorization (e.g., 'course', 'calendar') */
    readonly entryType: string;

    /** Render the entry as an HTML string */
    render(): string;

    /** Attach event listeners after rendering */
    attachListeners(container: HTMLElement): void;

    /** Get the data associated with this entry */
    getData(): unknown;
}

/**
 * Configuration options for BaseSidebarPanel
 */
export interface SidebarPanelOptions {
    /** DOM ID of the sidebar container. Default: 'schedule-selected-courses' */
    containerId?: string;

    /** Animation duration in milliseconds. Default: 200 */
    animationDuration?: number;

    /** Whether pressing Escape closes the panel. Default: true */
    escapeToClose?: boolean;

    /** Animation type for open/close. Default: 'fade' */
    animationType?: PanelAnimationType;
}

/**
 * Configuration for CourseEntry
 */
export interface CourseEntryOptions {
    /** Callback when clear sections button is clicked */
    onClearSections?: () => void;

    /** Callback when remove course button is clicked */
    onRemove?: () => void;

    /** Callback when the course header is clicked */
    onClick?: () => void;

    /** Whether the course item is expanded */
    isExpanded?: boolean;
}

/**
 * Configuration for CalendarButtonEntry
 */
export interface CalendarButtonEntryOptions {
    /** Name of the connected calendar */
    calendarName: string;

    /** Total number of events across all terms */
    totalEvents: number;

    /** Number of visible (non-excluded) events */
    visibleEvents: number;

    /** Callback when the button is clicked */
    onClick?: () => void;
}
