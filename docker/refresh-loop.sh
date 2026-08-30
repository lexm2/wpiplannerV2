#!/usr/bin/env bash
# Refetches course data on an interval and publishes it to $DATA_DIR for nginx.

set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
INTERVAL="${REFRESH_INTERVAL_SECONDS:-900}"

mkdir -p "$DATA_DIR"

# Seed from the build's bundled data so nginx can serve before the first fetch.
for f in course-data.json course-data-constructed.json term-bounds.json last-updated.json; do
    if [ ! -f "$DATA_DIR/$f" ] && [ -f "/app/public/$f" ]; then
        cp "/app/public/$f" "$DATA_DIR/$f"
    fi
done

refresh_once() {
    echo "[refresh] $(date -u +%FT%TZ) starting"

    # The fetch/convert scripts write into /app/public/.
    cd /app

    bun run fetch-data
    bun run convert

    printf '{"timestamp":"%s","utc":"%s"}\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
        "$(date -u '+%Y-%m-%d %H:%M UTC')" \
        > public/last-updated.json

    # Publish via tmp+mv so nginx never reads a half-written file.
    for f in course-data.json course-data-constructed.json term-bounds.json last-updated.json; do
        if [ -f "public/$f" ]; then
            cp "public/$f" "$DATA_DIR/$f.tmp"
            mv "$DATA_DIR/$f.tmp" "$DATA_DIR/$f"
        fi
    done

    echo "[refresh] $(date -u +%FT%TZ) done"
}

while true; do
    if ! refresh_once; then
        echo "[refresh] failed, will retry after interval" >&2
    fi
    sleep "$INTERVAL"
done
