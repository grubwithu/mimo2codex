#!/usr/bin/env node
import { buildConfig, parseArgv, type Config } from "./config.js";
import { startServer } from "./server.js";
import { setVerbose, log, redactKey } from "./util/log.js";

const VERSION = "0.1.0";

const HELP = `mimo2codex v${VERSION} — local proxy: Codex Responses API → Xiaomi MiMo Chat Completions

USAGE
  mimo2codex [options]
  mimo2codex print-config
  mimo2codex print-cc-switch

OPTIONS
  -p, --port <n>          listen port (default: 8788, env: MIMO2CODEX_PORT)
      --host <h>          bind host (default: 127.0.0.1, env: MIMO2CODEX_HOST)
      --base-url <url>    MiMo base url (default: https://api.xiaomimimo.com/v1, env: MIMO_BASE_URL)
      --api-key <key>     MiMo api key (env: MIMO_API_KEY) — required
      --no-reasoning      hide MiMo reasoning_content from Codex (still re-injected for multi-turn quality)
      --reasoning         force reasoning passthrough (default)
  -v, --verbose           log every request (env: MIMO2CODEX_VERBOSE=1)
  -V, --version           print version
  -h, --help              show this help

SUBCOMMANDS
  print-config            print the ~/.codex/config.toml snippet to stdout
  print-cc-switch         print auth.json + config.toml snippets for the cc-switch
                          desktop app (https://github.com/farion1231/cc-switch)

EXAMPLES
  MIMO_API_KEY=sk-... mimo2codex
  mimo2codex --port 9000 --base-url https://token-plan-cn.xiaomimimo.com/v1
  mimo2codex print-config > codex-mimo.toml
  mimo2codex print-cc-switch
`;

function configSnippet(cfg: { host: string; port: number }): string {
  return `# ~/.codex/config.toml — drop these lines in (or merge with existing config)
model = "mimo-v2.5-pro"
model_provider = "mimo"

[model_providers.mimo]
name = "MiMo (via mimo2codex)"
base_url = "http://${cfg.host}:${cfg.port}/v1"
wire_api = "responses"
env_key = "MIMO2CODEX_KEY"
request_max_retries = 1

# In your shell, export any non-empty value (the proxy doesn't validate it):
#   export MIMO2CODEX_KEY=anything
# On Windows (CMD): setx MIMO2CODEX_KEY anything
`;
}

// cc-switch (https://github.com/farion1231/cc-switch) is a desktop app that
// manages multiple Codex providers via a "+" → "Custom" panel. It writes
// ~/.codex/auth.json + ~/.codex/config.toml when you switch providers.
// This subcommand prints both snippets in a copy-pasteable form so users can
// add mimo2codex as a custom Codex provider in cc-switch.
function ccSwitchSnippet(cfg: { host: string; port: number }): string {
  const authJson = JSON.stringify({ OPENAI_API_KEY: "mimo2codex-local" }, null, 2);
  const configToml = `model_provider = "mimo2codex"
model = "mimo-v2.5-pro"

[model_providers.mimo2codex]
name = "MiMo (via mimo2codex)"
base_url = "http://${cfg.host}:${cfg.port}/v1"
wire_api = "responses"
requires_openai_auth = true
request_max_retries = 1
`;
  return `# cc-switch — Add Provider → Codex tab → Custom

# ───────── auth.json (paste into the auth.json textarea) ─────────
${authJson}

# ───────── config.toml (paste into the config.toml textarea) ─────────
${configToml}
# Note: OPENAI_API_KEY can be any non-empty string — mimo2codex does not
# validate inbound credentials. Your real MiMo key stays in MIMO_API_KEY
# on the machine running mimo2codex.
`;
}

function printStartupBanner(cfg: Config): void {
  // eslint-disable-next-line no-console
  console.log(`mimo2codex v${VERSION} listening on http://${cfg.host}:${cfg.port}`);
  // eslint-disable-next-line no-console
  console.log(`upstream:    ${cfg.baseUrl}`);
  // eslint-disable-next-line no-console
  console.log(`api key:     ${redactKey(cfg.apiKey)}`);
  // eslint-disable-next-line no-console
  console.log(`reasoning:   ${cfg.exposeReasoning ? "passthrough" : "hidden"}`);
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log(configSnippet({ host: cfg.host, port: cfg.port }));
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

  if (parsed.positional[0] === "print-config") {
    const host = parsed.host ?? "127.0.0.1";
    const port = parsed.port ?? 8788;
    // eslint-disable-next-line no-console
    console.log(configSnippet({ host, port }));
    return;
  }

  if (parsed.positional[0] === "print-cc-switch") {
    const host = parsed.host ?? "127.0.0.1";
    const port = parsed.port ?? 8788;
    // eslint-disable-next-line no-console
    console.log(ccSwitchSnippet({ host, port }));
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
  printStartupBanner(cfg);

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
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
