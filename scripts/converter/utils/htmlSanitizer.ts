/**
 * HTML sanitization utilities for course descriptions
 * Workday provides descriptions with HTML markup that needs to be cleaned
 */

/**
 * Removes HTML tags and decodes entities from Workday descriptions
 */
export function sanitizeHTML(html: string | null): string {
    if (!html) {
        return '';
    }

    let cleaned = html;

    // Remove all HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, ' ');

    // Decode HTML entities
    cleaned = cleaned.replace(/&amp;/g, '&');
    cleaned = cleaned.replace(/&#39;/g, "'");
    cleaned = cleaned.replace(/&#43;/g, '+');
    cleaned = cleaned.replace(/&#34;/g, '"');
    cleaned = cleaned.replace(/&lt;/g, '<');
    cleaned = cleaned.replace(/&gt;/g, '>');
    cleaned = cleaned.replace(/&quot;/g, '"');
    cleaned = cleaned.replace(/&nbsp;/g, ' ');

    // Collapse multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ');

    // Trim whitespace
    cleaned = cleaned.trim();

    return cleaned;
}
