$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$processFile = Join-Path $projectRoot "qa-local\qa-processes.json"
if (-not (Test-Path -LiteralPath $processFile)) {
    Write-Host "No local QA process record was found."
    exit 0
}
$record = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
foreach ($processId in @($record.backend_pid, $record.frontend_pid)) {
    if ($processId) {
        Stop-Process -Id $processId -ErrorAction SilentlyContinue
    }
}
Remove-Item -LiteralPath $processFile -Force
Write-Host "HumanOS local QA processes stopped."
