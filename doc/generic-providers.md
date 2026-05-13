# Generic OpenAI-compatible Providers · Detailed Guide

> English · [中文](./generic-providers.zh.md)
>
> Back to: [README English](../README.md) · [README 中文](../README.zh.md)

mimo2codex ships with two built-in providers — MiMo and DeepSeek. The **generic provider mechanism** lets you wire any **OpenAI Chat Completions-compatible** or **native Responses API** upstream to the latest Codex without modifying any code: Qwen, GLM, Kimi, Zhipu, OpenAI itself, local vLLM, Ollama, LM Studio — anything with an OpenAI-shaped HTTP interface.

## What it solves

The latest Codex hard-requires `wire_api = "responses"`, but almost every third-party model only exposes Chat Completions. mimo2codex does the translation; you just register your upstream in a config file.

Two wire-protocol modes are supported:

| `wireApi` | Upstream protocol | When to use |
|---|---|---|
| `chat` (default) | OpenAI Chat Completions | 99% of third-party providers (Qwen / GLM / DeepSeek / Kimi / Ollama / vLLM …) |
| `responses` | OpenAI Responses API | Upstream natively speaks Responses (OpenAI itself, future-leaning providers). Direct passthrough — no protocol translation |

The `responses` passthrough has a side benefit: **when the upstream's protocol evolves, you don't wait for mimo2codex to catch up** — new fields flow straight through without being stripped by an outdated translator.

## 60-second start

**Simplest path** — one provider, three env vars.

```bash
export GENERIC_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export GENERIC_API_KEY=sk-your-qwen-key
export GENERIC_DEFAULT_MODEL=qwen3-max
mimo2codex --model generic
```

The startup banner prints `provider: generic`, `upstream: https://dashscope...`, and `mimo2codex print-config --model generic` outputs the `auth.json + config.toml` snippets — paste into `~/.codex/`.

> ⚠️ env-only mode supports **one** upstream. For multiple, use the `providers.json` route below.

## Config-file route (multi-instance, recommended)

Write a `providers.json` with one entry per upstream. Default path:

| OS | Path |
|---|---|
| macOS / Linux | `~/.mimo2codex/providers.json` |
| Windows | `%USERPROFILE%\.mimo2codex\providers.json` |

Override with `MIMO2CODEX_PROVIDERS_FILE=/some/path/providers.json`.

Full example:

```json
{
  "providers": [
    {
      "id": "qwen",
      "shortcut": "qwen",
      "displayName": "Qwen (DashScope)",
      "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "envKey": "QWEN_API_KEY",
      "defaultModel": "qwen3-max",
      "wireApi": "chat",
      "models": [
        { "id": "qwen3-max", "contextWindow": 262144 },
        { "id": "qwen3-coder-plus", "contextWindow": 1048576 }
      ],
      "features": { "forceParallelToolCalls": true }
    },
    {
      "id": "kimi",
      "shortcut": "kimi",
      "displayName": "Kimi K2",
      "baseUrl": "https://api.moonshot.cn/v1",
      "envKey": "KIMI_API_KEY",
      "defaultModel": "kimi-k2-0905-preview"
    },
    {
      "id": "ollama",
      "shortcut": "ol",
      "displayName": "Ollama (local)",
      "baseUrl": "http://127.0.0.1:11434/v1",
      "envKey": "OLLAMA_API_KEY",
      "defaultModel": "qwen2.5-coder:7b"
    },
    {
      "id": "openai-native",
      "displayName": "OpenAI (native Responses)",
      "baseUrl": "https://api.openai.com/v1",
      "envKey": "OPENAI_API_KEY",
      "defaultModel": "gpt-5",
      "wireApi": "responses"
    }
  ]
}
```

Then start:

```bash
export QWEN_API_KEY=sk-...
export KIMI_API_KEY=sk-...
mimo2codex --model qwen        # default provider = qwen
```

`--model` accepts either `id` or `shortcut`.

## Field reference

| Field | Required | Default | Notes |
|---|---|---|---|
| `id` | ✓ | — | Unique identifier. Cannot be `mimo` / `deepseek` (reserved). Alphanumeric + `-` / `_` only |
| `displayName` | — | id | Shown in UI and print-config output |
| `shortcut` | — | id | Used with `--model <shortcut>` |
| `baseUrl` | ✓ | — | Upstream base URL (**do not** include `/chat/completions` — mimo2codex appends paths) |
| `envKey` | ✓ | — | Env var to read the API key from (e.g. `QWEN_API_KEY`) |
| `defaultModel` | ✓ | — | Fallback when client didn't specify or sent an unknown id |
| `wireApi` | — | `"chat"` | `"chat"` or `"responses"`, see above |
| `models` | — | `[]` | Declared model catalog for this provider (see next section) |
| `features.forceParallelToolCalls` | — | `false` | Force `parallel_tool_calls: true` (recommended for agentic-coding upstreams) |
| `features.webSearch` | — | `false` | Forward Codex's `web_search` tool (only meaningful if upstream has a builtin web_search) |
| `docsUrl` | — | — | Link shown in the "missing API key" error |

