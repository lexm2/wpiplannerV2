/**
 * Utility functions for handling WPI academic terms
 */

const TERM_MAP: { [key: string]: string } = {
    'A': 'A Term',
    'B': 'B Term',
    'C': 'C Term',
    'D': 'D Term'
};

/**
 * Formats a term letter into a display-friendly format
 *
 * @param termLetter - Single term letter (A, B, C, D)
 * @returns Formatted term name (e.g., "A Term", "B Term")
 */
export function formatTermName(termLetter: string): string {
    const normalized = termLetter.toUpperCase().trim();
    return TERM_MAP[normalized] || `${termLetter.toUpperCase()} Term`;
}

/**
 * Validates if a string is a valid WPI academic term letter
 *
 * @param term - String to validate
 * @returns True if the term is a valid academic term letter (A, B, C, or D)
 */
export function isValidTermLetter(term: string): boolean {
    if (!term || typeof term !== 'string') return false;
    return /^[ABCD]$/i.test(term.trim());
}