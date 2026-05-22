import { app } from "electron";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

export interface SidecarPaths {
  /** Binary to spawn — always `process.execPath` (the Electron binary). */
  node: string;
  /** Path to compiled CLI entry point */
  cliEntry: string;
  /** Env vars to add when spawning — must include ELECTRON_RUN_AS_NODE=1. */
  env: Record<string, string>;
}

/**
 * Resolves the sidecar binary + CLI entry point.
 *
 * Strategy: we spawn the Electron binary itself with `ELECTRON_RUN_AS_NODE=1`
 * so it runs as plain Node, using Electron's bundled Node runtime. This means
 * native modules (e.g. better-sqlite3) only need to ship a prebuild matching
 * the Electron ABI — no separate Node-runtime download, no ABI mismatch.
 *
 * - **Packaged build**: always uses `resources/sidecar/dist/cli.js` shipped
 *   by electron-builder's extraResources.
 * - **Dev (`npm run desktop:dev`)**: prefers the same `resources/sidecar/` if
 *   the user has run `npm run sidecar:build`; otherwise falls back to the
 *   repo's root `dist/cli.js` + root `node_modules` (the host Node ABI
 *   matches Electron's closely enough that this almost always works).
 */
export function sidecarPaths(): SidecarPaths {
  const env = { ELECTRON_RUN_AS_NODE: "1" };

  if (app.isPackaged) {
    return {
      node: process.execPath,
      cliEntry: join(process.resourcesPath, "sidecar", "dist", "cli.js"),
      env,
    };
  }

  // Dev mode
  const appPath = app.getAppPath();              // package/desktop
  const repoRoot = resolve(appPath, "..", "..");  // repo root
  const bundledCli = resolve(repoRoot, "package/desktop/resources/sidecar/dist/cli.js");

  if (existsSync(bundledCli)) {
    return { node: process.execPath, cliEntry: bundledCli, env };
  }

  // Dev fallback — use repo's compiled CLI directly.
  const repoCli = resolve(repoRoot, "dist", "cli.js");
  if (!existsSync(repoCli)) {
    throw new Error(
      `dev sidecar fallback expects ${repoCli} to exist. Run \`npm run build\` at the repo root first, or run \`npm run sidecar:build\` for a full bundle.`
    );
  }
  return { node: process.execPath, cliEntry: repoCli, env };
}
