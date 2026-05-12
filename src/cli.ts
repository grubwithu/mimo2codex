#!/usr/bin/env node
import { createRequire } from "node:module";
import { buildConfig, parseArgv, type Config } from "./config.js";
import { startServer } from "./server.js";
import { setVerbose, log, redactKey } from "./util/log.js";
import { closeDb, openDb } from "./db/index.js";
import { initRegistry } from "./providers/registry.js";
import { loadGenericProviders, GenericLoaderError } from "./providers/genericLoader.js";
import { resolveDataDir } from "./db/dataDir.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Discover the data-dir path WITHOUT creating it. Used for print-config /
// print-cc-switch subcommands so a one-shot snippet print doesn't have
// filesystem side effects.
function nonCreatingDataDirCandidate(
  cliOverride: string | undefined,
  env: NodeJS.ProcessEnv
): string {
  const dir = cliOverride ?? env.MIMO2CODEX_DATA_DIR ?? join(homedir(), ".mimo2codex");
  return existsSync(dir) ? dir : "";
}
import {
  ccSwitchSnippet,
  configSnippet,
  configSnippetEnvKey,
  resolveSnippetTarget,
  type SnippetTarget,
} from "./setup/snippets.js";

const VERSION = (createRequire(import.meta.url)("../package.json") as { version: string }).version;

const HELP = `mimo2codex v${VERSION} — local proxy: Codex Responses API → Chat Completions (MiMo / DeepSeek)

USAGE
  mimo2codex [options]
  mimo2codex print-config
  mimo2codex print-cc-switch

OPTIONS
  -p, --port <n>          listen port (default: 8788, env: MIMO2CODEX_PORT)
      --host <h>          bind host (default: 127.0.0.1, env: MIMO2CODEX_HOST)
      --model <shortcut>  default upstream provider: "mimo" (default) or "ds" (DeepSeek)
      --base-url <url>    base url for the default provider (env: MIMO_BASE_URL / DEEPSEEK_BASE_URL)
      --api-key <key>     api key for the default provider (env varies — see below) — required
      --no-reasoning      hide reasoning_content from Codex (still re-injected for multi-turn quality)
      --reasoning         force reasoning passthrough (default)
      --data-dir <path>   admin sqlite + UI data directory (default: ~/.mimo2codex,
                          env: MIMO2CODEX_DATA_DIR)
      --no-admin          disable the local admin UI + sqlite logging
                          (env: MIMO2CODEX_NO_ADMIN=1)
  -v, --verbose           log every request (env: MIMO2CODEX_VERBOSE=1)
  -V, --version           print version
  -h, --help              show this help

PROVIDER KEYS
      MiMo:     MIMO_API_KEY                          (default base: https://api.xiaomimimo.com/v1)
      DeepSeek: DS_API_KEY  or  DEEPSEEK_API_KEY      (default base: https://api.deepseek.com/v1)
      Set the key for whichever provider --model selects. Other providers are
      registered automatically when their key is present (per-request routing
      lands in a follow-up release).

GENERIC OPENAI-COMPAT PROVIDERS
      Declare any OpenAI Chat-Completions-compatible upstream (Qwen, GLM, Kimi,
      vLLM, Ollama, etc.) in providers.json — by default at:
        ~/.mimo2codex/providers.json
      Or set MIMO2CODEX_PROVIDERS_FILE to point elsewhere.

      For a one-shot single instance, set GENERIC_BASE_URL + GENERIC_API_KEY +
      GENERIC_DEFAULT_MODEL; mimo2codex synthesizes a provider with id "generic".

      Each provider entry supports wireApi: "chat" (default — translate to
      Chat Completions) or "responses" (pipe Codex's Responses payload through
      to the upstream's /v1/responses unchanged — use when the upstream natively
      speaks the Responses API).

      To make a generic provider the default, pass --model <id-or-shortcut>
      (e.g. \`--model qwen\`). With no flag, mimo2codex defaults to mimo.

DEFAULTS BAKED IN (no flag needed)
      ✓ MiMo thinking mode ON — model generates reasoning_content; use
        --no-reasoning to hide it from the Codex terminal (still preserved
        between turns for multi-turn tool quality)
      ✓ parallel_tool_calls forced on — model can batch tool calls per turn,
        helps avoid "model says 'I'll do X' then ends" pattern
      ✓ Codex web_search forwarded to MiMo's web_search builtin. If your account
        doesn't have the Web Search Plugin activated, MiMo returns 400
        "webSearchEnabled is false" — mimo2codex surfaces that error so you can
        activate the plugin (https://platform.xiaomimimo.com/#/console/plugin,
        separately billed) and restart, or accept that web search isn't available

SUBCOMMANDS
  print-config            print ~/.codex/auth.json + config.toml snippets (default;
                          works for Codex CLI and desktop app)
  print-config --env-key  print env-var-based variant (Codex CLI only — desktop app
                          will NOT see shell env vars set via export/setx)
  print-cc-switch         print auth.json + config.toml snippets for the cc-switch
                          desktop app (https://github.com/farion1231/cc-switch)

EXAMPLES
  MIMO_API_KEY=sk-... mimo2codex
  mimo2codex --port 9000 --base-url https://token-plan-cn.xiaomimimo.com/v1
  mimo2codex print-config > codex-mimo.toml
  mimo2codex print-config --env-key       # legacy env-var variant
  mimo2codex print-cc-switch

  # Generic OpenAI-compat upstream — single instance via env vars
  GENERIC_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1 \\
    GENERIC_API_KEY=sk-... GENERIC_DEFAULT_MODEL=qwen3-max \\
    mimo2codex --model generic

  # Multi-instance — declare in ~/.mimo2codex/providers.json, then:
  QWEN_API_KEY=sk-... mimo2codex --model qwen
`;