Each `models[]` entry:

| Field | Required | Notes |
|---|---|---|
| `id` | ✓ | The upstream's real model id |
| `aliases` | — | Client-side names that route to this model too |
| `displayName` | — | UI label |
| `contextWindow` | — | Emitted as `model_context_window` in print-config |
| `maxOutputTokens` | — | Emitted as `model_max_output_tokens` in print-config |
| `supportsImages` / `supportsReasoning` / `supportsWebSearch` | — | Metadata, surfaced in admin UI |

## Model identification strategy

`models[]` is **optional**. Two modes:

**1. With declared `models[]` (strict mode)**

Only ids in `models[]` (or their aliases) are considered "owned" by this provider. Requests are routed to the provider whose catalog exactly matches the client-supplied model id. If the client sends an unlisted id:
- And this provider is the **default** → rewrite to `defaultModel`, log a `rewriteNotice`
- Otherwise → falls through to the default provider's fallback

Good for: known model lineup, wanting print-config to emit `model_context_window`, clean admin UI catalog.

**2. No `models[]` (open-catalog passthrough)**

Whatever model id the client sends, forward verbatim. **No rewriting, no errors.**

Good for: upstreams with fast-changing catalogs (Ollama, OpenRouter), when you just want a pipe.

> Open-catalog generics are **not** auto-matched by model id — otherwise they'd "swallow" every mimo / deepseek id. To route to them, set them as the default provider with `--model <id>`.

### Routing priority

The same model id may be declared by multiple providers (typical case: you spun up a generic provider for your internal MiMo proxy and listed `mimo-v2.5-pro` in its `models[]`). `selectProvider` picks in this order:

1. **User-declared generics with a key** (non-empty `models[]`), in registration order
2. **Built-in providers with a key** (mimo / deepseek)
3. **Default-provider fallback** — model id is rewritten to the default provider's `defaultModel`, with a `rewriteNotice` warning logged

Step 1 prioritizes user-declared generics over built-ins so that the "internal proxy" case works: if you only set `COMPANY_MIMO_API_KEY` (no `MIMO_API_KEY`), a client request for `mimo-v2.5-pro` still routes to your generic (instead of falling through to the default provider because the built-in mimo has no key). If multiple keyed generics declare the same model id, the first one registered wins.

## wireApi explained

**`chat`**: mimo2codex translates Codex's Responses request to Chat Completions, sends to `${baseUrl}/chat/completions`, translates the response back.

```
Codex ──[Responses]──> mimo2codex ──[Chat]──> upstream ──[Chat]──> mimo2codex ──[Responses]──> Codex
```

**`responses`**: mimo2codex forwards Codex's request **as-is** to `${baseUrl}/responses`. No translation either direction.

```
Codex ──[Responses]──> mimo2codex ──[Responses raw]──> upstream ──[Responses raw]──> mimo2codex ──> Codex
```

Use `responses` when:

- Upstream is OpenAI itself
- Upstream claims "full OpenAI Responses API parity"
- Upstream supports fields chat completions can't carry (`reasoning.effort`, `text.verbosity`, new tool types) and you don't want them dropped

Notes:

- Streaming passthrough is **byte-level pipe** — upstream SSE frames forward unmodified, Codex's parser handles framing. Lower overhead but mimo2codex makes zero modifications mid-stream
- Admin UI's per-model token stats can only extract top-level `usage` fields on the `responses` path; nested usage breakdowns aren't parsed

## Real-world examples

### Alibaba Qwen (DashScope OpenAI-compatible mode)

```json
{
  "id": "qwen",
  "displayName": "Qwen (DashScope)",
  "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "envKey": "QWEN_API_KEY",
  "defaultModel": "qwen3-max",
  "models": [
    { "id": "qwen3-max", "contextWindow": 262144 },
    { "id": "qwen3-coder-plus", "contextWindow": 1048576, "supportsReasoning": true }
  ],
  "features": { "forceParallelToolCalls": true }
}
```

### Zhipu GLM

