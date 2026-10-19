/**
 * The course API server: read-only JSON routes over the course catalog, for
 * the planner and for students' AI assistants. `bun run serve:api`.
 *
 * PORT (3001), HOST (127.0.0.1), BASE_PATH (/wpiplannerV2) and DATA_DIR
 * (where the refresh job writes the live data; public/ is the fallback)
 * come from the environment.
 */
import { join } from 'node:path';
import { CatalogSource } from './src/api/catalog';
import { CORS_HEADERS, createApiHandler } from './src/api/http';
import { createMcpEndpoint } from './src/mcp/server';

const basePath = (process.env.BASE_PATH ?? '/wpiplannerV2').replace(/\/$/, '');

const catalog = new CatalogSource({
  dataDir: process.env.DATA_DIR,
  publicDir: join(import.meta.dir, 'public'),
});
const getCatalog = () => catalog.get();

const api = createApiHandler({ basePath, getCatalog });
const mcp = createMcpEndpoint(getCatalog);
const mcpPath = `${basePath}/mcp`;

/** The MCP endpoint, with CORS so browser-based clients can reach it too. */
async function serveMcp(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const response = await mcp.fetch(request);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

// Load before listening, so a bad catalog fails the start rather than the
// first request.
await getCatalog();

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3001),
  hostname: process.env.HOST ?? '127.0.0.1',
  async fetch(request) {
    const { pathname } = new URL(request.url);
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
  },
});

process.stdout.write(
  `Course MCP endpoint at ${server.url.href}${mcpPath.slice(1)}\n`,
);
process.stdout.write(
  `Course API listening on ${server.url.href}${basePath.slice(1)}/api\n`,
);
