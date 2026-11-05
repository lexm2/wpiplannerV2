/**
 * Resizable side-panel configuration.
 *
 * Each panel's width is driven by a CSS custom property, read either by a grid
 * template (layout.css / schedule-page.css) or by the panel's own `width` rule
 * (degree-page.css). SidePanel.svelte mounts the ResizeHandle that drags the
 * variable live and persists the result; applyStoredPanelWidths() restores
 * saved widths on startup (before first paint) to avoid a layout flash.
 *
 * Adding an entry here is all a new panel needs for its width to be restored.
 */
export interface PanelWidthConfig {
  /** CSS custom property the grid template reads (set on :root). */
  cssVar: string;
  /** localStorage key the chosen width is persisted under. */
  storageKey: string;
  /** Default width in px (matches the CSS fallback). */
  defaultWidth: number;
  /** Drag bounds in px. */
  min: number;
  max: number;
  /**
   * Set for the panels that share a row with the course list: dragging stops
   * where the list would fall below LIST_MIN_WIDTH, whatever the other panel
   * has taken.
   */
  sharesRowWithList?: boolean;
}

/** The narrowest the course list may be squeezed to by its two side panels. */
const LIST_MIN_WIDTH = 400;

/** The Classes page's course list, the grid's flexible column. */
const LIST_SELECTOR = '.main-content';

/** Below this window width the Classes panels are drawers, not columns. */
const DRAWER_BREAKPOINT = 1200;

export const PANEL_WIDTHS = {
  sidebar: {
    cssVar: '--panel-sidebar-width',
    storageKey: 'wpi-planner-width-sidebar',
    defaultWidth: 280,
    min: 200,
    max: 480,
    sharesRowWithList: true,
  },
  rightPanel: {
    cssVar: '--panel-right-width',
    storageKey: 'wpi-planner-width-right-panel',
    defaultWidth: 700,
    min: 360,
    max: 960,
    sharesRowWithList: true,
  },
  scheduleSidebar: {
    cssVar: '--panel-schedule-sidebar-width',
    storageKey: 'wpi-planner-width-schedule-sidebar',
    defaultWidth: 400,
    min: 280,
    max: 680,
  },
  degreeRail: {
    cssVar: '--panel-degree-rail-width',
    storageKey: 'wpi-planner-width-degree-rail',
    defaultWidth: 248,
    min: 200,
    max: 420,
  },
} satisfies Record<string, PanelWidthConfig>;

/**
 * The widest `config`'s panel may be right now without the course list
 * dropping below LIST_MIN_WIDTH, given the panel's current width. Panels that
 * don't share the list's row are bound by `max` alone.
 */
export function maxWidthNow(
  config: PanelWidthConfig,
  currentWidth: number,
): number {
  if (!config.sharesRowWithList) return config.max;
  const list = document.querySelector(LIST_SELECTOR)?.getBoundingClientRect();
  if (!list || list.width === 0) return config.max;
  const room = currentWidth + list.width - LIST_MIN_WIDTH;
  return Math.max(config.min, Math.min(config.max, Math.floor(room)));
}

export function clampWidth(
  config: PanelWidthConfig,
  width: number,
  max: number = config.max,
): number {
  return Math.min(max, Math.max(config.min, Math.round(width)));
}

/**
 * Stored widths that would leave the course list under LIST_MIN_WIDTH (set on
 * a wider window, or before the limit existed) are shrunk to fit and written
 * back, the right panel giving way first. Only panels that have a stored width
 * are touched; the others adapt through CSS.
 */
function repairStoredListWidths(): void {
  if (window.innerWidth <= DRAWER_BREAKPOINT) return;
  const { sidebar, rightPanel } = PANEL_WIDTHS;
  const read = (config: PanelWidthConfig) => {
    const value = Number(localStorage.getItem(config.storageKey));
    return localStorage.getItem(config.storageKey) !== null &&
      Number.isFinite(value)
      ? clampWidth(config, value)
      : null;
  };
  const left = read(sidebar);
  const right = read(rightPanel);
  const avail = window.innerWidth - LIST_MIN_WIDTH;

  const fit = (
    config: PanelWidthConfig,
    stored: number | null,
    other: number,
  ) =>
    stored === null || stored + other <= avail
      ? stored
      : Math.max(config.min, avail - other);
  const nextRight = fit(rightPanel, right, left ?? sidebar.defaultWidth);
  const nextLeft = fit(sidebar, left, nextRight ?? rightPanel.min);

  for (const [config, was, now] of [
    [rightPanel, right, nextRight],
    [sidebar, left, nextLeft],
  ] as const) {
    if (now !== null && now !== was) {
      localStorage.setItem(config.storageKey, String(now));
    }
  }
}

/** Apply a persisted width (if any) for a single panel to :root. */
function applyStoredPanelWidth(config: PanelWidthConfig): void {
  const raw = localStorage.getItem(config.storageKey);
  if (raw === null) return;
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  document.documentElement.style.setProperty(
    config.cssVar,
    `${clampWidth(config, value)}px`,
  );
}

/** Restore every saved panel width. Call once during app init. */
export function applyStoredPanelWidths(): void {
  repairStoredListWidths();
  for (const config of Object.values(PANEL_WIDTHS)) {
    applyStoredPanelWidth(config);
  }
}