```json
{
  "id": "glm",
  "displayName": "Zhipu GLM-4.6",
  "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
  "envKey": "ZHIPU_API_KEY",
  "defaultModel": "glm-4.6",
  "models": [
    { "id": "glm-4.6", "contextWindow": 200000 }
  ]
}
```

### Moonshot Kimi

```json
{
  "id": "kimi",
  "displayName": "Kimi K2",
  "baseUrl": "https://api.moonshot.cn/v1",
  "envKey": "KIMI_API_KEY",
  "defaultModel": "kimi-k2-0905-preview",
  "models": [
    { "id": "kimi-k2-0905-preview", "contextWindow": 256000 }
  ]
}
```

### Local Ollama / LM Studio (open-catalog)

```json
{
  "id": "ollama",
  "shortcut": "ol",
  "displayName": "Ollama (local)",
  "baseUrl": "http://127.0.0.1:11434/v1",
  "envKey": "OLLAMA_API_KEY",
  "defaultModel": "qwen2.5-coder:7b"
}
```

Ollama doesn't validate API keys, but `envKey` is schema-required — just set anything (`OLLAMA_API_KEY=ignored`).

### OpenAI native Responses (passthrough)

```json
{
  "id": "openai-native",
  "displayName": "OpenAI (native Responses)",
  "baseUrl": "https://api.openai.com/v1",
  "envKey": "OPENAI_API_KEY",
  "defaultModel": "gpt-5",
  "wireApi": "responses"
}
```

## Default provider & routing rules (important)

After adding generic providers, routing priority:

