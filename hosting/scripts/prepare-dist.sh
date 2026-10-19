#!/bin/sh
# Readies a built dist/ for serving. Used by the Docker image and the RHEL install.

set -eu

DIST="${1:?usage: prepare-dist.sh DIST_DIR}"

# The live data is served from the fetcher's directory instead.
rm -f "$DIST/course-data-constructed.json" "$DIST/term-bounds.json" "$DIST/last-updated.json"

# gzip -9 copies for nginx's gzip_static and its Apache equivalent; built
# files never change.
find "$DIST" -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \
        -o -name '*.json' -o -name '*.svg' -o -name '*.txt' -o -name '*.xml' \) \
        -size +1k -exec gzip -9 -kf {} \;
