# syntax=docker/dockerfile:1.7

FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build
# Precompressed copies for nginx's gzip_static, at a level too slow to use
# per request. Hashed assets and the static JSON never change once built.
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \
        -o -name '*.json' -o -name '*.svg' -o -name '*.txt' -o -name '*.xml' \) \
        -size +1k -exec gzip -9 -k {} \;

FROM nginx:1.27-alpine AS runtime

# Path matches vite `base: '/wpiplannerV2/'`.
COPY --from=builder /app/dist /usr/share/nginx/html/wpiplannerV2
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