function checkMimoHostMismatch(cfg: Config): string | null {
  // Catch the most common foot-gun: tp-* key sent at the pay-as-you-go host
  // (or sk-* key sent at the token-plan host) — usually because MIMO_BASE_URL
  // is left over in the shell from a previous session. Yields 401 or
  // confusing 400s upstream; cheaper to warn at startup.
  if (cfg.defaultProviderId !== "mimo") return null;
  const isTpKey = cfg.apiKey.startsWith("tp-");
  const isSkKey = cfg.apiKey.startsWith("sk-");
  const hostIsTokenPlan = /token-plan/i.test(cfg.baseUrl);
  if (isTpKey && !hostIsTokenPlan) {
    return `tp-* key 通常需要 token-plan 主机，但当前 baseUrl 是 ${cfg.baseUrl}。检查 MIMO_BASE_URL / --base-url 是否覆盖了自动推断。`;
  }
  if (isSkKey && hostIsTokenPlan) {
    return `sk-* key 通常需要 pay-as-you-go 主机，但当前 baseUrl 是 ${cfg.baseUrl}。检查 MIMO_BASE_URL / --base-url 是否泄漏（PowerShell: Remove-Item Env:MIMO_BASE_URL）。`;
  }
  return null;
}

function printStartupBanner(cfg: Config, target: SnippetTarget): void {
  // eslint-disable-next-line no-console
  console.log(`mimo2codex v${VERSION} listening on http://${cfg.host}:${cfg.port}`);
  // eslint-disable-next-line no-console
  console.log(`provider:    ${cfg.defaultProviderId}`);
  // eslint-disable-next-line no-console
  console.log(`upstream:    ${cfg.baseUrl}`);
  // eslint-disable-next-line no-console
  console.log(`api key:     ${redactKey(cfg.apiKey)}`);
  const mismatch = checkMimoHostMismatch(cfg);
  if (mismatch) {
    // eslint-disable-next-line no-console
    console.log(`⚠ 警告:      ${mismatch}`);
  }
  if (cfg.defaultProviderId === "mimo") {
    // eslint-disable-next-line no-console
    console.log(
      `plan:        ${cfg.isTokenPlan ? "token-plan (web_search auto-disabled — plugin not available)" : "pay-as-you-go"}`
    );
  }
  // eslint-disable-next-line no-console
  console.log(`reasoning:   ${cfg.exposeReasoning ? "passthrough" : "hidden"}`);
  const others = (Object.keys(cfg.providers) as Array<keyof typeof cfg.providers>)
    .filter((id) => id !== cfg.defaultProviderId && cfg.providers[id])
    .join(", ");
  if (others) {
    // eslint-disable-next-line no-console
    console.log(`registered:  ${others} (model-routed when client picks one of those ids)`);
  }
  if (cfg.adminEnabled) {
    // eslint-disable-next-line no-console
    console.log(`admin UI:    http://${cfg.host}:${cfg.port}/admin/`);
    // eslint-disable-next-line no-console
    console.log(`data dir:    ${cfg.dataDir}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`admin UI:    disabled (--no-admin)`);
  }
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log(configSnippet({ host: cfg.host, port: cfg.port }, target));
}

function main(): void {
  let parsed;
  try {
    parsed = parseArgv(process.argv.slice(2));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`error: ${(err as Error).message}`);
    process.exit(2);
  }

  if (parsed.showHelp) {
    // eslint-disable-next-line no-console
    console.log(HELP);
    return;
  }
  if (parsed.showVersion) {
    // eslint-disable-next-line no-console
    console.log(VERSION);
    return;
  }

  // Register generic providers from providers.json (or GENERIC_* env vars)
  // BEFORE we look at print-config / print-cc-switch subcommands, so those
  // can resolve `--model qwen` against a user-declared generic. We do NOT
  // call resolveDataDir() here (which would auto-create ~/.mimo2codex/) — we
  // only inspect the default path if it already exists, so a one-shot
  // `mimo2codex print-config` doesn't have filesystem side effects.
  const isSubcommand =
    parsed.positional[0] === "print-config" || parsed.positional[0] === "print-cc-switch";
  const adminEnabledForLoader = parsed.noAdmin
    ? false
    : process.env.MIMO2CODEX_NO_ADMIN
      ? false
      : true;
  const dataDirForLoader =
    !isSubcommand && adminEnabledForLoader
      ? resolveDataDir(parsed.dataDir, process.env)
      : nonCreatingDataDirCandidate(parsed.dataDir, process.env);
  try {
    const generics = loadGenericProviders(process.env, dataDirForLoader);
    initRegistry(generics);
  } catch (err) {
    if (err instanceof GenericLoaderError) {
      // eslint-disable-next-line no-console
      console.error(`error: ${err.message}`);
      process.exit(2);
    }
    throw err;
  }

  if (parsed.positional[0] === "print-config") {
    const host = parsed.host ?? "127.0.0.1";
    const port = parsed.port ?? 8788;
    const useEnvKey = parsed.envKey === true;
    const target = resolveSnippetTarget(parsed.model);
    // eslint-disable-next-line no-console
    console.log(
      useEnvKey
        ? configSnippetEnvKey({ host, port }, target)
        : configSnippet({ host, port }, target)
    );
    return;
  }

  if (parsed.positional[0] === "print-cc-switch") {
    const host = parsed.host ?? "127.0.0.1";
    const port = parsed.port ?? 8788;
    const target = resolveSnippetTarget(parsed.model);
    // eslint-disable-next-line no-console
    console.log(ccSwitchSnippet({ host, port }, target));
    return;
  }

  let cfg: Config;
  try {
    cfg = buildConfig(parsed, process.env, VERSION);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`error: ${(err as Error).message}`);
    process.exit(2);
  }

  setVerbose(cfg.verbose);

  if (cfg.adminEnabled) {
    try {
      openDb(cfg.dataDir);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `error: failed to open admin database at ${cfg.dataDir}: ${(err as Error).message}\n` +
          `Pass --no-admin to disable persistence, or --data-dir <path> to choose a writable location.`
      );
      process.exit(2);
    }
  }

  printStartupBanner(cfg, resolveSnippetTarget(parsed.model));

  const server = startServer(cfg);
  server.on("listening", () => {
    log.debug("server listening");
  });
  server.on("error", (err) => {
    log.error("server error", { error: err.message });
    process.exit(1);
  });

  const shutdown = (sig: string) => {
    log.info(`received ${sig}, shutting down`);
    server.close(() => {
      try {
        closeDb();
      } catch {
        // ignore
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
