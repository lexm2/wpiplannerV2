# Self-hosting WPI Planner

This branch is the app plus everything to host it; the app branches carry
none of it. To deploy app changes, merge them into `server`.

The app is a static SPA, a small loop that refreshes course JSON from WPI
every 15 minutes, and a read-only course API with an MCP endpoint for
students' AI assistants. All three share one origin under `/wpiplannerV2/`.

```
hosting/
├── install.sh       one-command install and update, any supported distro
├── scripts/         shared by both setups: build prep, data refresh loop
├── docker/          Debian, Ubuntu, Arch: compose stack, nginx config
└── rhel/            RHEL family: Apache config, systemd unit, manual steps
```

## One-command install

`install.sh` sets up a fresh server and, re-run with the same options, updates it.

- **Debian, Ubuntu, Arch:** installs Docker and nginx, runs the containers
  bound to localhost with nginx in front, and with `--domain` gets a Let's
  Encrypt certificate (the domain's DNS must already point at the server).
- **RHEL, Rocky, Alma, Fedora:** no containers. Apache httpd serves the built
  app directly, proxies the API, and systemd services run the fetcher and the
  API; HTTPS uses a
  certificate you pass with `--tls-cert` and `--tls-key`. The same setup by
  hand is in [rhel/README.md](rhel/README.md).

```
curl -fsSL https://raw.githubusercontent.com/lexm2/wpiplannerV2/server/hosting/install.sh \
    | sudo bash -s -- --domain planner.example.com --email you@example.com
```

Leave out `--domain` to serve over plain HTTP on the server's IP. `--help`
lists the other options.

## Docker by hand

Requirements: Docker and Docker Compose on the host.

```
git clone --branch server https://github.com/lexm2/wpiplannerV2.git
cd wpiplannerV2/hosting/docker
docker compose up -d --build
```

Open http://localhost:8080/wpiplannerV2/ (override the host port with
`WEB_PORT=80 docker compose up -d`).

What's running:

- `web` — nginx serving the built SPA at `/wpiplannerV2/`.
- `api` — bun container running `server.ts`, the course API and MCP endpoint.
  It has no host port: `web` proxies `/wpiplannerV2/api/` and
  `/wpiplannerV2/mcp` to it. It reads the catalog from the shared volume and
  picks up each refresh within 30 seconds, without a restart.
- `fetcher` — bun container that runs `bun run fetch-data && bun run convert`
  every `REFRESH_INTERVAL_SECONDS` (default 900) and writes the four course
  JSON files into a shared `course-data` volume. The web container serves those
  files from the volume via nginx `alias` directives, so refreshes are live
  without rebuilding the image.

Useful commands:

- `docker compose logs -f fetcher` — watch refreshes.
- `docker compose restart fetcher` — force an immediate refresh.
- `docker compose logs -f api` and `docker compose restart api` — the API.
- `docker compose down -v` — stop and wipe the cached course data.

## Course API and MCP

Both setups serve, beside the app:

- `https://<domain>/wpiplannerV2/api/` — read-only JSON. `GET health`,
  `meta`, `departments`, `courses?department=CS&term=C&limit=20`,
  `courses/CS2102`; `POST courses/search` (the filter panel's criteria as
  JSON) and `POST conflicts` (`{"crns": [...]}`).
- `https://<domain>/wpiplannerV2/mcp` — MCP over Streamable HTTP, stateless,
  with the tools `search_courses`, `get_course`, `list_departments`,
  `get_catalog_info` and `check_conflicts`.

A student connects an MCP client to it, for example Claude Code:

```
claude mcp add --transport http wpi-courses https://<domain>/wpiplannerV2/mcp
```

The comment at the top of `server.ts` lists its environment variables; the
route and tool code is in `src/api/` and `src/mcp/`.
