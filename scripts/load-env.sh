#!/usr/bin/env bash
# scripts/load-env.sh — load .env into the current shell (macOS / Linux / Git Bash).
#
# Usage:
#   source scripts/load-env.sh                # loads ./.env
#   source scripts/load-env.sh path/to/file   # loads a different file
#
# Honors KEY=VALUE lines. Comments (`#`) and blanks are skipped. Values may be
# wrapped in single or double quotes — the wrapping pair is stripped, the
# interior is treated literally (no $variable expansion, no backslash escapes).
# Pre-existing env vars are overwritten so the file is the source of truth for
# the keys it declares.
#
# Names are printed when loaded; VALUES ARE NEVER PRINTED.

# ──────────── must be sourced, not executed ────────────
# Detection works in both bash (BASH_SOURCE) and zsh (ZSH_EVAL_CONTEXT). When
# the script is sourced, `return` exits without killing the calling shell;
# when executed, we fall through to `exit`.
_load_env_sourced=0
if [ -n "${ZSH_VERSION:-}" ]; then
  case "${ZSH_EVAL_CONTEXT:-}" in *:file*) _load_env_sourced=1 ;; esac
elif [ -n "${BASH_VERSION:-}" ]; then
  [ "${BASH_SOURCE[0]:-}" != "${0}" ] && _load_env_sourced=1
fi
if [ "$_load_env_sourced" -ne 1 ]; then
  printf 'load-env: source this script, do not execute it.\n  source scripts/load-env.sh\n' >&2
  unset _load_env_sourced
  exit 1
fi
unset _load_env_sourced

# ──────────── locate the file ────────────
_load_env_file="${1:-.env}"
if [ ! -f "$_load_env_file" ]; then
  printf 'load-env: %s not found\n' "$_load_env_file" >&2
  printf '  copy .env.example to .env and fill in your keys.\n' >&2
  unset _load_env_file
  return 1
fi

# ──────────── parse + export ────────────
_load_env_count=0
_load_env_names=""
while IFS= read -r _load_env_line || [ -n "$_load_env_line" ]; do
  # Strip trailing CR (Windows-edited .env files).
  _load_env_line="${_load_env_line%$'\r'}"
  # Strip leading whitespace.
  while [ "${_load_env_line# }" != "$_load_env_line" ]; do _load_env_line="${_load_env_line# }"; done
  while [ "${_load_env_line#	}" != "$_load_env_line" ]; do _load_env_line="${_load_env_line#	}"; done
  # Skip blanks and comments.
  case "$_load_env_line" in
    ''|'#'*) continue ;;
  esac
  # Require a `=`. Lines without one are skipped (mirrors dotenv tolerance).
  case "$_load_env_line" in
    *=*) : ;;
    *) continue ;;
  esac
  # Allow optional `export ` prefix for compatibility with hand-written .env files.
  case "$_load_env_line" in
    'export '*) _load_env_line="${_load_env_line#export }" ;;
  esac
  _load_env_key="${_load_env_line%%=*}"
  _load_env_val="${_load_env_line#*=}"
  # Validate key (POSIX env var: [A-Za-z_][A-Za-z0-9_]*). Reject otherwise.
  case "$_load_env_key" in
    [!A-Za-z_]*|*[!A-Za-z0-9_]*)
      printf 'load-env: skipping invalid key name: %s\n' "$_load_env_key" >&2
      continue
      ;;
  esac
  # Strip surrounding quotes (paired, on both ends).
  case "$_load_env_val" in
    \"*\") _load_env_val="${_load_env_val#\"}"; _load_env_val="${_load_env_val%\"}" ;;
    \'*\') _load_env_val="${_load_env_val#\'}"; _load_env_val="${_load_env_val%\'}" ;;
  esac
  export "$_load_env_key=$_load_env_val"
  _load_env_count=$((_load_env_count + 1))
  _load_env_names="$_load_env_names $_load_env_key"
done < "$_load_env_file"

printf 'load-env: %d variable(s) loaded from %s\n' "$_load_env_count" "$_load_env_file"
for _load_env_name in $_load_env_names; do
  printf '  - %s\n' "$_load_env_name"
done

unset _load_env_file _load_env_line _load_env_key _load_env_val \
      _load_env_count _load_env_names _load_env_name
