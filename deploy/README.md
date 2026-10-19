# Self-hosting WPI Planner

This branch is the app plus everything to host it; the app branches carry
none of it. To deploy app changes, merge them into `server`.

The app is a static SPA plus a small loop that refreshes course JSON from WPI
every 15 minutes. Both live in `docker-compose.yml`.

## One-command install

`install.sh` sets up a fresh server and, re-run with the same options, updates it.

- **Debian, Ubuntu, Arch:** installs Docker and nginx, runs the containers
  bound to localhost with nginx in front, and with `--domain` gets a Let's
  Encrypt certificate (the domain's DNS must already point at the server).
- **RHEL, Rocky, Alma, Fedora:** no containers. Apache httpd serves the built
  app directly and a systemd service runs the fetcher; HTTPS uses a
  certificate you pass with `--tls-cert` and `--tls-key`. The same setup by
  hand is in [rhel.md](rhel.md).

```
curl -fsSL https://raw.githubusercontent.com/lexm2/wpiplannerV2/server/install.sh \
    | sudo bash -s -- --domain planner.example.com --email you@example.com
```

Leave out `--domain` to serve over plain HTTP on the server's IP. `--help`
lists the other options.

## Manual

Requirements: Docker and Docker Compose on the host.

```
git clone --branch server https://github.com/lexm2/wpiplannerV2.git
cd wpiplannerV2
docker compose up -d --build
```

Open http://localhost:8080/wpiplannerV2/ (override the host port with
`WEB_PORT=80 docker compose up -d`).

What's running:

- `web` — nginx serving the built SPA at `/wpiplannerV2/`.
- `fetcher` — bun container that runs `bun run fetch-data && bun run convert`
  every `REFRESH_INTERVAL_SECONDS` (default 900) and writes the four course
  JSON files into a shared `course-data` volume. The web container serves those
  files from the volume via nginx `alias` directives, so refreshes are live
  without rebuilding the image.

Useful commands:

- `docker compose logs -f fetcher` — watch refreshes.
- `docker compose restart fetcher` — force an immediate refresh.
- `docker compose down -v` — stop and wipe the cached course data.
