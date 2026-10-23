/**
 * Course_Tags reads "Group :: Value; Group :: Value", e.g.
 * "Degree Attribute :: Social Sciences; Offering Pattern :: Category I".
 */

/** The values tagged under one group, in the order the feed lists them. */
export function tagValues(tags: string | undefined, group: string): string[] {
  const prefix = `${group} :: `;
  return (tags ?? '')
    .split(/\s*;\s*/)
    .filter(tag => tag.startsWith(prefix))
    .map(tag => tag.slice(prefix.length).trim())
    .filter(Boolean);
}

/** Values of one group across several sections' tags, each once. */
export function unionTagValues(
  tagStrings: (string | undefined)[],
  group: string,
): string[] {
  return [...new Set(tagStrings.flatMap(tags => tagValues(tags, group)))];
}

const OFFERING_CATEGORIES: Record<string, 1 | 2 | 3> = {
  'Category I': 1,
  'Category II': 2,
  'Category III': 3,
};

/**
 * WPI's offering category from the "Offering Pattern" tag: I is offered
 * every year, II at least every other year, III occasionally. Null when
 * untagged, as most graduate courses are.
 */
export function offeringCategory(
  tagStrings: (string | undefined)[],
): 1 | 2 | 3 | null {
  for (const value of unionTagValues(tagStrings, 'Offering Pattern')) {
    const category = OFFERING_CATEGORIES[value];
    if (category) return category;
  }
  return null;
}
