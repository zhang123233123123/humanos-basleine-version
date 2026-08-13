param(
    [int]$BackendPort = 8807,
    [int]$FrontendPort = 3040,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$nodeDir = "C:\Users\SYY\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$node = Join-Path $nodeDir "node.exe"
$runRoot = Join-Path $projectRoot ".v4-run"

if (-not (Test-Path -LiteralPath $python)) {
    throw "V4 Python environment is missing. Run: python -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt"
}
if (-not (Test-Path -LiteralPath $node)) {
    throw "The bundled Node.js runtime was not found."
}

$url = "http://127.0.0.1:$FrontendPort/login"
$backendListener = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue
$frontendListener = Get-NetTCPConnection -LocalPort $FrontendPort -State Listen -ErrorAction SilentlyContinue
if ($backendListener -and $frontendListener) {
    try {
        $existingHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/api/health" -TimeoutSec 2
        $existingFrontend = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4
        if ($existingHealth.ok -and $existingFrontend.StatusCode -eq 200) {
            Write-Host "HumanOS teammate V4 is already running: $url"
            if (-not $NoBrowser) { Start-Process $url }
            exit 0
        }
    } catch { }
}
foreach ($port in @($BackendPort, $FrontendPort)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $port is already in use. Choose different -BackendPort and -FrontendPort values."
    }
}

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$env:PORT = [string]$BackendPort
$backend = Start-Process $python -ArgumentList @("humanos_server.py") `
    -WorkingDirectory (Join-Path $projectRoot "backend") -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runRoot "backend.log") `
    -RedirectStandardError (Join-Path $runRoot "backend-error.log") -PassThru

$env:HUMANOS_BACKEND_URL = "http://127.0.0.1:$BackendPort"
$env:NEXTAUTH_URL = "http://127.0.0.1:$FrontendPort"
$env:NEXTAUTH_SECRET = "humanos-v4-local-test-only"
$env:DEMO_MODE = "false"
$env:NEXT_PUBLIC_DEMO_MODE = "false"
$frontend = Start-Process $node -ArgumentList @("node_modules\next\dist\bin\next", "dev", "-p", [string]$FrontendPort) `
    -WorkingDirectory (Join-Path $projectRoot "frontend") -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runRoot "frontend.log") `
    -RedirectStandardError (Join-Path $runRoot "frontend-error.log") -PassThru

@{ backend_pid = $backend.Id; frontend_pid = $frontend.Id; backend_port = $BackendPort; frontend_port = $FrontendPort } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runRoot "processes.json") -Encoding UTF8

$healthUrl = "http://127.0.0.1:$BackendPort/api/health"
$ready = $false
for ($attempt = 0; $attempt -lt 80; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
        if ($health.ok) { $ready = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 250
}
if (-not $ready) {
    throw "V4 backend did not become ready. Check .v4-run\backend-error.log"
}

$frontendReady = $false
for ($attempt = 0; $attempt -lt 120; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$FrontendPort/login" -UseBasicParsing -TimeoutSec 1
        if ($response.StatusCode -eq 200) { $frontendReady = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 250
}
if (-not $frontendReady) {
    throw "V4 frontend did not become ready. Check .v4-run\frontend-error.log"
}

Write-Host "HumanOS teammate V4 is ready: $url"
Write-Host "The onboarding form contains editable sample planning data."
if (-not $NoBrowser) { Start-Process $url }
