/**
 * HTML sanitization utilities for course descriptions
 * Workday provides descriptions with HTML markup that needs to be cleaned
 */

export function extractCategory(html: string | null): {
  category: 1 | 2 | 3 | null;
  cleanedHtml: string;
} {
  if (!html) return { category: null, cleanedHtml: '' };

  // No word-boundary lookahead: handles "Cat. IAn intensive..." where text immediately follows the numeral
  // \.? makes the period after "Cat" optional to also match "Cat II." format
  const match = html.match(/Cat\.?\s*(III|II|I|[123])\.?/i);
  if (!match) return { category: null, cleanedHtml: html };

  const catStr = match[1].toUpperCase();
  let category: 1 | 2 | 3;
  if (catStr === 'I' || catStr === '1') category = 1;
  else if (catStr === 'II' || catStr === '2') category = 2;
  else if (catStr === 'III' || catStr === '3') category = 3;
  else return { category: null, cleanedHtml: html };

  const cleanedHtml = html
    .replace(/<p>(?:<i>)?Cat\.?\s*(?:III|II|I|[123])\.?(?:<\/i>)?<\/p>/gi, '')
    .replace(/Cat\.?\s*(?:III|II|I|[123])\.?(?:<br\s*\/?>\s*)*/gi, '')
    .replace(/;\s*Cat\.?\s*(?:III|II|I|[123])\.?/gi, '')
    .replace(/Cat\.?\s*(?:III|II|I|[123])\.?/gi, '')
    .replace(/;\s*\)/g, ')');

  return { category, cleanedHtml };
}

/**
 * Removes HTML tags and decodes entities from Workday descriptions
 */
export function sanitizeHTML(html: string | null): string {
  if (!html) {
    return '';
  }

  let cleaned = html;

  cleaned = cleaned.replace(/<[^>]*>/g, ' ');

  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&#39;/g, "'");
  cleaned = cleaned.replace(/&#43;/g, '+');
  cleaned = cleaned.replace(/&#34;/g, '"');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&nbsp;/g, ' ');

  cleaned = cleaned.replace(/\s+/g, ' ');

  cleaned = cleaned.trim();

  // Strip leading punctuation artifacts left after category marker removal (e.g. ", " or "- ")
  cleaned = cleaned.replace(/^[,;:\---.]+\s*/, '').trim();

  return cleaned;
}
