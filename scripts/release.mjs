#!/usr/bin/env node
// Bump version + push tags, but pin the previous commit's subject to the
// version bump's commit message so `git log` reads as
// "0.1.16 - [fix] xxx" instead of a bare "0.1.16".
//
// We deliberately skip `npm version`'s built-in `-m "%s ..."` substitution:
// on Windows that argument gets mangled by cmd.exe (% is the env-var marker)
// when running under pnpm/npm scripts. Instead we bump with
// --no-git-tag-version, then craft the commit + tag ourselves via `git`,
// which takes the message as a plain argv entry — no shell parsing involved.
//
// Usage: node scripts/release.mjs <patch|minor|major>
import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const bump = process.argv[2];
if (!["patch", "minor", "major"].includes(bump)) {
  console.error("Usage: node scripts/release.mjs <patch|minor|major>");
  process.exit(1);
}

let lastSubject = "";
try {
  lastSubject = execSync("git log -1 --pretty=%s", { encoding: "utf8", cwd: repoRoot }).trim();
} catch {
  // first commit / detached state — just bump without context
}

// Skip the splice if the previous commit was itself a version bump, so we
// don't end up with "0.1.17 - 0.1.16".
const looksLikeVersionBump = /^v?\d+\.\d+\.\d+(\s|$)/.test(lastSubject);
const ctxSuffix = lastSubject && !looksLikeVersionBump ? ` - ${lastSubject}` : "";

function run(cmd, args, { shell = false } = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: repoRoot, shell });
  if (r.error) {
    console.error(`[release] failed to start: ${cmd}`, r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`[release] command failed (exit ${r.status}): ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

// 1. Bump version in package.json (+ package-lock.json if present); no commit, no tag.
// npm on Windows is npm.cmd — Node's spawn can't launch .cmd files directly,
// so we go through the shell. These args are all simple ASCII so re-parsing
// by cmd.exe is harmless.
run("npm", ["version", bump, "--no-git-tag-version"], { shell: true });

// 2. Read the new version.
const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
const newVersion = pkg.version;
const message = `${newVersion}${ctxSuffix}`;

console.log(`[release] new version: ${newVersion}`);
console.log(`[release] commit message: ${message}`);

// 3. Commit the bumped manifest + tag at HEAD.
run("git", ["commit", "-am", message]);
run("git", ["tag", "-a", `v${newVersion}`, "-m", message]);

// 4. Push branch + tag together.
run("git", ["push", "--follow-tags"]);
