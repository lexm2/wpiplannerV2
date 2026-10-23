/**
 * Workday has no structured prerequisites; descriptions state them in prose,
 * as "Recommended background: ..." (also Suggested / Required background) or
 * "Prerequisite(s): ...". This lifts those statements out, leaving the
 * description as it is.
 *
 * Deliberately conservative: a statement runs to the next marker or the end
 * of the description, but stops early at a sentence that plainly starts
 * something else ("Students may not receive credit...", "This course...").
 */

const MARKERS = [
  {
    key: 'recommendedBackground',
    pattern: /\b(?:Recommended|Suggested|Required)\s+background\s*[:-]\s*/gi,
  },
  { key: 'prerequisites', pattern: /\bPrerequisites?\s*:\s*/gi },
] as const;

type Key = (typeof MARKERS)[number]['key'];

// Sentences that start a new topic rather than continue the statement.
const NEW_TOPIC =
  /(?<=[.!?)])\s*(?=(?:Students|Student|This|These|The course|The class|Note|NOTE|Although|While|Some sections|Undergraduate|Anticipated|Topics|Credit|Offered|Not open|Intended|Enrollment|Please|Course|See)\b)/;

/** Drops a ")" left over from a statement written in parentheses. */
function closeParens(statement: string): string {
  const open = statement.split('(').length;
  const close = statement.split(')').length;
  return close > open ? statement.replace(/\)(?=\W*$)/, '') : statement;
}

export function extractPrerequisites(
  text: string,
): Partial<Record<Key, string>> {
  const found: { key: Key; start: number; end: number }[] = [];
  for (const { key, pattern } of MARKERS) {
    for (const match of text.matchAll(pattern)) {
      found.push({
        key,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  found.sort((a, b) => a.start - b.start);

  const statements: Partial<Record<Key, string[]>> = {};
  found.forEach((marker, i) => {
    const until = found[i + 1]?.start ?? text.length;
    const statement = closeParens(
      text
        .slice(marker.end, until)
        .split(NEW_TOPIC)[0]
        .trim()
        .replace(/[\s,;]+$/, ''),
    );
    if (statement) (statements[marker.key] ??= []).push(statement);
  });

  const result: Partial<Record<Key, string>> = {};
  for (const [key, parts] of Object.entries(statements) as [Key, string[]][]) {
    result[key] = parts.join(' ');
  }
  return result;
}
