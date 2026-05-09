#!/usr/bin/env node
// Ensure the admin UI bundle exists before `npm run dev` boots. The bundle is
// built by `npm run web:install && npm run web:build`, but doing that on every
// dev start would add ~5s for no reason. We only run it when dist/web/index.html
// is missing — typically the first dev run after a fresh clone, or after
// `dist/` was wiped.
//
// Production / npm-installed users never hit this script: prepack already
// populated dist/web/ in the published tarball.
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sentinel = resolve(repoRoot, "dist", "web", "index.html");

if (existsSync(sentinel)) {
  process.exit(0);
}

console.log("[ensure-web] dist/web/ missing — running web:install + web:build…");
try {
  execSync("npm run web:install", { stdio: "inherit", cwd: repoRoot });
  execSync("npm run web:build", { stdio: "inherit", cwd: repoRoot });
} catch (err) {
  console.error("[ensure-web] failed:", err && err.message ? err.message : err);
  process.exit(1);
}
