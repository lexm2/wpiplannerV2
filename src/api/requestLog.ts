/**
 * One line per request on stdout: what was asked, how it went and how
 * long it took. For an MCP tool call, the tool and, when the model's call
 * failed, the kind of error (not its message, which quotes what the caller
 * typed). Addresses and arguments are not logged.
 */
import { errorKind } from './errors';

/** Where a tool error says what kind it is (see failure() in mcp/server.ts). */
export const ERROR_KIND_META = 'wpi/errorKind';

interface RpcMessage {
  method?: unknown;
  params?: { name?: unknown };
  result?: {
    isError?: unknown;
    content?: { text?: unknown }[];
    _meta?: Record<string, unknown>;
  };
  error?: { code?: unknown };
}

/** The SDK's own check of a tool's arguments words its failure this way. */
const SCHEMA_ERROR_RE = /^(?:MCP error -?\d+: )?Input validation error/;

/**
 * What a real tool's name looks like. Any other name is only the caller's own
 * text, and a newline in it would write a line of their choosing to the log.
 */
const TOOL_NAME_RE = /^[\w.-]{1,64}$/;

/** The tool a tools/call request names; null for anything else. */
export async function mcpToolName(request: Request): Promise<string | null> {
  if (request.method !== 'POST') return null;
  try {
    const body = (await request.clone().json()) as RpcMessage;
    const name = body.params?.name;
    if (body.method !== 'tools/call' || typeof name !== 'string') return null;
    return TOOL_NAME_RE.test(name) ? name : 'invalid';
  } catch {
    return null;
  }
}

/**
 * The kind of error a tool call answered with: a tool error (the model's
 * input, caught by the tool or by the SDK's schema check) or a protocol
 * error; null when it succeeded. Reads the one event the stateless endpoint
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
    if (message.result?.isError) {
      const kind = message.result._meta?.[ERROR_KIND_META];
      if (typeof kind === 'string') return kind;
      const text = message.result.content?.[0]?.text;
      return typeof text === 'string' && SCHEMA_ERROR_RE.test(text)
        ? 'invalidInput'
        : 'toolError';
    }
    if (typeof message.error?.code === 'number') {
      return `rpc${message.error.code}`;
    }
  }
  return null;
}

/** The kind of a refused request, from its status alone. */
export const httpError = (response: Response): string | null =>
  response.status < 400 ? null : errorKind(response.status);

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
  if (fields.error) parts.push(`error=${fields.error}`);
  return parts.join(' ');
}
