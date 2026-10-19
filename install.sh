#!/usr/bin/env bash
# Installs WPI Planner on a fresh server. Re-running it updates the checkout
# and rebuilds, so it doubles as the updater.
#
# Debian, Ubuntu, Arch: Docker runs the app and its data fetcher, and a host
#   nginx sits in front of them, with a Let's Encrypt certificate when given
#   a domain.
# RHEL and its rebuilds (Rocky, Alma, CentOS Stream, Fedora): no containers.
#   Apache httpd serves the built app itself and a systemd service runs the
#   fetcher, with HTTPS from a certificate you supply. deploy/rhel.md has the
#   same steps by hand.
#
#   curl -fsSL https://raw.githubusercontent.com/lexm2/wpiplannerV2/master/install.sh \
#       | sudo bash -s -- --domain planner.example.com --email you@example.com

set -euo pipefail

REPO="https://github.com/lexm2/wpiplannerV2.git"
BRANCH="master"
DIR="/opt/wpiplanner"
PORT="8080"
DOMAIN=""
EMAIL=""
HTTPS=true
TLS_CERT=""
TLS_KEY=""

usage() {
    cat <<EOF
Usage: install.sh [options]

  --domain NAME     Serve on this domain; its DNS must already point at this
                    server. Without it the app is served over plain HTTP on
                    whatever address reaches port 80.
  --branch NAME     Branch to deploy (default: $BRANCH).
  --dir PATH        Where to check the app out (default: $DIR).

Debian, Ubuntu and Arch:
  --email ADDR      Contact address for Let's Encrypt expiry notices.
  --no-https        With --domain, skip the Let's Encrypt certificate.
  --port N          Localhost port the app container listens on (default: $PORT).

RHEL and its rebuilds:
  --tls-cert FILE   PEM certificate, followed by its intermediate chain.
  --tls-key FILE    Its private key. With both, and --domain, the app is
                    served over HTTPS and plain HTTP redirects to it.
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        --domain) DOMAIN="${2:?--domain needs a value}"; shift 2 ;;
        --email) EMAIL="${2:?--email needs a value}"; shift 2 ;;
        --no-https) HTTPS=false; shift ;;
        --branch) BRANCH="${2:?--branch needs a value}"; shift 2 ;;
        --dir) DIR="${2:?--dir needs a value}"; shift 2 ;;
        --port) PORT="${2:?--port needs a value}"; shift 2 ;;
        --tls-cert) TLS_CERT="${2:?--tls-cert needs a value}"; shift 2 ;;
        --tls-key) TLS_KEY="${2:?--tls-key needs a value}"; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
    esac
done

log() { echo "==> $*"; }
die() { echo "[ERROR] $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root (sudo bash install.sh ...)."

# shellcheck source=/dev/null
. /etc/os-release
case " ${ID:-} ${ID_LIKE:-} " in
    *" debian "*|*" ubuntu "*) FAMILY=debian ;;
    *" arch "*) FAMILY=arch ;;
    *" rhel "*|*" fedora "*) FAMILY=rhel ;;
    *) die "Only Debian, Ubuntu, Arch and RHEL-family systems are supported (found ${PRETTY_NAME:-unknown})." ;;
esac

server_ip() {
    ip -4 route get 1.1.1.1 | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}'
}

