/**
 * Common utility types used across the application.
 */

/**
 * A date range with start and end dates.
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * A selectable option for dropdowns, checkboxes, etc.
 */
export interface FilterOption {
  value: string;
  label: string;
}
