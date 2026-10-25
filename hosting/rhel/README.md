# Running WPI Planner on RHEL with Apache

`install.sh` does all of this on a RHEL-family server. These are the same steps
by hand, for a server whose configuration is managed some other way.

The app is a static site, a fetcher that refreshes the course data every
15 minutes, and a course API with an MCP endpoint. Apache serves the built app
as files, the fetcher's output through three `Alias`es, and proxies
`/wpiplannerV2/api/` and `/wpiplannerV2/mcp` to the API on `127.0.0.1:8008`.
No containers are involved.

| Path | What | Owner |
|---|---|---|
| `/opt/wpiplanner` | git checkout; the fetcher and API run from here | `wpiplanner` |
| `/var/www/wpiplanner/wpiplannerV2` | the built app | `root` |
| `/var/www/wpiplanner-data` | live course data, written by the fetcher | `wpiplanner` |
| `/etc/httpd/wpiplanner/app.conf` | the app's Apache rules | `root` |
| `/etc/httpd/conf.d/wpiplanner.conf` | the vhost that includes them | `root` |

Both web paths sit under `/var/www`, which the stock SELinux policy already
labels `httpd_sys_content_t`, so no `semanage` rules are needed.

By default SELinux stops httpd from opening connections, which the API proxy
needs. The API listens on 8008, a port the policy already labels
`http_port_t`, so `httpd_can_network_relay` is enough; it lets httpd reach web
and proxy ports, where `httpd_can_network_connect` would open every port. (The
API's own default, 3001, is labelled `ntop_port_t` and would need either the
broader boolean or a `semanage port -m`.)

## Dependencies

- `httpd` with its stock modules (alias, deflate, dir, headers, mime, proxy,
  proxy_http, rewrite; the package loads all of them), and `mod_ssl` for HTTPS.
- `git`, `rsync`, `diffutils`, `gzip`, `unzip` from the base repos.
- [Bun](https://bun.sh), the one dependency from outside RHEL's repos. It builds
  the app, runs the fetch and convert scripts, which use only Bun's built-in
  modules, and runs the API from the checkout with the build's `node_modules`. `curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash`
  puts it at `/usr/local/bin/bun`.

If the course data can be dropped into `/var/www/wpiplanner-data` some other
way (WPI's own servers already have it), the fetcher is not needed. The app
only needs Bun to build, and that can happen on any machine; the API needs it
at run time. The data directory has to hold `course-data-constructed.json`,
`term-bounds.json` and `last-updated.json`, as `scripts/convert-course-data.ts`
writes them.

## Steps

```bash
dnf install -y httpd mod_ssl git rsync diffutils gzip unzip
curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash

useradd --system --create-home --home-dir /var/lib/wpiplanner --shell /sbin/nologin wpiplanner
install -d -o wpiplanner -g wpiplanner /opt/wpiplanner /var/www/wpiplanner-data
cd /opt/wpiplanner
runuser -u wpiplanner -- git clone --branch server https://github.com/lexm2/wpiplannerV2.git .

# Build, then strip the build's copies of the live data and precompress it.
runuser -u wpiplanner -- env HOME=/var/lib/wpiplanner PATH=/usr/local/bin:/usr/bin:/bin \
    sh -c 'bun install --frozen-lockfile && bun run build && sh hosting/scripts/prepare-dist.sh dist'
install -d /var/www/wpiplanner
rsync -a --delete --chown=root:root dist/ /var/www/wpiplanner/wpiplannerV2/
restorecon -R /var/www/wpiplanner /var/www/wpiplanner-data

# Fetcher. It seeds the data directory before its first fetch.
cp hosting/rhel/systemd/wpiplanner-fetcher.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now wpiplanner-fetcher

# Course API on 127.0.0.1:8008; Apache proxies to it.
cp hosting/rhel/systemd/wpiplanner-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now wpiplanner-api
sleep 3  # it loads the catalog before listening
curl -fsS http://127.0.0.1:8008/wpiplannerV2/api/v1/health
setsebool -P httpd_can_network_relay 1

# Apache. Edit the vhost's name and certificate paths first.
install -d /etc/httpd/wpiplanner
install -m 644 hosting/rhel/apache/wpiplanner-app.conf /etc/httpd/wpiplanner/app.conf
install -m 644 hosting/rhel/apache/wpiplanner-vhost.conf /etc/httpd/conf.d/wpiplanner.conf
apachectl configtest
systemctl enable --now httpd

firewall-cmd --permanent --add-service=http --add-service=https
firewall-cmd --reload
```

The site is then at `https://<your name>/wpiplannerV2/`, the API at
`.../wpiplannerV2/api/v1/` and the MCP endpoint at `.../wpiplannerV2/mcp`.

## HTTPS

`hosting/rhel/apache/wpiplanner-vhost.conf` expects a PEM certificate, followed by its
intermediate chain, and its key. Keep them under `/etc/pki/tls/` so they carry
the `cert_t` label httpd is allowed to read; a certificate elsewhere, or one
moved there with `mv` and not `restorecon`ed, makes httpd fail to start or
reload, saying in `journalctl -u httpd` that the file "does not exist or is
empty". `install.sh` refuses such files up front.

## Updating

```bash
cd /opt/wpiplanner
# The fetcher rewrites these in the checkout; the live copies are in the data directory.
runuser -u wpiplanner -- git checkout -- data/course-data.json \
    public/course-data-constructed.json public/term-bounds.json public/last-updated.json
runuser -u wpiplanner -- git pull --ff-only
# then the build and rsync lines above, and:
systemctl restart wpiplanner-fetcher wpiplanner-api
```

Or re-run `install.sh` with the same options.

## Day to day

- `journalctl -u wpiplanner-fetcher -f`: watch refreshes.
- `systemctl restart wpiplanner-fetcher`: refresh now.
- `journalctl -u wpiplanner-api -f`, `systemctl restart wpiplanner-api`: the
  API. It picks up each refresh within 30 seconds on its own; restart it only
  for new code.
- An API request answering 503 with `Permission denied` in
  `/var/log/httpd/error_log` is SELinux: check `getsebool httpd_can_network_relay`.
- The fetcher leaves the files alone when WPI's data has not changed, so their
  ETags hold and browsers revalidate to a 304.
