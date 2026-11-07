/**
 * The course API server: read-only JSON routes over the course catalog, for
 * the planner and for students' AI assistants. `bun run serve:api`.
 *
 * PORT (3001), HOST (127.0.0.1), BASE_PATH (/wpiplannerV2) and DATA_DIR
 * (where the refresh job writes the live data; public/ is the fallback)
 * come from the environment, as do RATE_LIMIT_PER_MINUTE (120 requests a
 * client, in bursts up to RATE_LIMIT_BURST, 60; 0 turns the limit off) and
 * REQUEST_LOG (any value but 0 logs a line per request).
 * TRUSTED_PROXIES lists the proxies (IPv4 addresses or CIDRs, comma
 * separated) whose X-Forwarded-For is believed, besides loopback: a client
 * reaching the server any other way is limited by its own address.
 */
import { join } from 'node:path';
import { CatalogSource } from './src/api/catalog';
import { API_VERSION, CORS_HEADERS, createApiHandler } from './src/api/http';
import {
  clientAddress,
  RateLimiter,
  trustedProxies,
} from './src/api/rateLimit';
import {
  httpError,
  logLine,
  mcpCallError,
  mcpToolName,
} from './src/api/requestLog';
import { createSearchPool } from './src/api/scheduleSearchPool';
import { createMcpEndpoint } from './src/mcp/server';

const basePath = (process.env.BASE_PATH ?? '/wpiplannerV2').replace(/\/$/, '');

/** Request bodies are small JSON (a query, a list of CRNs); refuse more. */
const MAX_BODY_BYTES = 64 * 1024;

const perMinute = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120);
const limiter =
  perMinute > 0
    ? new RateLimiter(perMinute, Number(process.env.RATE_LIMIT_BURST ?? 60))
    : null;
const isTrustedProxy = trustedProxies(process.env.TRUSTED_PROXIES);
const logRequests = (process.env.REQUEST_LOG ?? '1') !== '0';

const catalog = new CatalogSource({
  dataDir: process.env.DATA_DIR,
  publicDir: join(import.meta.dir, 'public'),
});
const getCatalog = () => catalog.get();

// Searches run in workers so a long one never stalls the other requests.
const search = createSearchPool({
  workers: Number(process.env.SEARCH_WORKERS ?? 2),
  maxQueue: Number(process.env.SEARCH_QUEUE ?? 8),
});
const api = createApiHandler({ basePath, getCatalog, search });
const mcp = createMcpEndpoint(getCatalog, search);
const mcpPath = `${basePath}/mcp`;
const healthPath = `${basePath}/api/${API_VERSION}/health`;

/** The stateless MCP endpoint answers POST only, so CORS advertises just that. */
const MCP_CORS_HEADERS = {
  ...CORS_HEADERS,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** The MCP endpoint, with CORS so browser-based clients can reach it too. */
async function serveMcp(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
  }
  const response = await mcp.fetch(request);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(MCP_CORS_HEADERS)) {
    headers.set(name, value);
  }
  // RFC 9110: a 405 names the methods the resource does take.
  if (response.status === 405) headers.set('Allow', 'POST, OPTIONS');
  return new Response(response.body, { status: response.status, headers });
}

async function route(request: Request, pathname: string): Promise<Response> {
  if (pathname === mcpPath || pathname === `${mcpPath}/`) {
    return serveMcp(request);
  }
  return (
    (await api(request)) ??
    Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS },
    )
  );
}

function refusal(status: number, error: string, headers = {}): Response {
  return Response.json(
    { error },
    { status, headers: { ...CORS_HEADERS, ...headers } },
  );
}

function tooManyRequests(wait: number): Response {
  return refusal(
    429,
    `Too many requests from this address; try again in ${wait} second${wait === 1 ? '' : 's'}.`,
    { 'Retry-After': String(wait) },
  );
}

const tooLarge = () =>
  refusal(
    413,
    `The request body is larger than ${MAX_BODY_BYTES / 1024} KB; the API takes small JSON.`,
  );

/**
 * The request with its body read, or a 413 when it is over the cap. Bun's own
 * maxRequestBodySize answers with an empty body, no CORS headers and no log
 * line, so the cap is enforced here: by Content-Length first, then by
 * counting the bytes of a body that did not declare one (chunked).
 */
async function withinBodyCap(request: Request): Promise<Request | Response> {
  if (!request.body) return request;
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    return tooLarge();
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: Buffer.concat(chunks),
  });
}

// Load before listening, so a bad catalog fails the start rather than the
// first request.
await getCatalog();

const server = Bun.serve({
  // Otherwise on unless NODE_ENV says production, and its error page shows the
  // caller the stack, the server's paths and the source around the failure.
  development: false,
  port: Number(process.env.PORT ?? 3001),
  hostname: process.env.HOST ?? '127.0.0.1',
  async fetch(incoming, server) {
    const started = performance.now();
    const { pathname } = new URL(incoming.url);
    const isMcp = pathname === mcpPath || pathname === `${mcpPath}/`;

    // Health checks (the container's, the proxy's) never count.
    const wait =
      limiter && incoming.method !== 'OPTIONS' && pathname !== healthPath
        ? limiter.take(
            clientAddress(
              incoming,
              server.requestIP(incoming)?.address ?? null,
              isTrustedProxy,
            ),
          )
        : 0;
    let request = incoming;
    let tool: string | null = null;
    let response: Response;
    if (wait > 0) {
      response = tooManyRequests(wait);
    } else {
      const bounded = await withinBodyCap(incoming);
      if (bounded instanceof Response) {
        response = bounded;
      } else {
        request = bounded;
        // Before the endpoint reads the body.
        if (isMcp && logRequests) tool = await mcpToolName(request);
        response = await route(request, pathname);
      }
    }

    if (logRequests && request.method !== 'OPTIONS') {
      // A tool call's reply is its one event; other MCP replies are not read.
      const error = tool ? await mcpCallError(response) : httpError(response);
      process.stdout.write(
        `${logLine({
          method: request.method,
          path: pathname,
          status: response.status,
          ms: performance.now() - started,
          tool,
          error,
        })}\n`,
      );
    }
    return response;
  },
});

process.stdout.write(
  `Course MCP endpoint at ${server.url.href}${mcpPath.slice(1)}\n`,
);
process.stdout.write(
  `Course API listening on ${server.url.href}${basePath.slice(1)}/api/${API_VERSION}\n`,
);
