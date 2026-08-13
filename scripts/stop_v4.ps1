$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$processFile = Join-Path $projectRoot ".v4-run\processes.json"

if (-not (Test-Path -LiteralPath $processFile)) {
    Write-Host "No recorded V4 processes were found."
    exit 0
}

$processes = Get-Content -Raw -LiteralPath $processFile | ConvertFrom-Json
foreach ($processId in @($processes.backend_pid, $processes.frontend_pid)) {
    if ($processId -and (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
        Stop-Process -Id $processId -Force
    }
}
foreach ($port in @($processes.backend_port, $processes.frontend_port)) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}
Remove-Item -LiteralPath $processFile -Force
Write-Host "HumanOS teammate V4 has been stopped."
