/**
 * Centralized icon path constants for type-safe static asset references.
 * All icons are served statically from the public/icons/ directory.
 */

export type IconName =
  | 'FILTER'
  | 'FILTER_FILLED'
  | 'FILE_EXPORT'
  | 'DOWNLOAD'
  | 'ALERT_CIRCLE'
  | 'ADJUSTMENTS_ALT'
  | 'WAND';

/**
 * Icon paths for static SVG assets.
 *
 * Available icons:
 * - FILTER: Outline filter icon (24x24)
 * - FILTER_FILLED: Filled filter icon (24x24)
 * - FILE_EXPORT: File export icon (24x24)
 * - DOWNLOAD: Download icon (24x24)
 * - ALERT_CIRCLE: Alert/warning circle icon (24x24)
 * - ADJUSTMENTS_ALT: Settings/adjustments icon (24x24)
 * - WAND: Magic wand icon (24x24)
 */
export const ICONS: Record<IconName, string> = {
  FILTER: '/icons/filter.svg',
  FILTER_FILLED: '/icons/filter-filled.svg',
  FILE_EXPORT: '/icons/file-export.svg',
  DOWNLOAD: '/icons/download.svg',
  ALERT_CIRCLE: '/icons/alert-circle.svg',
  ADJUSTMENTS_ALT: '/icons/adjustments-alt.svg',
  WAND: '/icons/wand.svg',
} as const;
