/**
 * Centralized icon path constants for type-safe asset references.
 * Icons are imported from src/assets/icons/ and Vite handles base path resolution.
 *
 * Exports both URL paths (for img tags) and inline SVG content (for better CSS styling).
 */

import filterIcon from '../assets/icons/filter.svg?url';
import filterFilledIcon from '../assets/icons/filter-filled.svg?url';
import fileExportIcon from '../assets/icons/file-export.svg?url';
import downloadIcon from '../assets/icons/download.svg?url';
import alertCircleIcon from '../assets/icons/alert-circle.svg?url';
import adjustmentsAltIcon from '../assets/icons/adjustments-alt.svg?url';
import wandIcon from '../assets/icons/wand.svg?url';
import eraserIcon from '../assets/icons/eraser.svg?url';
import xIcon from '../assets/icons/x.svg?url';
import checkIcon from '../assets/icons/check.svg?url';
import plusIcon from '../assets/icons/plus.svg?url';
import arrowBarRightIcon from '../assets/icons/arrow-bar-right.svg?url';

export type IconName =
  | 'FILTER'
  | 'FILTER_FILLED'
  | 'FILE_EXPORT'
  | 'DOWNLOAD'
  | 'ALERT_CIRCLE'
  | 'ADJUSTMENTS_ALT'
  | 'WAND'
  | 'ERASER'
  | 'X'
  | 'CHECK'
  | 'PLUS'
  | 'ARROW_BAR_RIGHT';

/**
 * Icon paths for SVG assets with Vite base path resolution.
 *
 * Available icons:
 * - FILTER: Outline filter icon (24x24)
 * - FILTER_FILLED: Filled filter icon (24x24)
 * - FILE_EXPORT: File export icon (24x24)
 * - DOWNLOAD: Download icon (24x24)
 * - ALERT_CIRCLE: Alert/warning circle icon (24x24)
 * - ADJUSTMENTS_ALT: Settings/adjustments icon (24x24)
 * - WAND: Magic wand icon (24x24)
 * - ERASER: Eraser icon (24x24)
 * - X: Close/remove icon (16x16)
 * - CHECK: Checkmark icon (16x16)
 * - PLUS: Plus/add icon (16x16)
 */
export const ICONS: Record<IconName, string> = {
  FILTER: filterIcon,
  FILTER_FILLED: filterFilledIcon,
  FILE_EXPORT: fileExportIcon,
  DOWNLOAD: downloadIcon,
  ALERT_CIRCLE: alertCircleIcon,
  ADJUSTMENTS_ALT: adjustmentsAltIcon,
  WAND: wandIcon,
  ERASER: eraserIcon,
  X: xIcon,
  CHECK: checkIcon,
  PLUS: plusIcon,
  ARROW_BAR_RIGHT: arrowBarRightIcon,
} as const;

/**
 * Inline SVG content for icons that need CSS styling support.
 * These use currentColor and can be styled with CSS fill/stroke properties.
 */
export const INLINE_SVGS: Record<IconName, string> = {
  FILTER: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227z" /></svg>`,
  FILTER_FILLED: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 3h-16a1 1 0 0 0 -1 1v2.227l.008 .223a3 3 0 0 0 .772 1.795l4.22 4.641v8.114a1 1 0 0 0 1.316 .949l6 -2l.108 -.043a1 1 0 0 0 .576 -.906v-6.586l4.121 -4.12a3 3 0 0 0 .879 -2.123v-2.171a1 1 0 0 0 -1 -1z" /></svg>`,
  FILE_EXPORT: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M11.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v5m-5 6h7m-3 -3l3 3l-3 3" /></svg>`,
  DOWNLOAD: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></svg>`,
  ALERT_CIRCLE: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>`,
  ADJUSTMENTS_ALT: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 8h4v4h-4z" /><path d="M6 4l0 4" /><path d="M6 12l0 8" /><path d="M10 14h4v4h-4z" /><path d="M12 4l0 10" /><path d="M12 18l0 2" /><path d="M16 5h4v4h-4z" /><path d="M18 4l0 1" /><path d="M18 9l0 11" /></svg>`,
  WAND: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 21l15 -15l-3 -3l-15 15l3 3" /><path d="M15 6l3 3" /><path d="M9 3a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2" /><path d="M19 13a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2" /></svg>`,
  ERASER: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3" /><path d="M18 13.3l-6.3 -6.3" /></svg>`,
  X: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>`,
  CHECK: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>`,
  PLUS: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>`,
  ARROW_BAR_RIGHT: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 12l-10 0" /><path d="M20 12l-4 4" /><path d="M20 12l-4 -4" /><path d="M4 4l0 16" /></svg>`,
} as const;

/**
 * Helper function to create an inline SVG with custom classes.
 * @param iconName The icon to render
 * @param className Optional CSS classes to apply
 * @returns HTML string with inline SVG
 */
export function getInlineSVG(iconName: IconName, className?: string): string {
  const svg = INLINE_SVGS[iconName];
  if (!className) return svg;

  // Add class to the SVG element
  return svg.replace('<svg', `<svg class="${className}"`);
}
