# docbackend

Small Go service that backs the [docweb](../docweb/) site's interactive features:

| Endpoint | Purpose |
|---|---|
| `POST /api/ideas` | Submit a public idea / pain point. New rows are `pending` until moderated. |
| `GET  /api/ideas` | Paginate publicly approved ideas (newest first) + per-idea comment count. |
| `POST /api/ideas/{id}/comments` | Post a flat comment on a public idea. |
| `GET  /api/ideas/{id}/comments` | Paginate comments on a public idea (oldest first). |
| `POST /api/ask` | Doc-grounded Q&A. Returns text/event-stream. |
| `GET  /api/health` | Liveness + loaded doc count. |

Frontend pairing: [`docweb/src/api/client.ts`](../docweb/src/api/client.ts).

## Stack

- Go 1.25, [Kratos v2](https://go-kratos.dev/) for the lifecycle + HTTP server wrapper
- [GORM](https://gorm.io/) on PostgreSQL (driver: `gorm.io/driver/postgres`)
- [bluemonday](https://github.com/microcosm-cc/bluemonday) for sanitization
- `golang.org/x/time/rate` for per-IP token-bucket throttling

## One-time setup

1. Set up the database:

   ```powershell
   $env:DOCBACKEND_TEST_DSN = "postgres://user:pass@localhost:5432/yourdb?sslmode=disable"
   make migrate
   ```

   This runs `TestAutoMigrate`, which creates `docbackend_ideas` and `docbackend_comments`. The same `AutoMigrate` also runs on each server start, so the test is just a fast bootstrap + CI schema-drift guard.

2. Set the required environment variables (the config substitutes `${VAR}` placeholders against the process env at load time):

   | Variable | Used for |
   |---|---|
   | `DOCBACKEND_DSN` | Postgres DSN |
   | `DOCBACKEND_UPSTREAM_BASE_URL` | OpenAI-compatible base, e.g. `https://api.mimo.chat/v1` |
   | `DOCBACKEND_UPSTREAM_API_KEY` | API key for the upstream |
   | `DOCBACKEND_UPSTREAM_MODEL` | Model name, e.g. `mimo-v2.5` |
   | `DOCBACKEND_IP_SALT` | Any random string — mixed into sha256(ip + salt) for rate-limit bucketing |
   | `DOCBACKEND_DOCS_DIR` | (optional) Override the docs directory; defaults to `configs/../../doc`. |

## Run locally

```powershell
make run
# or
go run ./cmd/docbackend -conf configs/config.yaml
```

Then:

```powershell
curl http://127.0.0.1:8080/api/health
```

## Moderation

Both tables drop new rows in their default status:

- ideas → `pending` (hidden until you approve)
- comments → `public` (visible immediately; you hide bad ones)

To approve / hide:

```sql
UPDATE docbackend_ideas    SET status = 'public' WHERE id = 42;
UPDATE docbackend_comments SET status = 'hidden' WHERE id = 99;
```

No admin UI in v1 — `psql` is the moderation surface.

## Build a Docker image

```powershell
# from repo root (not docbackend/), so the Dockerfile can COPY ../doc
docker build -f docbackend/Dockerfile -t mimo2codex-docbackend .
```

Or use the helper PowerShell script (auto-detects version from root `package.json` and Docker Hub username from your `docker login`):

```powershell
pwsh docbackend/scripts/docker-build-push.ps1
```

## Deploy shape

```
nginx (mimodoc.chengj.online)
  ├── /              → docweb static files
  └── /api/*         → docbackend:8080 (reverse_proxy, proxy_buffering off for SSE)
```

The container is stateless; persistent data lives in the external PostgreSQL pointed to by `DOCBACKEND_DSN`.
