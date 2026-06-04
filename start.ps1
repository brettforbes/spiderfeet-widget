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

Write-Host "Starting SpiderFeet Widget dev server at http://localhost:$Port ..."
npm start
