param(
    [Parameter(Mandatory = $true)][string]$Slug,
    [Parameter(Mandatory = $true)][string]$Result
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'

function Get-Setting([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
        if ($line) {
            $value = $line.Substring($Name.Length + 1).Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            return $value
        }
    }
    return ''
}

function Write-Result([string]$BaseUrl, [string]$Email, [string]$Password) {
    $parent = Split-Path -Parent $Result
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    $json = @{ base_url = $BaseUrl; email = $Email; password = $Password } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($Result, $json, [System.Text.UTF8Encoding]::new($false))
}

if ($Slug -ne 'payload-cms') { throw "No hay instalador para '$Slug'." }

$email = Get-Setting 'PAYLOAD_EMAIL'
$password = Get-Setting 'PAYLOAD_PASSWORD'
$managedUrl = Get-Setting 'NOMIKOS_APP_URL'
if ($managedUrl) {
    Write-Output "modo gestionado: registrando $managedUrl"
    Write-Result $managedUrl $email $password
    Write-Output 'instalación registrada'
    exit 0
}

$payloadDir = Join-Path $root 'dapps/payload-cms'
$template = Join-Path $payloadDir 'templates/with-cloudflare-d1'
if (-not (Test-Path $template)) {
    if (Test-Path $payloadDir) { throw "No existe la plantilla Payload en $template" }
    $git = Get-Command git -ErrorAction Stop
    & $git.Source clone --depth 1 --branch v3.82.1 https://github.com/payloadcms/payload.git $payloadDir
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo clonar Payload CMS.' }
}
if (-not (Test-Path $template)) { throw "No existe la plantilla Payload en $template" }

$pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $pnpm) { $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue }
if (-not $pnpm) {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) { $npm = Get-Command npm -ErrorAction Stop }
    & $npm.Source install --global pnpm
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar pnpm.' }
    $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if (-not $pnpm) { $pnpm = Get-Command pnpm -ErrorAction Stop }
}

if (-not (Test-Path (Join-Path $template 'node_modules'))) {
    Push-Location $template
    try {
        & $pnpm.Source install --ignore-workspace
        if ($LASTEXITCODE -ne 0) { throw 'pnpm install falló.' }
    }
    finally { Pop-Location }
}

$secret = Get-Setting 'PAYLOAD_SECRET'
if (-not $secret) { $secret = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N') }
[System.IO.File]::WriteAllText((Join-Path $template '.env'), "PAYLOAD_SECRET=$secret`n", [System.Text.UTF8Encoding]::new($false))

function Test-Port([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        return $task.Wait(350) -and $client.Connected
    }
    catch { return $false }
    finally { $client.Dispose() }
}

if (-not (Test-Port 3100)) {
    $temp = [System.IO.Path]::GetTempPath()
    Start-Process -FilePath $pnpm.Source -ArgumentList @('dev', '--port', '3100') `
        -WorkingDirectory $template `
        -RedirectStandardOutput (Join-Path $temp 'nomikos-payload.stdout.log') `
        -RedirectStandardError (Join-Path $temp 'nomikos-payload.stderr.log') `
        -WindowStyle Hidden | Out-Null
}

$ready = $false
for ($i = 0; $i -lt 120; $i++) {
    if (Test-Port 3100) { $ready = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $ready) { throw 'Payload CMS no levantó en el puerto 3100; revisa %TEMP%/nomikos-payload.*.log.' }

if (-not $email) {
    $email = "agent@nomikos.$([Environment]::MachineName.ToLowerInvariant()).local"
    $password = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    $body = @{ email = $email; password = $password } | ConvertTo-Json -Compress
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:3100/api/users/first-register' `
            -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 20
    }
    catch { throw 'No se pudo crear el primer usuario de Payload; configura PAYLOAD_EMAIL y PAYLOAD_PASSWORD en .env si ya existe uno.' }
    if ([int]$response.StatusCode -ne 200) { throw "first-register respondió HTTP $([int]$response.StatusCode)." }
}

Write-Result 'http://localhost:3100' $email $password
Write-Output 'Payload CMS instalado; credenciales entregadas al API para cifrado.'
