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

    # Called from an `if`, which disables set -e inside the function, so every
    # step bails out explicitly; otherwise a failed fetch would still convert and
    # publish stale data under a fresh last-updated.json.
    # The fetch/convert scripts write into /app/public/.
    cd /app || return 1

    bun run fetch-data || return 1

    # Compared against what is published rather than the last fetch, so a
    # volume left over from an older image still gets refreshed. Leaving the
    # files alone keeps their mtimes, and with them nginx's ETags, so browsers
    # revalidate to a 304 instead of downloading the data again.
    if cmp -s public/course-data.json "$DATA_DIR/course-data.json" &&
        [ -f "$DATA_DIR/course-data-constructed.json" ]; then
        echo "[refresh] $(date -u +%FT%TZ) unchanged, nothing to publish"
        return 0
    fi

    bun run convert || return 1

    printf '{"timestamp":"%s","utc":"%s"}\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
        "$(date -u '+%Y-%m-%d %H:%M UTC')" \
        > public/last-updated.json || return 1

    # Publish via tmp+mv so nginx never reads a half-written file.
    # The raw copy goes last: it marks this data as published.
    for f in course-data-constructed.json term-bounds.json last-updated.json course-data.json; do
        if [ -f "public/$f" ]; then
            cp "public/$f" "$DATA_DIR/$f.tmp" || return 1
            mv "$DATA_DIR/$f.tmp" "$DATA_DIR/$f" || return 1
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
