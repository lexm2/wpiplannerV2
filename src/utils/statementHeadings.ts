/**
 * The headings a course description opens a prerequisite or background
 * statement with, as pattern sources: "Recommended background: ...",
 * "Recommended Background Working knowledge of...", "The recommended
 * background for this course is...", "Prerequisites Completion of 24
 * credits...". The converter lifts the statement that follows into its own
 * field; the MCP text cuts heading and statement from the description it
 * shows. Each takes its separator (":", ";" or "-"), when there is one.
 */
export const STATEMENT_HEADING = {
  recommendedBackground: String.raw`(?:The\s+)?(?:Recommended|Suggested|Required)\s+Backgrounds?(?:\s+for\s+this\s+course)?(?:\s+(?:is|includes|consists\s+of))?\s*[:;-]?`,
  prerequisites: String.raw`Prerequisites?\s*[:;-]?`,
} as const;
