# syntax=docker/dockerfile:1.7

FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Full install: the API reaches svelte/reactivity through the shared filter
# code, and svelte is a dev dependency, so --production can't run it.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json server.ts ./
COPY src ./src
# One file instead of a 180 MB node_modules in the image.
RUN bun build server.ts --target=bun --outfile=dist/server.js

FROM oven/bun:1-alpine AS runtime
WORKDIR /app

# server.js reads public/ beside itself: rateMyProfessor.json, plus the bundled
# course data until the fetcher has written /data.
COPY --from=builder /app/dist/server.js ./
COPY public/course-data-constructed.json public/term-bounds.json \
    public/last-updated.json public/rateMyProfessor.json ./public/

ENV HOST=0.0.0.0 \
    PORT=3001 \
    DATA_DIR=/data

USER bun
EXPOSE 3001
CMD ["bun", "server.js"]
