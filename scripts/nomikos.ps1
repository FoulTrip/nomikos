[CmdletBinding()]
param(
    [ValidateSet('init', 'secrets', 'build', 'up', 'down', 'restart', 'status', 'logs')]
    [string]$Action = 'up',
    [string[]]$Service = @(),
    [ValidateSet('local', 'r2')]
    [string]$Backend
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$script:StorageBackend = 'local'
Push-Location $root

function Initialize-Env {
    $envPath = Join-Path $root '.env'
    if (-not (Test-Path $envPath)) {
        Copy-Item (Join-Path $root '.env.example') $envPath
        Write-Output 'created .env from .env.example'
    }

    $lines = [System.Collections.Generic.List[string]]::new()
    foreach ($line in [System.IO.File]::ReadAllLines($envPath)) { $lines.Add($line) }

    foreach ($name in @('ACCOUNTS_MASTER_KEY', 'AUTH_SECRET', 'PAYLOAD_SECRET')) {
        $index = -1
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match "^$name=(.*)$") { $index = $i; break }
        }
        if ($index -ge 0 -and -not [string]::IsNullOrWhiteSpace(($lines[$index] -split '=', 2)[1])) {
            continue
        }

        $bytes = [byte[]]::new(32)
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $value = if ($name -eq 'PAYLOAD_SECRET') {
            [System.BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
        } else {
            [Convert]::ToBase64String($bytes)
        }
        if ($index -ge 0) { $lines[$index] = "$name=$value" }
        else { $lines.Add("$name=$value") }
        Write-Output "generated $name"
    }

    [System.IO.File]::WriteAllLines($envPath, $lines.ToArray(), [System.Text.UTF8Encoding]::new($false))
}

function Require-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker is not installed. Install Docker Desktop or Docker Engine with Compose v2.'
    }
    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is required (docker compose).' }
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker is installed but its engine is not running. Start Docker Desktop and retry.' }
}

function Build-Stack {
    foreach ($target in @('payload-cms', 'mcp-server', 'api', 'brain', 'dapp')) {
        Write-Output "building $target"
        & docker compose build $target
        if ($LASTEXITCODE -ne 0) { throw "docker compose build $target failed with exit code $LASTEXITCODE" }
    }
}

function Get-StorageComposeArgs {
    $envPath = Join-Path $root '.env'
    $backend = if ($Backend) { $Backend } elseif ($env:OBJECT_STORE_BACKEND) { $env:OBJECT_STORE_BACKEND } else { 'local' }
    if (-not $Backend -and -not $env:OBJECT_STORE_BACKEND -and (Test-Path $envPath)) {
        $line = [System.IO.File]::ReadAllLines($envPath) | Where-Object { $_ -match '^OBJECT_STORE_BACKEND=' } | Select-Object -Last 1
        if ($line) { $backend = (($line -split '=', 2)[1] -split '#', 2)[0].Trim().Trim('"').Trim("'").ToLowerInvariant() }
    }
    $script:StorageBackend = $backend.ToLowerInvariant()
    $env:OBJECT_STORE_BACKEND = $script:StorageBackend
    if ($script:StorageBackend -eq 'r2') {
        # Override any stale COMPOSE_PROFILES=local in an existing .env.
        $env:COMPOSE_PROFILES = ''
        return @()
    }
    $env:COMPOSE_PROFILES = 'local'
    return @('--profile', 'local')
}

function Wait-ForLocalStorage {
    if ($script:StorageBackend -eq 'r2') { return }
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $state = & docker inspect --format '{{.State.Health.Status}}' nomikos-rustfs 2>$null
        if ($LASTEXITCODE -eq 0 -and $state -eq 'healthy') { return }
        Start-Sleep -Seconds 2
    }
    throw 'Timed out waiting for RustFS to become healthy.'
}

function Stop-LocalStorageForR2 {
    if ($script:StorageBackend -ne 'r2') { return }
    & docker stop nomikos-rustfs *> $null
    # A first R2 deployment has no RustFS container to stop.
}

function Publish-LocalModel {
    if ($script:StorageBackend -eq 'r2') { return }
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        & docker compose exec -T api curl -fsS http://127.0.0.1:8080/api/health *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'Timed out waiting for the API before publishing the local model.' }
    $status = & docker compose exec -T api curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/device/model/head
    if ($LASTEXITCODE -ne 0) { throw 'Could not check whether the local simulator model exists.' }
    if ($status -eq '200') {
        Write-Output 'local simulator model is already available from RustFS'
        return
    }
    & docker compose exec -T api curl -fsS -X POST http://127.0.0.1:8080/api/device/model/upload *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Could not publish the simulator model to local RustFS through the API.' }
    Write-Output 'published the simulator model to local RustFS through the API'
}

try {
    switch ($Action) {
        { $_ -in @('init', 'secrets') } {
            Initialize-Env
        }
        'build' {
            Initialize-Env
            $composeArgs = Get-StorageComposeArgs
            Require-Docker
            & docker compose config --quiet
            if ($LASTEXITCODE -ne 0) { throw 'docker compose config failed.' }
            Build-Stack
        }
        'up' {
            Initialize-Env
            $composeArgs = Get-StorageComposeArgs
            Require-Docker
            & docker compose config --quiet
            if ($LASTEXITCODE -ne 0) { throw 'docker compose config failed.' }
            Build-Stack
            Stop-LocalStorageForR2
            & docker compose @composeArgs up -d @Service
            if ($LASTEXITCODE -ne 0) { throw "docker compose up failed with exit code $LASTEXITCODE" }
            Wait-ForLocalStorage
            Publish-LocalModel
            & docker compose @composeArgs ps --all
        }
        'down' {
            Require-Docker
            & docker compose down
            if ($LASTEXITCODE -ne 0) { throw 'docker compose down failed.' }
        }
        'restart' {
            Require-Docker
            $composeArgs = Get-StorageComposeArgs
            & docker compose @composeArgs restart @Service
            if ($LASTEXITCODE -ne 0) { throw 'docker compose restart failed.' }
        }
        'status' {
            Require-Docker
            $composeArgs = Get-StorageComposeArgs
            & docker compose @composeArgs ps --all
            if ($LASTEXITCODE -ne 0) { throw 'docker compose ps failed.' }
        }
        'logs' {
            Require-Docker
            $composeArgs = Get-StorageComposeArgs
            & docker compose @composeArgs logs --tail 100 --follow @Service
            if ($LASTEXITCODE -ne 0) { throw 'docker compose logs failed.' }
        }
    }
}
finally {
    Pop-Location
}
