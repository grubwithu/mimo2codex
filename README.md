# mimo2codex

> English · [中文文档](./README.zh.md)

Local proxy that lets the **latest OpenAI Codex CLI** and **Codex desktop app** talk to **Xiaomi MiMo V2.5 Pro** by translating Codex's Responses API ↔ MiMo's Chat Completions API on the fly. Works standalone, or as a custom Codex provider in [cc-switch](https://github.com/farion1231/cc-switch) — switch between OpenAI / MiMo / Azure / OpenRouter etc. with one click.

> Why? MiMo's official [Codex integration doc](https://platform.xiaomimimo.com/docs/zh-CN/integration/codex) tells you the only supported wire is `wire_api = "chat"`, but newer Codex versions hard-error with `wire_api = chat is no longer supported`. The official workaround is to downgrade Codex (losing the new pet, tool, and desktop features). This proxy is a better workaround: leave Codex on the latest version, run mimo2codex locally, and Codex will think it's talking to a native Responses-API backend.
>
> Conceptually similar to [openrouter](https://openrouter.ai), [claude-code-router](https://github.com/musistudio/claude-code-router) and [y-router](https://github.com/luohy15/y-router) — pure stateless protocol translation, no scheduling, no storage.

## What works

- ✅ Codex CLI 0.x with `wire_api = "responses"`
- ✅ Codex desktop app (macOS / Windows) — same `~/.codex/config.toml`
- ✅ Pet companion (status driven by SSE event lifecycle, no special handling needed)
- ✅ Tool calling — function tools, including parallel calls
- ✅ Multi-turn conversations with mixed tool calls + reasoning
- ✅ Streaming SSE with full Responses event schema (`response.created`, `output_item.added`, `output_text.delta`, `function_call_arguments.delta`, `reasoning_summary_text.delta`, `completed`, …)
- ✅ Thinking mode passthrough — MiMo's `reasoning_content` is shown in Codex's reasoning panel and re-injected on follow-up turns to keep multi-turn tool quality high (per MiMo's docs)
- ✅ 1M context — pass `mimo-v2.5-pro[1m]` as the model
- ✅ **cc-switch integration** — `mimo2codex print-cc-switch` outputs the auth.json + config.toml snippets you paste into cc-switch's "Add Provider → Codex → Custom" dialog

## Install

```bash
npm install -g mimo2codex
```

Requires Node.js 18+.

## Use

### 1. Get a MiMo API key

Sign up at [platform.xiaomimimo.com](https://platform.xiaomimimo.com), create a key in **Console → API Keys**. Either pay-as-you-go (`sk-xxx`) or token-plan (`tp-xxx`) works.

### 2. Start the proxy

```bash
export MIMO_API_KEY=sk-xxxxxxxxxxxxxxxx
mimo2codex
```

You should see:

```
mimo2codex v0.1.0 listening on http://127.0.0.1:8788
upstream:    https://api.xiaomimimo.com/v1
api key:     sk-x…xxxx
reasoning:   passthrough

# ~/.codex/config.toml — drop these lines in (or merge with existing config)
model = "mimo-v2.5-pro"
model_provider = "mimo"

[model_providers.mimo]
name = "MiMo (via mimo2codex)"
base_url = "http://127.0.0.1:8788/v1"
wire_api = "responses"
env_key = "MIMO2CODEX_KEY"
request_max_retries = 1
```

### 3. Configure Codex

Copy that snippet into `~/.codex/config.toml` (Windows: `%USERPROFILE%\.codex\config.toml`), and export any non-empty value as `MIMO2CODEX_KEY` — Codex requires an env_key to be set, but the proxy doesn't validate it (your real MiMo key is what mimo2codex uses upstream):

```bash
export MIMO2CODEX_KEY=anything
```

On Windows (CMD):

```cmd
setx MIMO2CODEX_KEY anything
```

### 4. Run Codex

```bash
codex
```

Then ask away — including tool-using prompts:

```
> 帮我写一个 Python 计算斐波那契的函数并保存到 fib.py
```

The pet, tool calls, reasoning summary, and multi-turn flow all work. If you want to hide reasoning from the terminal, pass `--no-reasoning` when starting the proxy (it still re-injects reasoning to MiMo on follow-up turns, just not to Codex).

## Use with cc-switch

[cc-switch](https://github.com/farion1231/cc-switch) is a desktop app that manages multiple Codex / Claude Code / OpenCode providers and lets you switch between them in one click. Its built-in Codex preset list does **not** include MiMo (because MiMo doesn't speak Responses API) — but you can plug mimo2codex in as a custom provider:

1. Keep `mimo2codex` running (with `MIMO_API_KEY` set).
2. Print the cc-switch snippets:

   ```bash
   mimo2codex print-cc-switch
   ```

   It outputs two blocks: an `auth.json` block and a `config.toml` block.

3. In cc-switch: switch to the **Codex** tab → click **+** → choose **App-specific Provider** → preset = **Custom**.
4. Paste the `auth.json` block into the auth.json textarea, paste the `config.toml` block into the config.toml textarea, set the name to e.g. `MiMo (via mimo2codex)`, click **Add**.
5. Click the new entry to make it active. cc-switch writes `~/.codex/auth.json` + `~/.codex/config.toml` for you.
6. Run `codex`. Switch back to OpenAI Official / Azure / OpenRouter / etc. anytime by clicking another entry in cc-switch — `mimo2codex` keeps running and only sees traffic when its provider is selected.

cc-switch's "Fetch Models" button on the provider form calls `/v1/models`, which mimo2codex implements — so the model dropdown will list `mimo-v2.5-pro`, `mimo-v2.5-pro[1m]`, and `mimo-v2-flash` automatically.

## CLI flags

| Flag | Env | Default | Notes |
|---|---|---|---|
| `--port`, `-p` | `MIMO2CODEX_PORT` | `8788` | listen port |
| `--host` | `MIMO2CODEX_HOST` | `127.0.0.1` | bind host (keep on loopback) |
| `--base-url` | `MIMO_BASE_URL` | `https://api.xiaomimimo.com/v1` | switch to `https://token-plan-cn.xiaomimimo.com/v1` for the Token Plan |
| `--api-key` | `MIMO_API_KEY` | _required_ | upstream MiMo key |
| `--no-reasoning` | `MIMO2CODEX_NO_REASONING=1` | off | hide reasoning from Codex (still preserved between turns) |
| `--verbose`, `-v` | `MIMO2CODEX_VERBOSE=1` | off | log every translated request |

Subcommands:

```bash
mimo2codex print-config             # write the ~/.codex/config.toml snippet to stdout
mimo2codex print-cc-switch          # write the cc-switch auth.json + config.toml snippets
mimo2codex --port 9000 print-config # adjust port in the snippet
```

## How it works

```
┌─────────────┐   POST /v1/responses    ┌──────────────┐   POST /v1/chat/completions   ┌─────────────┐
│ Codex CLI / │ (wire_api="responses")  │  mimo2codex  │   (chat completions, SSE)     │ Xiaomimimo  │
│ Codex App   │ ──────────────────────► │  127.0.0.1   │ ────────────────────────────► │ MiMo V2.5   │
└─────────────┘ ◄────────────────────── │  :8788       │ ◄──────────────────────────── └─────────────┘
                  Responses SSE         └──────────────┘   Chat SSE
```

For each request:

1. Codex POSTs a Responses payload (`input` array of message/function_call/function_call_output/reasoning items).
2. mimo2codex translates `input` → Chat `messages`, folding consecutive `reasoning` + `function_call` items into a single assistant turn with `reasoning_content` + `tool_calls`.
3. mimo2codex POSTs to MiMo's `/v1/chat/completions` (Bearer auth).
4. Streams back Chat SSE chunks; the state machine in `streamToSse.ts` rewrites them as Responses SSE events.

That's it. The proxy is fully stateless — no `previous_response_id` storage, no caching, no key validation against incoming requests. Run as many instances as you want.

## FAQ

**Does this support Codex's pet feature?**
Yes — pets are a desktop UI overlay driven by Codex's internal status (working / waiting-input / done / error). That status is computed from the Responses SSE event lifecycle (`response.created`, `response.in_progress`, `response.output_item.added`, `response.completed`, `response.failed`). The proxy emits exactly those events, so pets behave normally.

**Does this support tool calling?**
Yes. Codex's local shell, file edit, web fetch, and any custom tools all flow through unchanged — the proxy translates `function_call` Responses items ↔ `tool_calls` Chat fields, including arguments-delta streaming for parallel calls.

**What about images / audio?**
The proxy passes `input_image` parts through as `image_url` parts. Note: MiMo's chat API only accepts images on the `mimo-v2-omni` model; on `mimo-v2.5-pro` they will be silently dropped by upstream. `input_file` is dropped with a warning (MiMo chat API doesn't support it).

**Token plan endpoint?**
Pass `--base-url https://token-plan-cn.xiaomimimo.com/v1` and use your `tp-xxx` key.

**Is reasoning ever lost?**
No. Even with `--no-reasoning` the proxy still receives and stores `reasoning_content` so it can re-inject it on the next turn (MiMo recommends this for multi-turn tool quality). The flag only controls whether reasoning is surfaced to the Codex terminal.

**Why not just patch Codex to accept the chat wire?**
That works for the CLI today (downgrade to 0.80.0), but you lose pets, the new desktop release, and any future improvements. A protocol shim is a smaller, longer-lived fix.

## Development

```bash
git clone … && cd mimo2codex
npm install
npm run dev          # runs src/cli.ts via tsx
npm test             # vitest
npm run build        # produces dist/
```

## License

MIT
