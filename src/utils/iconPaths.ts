/**
 * Centralized icon path constants for type-safe asset references.
 * Icons are imported from src/assets/icons/ and Vite handles base path resolution.
 */

import filterIcon from '../assets/icons/filter.svg?url';
import filterFilledIcon from '../assets/icons/filter-filled.svg?url';
import fileExportIcon from '../assets/icons/file-export.svg?url';
import downloadIcon from '../assets/icons/download.svg?url';
import alertCircleIcon from '../assets/icons/alert-circle.svg?url';
import adjustmentsAltIcon from '../assets/icons/adjustments-alt.svg?url';
import wandIcon from '../assets/icons/wand.svg?url';
import eraserIcon from '../assets/icons/eraser.svg?url';

export type IconName =
  | 'FILTER'
  | 'FILTER_FILLED'
  | 'FILE_EXPORT'
  | 'DOWNLOAD'
  | 'ALERT_CIRCLE'
  | 'ADJUSTMENTS_ALT'
  | 'WAND'
  | 'ERASER';

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
} as const;
