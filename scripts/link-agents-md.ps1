# Recreates the AGENTS.md -> CLAUDE.md hardlink structure after a fresh clone.
# Run from repo root. Requires admin on Windows for hardlink creation
# (Developer Mode also grants this without full admin).
param(
    [switch]$Force
)

$repoRoot = Split-Path -Parent $PSCommandPath
Set-Location -LiteralPath $repoRoot

$agent = Join-Path $repoRoot "AGENTS.md"
$claude = Join-Path $repoRoot "CLAUDE.md"

if (-not (Test-Path -LiteralPath $claude)) {
    Write-Error "CLAUDE.md not found - nothing to link to"
    exit 1
}

$isHardlink = (Test-Path -LiteralPath $agent) -and ((Get-Item -LiteralPath $agent).LinkType -eq 'HardLink')

if ($isHardlink) {
    Write-Host "AGENTS.md is already a hardlink to CLAUDE.md. Nothing to do."
    exit 0
}

if (Test-Path -LiteralPath $agent) {
    if ($Force) {
        Remove-Item -LiteralPath $agent
        Write-Host "Removed standalone AGENTS.md (--force)."
    } else {
        Write-Host "AGENTS.md exists as a standalone file. Run with -Force to replace it with a hardlink."
        exit 0
    }
}

try {
    New-Item -ItemType HardLink -Path $agent -Target $claude | Out-Null
    Write-Host "Hardlink created: AGENTS.md -> CLAUDE.md"
} catch [System.UnauthorizedAccessException] {
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Error "Hardlink requires admin privileges. Run PowerShell as Administrator, or enable Developer Mode in Windows Settings."
    } else {
        Write-Error "Hardlink failed: $_"
    }
    exit 1
}
