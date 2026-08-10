param(
    [switch]$NoBrowser,
    [int]$BackendPort = 8787,
    [int]$FrontendPort = 3000
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$frontendRoot = Join-Path $projectRoot "product-frontend"
$runtimeRoot = Join-Path $projectRoot "product-local"
$processFile = Join-Path $runtimeRoot "processes.json"

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

foreach ($portToCheck in @($BackendPort, $FrontendPort)) {
    if (Get-NetTCPConnection -LocalPort $portToCheck -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $portToCheck is already in use. Stop the old process or pass free -BackendPort and -FrontendPort values."
    }
}

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
$pythonFallback = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$python = if ($pythonCommand) { $pythonCommand.Source } elseif (Test-Path -LiteralPath $pythonFallback) { $pythonFallback } else { throw "Python was not found." }

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeFallback = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = if ($nodeCommand) { $nodeCommand.Source } elseif (Test-Path -LiteralPath $nodeFallback) { $nodeFallback } else { throw "Node.js was not found. Install Node.js and reopen PowerShell." }
$nextCli = Join-Path $frontendRoot "node_modules\next\dist\bin\next"
$nextCliRelative = ".\node_modules\next\dist\bin\next"
if (-not (Test-Path -LiteralPath $nextCli)) {
    throw "Product frontend dependencies are missing. Run npm install in $frontendRoot first."
}

$env:PORT = [string]$BackendPort
$backend = Start-Process $python -ArgumentList @("humanos_server.py") `
    -WorkingDirectory (Join-Path $projectRoot "backend") -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runtimeRoot "backend.log") `
    -RedirectStandardError (Join-Path $runtimeRoot "backend-error.log") -PassThru

$env:HUMANOS_BACKEND_URL = "http://127.0.0.1:$BackendPort"
$env:NEXTAUTH_URL = "http://127.0.0.1:$FrontendPort"
if (-not $env:NEXTAUTH_SECRET) { $env:NEXTAUTH_SECRET = "humanos-local-product-development" }
$env:DEMO_MODE = "true"
$env:NEXT_PUBLIC_DEMO_MODE = "true"
# Pass the CLI relative to WorkingDirectory. Start-Process flattens ArgumentList
# into a string, which otherwise splits the absolute OneDrive path at spaces.
$frontend = Start-Process $node -ArgumentList @($nextCliRelative, "dev", "-p", [string]$FrontendPort) `
    -WorkingDirectory $frontendRoot -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runtimeRoot "frontend.log") `
    -RedirectStandardError (Join-Path $runtimeRoot "frontend-error.log") -PassThru

@{ backend_pid = $backend.Id; frontend_pid = $frontend.Id } |
    ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding UTF8

$healthUrl = "http://127.0.0.1:$BackendPort/api/health"
$backendReady = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
        if ($health.ok) { $backendReady = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 250
}
$url = "http://127.0.0.1:$FrontendPort"
$frontendReady = $false
for ($attempt = 0; $attempt -lt 120; $attempt++) {
    if ($frontend.HasExited) { break }
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { $frontendReady = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 250
}

if (-not $backendReady -or -not $frontendReady) {
    foreach ($startedProcess in @($frontend, $backend)) {
        if ($startedProcess -and -not $startedProcess.HasExited) {
            Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
    if (-not $backendReady) { throw "The backend did not become ready. Check product-local/backend-error.log." }
    throw "The product frontend did not become ready. Check product-local/frontend-error.log."
}

Write-Host "HumanOS product UI is ready: $url"
Write-Host "Backend: $healthUrl"
Write-Host "Process record: $processFile"
if (-not $NoBrowser) { Start-Process $url }
