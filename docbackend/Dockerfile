# Multi-stage build for docbackend. The build context is expected to be the
# REPO ROOT (not docbackend/) so we can COPY ../doc into the final image.
#
# Build:
#   docker build -f docbackend/Dockerfile -t mimo2codex-docbackend .
#
# Run:
#   docker run --rm -p 8080:8080 \
#     -e DOCBACKEND_DSN="postgres://user:pass@host:5432/db?sslmode=disable" \
#     -e DOCBACKEND_UPSTREAM_BASE_URL="https://api.mimo.chat/v1" \
#     -e DOCBACKEND_UPSTREAM_API_KEY="sk-..." \
#     -e DOCBACKEND_UPSTREAM_MODEL="mimo-v2.5" \
#     -e DOCBACKEND_IP_SALT="any-random-string" \
#     mimo2codex-docbackend

FROM golang:1.25-alpine AS builder
WORKDIR /src
# Cache deps separately so source edits don't bust the module download layer.
COPY docbackend/go.mod docbackend/go.sum ./docbackend/
RUN cd docbackend && go mod download
COPY docbackend ./docbackend
RUN cd docbackend && CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/docbackend ./cmd/docbackend

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=builder /out/docbackend /app/docbackend
COPY docbackend/configs /app/configs
# Docs live at repo-root /doc — bundle them so the AI assistant has the
# corpus available without an extra volume mount.
COPY doc /app/doc
ENV DOCBACKEND_DOCS_DIR=/app/doc
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app/docbackend", "-conf", "/app/configs/config.yaml"]
