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

const basePath = (process.env.BASE_PATH ?? '/wpiplannerV2').replace(/\/$/, '');

const catalog = new CatalogSource({
  dataDir: process.env.DATA_DIR,
  publicDir: join(import.meta.dir, 'public'),
});
const getCatalog = () => catalog.get();

const api = createApiHandler({ basePath, getCatalog });

// Load before listening, so a bad catalog fails the start rather than the
// first request.
await getCatalog();

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3001),
  hostname: process.env.HOST ?? '127.0.0.1',
  async fetch(request) {
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
  `Course API listening on ${server.url.href}${basePath.slice(1)}/api\n`,
);
