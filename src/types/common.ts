/**
 * Common utility types used across the application.
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
