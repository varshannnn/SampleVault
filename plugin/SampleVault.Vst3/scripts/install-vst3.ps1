param(
    [string]$BuildConfig = "Release"
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$plugin = Join-Path $PSScriptRoot "..\build\SampleVault_artefacts\$BuildConfig\VST3\SampleVault.vst3"
$plugin = [System.IO.Path]::GetFullPath($plugin)

$targetRoot = "C:\Program Files\Common Files\VST3"
$target = Join-Path $targetRoot "SampleVault.vst3"

if (-not (Test-Path $plugin)) {
    throw "Built plugin not found at: $plugin`nBuild it first with cmake --build build --config $BuildConfig"
}

Write-Host "Installing:"
Write-Host "  $plugin"
Write-Host "to:"
Write-Host "  $target"
Write-Host ""

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

if (Test-Path $target) {
    Remove-Item -Recurse -Force $target
}

Copy-Item -Recurse -Force $plugin $target

Write-Host ""
Write-Host "Installed SampleVault.vst3"
Write-Host "Restart/rescan Ableton Live if it was open."
