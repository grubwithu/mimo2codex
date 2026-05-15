# scripts/load-env.ps1 — load .env into the current PowerShell session.
#
# Usage:
#   . .\scripts\load-env.ps1                   # loads .\.env
#   . .\scripts\load-env.ps1 .\.env.local      # loads a different file
#
# IMPORTANT: dot-source this script (note the leading `. `). If you just run
# `.\scripts\load-env.ps1`, PowerShell spawns a child scope, sets the vars
# there, and drops them on exit — your shell sees nothing.
#
# Honors KEY=VALUE lines. Comments (`#`) and blanks are skipped. Values may be
# wrapped in single or double quotes — the wrapping pair is stripped, the
# interior is treated literally (no $variable expansion, no backslash escapes).
# Pre-existing env vars are overwritten so the file is the source of truth for
# the keys it declares.
#
# Names are printed when loaded; VALUES ARE NEVER PRINTED.

param(
    [Parameter(Position = 0)]
    [string]$Path = '.env'
)

if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host "load-env: $Path not found" -ForegroundColor Yellow
    Write-Host '  copy .env.example to .env and fill in your keys.' -ForegroundColor Yellow
    return
}

$loaded = New-Object System.Collections.Generic.List[string]
foreach ($raw in Get-Content -LiteralPath $Path) {
    # Strip leading whitespace; trailing CR is handled by Get-Content already.
    $line = $raw.TrimStart()
    if ($line.Length -eq 0) { continue }
    if ($line.StartsWith('#')) { continue }
    # Optional `export ` prefix for parity with the bash loader.
    if ($line.StartsWith('export ')) {
        $line = $line.Substring(7).TrimStart()
    }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { continue }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1)
    # Validate key name: [A-Za-z_][A-Za-z0-9_]*
    if ($key -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        Write-Host "load-env: skipping invalid key name: $key" -ForegroundColor Yellow
        continue
    }
    # Strip surrounding quotes (paired, on both ends).
    if (($val.StartsWith('"') -and $val.EndsWith('"') -and $val.Length -ge 2) -or
        ($val.StartsWith("'") -and $val.EndsWith("'") -and $val.Length -ge 2)) {
        $val = $val.Substring(1, $val.Length - 2)
    }
    # Set in the process's current session — visible to child processes
    # launched from this shell (mimo2codex, codex, etc.).
    Set-Item -LiteralPath ("Env:" + $key) -Value $val
    [void]$loaded.Add($key)
}

Write-Host ("load-env: {0} variable(s) loaded from {1}" -f $loaded.Count, $Path) -ForegroundColor Green
foreach ($k in $loaded) {
    Write-Host "  - $k"
}
