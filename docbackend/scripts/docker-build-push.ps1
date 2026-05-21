<#
.SYNOPSIS
  Build the mimo2codex-docbackend image and push it to Docker Hub.

.DESCRIPTION
  Multi-arch Linux build (amd64 + arm64) via Docker Buildx, run from a Windows
  host. The build context is the REPO ROOT (not docbackend/) because the
  Dockerfile needs `COPY doc /app/doc`.

  Assumptions
    * `docker login` has already been done.
    * Run from anywhere — paths are resolved relative to this script.

.PARAMETER Username
  Docker Hub username. Falls back to $env:DOCKERHUB_USERNAME, then to the
  username stashed by the Docker Desktop credential helper.

.PARAMETER Repo
  Repository name on Docker Hub. Default: mimo2codex-docbackend.

.PARAMETER Tags
  Default (when omitted): the version read from the repo-root package.json
  (e.g. "0.4.2") + "latest". A `sha-<short>` tag is always auto-appended when
  invoked inside a git checkout, regardless of -Tags.

.PARAMETER Platforms
  Target platforms (comma list in buildx form). Default: linux/amd64,linux/arm64.

.PARAMETER NoPush
  Build only — don't push.

.PARAMETER LoadLocal
  Single-arch build that loads the result into the local Docker daemon.

.EXAMPLE
  pwsh docbackend/scripts/docker-build-push.ps1

.EXAMPLE
  pwsh docbackend/scripts/docker-build-push.ps1 -LoadLocal -NoPush

.EXAMPLE
  pwsh docbackend/scripts/docker-build-push.ps1 -Tags 0.4.2
#>

[CmdletBinding()]
param(
  [string]$Username = $env:DOCKERHUB_USERNAME,
  [string]$Repo = "mimo2codex-docbackend",
  [string[]]$Tags = @(),
  [string]$Platforms = "linux/amd64,linux/arm64",
  [switch]$NoPush,
  [switch]$LoadLocal
)

$ErrorActionPreference = "Stop"

function Get-DockerHubUsername {
  $configPath = Join-Path $env:USERPROFILE ".docker\config.json"
  if (-not (Test-Path $configPath)) { return $null }

  try {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
  } catch {
    return $null
  }

  $hubKeys = @("https://index.docker.io/v1/", "index.docker.io", "docker.io")

  $store = $config.credsStore
  if (-not $store -and $config.credHelpers) {
    foreach ($k in $hubKeys) {
      $h = $config.credHelpers.$k
      if ($h) { $store = $h; break }
    }
  }
  if ($store) {
    $helper = "docker-credential-$store"
    foreach ($k in $hubKeys) {
      try {
        $json = $k | & $helper get 2>$null
        if ($LASTEXITCODE -eq 0 -and $json) {
          $parsed = $json | ConvertFrom-Json -ErrorAction Stop
          if ($parsed.Username) { return [string]$parsed.Username }
        }
      } catch {}
    }
  }

  if ($config.auths) {
    foreach ($k in $hubKeys) {
      $entry = $config.auths.$k
      if ($entry -and $entry.auth) {
        try {
          $bytes = [Convert]::FromBase64String([string]$entry.auth)
          $decoded = [System.Text.Encoding]::UTF8.GetString($bytes)
          $name = $decoded.Split(':', 2)[0]
          if ($name) { return $name }
        } catch {}
      }
    }
  }

  return $null
}

if (-not $Username) {
  $Username = Get-DockerHubUsername
  if ($Username) {
    Write-Host "Detected Docker Hub username from local credentials: $Username" -ForegroundColor DarkGray
  }
}

