/**
 * Utility functions for handling WPI academic terms
 * Note: Term extraction is now handled by Java backend during data processing.
 * These functions are kept for legacy support and testing purposes.
 */

/**
 * Extracts the academic term letter (A, B, C, D) from WPI section data
 * 
 * @deprecated This function is now primarily used for testing and legacy support.
 * The main application uses pre-computed terms from the Java backend.
 * 
 * @param termString - Raw term string from WPI data (e.g., "202201", "2025 Fall A Term")
 * @param sectionNumber - Section number (e.g., "A01", "B02", "AL01")
 * @returns Single letter representing the academic term (A, B, C, or D)
 */
export function extractTermLetter(termString: string, sectionNumber?: string): string {
    // Option 1: Section number pattern (primary method - most reliable)
    // Extract term from section numbers like "A01" -> A, "D01" -> D
    if (sectionNumber) {
        const sectionMatch = sectionNumber.match(/^([ABCD])/i);
        if (sectionMatch) {
            return sectionMatch[1].toUpperCase();
        }
    }
    
    // Option 2: Text format for future compatibility ("2025 Fall A Term", "2026 Spring C Term")
    if (termString) {
        const textMatch = termString.match(/\b([ABCD])\s+Term/i);
        if (textMatch) {
            return textMatch[1].toUpperCase();
        }
    }
    
    // Note: Removed incorrect numeric mapping - "202201" is academic year code, not term-specific
    
    // Ultimate fallback
    return 'A';
}

/**
 * Formats a term letter into a display-friendly format
 * 
 * @param termLetter - Single term letter (A, B, C, D)
 * @returns Formatted term name (e.g., "A Term", "B Term")
 */
export function formatTermName(termLetter: string): string {
    const normalized = termLetter.toUpperCase().trim();
    
    const termMap: { [key: string]: string } = {
        'A': 'A Term',
        'B': 'B Term',
        'C': 'C Term', 
        'D': 'D Term'
    };
    
    return termMap[normalized] || `${termLetter.toUpperCase()} Term`;
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