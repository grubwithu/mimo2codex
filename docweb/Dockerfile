# mimo2codex-docweb image
# ─────────────────────────────────────────────────────────────────────────────
# Build context MUST be the repo root (docweb pulls ../doc/*.md and
# ../images/*.png at build time via Vite import.meta.glob / ?url).
#
# Build (single-arch, load locally):
#   docker buildx build --file docweb/Dockerfile -t mimo2codex-docweb --load .
#
# Build & push multi-arch via scripts/docker-build-push.ps1.
# ─────────────────────────────────────────────────────────────────────────────

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy the manifest first to leverage Docker layer cache on deps.
COPY docweb/package.json ./docweb/
COPY docweb/package-lock.json* ./docweb/

WORKDIR /app/docweb
RUN npm install --no-audit --no-fund

# Bring in the docs and image assets the site renders.
WORKDIR /app
COPY doc ./doc
COPY images ./images

# Bring in the docweb sources (selective, to keep the build context small).
COPY docweb/src ./docweb/src
COPY docweb/public ./docweb/public
COPY docweb/index.html ./docweb/
COPY docweb/vite.config.ts ./docweb/
COPY docweb/tsconfig.json ./docweb/

WORKDIR /app/docweb
RUN npm run build

# ── Runtime stage: nginx static server ───────────────────────────────────────
FROM nginx:alpine AS runtime

COPY --from=builder /app/docweb/dist /usr/share/nginx/html
COPY docweb/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# nginx:alpine's default entrypoint already runs nginx in the foreground.
