$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$targetPath = Join-Path $projectRoot "humanos-syy7.zip"
$temporaryPath = Join-Path $projectRoot "humanos-syy7.zip.tmp"

# Always rebuild the single-file Data Foundry artifact from the current
# frontend sources before creating the archive. This prevents a correct source
# tree from being packaged with an older embedded HTML/CSS/JS bundle.
& python (Join-Path $PSScriptRoot "build_data_foundry_share.py")
if ($LASTEXITCODE -ne 0) {
    throw "Failed to rebuild the Data Foundry single-file artifact"
}

$packageEntries = @(
    "frontend/app.js",
    "frontend/index.html",
    "frontend/styles.css",
    "backend/.env.example",
    "backend/humanos_graph.py",
    "backend/humanos_server.py",
    "backend/README.md",
    "backend/requirements.txt",
    "backend/test_scheduler_constraints.py",
    "backend/test_task_input_layer.py",
    "backend/test_prompt_contracts.py",
    "backend/test_prompt_benchmark.py",
    "backend/test_weekly_lifecycle.py",
    "backend/test_research_edit_execution.py",
    "backend/test_confirmed_execution_rail.py",
    "backend/test_accelerated_week.py",
    "backend/test_shared_test_clock.py",
    "backend/prompt_benchmark_cases.json",
    "backend/run_prompt_benchmark.py",
    "scripts/build_data_foundry_share.py",
    "scripts/package_syy7.ps1",
    "scripts/qa_browser.mjs",
    "scripts/qa_execution_rail.mjs",
    "scripts/qa_plan_decision_ui.mjs",
    "scripts/qa_unified_clock_week.mjs",
    "scripts/qa_time_controller.mjs",
    "scripts/seed_execution_qa.py",
    "scripts/seed_unified_clock_qa.py",
    "scripts/export_unified_clock_qa.py",
    "scripts/simulate_plan_revision_qa.py",
    "scripts/simulate_accelerated_week.py",
    "scripts/generate_qa_scenarios.py",
    "scripts/start_local_qa.ps1",
    "scripts/stop_local_qa.ps1",
    "scripts/serve_frontend.py",
    "scripts/start_backend.sh",
    "scripts/start_frontend.sh",
    "README.md",
    "BACKEND_DATA_FIELDS.md",
    "IMPLEMENTATION_REPORT.md",
    "RESEARCH_EDIT_EXECUTION_IMPLEMENTATION.md",
    "UNIFIED_TEST_CLOCK_QA.md",
    "LOCAL_QA_TIME_CONTROLLER.md",
    "SYSTEM_COMPARISON.md",
    "render.yaml",
    ".gitignore",
    "data-foundry-share/index.html",
    "data-foundry-share/humanos-data-foundry-syy7.html"
)

if (Test-Path -LiteralPath $temporaryPath) {
    Remove-Item -LiteralPath $temporaryPath -Force
}

$archive = [System.IO.Compression.ZipFile]::Open(
    $temporaryPath,
    [System.IO.Compression.ZipArchiveMode]::Create
)

try {
    foreach ($entryName in $packageEntries) {
        $sourcePath = Join-Path $projectRoot ($entryName.Replace("/", [IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "Missing package file: $entryName"
        }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $sourcePath,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    $archive.Dispose()
}

$verificationArchive = [System.IO.Compression.ZipFile]::OpenRead($temporaryPath)
try {
    $entryNames = @($verificationArchive.Entries | ForEach-Object FullName)
    if ($entryNames.Count -ne $packageEntries.Count) {
        throw "Entry count mismatch: expected $($packageEntries.Count), got $($entryNames.Count)"
    }
    if ($entryNames -notcontains "data-foundry-share/humanos-data-foundry-syy7.html") {
        throw "The syy7 Data Foundry file is missing from the package"
    }
    $unsafeEntries = @($entryNames | Where-Object {
        $_ -match '(^|/)(\.env|data|__pycache__|qa-artifacts)(/|$)' -or $_ -match '\.(db|pyc)$'
    })
    if ($unsafeEntries.Count) {
        throw "Unsafe package entries: $($unsafeEntries -join ', ')"
    }
}
finally {
    $verificationArchive.Dispose()
}

Move-Item -LiteralPath $temporaryPath -Destination $targetPath -Force

$finalArchive = [System.IO.Compression.ZipFile]::OpenRead($targetPath)
try {
    [pscustomobject]@{
        Path = $targetPath
        SizeBytes = (Get-Item -LiteralPath $targetPath).Length
        Entries = $finalArchive.Entries.Count
        SHA256 = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash
    }
}
finally {
    $finalArchive.Dispose()
}
