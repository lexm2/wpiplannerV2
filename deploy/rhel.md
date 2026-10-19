# Running WPI Planner on RHEL with Apache

`install.sh` does all of this on a RHEL-family server. These are the same steps
by hand, for a server whose configuration is managed some other way.

The app is a static site plus a fetcher that refreshes the course data every
15 minutes. Apache serves both: the built app as files, and the fetcher's
output through three `Alias`es. No containers are involved.

| Path | What | Owner |
|---|---|---|
| `/opt/wpiplanner` | git checkout; the fetcher runs from here | `wpiplanner` |
| `/var/www/wpiplanner/wpiplannerV2` | the built app | `root` |
| `/var/www/wpiplanner-data` | live course data, written by the fetcher | `wpiplanner` |
| `/etc/httpd/wpiplanner/app.conf` | the app's Apache rules | `root` |
| `/etc/httpd/conf.d/wpiplanner.conf` | the vhost that includes them | `root` |

Both web paths sit under `/var/www`, which the stock SELinux policy already
labels `httpd_sys_content_t`, so no `semanage` rules are needed.

## Dependencies

- `httpd` with its stock modules (alias, deflate, dir, headers, mime, rewrite),
  and `mod_ssl` for HTTPS.
- `git`, `rsync`, `diffutils`, `gzip`, `unzip` from the base repos.
- [Bun](https://bun.sh), the one dependency from outside RHEL's repos. It builds
  the app and runs the fetch and convert scripts, which use only Bun's built-in
  modules. `curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash`
  puts it at `/usr/local/bin/bun`.

If the course data can be dropped into `/var/www/wpiplanner-data` some other
way (WPI's own servers already have it), the fetcher, and with it Bun on the
server, is not needed. The app only needs Bun to build, and that can happen on
any machine. The data directory has to hold `course-data-constructed.json`,
`term-bounds.json` and `last-updated.json`, as `scripts/convert-course-data.ts`
writes them.

## Steps

```bash
dnf install -y httpd mod_ssl git rsync diffutils gzip unzip
curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash

useradd --system --create-home --home-dir /var/lib/wpiplanner --shell /sbin/nologin wpiplanner
install -d -o wpiplanner -g wpiplanner /opt/wpiplanner /var/www/wpiplanner-data
cd /opt/wpiplanner
runuser -u wpiplanner -- git clone https://github.com/lexm2/wpiplannerV2.git .

# Build, then strip the build's copies of the live data and precompress it.
runuser -u wpiplanner -- env HOME=/var/lib/wpiplanner PATH=/usr/local/bin:/usr/bin:/bin \
    sh -c 'bun install --frozen-lockfile && bun run build && sh deploy/prepare-dist.sh dist'
install -d /var/www/wpiplanner
rsync -a --delete --chown=root:root dist/ /var/www/wpiplanner/wpiplannerV2/
restorecon -R /var/www/wpiplanner /var/www/wpiplanner-data

# Fetcher. It seeds the data directory before its first fetch.
cp deploy/systemd/wpiplanner-fetcher.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now wpiplanner-fetcher

# Apache. Edit the vhost's name and certificate paths first.
install -d /etc/httpd/wpiplanner
install -m 644 deploy/apache/wpiplanner-app.conf /etc/httpd/wpiplanner/app.conf
install -m 644 deploy/apache/wpiplanner.conf /etc/httpd/conf.d/wpiplanner.conf
apachectl configtest
systemctl enable --now httpd

firewall-cmd --permanent --add-service=http --add-service=https
firewall-cmd --reload
```

The site is then at `https://<your name>/wpiplannerV2/`.

## HTTPS

`deploy/apache/wpiplanner.conf` expects a PEM certificate, followed by its
intermediate chain, and its key. Keep them under `/etc/pki/tls/` so they carry
the `cert_t` label httpd is allowed to read; a certificate elsewhere fails
with a permission error in `/var/log/httpd/error_log`.

## Updating

```bash
cd /opt/wpiplanner
runuser -u wpiplanner -- git pull --ff-only
# then the build and rsync lines above, and:
systemctl restart wpiplanner-fetcher
```

Or re-run `install.sh` with the same options.

## Day to day

- `journalctl -u wpiplanner-fetcher -f`: watch refreshes.
- `systemctl restart wpiplanner-fetcher`: refresh now.
- The fetcher leaves the files alone when WPI's data has not changed, so their
  ETags hold and browsers revalidate to a 304.
