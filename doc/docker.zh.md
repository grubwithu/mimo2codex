# Docker 部署

mimo2codex 提供官方 docker 镜像，**多架构（amd64 + arm64）**、**支持 macOS / Windows / Linux**，发布在 GitHub Container Registry：

```
ghcr.io/7as0nch/mimo2codex
```

镜像 ~70MB（alpine 基础 + 多阶段构建裁剪），不含 npm / build 工具链。

## 目录

- [快速开始（docker compose）](#快速开始docker-compose)
- [纯 docker run 单行命令](#纯-docker-run-单行命令)
- [本地构建](#本地构建)
- [环境变量与 key 注入](#环境变量与-key-注入)
- [数据持久化](#数据持久化)
- [镜像 tag 说明](#镜像-tag-说明)
- [常用运维命令](#常用运维命令)
- [常见问题](#常见问题)
- [多架构 / 多平台支持](#多架构--多平台支持)

## 快速开始（docker compose）

仓库根目录已自带 `docker-compose.yml`。三步起：

```bash
# 1. 准备 .env（已在 .gitignore，不会被提交）
cp .env.example .env
# 编辑 .env，至少填一个 provider key：
#   MIMO_API_KEY=sk-xxxxxxxxxxxx
#   或 DEEPSEEK_API_KEY=sk-xxxxxxxxxxxx

# 2. 启动
docker compose up -d

# 3. 打开 admin UI
# Mac/Linux:
open http://localhost:8788
# Windows:
start http://localhost:8788
```

完成。后续配 Codex 用 `http://localhost:8788/v1` 当 base URL 即可。

## 纯 docker run 单行命令

不想用 compose 的话：

```bash
# 简版（key 直接传，无持久化）
docker run -d --name mimo2codex \
  -p 8788:8788 \
  -e MIMO_API_KEY=sk-xxxxxxxxxxxx \
  ghcr.io/7as0nch/mimo2codex:latest

# 带数据持久化 + .env 文件
docker run -d --name mimo2codex \
  -p 8788:8788 \
  --env-file ./.env \
  -e MIMO2CODEX_DATA_DIR=/data \
  -v ~/.mimo2codex:/data \
  ghcr.io/7as0nch/mimo2codex:latest
```

## 本地构建

不拉镜像，自己 build：

```bash
# 直接 build 当前架构的镜像
docker build -t mimo2codex:local .

# 或者改 docker-compose.yml 用 build:
#   image: ghcr.io/7as0nch/mimo2codex:latest   ← 注释掉
#   build: .                                    ← 启用
docker compose build
docker compose up -d
```

构建特点：
- 阶段 1：`node:20-alpine` 装 `python3 + make + g++` 编译 `better-sqlite3` 原生模块
- 阶段 2：`alpine:3.19` 只装 `nodejs + libstdc++`，不含 npm
- 自动裁剪：删 devDeps、`.md`、`.ts`、`.map`、test 目录
- 最终 ~70MB

本地单架构 build 通常 2~3 分钟（首次）。多架构（amd64 + arm64）build 走 GitHub Actions，~10 分钟。

## 环境变量与 key 注入

### 加载链

```
宿主机 .env
    │
    │  docker compose 启动时，env_file 把 KEY=VALUE 注入容器 process.env
    ▼
容器进程启动
    │
    │  mimo2codex/cli.ts 再读 <dataDir>/.env（默认 /data/.env）
    ▼
最终 process.env：
    /data/.env 存在 → 覆盖 compose 注入的同名变量
    /data/.env 不存在 → 用 compose 注入的值
```

**实践建议**：**只**在宿主机仓库根目录维护一份 `.env`，**不要**往 `.mimo2codex/.env`（挂载卷里）再放一份，避免两份覆盖关系混乱。

### 三种注入方式对比

| 方式 | 用法 | 适用场景 | 安全性 |
|---|---|---|---|
| `env_file: - .env`（compose 默认） | compose 文件指向 `.env` 文件 | 本地部署 ✅ | `.env` 在 `.gitignore` |
| `environment: - KEY=value`（硬编码） | compose 文件里写死值 | ❌ 别用 | key 会进 git 历史 |
| `environment: - KEY=${KEY}`（从 shell 取） | 从执行 `docker compose` 的 shell 读 | CI / CD | OK |
| `-e KEY=value`（docker run 临时） | 命令行传 | 调试 | OK，但易泄到 shell history |

### 必填 / 可选 env

最少填一个 provider key 即可启动。完整说明见 [.env.example](../.env.example) 或 [doc/env-setup.zh.md](./env-setup.zh.md)。常用：

- `MIMO_API_KEY` — 小米米莫（`sk-*` / `tp-*` 自动识别 host）
- `DEEPSEEK_API_KEY` — DeepSeek
- `GENERIC_API_KEY` + `GENERIC_BASE_URL` — 任意 OpenAI 兼容上游（Qwen / Kimi / GLM 等）
- `MIMO2CODEX_DATA_DIR=/data` — **必须**（compose 已带），告诉 app 数据写到挂载卷里
- `MIMO2CODEX_HOST=0.0.0.0` — Dockerfile 默认已设，容器内监听全网卡
- `MIMO2CODEX_DEFAULT_PROVIDER=mimo` — 默认上游 provider

## 数据持久化

`<dataDir>`（容器内 `/data`，宿主机 `./.mimo2codex/` 或自定义）下维护：

| 文件 | 内容 | 丢了影响 |
|---|---|---|
| `sqlite.db` | token 用量统计、请求日志、设置 | admin UI 数据归零 |
| `providers.json` | admin UI 加的 generic provider（Qwen / Kimi 等） | 配置丢失，要重新填 |
| `.env.example` | 启动时自动拷贝，参考用 | 可重生 |

**容器 stop / restart / 镜像升级（`docker compose pull && up -d`）都不丢数据**——因为数据在挂载卷里。

### 改挂别处

想和 npm 安装版共用同一份数据（家目录的 `~/.mimo2codex/`）：

```yaml
volumes:
  - ~/.mimo2codex:/data
```

注意：
- macOS / Windows：Docker Desktop 自动处理路径转换，OK
- Linux：宿主机文件 owner 会变成 root（容器跑 root），编辑/删除要 `sudo`

### 备份

直接打包挂载目录：

```bash
tar czf mimo2codex-backup-$(date +%F).tar.gz .mimo2codex/
```

恢复就反过来解压。

## 镜像 tag 说明

GitHub Actions workflow（`.github/workflows/docker.yml`）自动构建并推送以下 tag：

| Tag | 何时更新 | 适用场景 |
|---|---|---|
| `:latest` | 每次 push main + 每次发版 | "跟着主分支走" / 懒人 |
| `:0.2.15` | 打 `v0.2.15` git tag 时 | 生产环境，锁版本 |
| `:0.2` | 同 minor 版本最新 patch | 生产环境，允许 patch 升级 |
| `:main` | 每次 push 到 main | 测试新特性（开发版） |
| `:pr-N` | PR build 验证 | 不推送，仅 CI 内部 |

发版流程：
```bash
# 1. main 改完，bump 版本号
npm run release:patch       # 0.2.14 → 0.2.15，自动 git tag + push --tags

# 2. workflow 自动触发：
#    - 产出 ghcr.io/7as0nch/mimo2codex:0.2.15
#    - 产出 ghcr.io/7as0nch/mimo2codex:0.2
#    - 更新 ghcr.io/7as0nch/mimo2codex:latest
```

## 常用运维命令

```bash
# ─── 启停 ─────────────────────────────────────
docker compose up -d                       # 后台启动
docker compose stop                        # 只停容器（保留容器和卷）
docker compose down                        # 停 + 删容器（数据在挂载卷里，不丢）
docker compose down -v                     # ⚠️ 同时删 named volume（bind mount 不受影响）

# ─── 日志 ─────────────────────────────────────
docker compose logs -f mimo2codex          # 实时追
docker compose logs -f --tail=200 mimo2codex
docker compose logs --since 10m mimo2codex # 最近 10 分钟

# ─── 进容器调试 ──────────────────────────────
docker compose exec mimo2codex sh
docker compose exec mimo2codex env | grep MIMO    # 看注入的环境变量
docker compose exec mimo2codex ls /data           # 看持久化数据

# ─── 升级 ─────────────────────────────────────
docker compose pull                        # 拉最新镜像
docker compose up -d                       # 重建容器，数据保留

# ─── 重启（改 .env 必须）────────────────────
docker compose restart
# 或更彻底（确保环境变量重新注入）：
docker compose down && docker compose up -d

# ─── 状态 ─────────────────────────────────────
docker compose ps                          # 容器状态
docker stats mimo2codex                    # CPU / 内存实时
```

## 常见问题

### Q: `docker compose up` 报 `ghcr.io/7as0nch/mimo2codex:latest not found`

`metadata-action` 默认不生成 `:latest`。如果你 fork 的 workflow 文件早于 [66ca82d](https://github.com/7as0nch/mimo2codex/commit/66ca82d)，会缺这个 tag。两个选择：

**A. 临时改 compose 用 `:main`：**
```yaml
image: ghcr.io/7as0nch/mimo2codex:main
```

**B. 同步最新 workflow，等 build 完：**
```bash
git pull && git push        # 触发新 build
# 等 ~5-10 分钟（多架构慢），然后：
docker compose pull && docker compose up -d
```

### Q: 改了 admin UI 配置，容器重建就丢

挂载卷没生效。检查：

```bash
docker compose config | grep -A3 volumes        # 应看到挂载配置
docker compose exec mimo2codex ls /data          # 应看到 sqlite.db、providers.json
```

确认 `docker-compose.yml` 有：
```yaml
environment:
  - MIMO2CODEX_DATA_DIR=/data
volumes:
  - ./.mimo2codex:/data
```

### Q: 端口 8788 被占用

改 compose `ports:` 左侧（宿主机端口）：
```yaml
ports:
  - "9999:8788"     # 宿主 9999 → 容器 8788
```
重启后浏览器开 http://localhost:9999。

### Q: Apple Silicon Mac 上跑得慢

不应该——镜像有 arm64 版，Docker Desktop 自动拉对应架构。确认：

```bash
docker image inspect ghcr.io/7as0nch/mimo2codex:latest --format '{{.Architecture}}'
# 应输出: arm64
```

如果输出 amd64，是被走了 Rosetta 翻译，强制重拉：
```bash
docker pull --platform linux/arm64 ghcr.io/7as0nch/mimo2codex:latest
```

### Q: 改了 .env，重新 `docker compose up -d` 没生效

`up -d` 看 image / config 没变就不动容器。**改环境变量必须重启**：

```bash
docker compose restart
# 或更彻底：
docker compose down && docker compose up -d
```

### Q: build 很慢

多架构 build（QEMU 模拟 arm64 编译 native module）本来就慢。本地 build 单架构会快很多：

```bash
docker build -t mimo2codex:local .         # 只 build 当前 CPU 架构
```

GitHub Actions 首次 ~10 分钟，后续有 gha cache 命中会快很多。

### Q: 怎么看容器实际在跑的版本

```bash
docker compose exec mimo2codex node -e "console.log(require('./package.json').version)"
```

或：

```bash
docker image inspect ghcr.io/7as0nch/mimo2codex:latest \
  --format '{{index .Config.Labels "org.opencontainers.image.version"}}'
```

### Q: 想把 ghcr 镜像也镜像到 DockerHub / 私有 registry

发个 issue 说一下场景，或者自己 fork workflow，加一个 `docker/login-action` + 第二个 `push:` 目标。

## 多架构 / 多平台支持

workflow 自动构建：
- `linux/amd64` — Intel / AMD Linux 服务器、Intel Mac、Windows + WSL2（默认）
- `linux/arm64` — Apple Silicon Mac (M1/M2/M3/M4)、ARM Linux 服务器、Raspberry Pi 4/5 (64-bit OS)

`docker pull` 时客户端自动根据宿主 CPU 选对应 manifest，**用户命令完全一致**。

**不支持开箱用**：32-bit x86、32-bit ARM (armv7，老树莓派)、RISC-V 等。需要的话自己 build：
```bash
docker build --platform linux/arm/v7 -t mimo2codex:armv7 .
```
（注意：alpine + node 在 armv7 上未测试过，可能要换基础镜像）

各平台测试矩阵：

| 平台 | 状态 | 备注 |
|---|---|---|
| macOS Intel | ✅ | Docker Desktop |
| macOS Apple Silicon | ✅ | Docker Desktop / OrbStack，原生 arm64 |
| Windows 10/11 + WSL2 | ✅ | Docker Desktop |
| Windows + Hyper-V | ⚠️ | 建议切 WSL2 后端 |
| Ubuntu / Debian / Arch | ✅ | 原生 docker engine |
| Raspberry Pi 4/5 (64-bit) | ✅ | arm64 镜像直接拉 |
| Raspberry Pi 3 及更老 | ❌ | 32-bit ARM，没 build |

---

更多文档：
- [.env 与加载脚本](./env-setup.zh.md)
- [Codex 启用](./codex-enable.zh.md)
- [通用 provider](./generic-providers.zh.md)
- [mimoskill](./mimoskill.zh.md)
