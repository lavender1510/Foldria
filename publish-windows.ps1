# Foldria v0.1.0 - one-time GitHub publication on Windows.
# Requires Git, GitHub CLI (gh), Node.js and an authenticated lavender1510 account.
# Never force pushes or replaces an existing repository branch or tag.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repository = 'lavender1510/Foldria'
$tag = 'v0.1.0'
$releaseUrl = 'https://github.com/lavender1510/Foldria/releases'

function Invoke-Checked([string]$command, [string[]]$arguments) {
  & $command @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Befehl fehlgeschlagen (Exit $LASTEXITCODE): $command $($arguments -join ' ')"
  }
}

try {
  Set-Location $PSScriptRoot
  Write-Host ''
  Write-Host '  FOLDRIA  |  Windows GitHub Publisher' -ForegroundColor Magenta
  Write-Host '  Repository: https://github.com/lavender1510/Foldria'
  Write-Host '  Version: v0.1.0' 
  Write-Host ''

  foreach ($required in @('git', 'gh', 'node', 'npm')) {
    if (-not (Get-Command $required -ErrorAction SilentlyContinue)) {
      throw "'$required' ist nicht installiert oder nicht im PATH. Bitte Git, GitHub CLI und Node.js 22 installieren. Siehe BUILD-WINDOWS.md."
    }
  }

  & gh auth status *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'GitHub-Anmeldung erforderlich. Der Browser wird geoeffnet.' -ForegroundColor Yellow
    Invoke-Checked 'gh' @('auth', 'login', '--hostname', 'github.com', '--web', '--git-protocol', 'https')
  }

  # Read authenticated account as JSON. Using --jq and a piped native exit
  # code can produce a false mismatch in Windows PowerShell 5.1.
  $identityResponse = @(& gh api user)
  $identityExitCode = $LASTEXITCODE
  if ($identityExitCode -ne 0) {
    throw "GitHub-Konto konnte nicht abgefragt werden (Exit $identityExitCode). Bitte 'gh auth status' pruefen."
  }
  $identity = ($identityResponse -join "`n") | ConvertFrom-Json
  $currentUser = ([string]$identity.login).Trim()
  if ($currentUser -ine 'lavender1510') {
    throw "Angemeldet als '$currentUser' statt lavender1510. Bitte mit 'gh auth switch' das richtige Konto waehlen."
  }
  Write-Host "GitHub-Konto bestaetigt: $currentUser" -ForegroundColor Green
  Write-Host '[1/6] Kernfunktionstests ...' -ForegroundColor Cyan
  Invoke-Checked 'npm' @('test')

  Write-Host '[2/6] Git-Repository lokal vorbereiten ...' -ForegroundColor Cyan
  if (-not (Test-Path -LiteralPath '.git')) {
    Invoke-Checked 'git' @('init', '-b', 'main')
  }
  $branch = (& git branch --show-current | Select-Object -First 1).Trim()
  if ($branch -ne 'main') {
    throw "Aktueller Git-Branch ist '$branch' statt 'main'. Abbruch, um bestehende Branches nicht zu veraendern."
  }

  $remoteNames = @(& git remote)
  if ($remoteNames -contains 'origin') {
    $existingOrigin = (& git remote get-url origin | Select-Object -First 1).Trim()
    if ($existingOrigin -notin @('https://github.com/lavender1510/Foldria.git', 'git@github.com:lavender1510/Foldria.git')) {
      throw "Der Remote 'origin' verweist auf '$existingOrigin'. Abbruch, um nichts in ein fremdes Repository hochzuladen."
    }
  }

  # Use GitHub's standard noreply identity, only within this local repository.
  $authorName = (& git config --local user.name | Select-Object -First 1)
  if (-not $authorName) { Invoke-Checked 'git' @('config', '--local', 'user.name', 'lavender1510') }
  $authorEmail = (& git config --local user.email | Select-Object -First 1)
  if (-not $authorEmail) {
    $userId = [string]$identity.id
    if ($userId -notmatch '^\d+$') { throw 'Die GitHub-User-ID konnte nicht geladen werden.' }
    Invoke-Checked 'git' @('config', '--local', 'user.email', "$userId+lavender1510@users.noreply.github.com")
  }
  Invoke-Checked 'git' @('add', '-A')
  $staged = & git diff --cached --name-only
  if ($LASTEXITCODE -ne 0) { throw 'Git konnte die Dateien nicht pruefen.' }
  if ($staged) { Invoke-Checked 'git' @('commit', '-m', 'feat: initial Foldria desktop application') }
  # A clean working tree is expected when the initial commit already exists.
  # Do not treat "nothing to commit" as a failure, and don't rely on a
  # native-process exit code that PowerShell pipelines may propagate oddly.
  $headLines = @(& git log -1 --format=%H)
  $headSha = if ($headLines.Count -gt 0) { [string]$headLines[0] } else { '' }
  $headSha = $headSha.Trim()
  if ($headSha -notmatch '^[a-fA-F0-9]{40}$') {
    throw 'Es wurde kein gueltiger Git-Commit gefunden. Bitte git log -1 --oneline pruefen.'
  }
  Write-Host "Vorhandenen Commit verwenden: $($headSha.Substring(0, 7))" -ForegroundColor Green

  Write-Host '[3/6] GitHub-Repository pruefen ...' -ForegroundColor Cyan
  & gh repo view $repository --json name --jq '.name' *> $null
  $exists = ($LASTEXITCODE -eq 0)
  if (-not $exists) {
    Write-Host 'Lege das neue oeffentliche Repository an ...'
    Invoke-Checked 'gh' @('repo', 'create', $repository, '--public', '--description', 'Foldria - moderner Windows Datei-Sortierer mit Sortierregeln, Duplikatsuche und Undo.')
  } else {
    Write-Host 'Repository existiert bereits. Vorhandene Branches/Tags werden nicht ueberschrieben.'
  }

  if ($remoteNames -notcontains 'origin') {
    Invoke-Checked 'git' @('remote', 'add', 'origin', 'https://github.com/lavender1510/Foldria.git')
  }

  # Reject any existing main branch or version tag rather than overwrite user content.
  & git ls-remote --exit-code origin 'refs/heads/main' *> $null
  if ($LASTEXITCODE -eq 0) { throw 'Auf GitHub existiert bereits main. Keine Ueberschreibung. Bitte die vorhandenen Dateien erst pruefen.' }
  & git ls-remote --exit-code --tags origin "refs/tags/$tag" *> $null
  if ($LASTEXITCODE -eq 0) { throw "Auf GitHub existiert bereits $tag. Keine Ueberschreibung." }
  & git rev-parse --verify "refs/tags/$tag" *> $null
  if ($LASTEXITCODE -eq 0) { throw "Ein lokaler Tag $tag existiert bereits. Abbruch." }

  Write-Host '[4/6] Quellcode nach GitHub hochladen ...' -ForegroundColor Cyan
  Invoke-Checked 'git' @('push', '-u', 'origin', 'main')

  Write-Host '[5/6] Release-Tag erstellen ...' -ForegroundColor Cyan
  Invoke-Checked 'git' @('tag', '-a', $tag, '-m', 'Foldria v0.1.0 - Windows release')
  Invoke-Checked 'git' @('push', 'origin', $tag)

  Write-Host '[6/6] Windows-Build auf GitHub Actions angestossen.' -ForegroundColor Green
  Write-Host ''
  Write-Host 'Der Build prueft die Tests und erstellt Installer + portable EXE.'
  Write-Host "Actions: https://github.com/$repository/actions"
  Write-Host "Releases: $releaseUrl"
  Write-Host 'Die Download-Dateien erscheinen erst, wenn der GitHub-Actions-Job erfolgreich ist.'
} catch {
  Write-Host ''
  Write-Host "Veroeffentlichung nicht abgeschlossen: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Es wurden keine bestehenden Branches oder Tags erzwungen oder ueberschrieben.' -ForegroundColor Yellow
  exit 1
}
