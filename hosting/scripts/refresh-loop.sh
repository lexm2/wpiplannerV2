#!/usr/bin/env bash
# Refetches course data on an interval and publishes it to $DATA_DIR.

set -euo pipefail

APP_DIR="${APP_DIR:-/app}"
DATA_DIR="${DATA_DIR:-/data}"
INTERVAL="${REFRESH_INTERVAL_SECONDS:-900}"

mkdir -p "$DATA_DIR"

# Seed from the bundled data so the site works before the first fetch.
for f in course-data-constructed.json term-bounds.json last-updated.json; do
    if [ ! -f "$DATA_DIR/$f" ] && [ -f "$APP_DIR/public/$f" ]; then
        cp "$APP_DIR/public/$f" "$DATA_DIR/$f"
    fi
done

refresh_once() {
    echo "[refresh] $(date -u +%FT%TZ) starting"

    # Called from `if`, which disables set -e, so each step returns on failure;
    # otherwise a failed fetch would publish stale data under a fresh timestamp.
    cd "$APP_DIR" || return 1

    bun run fetch-data || return 1

    # Unchanged data is left alone, keeping its mtimes and ETags so browsers get
    # a 304. Compared with the published raw copy rather than the last fetch, so
    # an old volume still refreshes; the .gz check catches data seeded above.
    if cmp -s data/course-data.json "$DATA_DIR/course-data.json" &&
        [ -f "$DATA_DIR/course-data-constructed.json.gz" ]; then
        echo "[refresh] $(date -u +%FT%TZ) unchanged, nothing to publish"
        return 0
    fi

    bun run convert || return 1

    printf '{"timestamp":"%s","utc":"%s"}\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
        "$(date -u '+%Y-%m-%d %H:%M UTC')" \
        > public/last-updated.json || return 1

    # The catalog ships minified with a gzip -9 copy served as is, about half of
    # on-the-fly gzip. public/ keeps the readable copy.
    bun -e 'const [src, dst] = process.argv.slice(-2);
        await Bun.write(dst, JSON.stringify(await Bun.file(src).json()));' \
        public/course-data-constructed.json \
        "$DATA_DIR/course-data-constructed.json.tmp" || return 1
    gzip -9 -c "$DATA_DIR/course-data-constructed.json.tmp" \
        > "$DATA_DIR/course-data-constructed.json.gz.tmp" || return 1
    mv "$DATA_DIR/course-data-constructed.json.gz.tmp" "$DATA_DIR/course-data-constructed.json.gz" || return 1
    mv "$DATA_DIR/course-data-constructed.json.tmp" "$DATA_DIR/course-data-constructed.json" || return 1

    # tmp+mv so a reader never sees a half-written file. The raw copy goes last:
    # it marks the publish done.
    for f in public/term-bounds.json public/last-updated.json data/course-data.json; do
        if [ -f "$f" ]; then
            name="$(basename "$f")"
            cp "$f" "$DATA_DIR/$name.tmp" || return 1
            mv "$DATA_DIR/$name.tmp" "$DATA_DIR/$name" || return 1
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
