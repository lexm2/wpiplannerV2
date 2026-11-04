/**
 * Workday has no structured prerequisites; descriptions state them in prose,
 * as "Recommended background: ..." (also Suggested / Required background) or
 * "Prerequisite(s): ...". This lifts those statements out, leaving the
 * description as it is. A heading with its colon counts anywhere, so
 * "(Prerequisites: CS 503.)" does; one without ("Recommended Background
 * Working knowledge of...") only where it starts a sentence, since the words
 * also turn up in prose ("No prerequisites are suggested").
 *
 * Deliberately conservative: a statement runs to the next marker or the end
 * of the description, but stops early at a sentence that plainly starts
 * something else ("Students may not receive credit...", "This course...").
 */
import { STATEMENT_HEADING } from '../../../src/utils/statementHeadings';

type Key = keyof typeof STATEMENT_HEADING;

const MARKERS = (Object.keys(STATEMENT_HEADING) as Key[]).map(key => ({
  key,
  pattern: new RegExp(String.raw`\b${STATEMENT_HEADING[key]}\s*`, 'gi'),
}));

/** Where a heading without a separator may stand: opening a sentence. */
const SENTENCE_START = /(?:^|[.!?)]\s+|\(\s*)$/;

// Sentences that start a new topic rather than continue the statement.
const NEW_TOPIC =
  /(?<=[.!?)])\s*(?=(?:Students|Student|This|These|The course|The class|Note|NOTE|Although|While|Some sections|Undergraduate|Anticipated|Topics|Credit|Offered|Not open|Intended|Enrollment|Please|Course|See|With permission)\b)/;

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
      const separated = /[:;-]\s*$/.test(match[0]);
      if (!separated && !SENTENCE_START.test(text.slice(0, match.index))) {
        continue;
      }
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
