param([switch]$NoBrowser, [int]$BackendPort = 8787, [int]$FrontendPort = 8766)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$qaRoot = Join-Path $projectRoot "qa-local"
$scenarioDir = Join-Path $qaRoot "scenarios"
$activeDb = Join-Path $qaRoot "humanos-qa.db"
$processFile = Join-Path $qaRoot "qa-processes.json"

New-Item -ItemType Directory -Force -Path $qaRoot, $scenarioDir | Out-Null
$env:HUMANOS_TEST_MODE = "1"
$env:HUMANOS_QA_DB = "1"
$env:HUMANOS_TEST_NOW = "2026-08-03T08:45:00+08:00"
$env:HUMANOS_TEST_TIME_SCALE = "0"
$env:HUMANOS_DB_PATH = $activeDb
$env:HUMANOS_QA_SCENARIO_DIR = $scenarioDir
$env:PORT = [string]$BackendPort

foreach ($portToCheck in @($BackendPort, $FrontendPort)) {
    if (Get-NetTCPConnection -LocalPort $portToCheck -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $portToCheck is already in use. Stop the old HumanOS process, or pass -BackendPort and -FrontendPort with free ports."
    }
}

& python (Join-Path $PSScriptRoot "generate_qa_scenarios.py")
if ($LASTEXITCODE -ne 0) { throw "QA scenario generation failed" }

$backendLog = Join-Path $qaRoot "backend.log"
$frontendLog = Join-Path $qaRoot "frontend.log"
$backend = Start-Process python -ArgumentList @("humanos_server.py") -WorkingDirectory (Join-Path $projectRoot "backend") -WindowStyle Hidden -RedirectStandardOutput $backendLog -RedirectStandardError (Join-Path $qaRoot "backend-error.log") -PassThru
$frontend = Start-Process python -ArgumentList @("-m", "http.server", [string]$FrontendPort, "--bind", "127.0.0.1") -WorkingDirectory (Join-Path $projectRoot "frontend") -WindowStyle Hidden -RedirectStandardOutput $frontendLog -RedirectStandardError (Join-Path $qaRoot "frontend-error.log") -PassThru

@{ backend_pid = $backend.Id; frontend_pid = $frontend.Id } | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding UTF8

$healthUrl = "http://127.0.0.1:$BackendPort/api/health"
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
        if ($health.ok -and $health.qa_mode) { break }
    } catch { Start-Sleep -Milliseconds 250 }
}
if (-not $health.ok -or -not $health.qa_mode) { throw "The local QA backend did not become ready. Check $backendLog" }

$apiUrl = "http://127.0.0.1:$BackendPort"
$url = "http://127.0.0.1:$FrontendPort/index.html?api=$([uri]::EscapeDataString($apiUrl))"
Write-Host "HumanOS local QA is ready: $url"
Write-Host "QA login: clock-qa@example.com / testing123"
Write-Host "QA database: $activeDb"
if (-not $NoBrowser) { Start-Process $url }
