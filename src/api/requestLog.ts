/**
 * One line per request on stdout: what was asked, how it went and how
 * long it took. For an MCP tool call, the tool and, when the model's call
 * failed, the error it was given: the arguments models get wrong are what
 * the tool descriptions and schema hints are tuned from. Addresses and
 * arguments are not logged.
 */

/** Characters of an error message a line keeps. */
const ERROR_CHARS = 200;

interface RpcMessage {
  method?: unknown;
  params?: { name?: unknown };
  result?: { isError?: unknown; content?: { text?: unknown }[] };
  error?: { message?: unknown };
}

/** The tool a tools/call request names; null for anything else. */
export async function mcpToolName(request: Request): Promise<string | null> {
  if (request.method !== 'POST') return null;
  try {
    const body = (await request.clone().json()) as RpcMessage;
    return body.method === 'tools/call' && typeof body.params?.name === 'string'
      ? body.params.name
      : null;
  } catch {
    return null;
  }
}

/**
 * The error a tool call answered with: a tool error (the model's input,
 * caught by the tool or by the SDK's schema check) or a protocol error;
 * null when it succeeded. Reads the one event the stateless endpoint
 * sends, or a JSON reply.
 */
export async function mcpCallError(response: Response): Promise<string | null> {
  let text: string;
  try {
    text = await response.clone().text();
  } catch {
    return null;
  }
  const payloads = text.startsWith('{')
    ? [text]
    : text
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5));
  for (const payload of payloads) {
    let message: RpcMessage;
    try {
      message = JSON.parse(payload) as RpcMessage;
    } catch {
      continue;
    }
    const error = message.result?.isError
      ? message.result.content?.[0]?.text
      : message.error?.message;
    if (typeof error === 'string') return error;
  }
  return null;
}

/** A refused API request's `error`, as the caller was told it. */
export async function apiError(response: Response): Promise<string | null> {
  if (response.status < 400) return null;
  try {
    const body = (await response.clone().json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

/** `2026-10-25T20:40:03.747Z POST /wpiplannerV2/mcp 200 12ms tool=get_course`. */
export function logLine(fields: {
  method: string;
  path: string;
  status: number;
  ms: number;
  tool?: string | null;
  error?: string | null;
}): string {
  const parts = [
    new Date().toISOString(),
    fields.method,
    fields.path,
    String(fields.status),
    `${Math.round(fields.ms)}ms`,
  ];
  if (fields.tool) parts.push(`tool=${fields.tool}`);
  if (fields.error) {
    const oneLine = fields.error.replace(/\s+/g, ' ').trim();
    parts.push(
      `error=${JSON.stringify(oneLine.length > ERROR_CHARS ? `${oneLine.slice(0, ERROR_CHARS)}...` : oneLine)}`,
    );
  }
  return parts.join(' ');
}
