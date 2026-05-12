#!/usr/bin/env node
// Bump version + push tags, but pin the previous commit's subject to the
// version bump's commit message so `git log` reads as
// "0.1.16 - [fix] xxx" instead of a bare "0.1.16". `npm version` substitutes
// %s with the new version, and we splice in `git log -1 --pretty=%s` taken
// just before the bump.
//
// Usage: node scripts/release.mjs <patch|minor|major>
import { execSync, spawnSync } from "node:child_process";

const bump = process.argv[2];
if (!["patch", "minor", "major"].includes(bump)) {
  console.error("Usage: node scripts/release.mjs <patch|minor|major>");
  process.exit(1);
}

let lastSubject = "";
try {
  lastSubject = execSync("git log -1 --pretty=%s", { encoding: "utf8" }).trim();
} catch {
  // first commit / detached state — just bump without context
}

// Skip the splice if the previous commit was itself a version bump, so we
// don't end up with "0.1.17 - 0.1.16".
const looksLikeVersionBump = /^v?\d+\.\d+\.\d+(\s|$)/.test(lastSubject);
const message = lastSubject && !looksLikeVersionBump ? `%s - ${lastSubject}` : "%s";

console.log(`[release] bump=${bump} message="${message}"`);

const bumpResult = spawnSync("npm", ["version", bump, "-m", message], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (bumpResult.status !== 0) process.exit(bumpResult.status ?? 1);

const pushResult = spawnSync("git", ["push", "--follow-tags"], { stdio: "inherit" });
if (pushResult.status !== 0) process.exit(pushResult.status ?? 1);