1. Client `model` matches some provider's `models[]` (incl. aliases) **and that provider has a key** → route there
2. Catalog matched but the provider has no key → falls through to the default provider; model is rewritten to its `defaultModel`, logged as `client_model_rewritten`
3. Open-catalog provider (no `models[]`) → skipped during auto-routing (so it doesn't swallow unknown ids); reachable only by setting it as the default with `--model <id>`
4. Nothing matches → falls back to the default provider, rewriting model to its `defaultModel`, logged as `client_model_rewritten`

Default provider selection:

- `--model <id-or-shortcut>` takes priority
- Otherwise `MIMO2CODEX_DEFAULT_PROVIDER` env var
- Otherwise falls back to `"mimo"`

### What "no key" actually does

A common foot-gun: you configure qwen / kimi / glm in `providers.json` but only set `MIMO_API_KEY` at startup. Then:

```bash
# Client sends qwen3-max
# → byClientModel matches the qwen catalog
# → qwen has no key → fall through
# → default provider mimo → model rewritten to mimo-v2.5-pro
# → the response actually comes from MiMo on mimo-v2.5-pro
```

**No mid-conversation warning.** The admin "model mappings" table shows the `qwen3-max → mimo-v2.5-pro` rewrite, and chat logs carry the `client_model_rewritten` error code. But if you don't open the admin UI, it's easy to believe you're using Qwen when you're actually using MiMo.

To avoid this silent fallback, today's options:

1. **Make sure all keys are set up-front** — the admin Dashboard's Provider cards explicitly show "key detected / not detected" per provider; set all the keys you intend to use
2. **Single-provider startup** — to specifically use qwen, run `--model qwen` without the mimo key. Then if qwen has no key, startup errors out instead of silently downgrading

> Existing mimo / deepseek users **are not affected**: without `providers.json`, the default provider stays `mimo` and all behavior is byte-identical.

## Manage in admin webui (no manual JSON editing)

Open `http://127.0.0.1:8788/admin/`:

- **Generic Providers page** (sidebar, [`/admin/providers`](http://127.0.0.1:8788/admin/providers)): visual CRUD for generic providers
  - Table lists every entry in `providers.json`; each row has Edit / Delete
  - "+ Add Provider" opens a form with placeholders, inline validation (id can't collide with builtins, no spaces, baseUrl required, etc.)
  - Models list is dynamically editable — each model takes contextWindow / maxOutputTokens / vision / reasoning / web search metadata
  - "Edit raw JSON" escape hatch — edit the full `providers.json` text, only writes when JSON validates
  - On save, writes `~/.mimo2codex/providers.json` and shows a **"Restart mimo2codex to apply"** banner — there is no hot reload; the registry initializes once at startup
- **Setup guide** ([`/admin/setup`](http://127.0.0.1:8788/admin/setup)): provider dropdown, three tabs auto-render `auth.json + config.toml` for direct / env-key / cc-switch flows. Each code block has a Copy button
- **Dashboard**: all registered providers (including generics) shown in Provider cards with key-presence status
- **Logs**: filter by provider (generic ids appear in the dropdown)

> Note: the UI **does not manage API keys** — keys are not stored in the database or any config file; they must be injected via environment variables (e.g. `QWEN_API_KEY=sk-...`). This avoids credentials landing on disk and getting backed up or leaked. UI handles schema config, env handles secrets.

## CLI subcommands

```bash
mimo2codex print-config --model qwen            # qwen's auth.json + config.toml snippets
mimo2codex print-config --model qwen --env-key  # env-key variant (Codex CLI only)
mimo2codex print-cc-switch --model qwen         # cc-switch custom-provider snippets
```

`model_provider` naming convention in the toml:

- mimo → `[model_providers.mimo]` (legacy preserved)
- deepseek → `[model_providers.mimo2codex]` (legacy preserved)
- other generics → `[model_providers.mimo2codex-<id>]` (prefixed to avoid colliding with the user's existing toml sections)

## Troubleshooting

<details>
<summary><b><code>provider id "xxx" must be alphanumeric + dash/underscore</code></b></summary>

`id` only allows letters, digits, `-`, `_`. No spaces, dots, slashes. Use `kimi`, `my-qwen`, `local_dev` etc.

</details>

<details>
<summary><b><code>generic provider id "mimo" conflicts with a built-in provider</code></b></summary>

`mimo` and `deepseek` are reserved. Rename to e.g. `mimo-custom`.

</details>

<details>
<summary><b><code>missing API key for ...</code> but I set the env</b></summary>

Check:
1. The env var name matches `envKey` in the spec exactly (case-sensitive)
2. Right shell — PowerShell `$env:X` is invisible to cmd, and vice versa
3. You actually set the key for the provider that `MIMO2CODEX_DEFAULT_PROVIDER` (or `--model`) points at — the default provider must have a key, or startup fails

</details>

<details>
<summary><b>Startup banner doesn't show my generic provider</b></summary>

- Banner only lists providers with **API keys set**. Check `envKey`
- Verify the providers.json path: `~/.mimo2codex/` or explicit `MIMO2CODEX_PROVIDERS_FILE`
- JSON syntax errors fail startup loudly — they don't silently skip

</details>

<details>
<summary><b>Routing wrong — sent qwen3-max but got mimo</b></summary>

If your generic doesn't declare `models[]`, it **won't** be auto-matched by `byClientModel`. Two fixes:
- Add `models: [{ "id": "qwen3-max" }]` to the spec (recommended)
- Or make the generic the default provider: `mimo2codex --model qwen`

</details>

<details>
<summary><b>Upstream 400, error says reasoning / thinking field not recognized</b></summary>

Non-MiMo upstreams usually don't understand MiMo's `thinking` field. Generic providers already strip these by default. If you still see this, run with `--verbose` to inspect the actual forwarded body — likely something Codex itself emitted that the upstream doesn't accept (a Codex-side compat issue, unrelated to the proxy).

</details>

<details>
<summary><b>wireApi: "responses" upstream returns 404 / 405</b></summary>

The upstream probably doesn't implement `/v1/responses`. Most third parties only have `/v1/chat/completions` today — set `wireApi` back to `"chat"` (or omit it; default is chat).

</details>

<details>
<summary><b>Same id appears twice in providers.json</b></summary>

Startup fails with an error. Each id must be unique.

</details>

## Design notes

- **Why is the default provider still mimo?** Backwards compatibility. Existing mimo / deepseek users see zero behavior change after upgrading
- **Why don't open-catalog generics participate in `byClientModel`?** They'd swallow every unknown id, including mimo / deepseek's legit ids. They need an explicit `--model <id>` to be used as a catch-all
- **Why the `mimo2codex-` prefix on toml provider keys?** Users' `~/.codex/config.toml` may already have `[model_providers.qwen]` (pointing directly at Qwen). The prefix avoids overwriting it
- **Why no admin-UI form for editing generic providers?** Ship "it works" first. UI forms can be added later without changing the architecture (providers.json was already a config file)

## Source files

- [src/providers/generic.ts](../src/providers/generic.ts) — factory function
- [src/providers/genericLoader.ts](../src/providers/genericLoader.ts) — config loading + env fallback
- [src/providers/registry.ts](../src/providers/registry.ts) — runtime registration + routing guards
- [src/upstream/openaiCompatClient.ts](../src/upstream/openaiCompatClient.ts) — chat / responses upstream clients
- [src/server.ts](../src/server.ts) — wireApi branch in `handleResponses`
- [test/providers.generic.test.ts](../test/providers.generic.test.ts) — 18 test cases
