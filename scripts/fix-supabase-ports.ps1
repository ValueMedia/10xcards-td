<#
.SYNOPSIS
    Frees the Supabase local-dev TCP ports from the Windows (winnat / Hyper-V)
    reserved dynamic-port range so the local stack is reachable on 127.0.0.1.

.WHY
    `netsh interface ipv4 show excludedportrange protocol=tcp` shows winnat
    reserving a block (e.g. 54279-54378) that swallows Supabase's ports
    (54321-54324). Reserved ports cannot be bound on the host, so the WSL2
    localhost relay (and anything else) fails and Supabase can't be reached at
    127.0.0.1. Adding a PERSISTENT administered exclusion carves these ports out
    of winnat's pool, after which the native WSL relay forwards them normally.

    One-time fix: survives reboots; no need to re-run after `wsl --shutdown`.
    Self-elevates (these commands need admin) and writes a verbose log to
    scripts/fix-supabase-ports.log so the result is visible even though the
    elevated window is a separate, short-lived process. The log is written
    INCREMENTALLY so a mid-script failure is still captured.

.USAGE
    pwsh ./scripts/fix-supabase-ports.ps1           # apply the fix
    pwsh ./scripts/fix-supabase-ports.ps1 -Show     # just print current ranges
#>
param(
    [switch]$Show,
    [switch]$Elevated
)

# Reserve a clean contiguous block covering all Supabase ports:
#   54320 shadow, 54321 api, 54322 db, 54323 studio, 54324 mailpit,
#   54325/54326 smtp/pop3, 54327 analytics, 54329 pooler.
$startPort = 54320
$numPorts  = 10   # 54320-54329
$logPath   = Join-Path $PSScriptRoot 'fix-supabase-ports.log'

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

if ($Show) {
    netsh interface ipv4 show excludedportrange protocol=tcp
    return
}

if (-not (Test-Admin)) {
    Write-Host 'Elevation required (winnat + excludedportrange). Launching an admin window...'
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Elevated')
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -Wait
    Write-Host "`n--- log ($logPath) ---"
    if (Test-Path $logPath) { Get-Content $logPath } else { Write-Host '(no log written - elevation likely cancelled)' }
    return
}

# --- elevated from here: write the log incrementally ---
function Log($m) {
    $line = [string]$m
    Add-Content -Path $logPath -Value $line -Encoding utf8
    Write-Host $line
}

# Start a fresh log.
Set-Content -Path $logPath -Value "[$(Get-Date -Format o)] reserving Supabase ports $startPort-$($startPort + $numPorts - 1)" -Encoding utf8

try {
    # Clean up any stale 127.0.0.1 portproxy entries from earlier attempts.
    foreach ($p in 54321..54324) {
        cmd /c "netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=$p" 2>$null | Out-Null
    }

    Log 'Stopping winnat (with dependents)...'
    try { Stop-Service -Name winnat -Force -ErrorAction Stop; Log '  winnat stopped' }
    catch { Log "  stop winnat warning: $($_.Exception.Message)" }

    Log "Adding persistent excludedportrange tcp $startPort +$numPorts ..."
    $addOut = & cmd /c "netsh interface ipv4 add excludedportrange protocol=tcp startport=$startPort numberofports=$numPorts store=persistent" 2>&1
    Log "  netsh add exit=$LASTEXITCODE"
    $addOut | ForEach-Object { Log "    $_" }

    Log 'Starting winnat...'
    try { Start-Service -Name winnat -ErrorAction Stop; Log '  winnat started' }
    catch { Log "  start winnat warning: $($_.Exception.Message)" }

    Log 'Resulting excluded ranges:'
    $ranges = & cmd /c 'netsh interface ipv4 show excludedportrange protocol=tcp' 2>&1
    $ranges | ForEach-Object { Log "  $_" }

    Log 'DONE.'
}
catch {
    Log "ERROR: $($_.Exception.Message)"
    Log $_.ScriptStackTrace
}
