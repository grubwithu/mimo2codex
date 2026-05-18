# Docker deployment

mimo2codex ships an official docker image, **multi-arch (amd64 + arm64)**, **works on macOS / Windows / Linux**, hosted on GitHub Container Registry:

```
ghcr.io/7as0nch/mimo2codex
```

~70MB final image (alpine base + multi-stage build, no npm / build toolchain).

## Contents

- [Quickstart (docker compose)](#quickstart-docker-compose)
- [Plain `docker run` one-liner](#plain-docker-run-one-liner)
- [Build locally](#build-locally)
- [Env vars & key injection](#env-vars--key-injection)
- [Data persistence](#data-persistence)
- [Image tags](#image-tags)
- [Common ops commands](#common-ops-commands)
- [FAQ](#faq)
- [Multi-arch / multi-platform support](#multi-arch--multi-platform-support)

## Quickstart (docker compose)

Repo root ships a `docker-compose.yml`. Three steps:

```bash
# 1. Prepare .env (already gitignored)
cp .env.example .env
# Edit .env, set at least one provider key:
#   MIMO_API_KEY=sk-xxxxxxxxxxxx
#   or DEEPSEEK_API_KEY=sk-xxxxxxxxxxxx

# 2. Start
docker compose up -d

# 3. Open admin UI
open http://localhost:8788          # mac/Linux
start http://localhost:8788         # Windows
```

Done. Point Codex at `http://localhost:8788/v1` as the base URL.

## Plain `docker run` one-liner

If you don't want compose:

```bash
# Minimal (key inline, no persistence)
docker run -d --name mimo2codex \
  -p 8788:8788 \
  -e MIMO_API_KEY=sk-xxxxxxxxxxxx \
  ghcr.io/7as0nch/mimo2codex:latest

# With persistence + .env file
docker run -d --name mimo2codex \
  -p 8788:8788 \
  --env-file ./.env \
  -e MIMO2CODEX_DATA_DIR=/data \
  -v ~/.mimo2codex:/data \
  ghcr.io/7as0nch/mimo2codex:latest
```

## Build locally

Skip the registry, build yourself:

```bash
# Build for your current arch
docker build -t mimo2codex:local .

# Or via compose: in docker-compose.yml swap
#   image: ghcr.io/7as0nch/mimo2codex:latest   ← comment out
#   build: .                                    ← enable
docker compose build
docker compose up -d
```

Build details:
- Stage 1: `node:20-alpine` + `python3 + make + g++` to compile `better-sqlite3` native module
- Stage 2: `alpine:3.19` + `nodejs + libstdc++` only, no npm
- Trims devDeps, `.md`, `.ts`, `.map`, test dirs → ~70MB final
- Local single-arch build: ~2-3 min first time. CI multi-arch (amd64 + arm64): ~10 min.

## Env vars & key injection

### Loading chain

```
host .env
    │
    │  docker compose loads env_file → injects KEY=VALUE into container process.env
    ▼
container process starts
    │
    │  mimo2codex/cli.ts then reads <dataDir>/.env (default /data/.env)
    ▼
final process.env:
    /data/.env exists → overrides compose-injected values for matching keys
    /data/.env absent → compose-injected values stand
```

**Tip**: keep **only one** `.env` (host repo root, the one compose injects). Don't also drop one into `.mimo2codex/.env` — the two will fight in confusing ways.

### Injection methods

| Method | How | When | Safety |
|---|---|---|---|
| `env_file: - .env` (compose default) | Point compose at `.env` file | Local deploy ✅ | `.env` is gitignored |
| `environment: - KEY=value` (hardcoded) | Literal in compose file | ❌ Don't | Key lands in git history |
| `environment: - KEY=${KEY}` (from shell) | Read from invoking shell | CI / CD | OK |
| `-e KEY=value` (docker run inline) | Command line | Debug | OK, but leaks to shell history |

### Required / optional env

Need at least one provider key. Full reference: [.env.example](../.env.example) or [doc/env-setup.md](./env-setup.md). Common ones:

- `MIMO_API_KEY` — Xiaomi MiMo (`sk-*` / `tp-*` auto-routes to right host)
- `DEEPSEEK_API_KEY` — DeepSeek
- `GENERIC_API_KEY` + `GENERIC_BASE_URL` — any OpenAI-compatible upstream (Qwen / Kimi / GLM / etc)
- `MIMO2CODEX_DATA_DIR=/data` — **required** (compose sets it), tells app where the mounted volume is
- `MIMO2CODEX_HOST=0.0.0.0` — Dockerfile default, listens on all interfaces inside container
- `MIMO2CODEX_DEFAULT_PROVIDER=mimo` — default upstream provider

## Data persistence

Inside `<dataDir>` (container `/data`, host `./.mimo2codex/` or custom):

| File | Content | Loss impact |
|---|---|---|
| `sqlite.db` | Token usage stats, request logs, settings | Admin UI history wiped |
| `providers.json` | Generic providers added via admin UI (Qwen/Kimi/etc) | Config gone, re-enter |
| `.env.example` | Auto-copied on startup, reference only | Regenerates |

**Container stop / restart / image upgrade (`docker compose pull && up -d`) all keep data** — it lives in the mounted volume.

### Mount elsewhere

Share data with an npm-installed version (use home dir):

```yaml
volumes:
  - ~/.mimo2codex:/data
```

Notes:
- macOS / Windows: Docker Desktop handles path translation, just works
- Linux: host files end up root-owned (container runs as root), edit/rm needs `sudo`

### Backup

Just tar the mount dir:

```bash
tar czf mimo2codex-backup-$(date +%F).tar.gz .mimo2codex/
```

## Image tags

GitHub Actions workflow (`.github/workflows/docker.yml`) auto-builds & pushes:

| Tag | When updated | Use for |
|---|---|---|
| `:latest` | Every main push + every release | "track main" / quick start |
| `:0.2.15` | When `v0.2.15` git tag is pushed | Production, pinned version |
| `:0.2` | Latest patch within same minor | Production, allow patch upgrades |
| `:main` | Every main push | Test bleeding-edge |
| `:pr-N` | PR build verify | Internal CI only, not pushed |

Release flow:
```bash
npm run release:patch       # 0.2.14 → 0.2.15, auto git tag + push --tags
# Workflow then auto-produces:
#   ghcr.io/7as0nch/mimo2codex:0.2.15
#   ghcr.io/7as0nch/mimo2codex:0.2
#   updates :latest
```

## Common ops commands

```bash
# ─── Start/stop ─────────────────────────────────
docker compose up -d                       # Start detached
docker compose stop                        # Stop only (keep container + volumes)
docker compose down                        # Stop + remove container (data stays in mount)
docker compose down -v                     # ⚠️ Also remove named volumes (bind mounts unaffected)

# ─── Logs ───────────────────────────────────────
docker compose logs -f mimo2codex
docker compose logs -f --tail=200 mimo2codex
docker compose logs --since 10m mimo2codex

# ─── Debug shell ────────────────────────────────
docker compose exec mimo2codex sh
docker compose exec mimo2codex env | grep MIMO
docker compose exec mimo2codex ls /data

# ─── Upgrade ────────────────────────────────────
docker compose pull
docker compose up -d                       # Recreate container, data persists

# ─── Restart (required after .env edits) ────────
docker compose restart
# Or stronger (re-injects env vars cleanly):
docker compose down && docker compose up -d

# ─── Status ─────────────────────────────────────
docker compose ps
docker stats mimo2codex
```

## FAQ

### Q: `docker compose up` says `ghcr.io/7as0nch/mimo2codex:latest not found`

`metadata-action` doesn't emit `:latest` by default. If your fork's workflow predates [66ca82d](https://github.com/7as0nch/mimo2codex/commit/66ca82d), it's missing. Two options:

**A. Temporarily use `:main`:**
```yaml
image: ghcr.io/7as0nch/mimo2codex:main
```

**B. Sync the latest workflow + wait for build:**
```bash
git pull && git push        # triggers new build
# Wait ~5-10 min (multi-arch is slow), then:
docker compose pull && docker compose up -d
```

### Q: Admin UI config lost on container rebuild

Volume not mounted. Check:

```bash
docker compose config | grep -A3 volumes
docker compose exec mimo2codex ls /data    # Should show sqlite.db, providers.json
```

Make sure compose has:
```yaml
environment:
  - MIMO2CODEX_DATA_DIR=/data
volumes:
  - ./.mimo2codex:/data
```

### Q: Port 8788 already in use

Change host-side port in compose `ports:`:
```yaml
ports:
  - "9999:8788"
```
Then browser → http://localhost:9999.

### Q: Slow on Apple Silicon

Shouldn't be — image has arm64. Docker Desktop auto-pulls right arch. Verify:

```bash
docker image inspect ghcr.io/7as0nch/mimo2codex:latest --format '{{.Architecture}}'
# Expect: arm64
```

If amd64, you're going through Rosetta. Force re-pull:
```bash
docker pull --platform linux/arm64 ghcr.io/7as0nch/mimo2codex:latest
```

### Q: Edited .env, `docker compose up -d` didn't pick up changes

`up -d` skips touching containers if image/config unchanged. **Env changes need a restart:**

```bash
docker compose restart
# Or stronger:
docker compose down && docker compose up -d
```

### Q: Build is slow

Multi-arch build (QEMU emulating arm64 for native module compile) is inherently slow. Single-arch local build is much faster:

```bash
docker build -t mimo2codex:local .
```

CI first build ~10 min, subsequent runs hit gha cache so much faster.

### Q: How to check the running container's version

```bash
docker compose exec mimo2codex node -e "console.log(require('./package.json').version)"
```

Or:
```bash
docker image inspect ghcr.io/7as0nch/mimo2codex:latest \
  --format '{{index .Config.Labels "org.opencontainers.image.version"}}'
```

### Q: Mirror to DockerHub / private registry

File an issue with your use case, or fork the workflow and add a second `docker/login-action` + push target.

## Multi-arch / multi-platform support

Workflow auto-builds:
- `linux/amd64` — Intel / AMD Linux servers, Intel Mac, Windows + WSL2 (default)
- `linux/arm64` — Apple Silicon Mac (M1/M2/M3/M4), ARM Linux servers, Raspberry Pi 4/5 (64-bit OS)

`docker pull` picks the right manifest based on host CPU automatically — **same commands across platforms**.

**Not built**: 32-bit x86, 32-bit ARM (armv7, older Raspberry Pi), RISC-V. DIY:
```bash
docker build --platform linux/arm/v7 -t mimo2codex:armv7 .
```
(Note: alpine + node not tested on armv7, may need a different base image.)

Tested platforms:

| Platform | Status | Notes |
|---|---|---|
| macOS Intel | ✅ | Docker Desktop |
| macOS Apple Silicon | ✅ | Docker Desktop / OrbStack, native arm64 |
| Windows 10/11 + WSL2 | ✅ | Docker Desktop |
| Windows + Hyper-V | ⚠️ | Prefer WSL2 backend |
| Ubuntu / Debian / Arch | ✅ | Native docker engine |
| Raspberry Pi 4/5 (64-bit) | ✅ | arm64 image pulls directly |
| Raspberry Pi 3 and older | ❌ | 32-bit ARM, not built |

---

More docs:
- [.env + loader scripts](./env-setup.md)
- [Codex Enable](./codex-enable.md)
- [Generic providers](./generic-providers.md)
- [mimoskill](./mimoskill.md)
