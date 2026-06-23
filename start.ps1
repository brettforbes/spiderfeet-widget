# SpiderFeet Widget — development entry (SFW-01-04)
# Requires: Node.js, npm install
param(
    [int]$Port = 4001
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm is required. Install Node.js from https://nodejs.org/"
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Running npm install ..."
    npm install
}

$portInUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty OwningProcess
if ($portInUse) {
    $holder = Get-Process -Id $portInUse -ErrorAction SilentlyContinue
    if ($holder -and $holder.ProcessName -eq "node") {
        Write-Host "Port $Port is in use by a stale node process (PID $portInUse). Stopping it ..."
        Stop-Process -Id $portInUse -Force
        Start-Sleep -Seconds 1
    } else {
        Write-Error "Port $Port is already in use (PID $portInUse). Stop that process or pass -Port <number>."
    }
}

Write-Host "Starting SpiderFeet Widget dev server at http://localhost:$Port ..."
npm start
