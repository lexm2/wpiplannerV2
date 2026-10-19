#!/bin/sh
# Readies a built dist/ for a web server that serves the live course data from
# the fetcher's data directory. Used by the Docker image and the RHEL install.

set -eu

DIST="${1:?usage: prepare-dist.sh DIST_DIR}"

# The web server serves the live data from the fetcher's directory, so the
# build's copies would never be read.
rm -f "$DIST/course-data-constructed.json" "$DIST/term-bounds.json" "$DIST/last-updated.json"

# Precompressed copies for nginx's gzip_static and the Apache rewrite that
# stands in for it, at a level too slow to use per request. Hashed assets and
# the static JSON never change once built.
find "$DIST" -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \
        -o -name '*.json' -o -name '*.svg' -o -name '*.txt' -o -name '*.xml' \) \
        -size +1k -exec gzip -9 -kf {} \;
