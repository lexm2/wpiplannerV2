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