# Clones or fast-forwards $BRANCH into $DIR, running git through "$@" (empty,
# or a command that runs it as another user).
checkout() {
    log "Fetching $BRANCH into $DIR"
    if [ -d "$DIR/.git" ]; then
        "$@" git -C "$DIR" fetch -q origin "$BRANCH"
        "$@" git -C "$DIR" checkout -q "$BRANCH"
        # Fast-forward only, so edits made on the server stop the update
        # instead of being thrown away.
        "$@" git -C "$DIR" pull -q --ff-only origin "$BRANCH"
    elif [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
        die "$DIR exists and is not a git checkout; pick another --dir."
    else
        "$@" git clone -q --branch "$BRANCH" "$REPO" "$DIR"
    fi
}

install_docker_nginx() {
    WANT_CERT=false
    if [ -n "$DOMAIN" ] && [ "$HTTPS" = true ]; then
        WANT_CERT=true
    fi

    log "Installing packages"
    if [ "$FAMILY" = debian ]; then
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -q
        apt-get install -y -q ca-certificates curl git nginx iproute2
        if [ "$WANT_CERT" = true ]; then
            apt-get install -y -q certbot python3-certbot-nginx
        fi
        if ! command -v docker >/dev/null; then
            log "Installing Docker"
            curl -fsSL https://get.docker.com | sh
        fi
    else
        # -Syu, since Arch does not support installing against a stale package
        # database; this upgrades the rest of the system too.
        PKGS=(curl git nginx iproute2 docker docker-compose)
        if [ "$WANT_CERT" = true ]; then
            PKGS+=(certbot certbot-nginx)
        fi
        pacman -Syu --needed --noconfirm "${PKGS[@]}"
    fi
    docker compose version >/dev/null 2>&1 ||
        die "Docker is installed but its compose plugin is not (docker-compose-plugin on Debian, docker-compose on Arch)."
    systemctl enable --now docker

    checkout
    [ -f "$DIR/docker-compose.yml" ] || die "Branch $BRANCH has no docker-compose.yml; pass --branch."

    # Compose reads .env from the project directory, so later `docker compose`
    # commands run there keep the app bound to localhost, where only nginx reaches it.
    echo "WEB_PORT=127.0.0.1:$PORT" > "$DIR/.env"

    log "Building and starting the containers (the first build takes a few minutes)"
    docker compose --project-directory "$DIR" up -d --build

    log "Waiting for the app to answer"
    for _ in $(seq 60); do
        curl -fsS -o /dev/null "http://127.0.0.1:$PORT/wpiplannerV2/" && break
        sleep 1
    done
    curl -fsS -o /dev/null "http://127.0.0.1:$PORT/wpiplannerV2/" ||
        die "The app is not answering on 127.0.0.1:$PORT; see: docker compose --project-directory $DIR logs"

    log "Configuring nginx"
    if [ "$FAMILY" = debian ]; then
        SITE=/etc/nginx/sites-available/wpiplanner
    else
        # Arch's nginx.conf includes no directory of sites, so add conf.d.
        SITE=/etc/nginx/conf.d/wpiplanner.conf
        mkdir -p /etc/nginx/conf.d
        if ! grep -q 'include[[:space:]]*/etc/nginx/conf.d/\*\.conf' /etc/nginx/nginx.conf; then
            sed -i '0,/^[[:space:]]*http[[:space:]]*{/s//&\n    include \/etc\/nginx\/conf.d\/*.conf;/' \
                /etc/nginx/nginx.conf
        fi
    fi
    if [ -n "$DOMAIN" ]; then
        LISTEN="listen 80;"
        NAME="$DOMAIN"
    else
        # Without a domain this site has to win every request on port 80, which
        # the stock default site would otherwise claim. Arch's stock server has
        # no default_server, so marking this one is enough there.
        LISTEN="listen 80 default_server;"
        NAME="_"
        rm -f /etc/nginx/sites-enabled/default
    fi
    cat > "$SITE" <<EOF
# Written by install.sh; re-running it rewrites this file.
server {
    $LISTEN
    server_name $NAME;

    location / {
        proxy_pass         http://127.0.0.1:$PORT;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}
EOF
    if [ "$FAMILY" = debian ]; then
        ln -sf "$SITE" /etc/nginx/sites-enabled/wpiplanner
    fi
    nginx -t -q
    # Arch leaves nginx stopped after installing it; certbot needs it running.
    systemctl enable -q --now nginx

    if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
        ufw allow "Nginx Full" >/dev/null
    fi

    if [ "$WANT_CERT" = true ]; then
        log "Getting a certificate for $DOMAIN"
        if [ -n "$EMAIL" ]; then
            CONTACT=(-m "$EMAIL")
        else
            CONTACT=(--register-unsafely-without-email)
        fi
        # The site file was just rewritten without TLS; --keep-until-expiring
        # puts an existing certificate back instead of requesting a new one.
        # Certbot reloads nginx itself.
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect \
            --keep-until-expiring "${CONTACT[@]}"
        URL="https://$DOMAIN/wpiplannerV2/"
    else
        systemctl reload nginx
        URL="http://${DOMAIN:-$(server_ip)}/wpiplannerV2/"
    fi

    cat <<EOF

WPI Planner is running at $URL

  Update:         re-run this script with the same options
  Refresh logs:   docker compose --project-directory $DIR logs -f fetcher
  Force refresh:  docker compose --project-directory $DIR restart fetcher
EOF
}

APP_USER=wpiplanner
WEB_ROOT=/var/www/wpiplanner
DATA_DIR=/var/www/wpiplanner-data

# Runs a command as the app's user, which owns the checkout and the live data.
as_app() {
    runuser -u "$APP_USER" -- env HOME="/var/lib/$APP_USER" PATH=/usr/local/bin:/usr/bin:/bin "$@"
}

install_rhel_apache() {
    TLS=false
    if [ -n "$TLS_CERT" ] || [ -n "$TLS_KEY" ]; then
        [ -n "$TLS_CERT" ] && [ -n "$TLS_KEY" ] || die "--tls-cert and --tls-key go together."
        [ -n "$DOMAIN" ] || die "HTTPS needs --domain."
        [ -r "$TLS_CERT" ] || die "Cannot read $TLS_CERT."
        [ -r "$TLS_KEY" ] || die "Cannot read $TLS_KEY."
        TLS=true
    fi
    [ -z "$EMAIL" ] || die "--email is for Let's Encrypt, which this install does not use on RHEL; pass --tls-cert and --tls-key."

    # runuser keeps the working directory, which the app's user may not be
    # able to read.
    cd /

    log "Installing packages"
    PKGS=(httpd git unzip rsync diffutils gzip findutils iproute)
    if [ "$TLS" = true ]; then
        PKGS+=(mod_ssl)
    fi
    # Minimal installs ship curl-minimal, which conflicts with the curl
    # package but provides the same command.
    if ! command -v curl >/dev/null; then
        PKGS+=(curl)
    fi
    dnf install -y -q "${PKGS[@]}"
    # Bun is not packaged for RHEL. It builds the app and runs the fetcher.
    if [ ! -x /usr/local/bin/bun ]; then
        log "Installing Bun"
        curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash
    fi

    if ! id "$APP_USER" >/dev/null 2>&1; then
        useradd --system --create-home --home-dir "/var/lib/$APP_USER" \
            --shell /sbin/nologin "$APP_USER"
    fi
    install -d -o "$APP_USER" -g "$APP_USER" "$DIR"
    chown -R "$APP_USER:" "$DIR"
    checkout as_app
    [ -f "$DIR/deploy/apache/wpiplanner-app.conf" ] ||
        die "Branch $BRANCH has no deploy/apache/; pass --branch."

    log "Building the app (the first build takes a few minutes)"
    (cd "$DIR" && as_app bun install --frozen-lockfile && as_app bun run build &&
        as_app sh deploy/prepare-dist.sh dist)

    log "Publishing to $WEB_ROOT"
    install -d "$WEB_ROOT"
    rsync -a --delete --chown=root:root "$DIR/dist/" "$WEB_ROOT/wpiplannerV2/"
    install -d -o "$APP_USER" -g "$APP_USER" "$DATA_DIR"
    # Both sit under /var/www, which SELinux labels for httpd to read; this
    # puts back any label a copy carried over.
    if command -v restorecon >/dev/null; then
        restorecon -R "$WEB_ROOT" "$DATA_DIR"
    fi

    log "Starting the data fetcher"
    sed "s#/opt/wpiplanner#$DIR#g" "$DIR/deploy/systemd/wpiplanner-fetcher.service" \
        > /etc/systemd/system/wpiplanner-fetcher.service
    systemctl daemon-reload
    systemctl enable -q wpiplanner-fetcher
    # A restart, so an update runs the new fetch scripts.
    systemctl restart wpiplanner-fetcher
    # The fetcher seeds the data directory before its first fetch.
    for _ in $(seq 30); do
        [ -f "$DATA_DIR/last-updated.json" ] && break
        sleep 1
    done
    [ -f "$DATA_DIR/last-updated.json" ] ||
        die "The fetcher has not written $DATA_DIR yet; see: journalctl -u wpiplanner-fetcher"

    log "Configuring Apache"
    install -d /etc/httpd/wpiplanner
    install -m 644 "$DIR/deploy/apache/wpiplanner-app.conf" /etc/httpd/wpiplanner/app.conf
    {
        echo "# Written by install.sh; re-running it rewrites this file."
        echo "# The app's rules are in /etc/httpd/wpiplanner/app.conf."
        if [ "$TLS" = true ]; then
            cat <<EOF
<VirtualHost *:80>
    ServerName $DOMAIN
    Redirect permanent / https://$DOMAIN/
</VirtualHost>

<VirtualHost *:443>
    ServerName $DOMAIN
    SSLEngine on
    SSLCertificateFile $TLS_CERT
    SSLCertificateKeyFile $TLS_KEY
    Include /etc/httpd/wpiplanner/app.conf
</VirtualHost>
EOF
        else
            echo "<VirtualHost *:80>"
            if [ -n "$DOMAIN" ]; then
                echo "    ServerName $DOMAIN"
            fi
            echo "    Include /etc/httpd/wpiplanner/app.conf"
            echo "</VirtualHost>"
        fi
    } > /etc/httpd/conf.d/wpiplanner.conf
    apachectl configtest
    systemctl enable -q --now httpd
    systemctl reload httpd

    if systemctl is-active -q firewalld; then
        firewall-cmd -q --permanent --add-service=http
        if [ "$TLS" = true ]; then
            firewall-cmd -q --permanent --add-service=https
        fi
        firewall-cmd -q --reload
    fi

    if [ "$TLS" = true ]; then
        URL="https://$DOMAIN/wpiplannerV2/"
        CHECK=(--resolve "$DOMAIN:443:127.0.0.1" "$URL")
    else
        URL="http://${DOMAIN:-$(server_ip)}/wpiplannerV2/"
        CHECK=(-H "Host: ${DOMAIN:-localhost}" http://127.0.0.1/wpiplannerV2/)
    fi
    curl -fsS -o /dev/null "${CHECK[@]}" ||
        die "Apache is not serving the app; see: journalctl -u httpd and /var/log/httpd/error_log"

    cat <<EOF

WPI Planner is running at $URL

  Update:         re-run this script with the same options
  Refresh logs:   journalctl -u wpiplanner-fetcher -f
  Force refresh:  systemctl restart wpiplanner-fetcher
EOF
}

if [ "$FAMILY" = rhel ]; then
    install_rhel_apache
else
    [ -z "$TLS_CERT$TLS_KEY" ] || die "--tls-cert and --tls-key are for RHEL; this system gets a Let's Encrypt certificate from --domain."
    install_docker_nginx
fi