if (-not $Username) {
  throw @"
Could not detect Docker Hub username automatically.
  • Run ``docker login`` first, OR
  • Pass -Username <name>, OR
  • Set `$env:DOCKERHUB_USERNAME.
"@
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$dockerfile = (Resolve-Path (Join-Path $scriptDir "..\Dockerfile")).Path

# docbackend ships in lockstep with docweb — same image tag, same deploy
# manifest. We read docweb/package.json (NOT the root one — root belongs to
# the main mimo2codex CLI which has its own release cadence) so bumping
# docweb's version automatically picks up here too.
function Get-ProjectVersion {
  param([string]$PkgPath)
  if (-not (Test-Path $PkgPath)) { return $null }
  try {
    $obj = Get-Content $PkgPath -Raw | ConvertFrom-Json
    if ($obj.version) { return [string]$obj.version }
  } catch {}
  return $null
}

$docwebPkg = Join-Path $repoRoot "docweb\package.json"

$tagsExplicit = $PSBoundParameters.ContainsKey('Tags') -and $Tags.Count -gt 0
if (-not $tagsExplicit) {
  $autoVersion = Get-ProjectVersion -PkgPath $docwebPkg
  if ($autoVersion) {
    $Tags = @($autoVersion, "latest")
    Write-Host "Auto-detected version from docweb/package.json: $autoVersion" -ForegroundColor DarkGray
  } else {
    $Tags = @("latest")
    Write-Host "No docweb/package.json version detected — tagging 'latest' only" -ForegroundColor Yellow
  }
}

$gitSha = $null
Push-Location $repoRoot
try {
  $sha = & git rev-parse --short HEAD 2>$null
  if ($LASTEXITCODE -eq 0 -and $sha) {
    $gitSha = $sha.Trim()
  }
} catch {} finally {
  Pop-Location
}
if ($gitSha) { $Tags = @($Tags + "sha-$gitSha") | Select-Object -Unique }

$imageBase = "${Username}/${Repo}"
$tagArgs = @()
foreach ($t in $Tags) { $tagArgs += @("--tag", "${imageBase}:${t}") }

Write-Host ""
Write-Host "▶ Building $imageBase" -ForegroundColor Cyan
Write-Host "  Tags:      $($Tags -join ', ')"
Write-Host "  Platforms: $Platforms"
Write-Host "  Context:   $repoRoot   (repo root — needed so COPY ../doc works)"
Write-Host "  Dockerfile: $dockerfile"
Write-Host ""

& docker buildx version | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "docker buildx is not available. Make sure Docker Desktop is running."
}

$builderName = "m2cx-builder"
$builders = & docker buildx ls 2>&1
if (-not ($builders -match $builderName)) {
  Write-Host "Creating buildx builder '$builderName'…" -ForegroundColor Yellow
  & docker buildx create --name $builderName --driver docker-container --use --bootstrap | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to create buildx builder" }
} else {
  & docker buildx use $builderName | Out-Null
}

$buildArgs = @(
  "buildx", "build",
  "--file", $dockerfile,
  "--pull"
)

if ($LoadLocal) {
  if ($Platforms -match ",") {
    Write-Warning "Multi-platform with --load is not supported. Falling back to host arch only."
  }
  $hostArch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq "Arm64") {
    "linux/arm64"
  } else {
    "linux/amd64"
  }
  $buildArgs += @("--platform", $hostArch, "--load")
} else {
  $buildArgs += @("--platform", $Platforms)
  if (-not $NoPush) {
    $buildArgs += "--push"
  }
}

$buildArgs += $tagArgs
$buildArgs += $repoRoot

Write-Host "→ docker $($buildArgs -join ' ')" -ForegroundColor DarkGray
Write-Host ""
& docker @buildArgs
if ($LASTEXITCODE -ne 0) {
  throw "docker buildx failed (exit $LASTEXITCODE)"
}

Write-Host ""
Write-Host "✓ Done" -ForegroundColor Green
if (-not $NoPush -and -not $LoadLocal) {
  foreach ($t in $Tags) {
    Write-Host "  pushed: ${imageBase}:${t}" -ForegroundColor Green
  }
  Write-Host ""
  Write-Host "Run anywhere:" -ForegroundColor Cyan
  Write-Host "  docker run --rm -p 8080:8080 ``"
  Write-Host "    -e DOCBACKEND_DSN='postgres://...' ``"
  Write-Host "    -e DOCBACKEND_UPSTREAM_BASE_URL='https://...' ``"
  Write-Host "    -e DOCBACKEND_UPSTREAM_API_KEY='sk-...' ``"
  Write-Host "    -e DOCBACKEND_UPSTREAM_MODEL='mimo-v2.5' ``"
  Write-Host "    -e DOCBACKEND_IP_SALT='any-random-string' ``"
  Write-Host "    ${imageBase}:$($Tags[0])"
} elseif ($LoadLocal) {
  Write-Host "Loaded locally."
}
