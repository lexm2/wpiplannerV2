# syntax=docker/dockerfile:1.7

FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM nginx:1.27-alpine AS runtime

# Path matches vite `base: '/wpiplannerV2/'`.
COPY --from=builder /app/dist /usr/share/nginx/html/wpiplannerV2
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
