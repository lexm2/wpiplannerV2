/**
 * Input that parses but cannot be answered as asked: an unknown course,
 * department or CRN, a year with no published schedule. The message is
 * written for the caller to act on (it names close matches or the tool to
 * use instead); the HTTP routes send it with `status`, the MCP tools as a
 * tool error.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Characters of a caller's own text a message echoes before "...". */
const ECHO_CHARS = 60;

/** Control characters (newlines, tabs, escapes), which could fake a line. */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]+/g;

/** Text with its control characters replaced by spaces. */
export const withoutControls = (text: string) =>
  text.replace(CONTROL_RE, ' ').trim();

/**
 * A caller's text as a message echoes it: control characters dropped and
 * cut at ECHO_CHARS, so a pasted essay cannot fill the reply or fake a line
 * of it.
 */
export function echo(text: string): string {
  const clean = withoutControls(text);
  return clean.length > ECHO_CHARS
    ? `${clean.slice(0, ECHO_CHARS).trimEnd()}...`
    : clean;
}

/** Items a message lists before "and N more". */
const LISTED = 10;

/** "1, 2, 3", or the first LISTED and "and N more". */
export function listSome(items: (string | number)[]): string {
  const shown = items.slice(0, LISTED).join(', ');
  const more = items.length - LISTED;
  return more > 0 ? `${shown} and ${more} more` : shown;
}
