/**
 * Resizable side-panel configuration.
 *
 * Each panel's width is driven by a CSS custom property read by the grid
 * layouts (see layout.css / schedule-page.css). A ResizeHandle drags the
 * variable live and persists the result; applyStoredPanelWidths() restores
 * saved widths on startup (before first paint) to avoid a layout flash.
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
}

export const PANEL_WIDTHS = {
  sidebar: {
    cssVar: '--panel-sidebar-width',
    storageKey: 'wpi-planner-width-sidebar',
    defaultWidth: 280,
    min: 200,
    max: 480,
  },
  rightPanel: {
    cssVar: '--panel-right-width',
    storageKey: 'wpi-planner-width-right-panel',
    defaultWidth: 700,
    min: 360,
    max: 960,
  },
  scheduleSidebar: {
    cssVar: '--panel-schedule-sidebar-width',
    storageKey: 'wpi-planner-width-schedule-sidebar',
    defaultWidth: 400,
    min: 280,
    max: 680,
  },
} satisfies Record<string, PanelWidthConfig>;

export function clampWidth(config: PanelWidthConfig, width: number): number {
  return Math.min(config.max, Math.max(config.min, Math.round(width)));
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
  for (const config of Object.values(PANEL_WIDTHS)) {
    applyStoredPanelWidth(config);
  }
}
