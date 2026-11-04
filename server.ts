/**
 * The course API server: read-only JSON routes over the course catalog, for
 * the planner and for students' AI assistants. `bun run serve:api`.
 *
 * PORT (3001), HOST (127.0.0.1), BASE_PATH (/wpiplannerV2) and DATA_DIR
 * (where the refresh job writes the live data; public/ is the fallback)
 * come from the environment, as do RATE_LIMIT_PER_MINUTE (120 requests a
 * client, in bursts up to RATE_LIMIT_BURST, 60; 0 turns the limit off) and
 * REQUEST_LOG (any value but 0 logs a line per request).
 */
import { join } from 'node:path';
import { CatalogSource } from './src/api/catalog';
import { API_VERSION, CORS_HEADERS, createApiHandler } from './src/api/http';
import { clientAddress, RateLimiter } from './src/api/rateLimit';
import {
  apiError,
  logLine,
  mcpCallError,
  mcpToolName,
} from './src/api/requestLog';
import { createMcpEndpoint } from './src/mcp/server';

const basePath = (process.env.BASE_PATH ?? '/wpiplannerV2').replace(/\/$/, '');

/** Request bodies are small JSON (a query, a list of CRNs); refuse more. */
const MAX_BODY_BYTES = 64 * 1024;

const perMinute = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120);
const limiter =
  perMinute > 0
    ? new RateLimiter(perMinute, Number(process.env.RATE_LIMIT_BURST ?? 60))
    : null;
const logRequests = (process.env.REQUEST_LOG ?? '1') !== '0';

const catalog = new CatalogSource({
  dataDir: process.env.DATA_DIR,
  publicDir: join(import.meta.dir, 'public'),
});
const getCatalog = () => catalog.get();

const api = createApiHandler({ basePath, getCatalog });
const mcp = createMcpEndpoint(getCatalog);
const mcpPath = `${basePath}/mcp`;
const healthPath = `${basePath}/api/${API_VERSION}/health`;

const withCors = (response: Response) => {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
};

/** The MCP endpoint, with CORS so browser-based clients can reach it too. */
async function serveMcp(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return withCors(await mcp.fetch(request));
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

function tooManyRequests(wait: number): Response {
  return Response.json(
    {
      error: `Too many requests from this address; try again in ${wait} second${wait === 1 ? '' : 's'}.`,
    },
    {
      status: 429,
      headers: { ...CORS_HEADERS, 'Retry-After': String(wait) },
    },
  );
}

// Load before listening, so a bad catalog fails the start rather than the
// first request.
await getCatalog();

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3001),
  hostname: process.env.HOST ?? '127.0.0.1',
  maxRequestBodySize: MAX_BODY_BYTES,
  async fetch(request, server) {
    const started = performance.now();
    const { pathname } = new URL(request.url);
    const isMcp = pathname === mcpPath || pathname === `${mcpPath}/`;
    const tool = isMcp && logRequests ? await mcpToolName(request) : null;

    // Health checks (the container's, the proxy's) never count.
    const wait =
      limiter && request.method !== 'OPTIONS' && pathname !== healthPath
        ? limiter.take(
            clientAddress(request, server.requestIP(request)?.address ?? null),
          )
        : 0;
    const response =
      wait > 0 ? tooManyRequests(wait) : await route(request, pathname);

    if (logRequests && request.method !== 'OPTIONS') {
      // A tool call's reply is its one event; other MCP replies are not read.
      const error =
        tool && wait === 0
          ? await mcpCallError(response)
          : await apiError(response);
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
